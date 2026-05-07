import { useState, type ReactNode } from "react";

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  rightHint?: string;
  children: ReactNode;
}

export function Section({ title, defaultOpen = true, rightHint, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      borderTop: "1px solid #333",
      marginTop: 4,
    }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "10px 4px",
          background: "transparent",
          color: "#ddd",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            display: "inline-block",
            width: 10,
            color: "#888",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform 100ms",
          }}>▶</span>
          {title}
        </span>
        {rightHint && (
          <span style={{ color: "#666", fontWeight: 400, fontSize: 11 }}>{rightHint}</span>
        )}
      </button>
      {open && (
        <div style={{ padding: "0 4px 12px" }}>
          {children}
        </div>
      )}
    </div>
  );
}
