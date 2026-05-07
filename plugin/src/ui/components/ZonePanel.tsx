import { useState } from "react";
import { useStore, actions } from "../../state/store";
import type { MaskRef, PaletteRole, ZoneNode } from "../../engine/zoneTree";
import { ZoneTreeView } from "./ZoneTreeView";
import { MaterialPicker } from "./MaterialPicker";
import { executeAsModal, getActiveDoc, readSelectionAsMask } from "../../ps";

const ROLES: PaletteRole[] = ["dominant", "secondary", "accent", "support", "protected"];
const MASK_KINDS: MaskRef["kind"][] = ["selection", "channel", "flatColorId", "bitmap"];

const sectionLabel: React.CSSProperties = { color: "#bbb", marginBottom: 4, fontSize: 11 };
const inputStyle: React.CSSProperties = { width: "100%", padding: 6, marginBottom: 6 };
const btn: React.CSSProperties = {
  padding: "4px 10px",
  background: "transparent",
  color: "#ccc",
  border: "1px solid #444",
  cursor: "pointer",
  fontSize: 11,
};

export function ZonePanel() {
  const [{ tree, selectedZoneId }, a] = useStore();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState<string>("");
  const [newKind, setNewKind] = useState<MaskRef["kind"]>("selection");

  const selected: ZoneNode | null = selectedZoneId ? tree.nodes[selectedZoneId] ?? null : null;

  const submitAdd = () => {
    const name = newName.trim();
    if (!name) return;
    a.addZone({
      name,
      parentId: newParent === "" ? null : newParent,
      maskKind: newKind,
    });
    setNewName("");
    setNewParent("");
    setNewKind("selection");
    setAdding(false);
  };

  const allZoneOptions: { id: string; label: string }[] = [];
  // flat list for parent picker
  for (const id of Object.keys(tree.nodes)) {
    const n = tree.nodes[id];
    allZoneOptions.push({ id, label: `${"".padStart(n.depth, "·")} ${n.name}` });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button type="button" style={{ ...btn, flex: 1 }} onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "Add zone"}
        </button>
        <button
          type="button"
          style={{ ...btn, flex: 1, opacity: selected ? 1 : 0.4 }}
          disabled={!selected}
          onClick={() => selected && a.removeZone(selected.id)}
        >
          Remove
        </button>
      </div>

      {adding && (
        <div style={{ background: "#1a1a1a", padding: 8, marginBottom: 8, border: "1px solid #333", borderRadius: 4 }}>
          <div style={sectionLabel}>Name</div>
          <input
            style={inputStyle}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Skin, Cape, Sword"
          />
          <div style={sectionLabel}>Parent</div>
          <select style={inputStyle} value={newParent} onChange={(e) => setNewParent(e.target.value)}>
            <option value="">Root</option>
            {allZoneOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
          <div style={sectionLabel}>Mask source</div>
          <select
            style={inputStyle}
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as MaskRef["kind"])}
          >
            {MASK_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          {/* TODO: wire mask source to actual Photoshop selection / channel / flat color picker. */}
          <button type="button" style={{ ...btn, width: "100%" }} onClick={submitAdd}>
            Create zone
          </button>
        </div>
      )}

      {tree.rootIds.length === 0 ? (
        <div style={{ color: "#888", fontSize: 11, padding: 8, border: "1px dashed #333", borderRadius: 4 }}>
          No zones yet — works fine, the macro pass covers everything. Add a zone to refine.
        </div>
      ) : (
        <ZoneTreeView tree={tree} selectedId={selectedZoneId} onSelect={a.selectZone} />
      )}

      {selected && <SelectedEditor zone={selected} />}
    </div>
  );
}

function SelectedEditor({ zone }: { zone: ZoneNode }) {
  const [, a] = useStore();
  const update = (patch: Partial<ZoneNode>) => a.updateZone(zone.id, patch);
  const locks = zone.locks;
  const [captureStatus, setCaptureStatus] = useState<string>("");
  const hasMask = !!zone.maskRef.bitmap;
  const maskPx = zone.maskRef.bitmap ? zone.maskRef.bitmap.length : 0;

  const onCapture = async () => {
    setCaptureStatus("capturing…");
    try {
      await executeAsModal("ChromaGhost: capture selection", async () => {
        const doc = getActiveDoc();
        const mask = await readSelectionAsMask(doc.id);
        if (!mask) throw new Error("No active selection. Make a selection first.");
        actions.setZoneMask(zone.id, mask);
      });
      setCaptureStatus("captured");
    } catch (err) {
      setCaptureStatus(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div style={{ marginTop: 8, padding: 8, background: "#1a1a1a", border: "1px solid #333", borderRadius: 4 }}>
      <div style={{ ...sectionLabel, color: "#ddd", fontWeight: 600 }}>Selected: {zone.name}</div>

      <div style={sectionLabel}>Name</div>
      <input
        style={inputStyle}
        value={zone.name}
        onChange={(e) => update({ name: e.target.value })}
      />

      <div style={sectionLabel}>Palette role</div>
      <select
        style={inputStyle}
        value={zone.paletteRole}
        onChange={(e) => update({ paletteRole: e.target.value as PaletteRole })}
      >
        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>

      <div style={sectionLabel}>Material</div>
      <MaterialPicker
        value={zone.materialId}
        onChange={(id) => update({ materialId: id })}
      />

      <div style={{ ...sectionLabel, marginTop: 8 }}>Mask</div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
        <button type="button" style={{ ...btn, flex: 1 }} onClick={onCapture}>
          Capture from selection
        </button>
        <span style={{ fontSize: 10, color: hasMask ? "#8f8" : "#888" }}>
          {hasMask ? `${maskPx}px` : "none"}
        </span>
      </div>
      {captureStatus && (
        <div style={{ fontSize: 10, color: captureStatus === "captured" ? "#8f8" : "#f88", marginBottom: 6 }}>
          {captureStatus}
        </div>
      )}

      <div style={{ ...sectionLabel, marginTop: 8 }}>Locks</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 11, color: "#bbb" }}>
        {(["hue", "value", "material", "mask"] as const).map((k) => (
          <label key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={!!locks[k]}
              onChange={(e) => update({ locks: { ...locks, [k]: e.target.checked } })}
            />
            {k}
          </label>
        ))}
      </div>
    </div>
  );
}
