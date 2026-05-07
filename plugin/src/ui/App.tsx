import { useMemo, useState } from "react";
import { MOODS } from "../engine/moods";
import { buildValueRamp } from "../engine/palette";
import { generateColorPass, generateZonedColorPass } from "../engine/index";
import type { RGB } from "../engine/types";
import type { ZoneId } from "../engine/zoneTree";
import {
  executeAsModal,
  getActiveDoc,
  getActiveLayer,
  readLayerAsImageBuffer,
  buildColorPassOutput,
} from "../ps";
import { ZonePanel } from "./components/ZonePanel";
import { Section } from "./components/Section";
import { useStore } from "../state/store";

const rgbCss = (c: RGB) =>
  `rgb(${(c.r * 255) | 0}, ${(c.g * 255) | 0}, ${(c.b * 255) | 0})`;

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}
const Slider = ({ label, value, min, max, step, onChange, format }: SliderProps) => (
  <div style={{ marginBottom: 8 }}>
    <div style={{ display: "flex", justifyContent: "space-between", color: "#bbb", fontSize: 11 }}>
      <span>{label}</span><span style={{ color: "#888" }}>{format(value)}</span>
    </div>
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      style={{ width: "100%" }}
    />
  </div>
);

type Status =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; layerId: number }
  | { kind: "error"; message: string };

export function App() {
  const [moodId, setMoodId] = useState(MOODS[0].id);
  const mood = useMemo(() => MOODS.find((m) => m.id === moodId)!, [moodId]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [{ tree }] = useStore();

  const zonesWithMasks = useMemo(() => {
    const out: { id: ZoneId; bitmap: Uint8Array }[] = [];
    for (const id of Object.keys(tree.nodes)) {
      const bm = tree.nodes[id].maskRef.bitmap;
      if (bm) out.push({ id, bitmap: bm });
    }
    return out;
  }, [tree]);

  // Macro sliders (PRD §11). Defaults are neutral so output matches mood as designed.
  const [chromaScale, setChromaScale] = useState(1);   // saturation
  const [hueDrift, setHueDrift] = useState(1);         // drama
  const [hueOffset, setHueOffset] = useState(0);       // warm/cool
  const [keepShading, setKeepShading] = useState(mood.defaultValuePreservation);

  const ramp = useMemo(
    () => buildValueRamp(mood, { hueDriftScale: hueDrift, chromaScale, hueOffset }),
    [mood, hueDrift, chromaScale, hueOffset],
  );

  const onGenerate = async () => {
    setStatus({ kind: "running" });
    try {
      const newLayerId = await executeAsModal("ChromaGhost: Generate Color Pass", async () => {
        const doc = getActiveDoc();
        const layer = getActiveLayer();
        const grayscale = await readLayerAsImageBuffer(doc.id, layer.id);
        const expectedLen = grayscale.width * grayscale.height;
        const usableMasks = zonesWithMasks.filter((z) => z.bitmap.length === expectedLen);
        const useZoned = usableMasks.length > 0;
        const output = useZoned
          ? generateZonedColorPass({
              grayscale,
              mood,
              tree,
              zoneMasks: Object.fromEntries(usableMasks.map((z) => [z.id, z.bitmap])),
              unownedTransparent: true,
              globalOverrides: {
                chromaScale,
                hueDriftScale: hueDrift,
                hueOffset,
                valuePreservation: keepShading,
              },
            })
          : generateColorPass({
              grayscale,
              mood,
              chromaScale,
              hueDriftScale: hueDrift,
              hueOffset,
              valuePreservation: keepShading,
            });
        return buildColorPassOutput({
          documentId: doc.id,
          sourceLayerId: layer.id,
          output,
          targetBounds: layer.bounds,
        });
      });
      setStatus({ kind: "done", layerId: newLayerId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message });
    }
  };

  const resetSliders = () => {
    setChromaScale(1);
    setHueDrift(1);
    setHueOffset(0);
    setKeepShading(mood.defaultValuePreservation);
  };

  const statusText = (() => {
    switch (status.kind) {
      case "idle": return "Idle.";
      case "running": return "Generating color pass…";
      case "done": return `Done. New layer id: ${status.layerId}`;
      case "error": return `Error: ${status.message}`;
    }
  })();

  const statusColor = status.kind === "error"
    ? "#f88"
    : status.kind === "done"
      ? "#8f8"
      : "#aaa";

  const isRunning = status.kind === "running";
  const zoneCount = Object.keys(tree.nodes).length;
  const zonesWithMaskCount = zonesWithMasks.length;

  return (
    <div style={{
      // Make the panel scrollable inside the UXP host. UXP panels don't
      // auto-scroll their root unless we set explicit overflow + bounded height.
      height: "100vh",
      overflowY: "auto",
      overflowX: "hidden",
      padding: "12px 14px 24px",
      fontSize: 12,
      lineHeight: 1.4,
      boxSizing: "border-box",
    }}>
      <h2 style={{ margin: "0 0 2px", fontSize: 16 }}>ChromaGhost</h2>
      <p style={{ margin: "0 0 8px", color: "#999", fontSize: 11 }}>
        v0.1 — grayscale → full color pass
      </p>

      <Section title="Mood" defaultOpen rightHint={mood.name}>
        <select
          value={moodId}
          onChange={(e) => setMoodId(e.target.value)}
          style={{ width: "100%", padding: 6, marginBottom: 10 }}
        >
          {MOODS.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <div style={{ marginBottom: 6, color: "#bbb", fontSize: 11 }}>Value ramp preview</div>
        <div style={{
          display: "flex", height: 40, borderRadius: 4, overflow: "hidden",
          border: "1px solid #444",
        }}>
          {ramp.map((c, i) => (
            <div key={i} style={{ flex: 1, background: rgbCss(c) }} />
          ))}
        </div>
      </Section>

      <Section title="Macro sliders" defaultOpen>
        <Slider label="Saturation"   value={chromaScale} min={0}   max={2}  step={0.05} onChange={setChromaScale} format={(v) => v.toFixed(2) + "×"} />
        <Slider label="Drama"        value={hueDrift}    min={0}   max={2}  step={0.05} onChange={setHueDrift}    format={(v) => v.toFixed(2) + "×"} />
        <Slider label="Warm ↔ Cool"  value={hueOffset}   min={-30} max={30} step={1}    onChange={setHueOffset}   format={(v) => (v > 0 ? "+" : "") + v + "°"} />
        <Slider label="Keep shading" value={keepShading} min={0}   max={1}  step={0.02} onChange={setKeepShading} format={(v) => Math.round(v * 100) + "%"} />
        <button
          type="button"
          onClick={resetSliders}
          style={{
            width: "100%", padding: "4px 8px", marginTop: 4,
            background: "transparent", color: "#888",
            border: "1px solid #444", cursor: "pointer", fontSize: 11,
          }}
        >
          Reset sliders
        </button>
      </Section>

      <Section
        title="Zones"
        defaultOpen
        rightHint={zoneCount === 0 ? "none" : `${zoneCount} zone${zoneCount === 1 ? "" : "s"} · ${zonesWithMaskCount} with mask`}
      >
        <ZonePanel />
      </Section>

      <Section title="Generate" defaultOpen>
        <button
          type="button"
          onClick={onGenerate}
          disabled={isRunning}
          style={{
            width: "100%",
            padding: "10px 12px",
            marginBottom: 8,
            cursor: isRunning ? "default" : "pointer",
            fontWeight: 600,
          }}
        >
          {zonesWithMaskCount > 0
            ? `Generate Zoned Color Pass (${zonesWithMaskCount} zone${zonesWithMaskCount === 1 ? "" : "s"})`
            : "Generate Color Pass on Active Layer"}
        </button>
        <div style={{ color: statusColor, fontSize: 11 }}>{statusText}</div>
      </Section>
    </div>
  );
}
