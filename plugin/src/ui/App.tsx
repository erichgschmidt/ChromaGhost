import { useMemo, useState } from "react";
import { MOODS } from "../engine/moods";
import { buildValueRamp } from "../engine/palette";
import type { RGB } from "../engine/types";

const rgbCss = (c: RGB) =>
  `rgb(${(c.r * 255) | 0}, ${(c.g * 255) | 0}, ${(c.b * 255) | 0})`;

export function App() {
  const [moodId, setMoodId] = useState(MOODS[0].id);
  const mood = useMemo(() => MOODS.find((m) => m.id === moodId)!, [moodId]);
  const ramp = useMemo(() => buildValueRamp(mood, 1), [mood]);

  return (
    <div style={{ padding: 16, fontSize: 12, lineHeight: 1.4 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>ChromaGhost</h2>
      <p style={{ margin: "0 0 16px", color: "#999" }}>
        v0.1 — M0 scaffold. Engine M1 ready (zero-zone color pass).
      </p>

      <div style={{ marginBottom: 8, color: "#bbb" }}>Mood</div>
      <select
        value={moodId}
        onChange={(e) => setMoodId(e.target.value)}
        style={{ width: "100%", padding: 6, marginBottom: 16 }}
      >
        {MOODS.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>

      <div style={{ marginBottom: 8, color: "#bbb" }}>Value ramp preview</div>
      <div style={{
        display: "flex", height: 48, borderRadius: 4, overflow: "hidden",
        border: "1px solid #444",
      }}>
        {ramp.map((c, i) => (
          <div key={i} style={{ flex: 1, background: rgbCss(c) }} />
        ))}
      </div>

      <p style={{ marginTop: 16, color: "#777" }}>
        Photoshop adapter (M3) and zone tree (M4+) not yet wired. Run
        <code style={{ color: "#ccc" }}> npm test </code> to verify the engine.
      </p>
    </div>
  );
}
