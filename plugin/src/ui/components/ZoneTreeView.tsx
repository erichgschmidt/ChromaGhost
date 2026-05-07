import { walkDepthFirst } from "../../engine/zoneTree";
import type { ZoneTree, ZoneId } from "../../engine/zoneTree";
import { MATERIALS } from "../../engine/materials";

interface Props {
  tree: ZoneTree;
  selectedId: ZoneId | null;
  onSelect: (id: ZoneId) => void;
}

function materialName(id: string | null): string {
  if (!id) return "—";
  const m = MATERIALS.find((x) => x.id === id);
  return m ? m.name : id;
}

export function ZoneTreeView({ tree, selectedId, onSelect }: Props) {
  const rows: { id: ZoneId; depth: number; name: string; role: string; mat: string }[] = [];
  walkDepthFirst(tree, (node, depth) => {
    rows.push({
      id: node.id,
      depth,
      name: node.name,
      role: node.paletteRole,
      mat: materialName(node.materialId),
    });
  });

  if (rows.length === 0) return null;

  return (
    <div style={{ border: "1px solid #333", borderRadius: 4, marginBottom: 8 }}>
      {rows.map((r) => {
        const selected = r.id === selectedId;
        return (
          <div
            key={r.id}
            onClick={() => onSelect(r.id)}
            style={{
              padding: "4px 8px",
              paddingLeft: 8 + r.depth * 14,
              background: selected ? "#2a3a55" : "transparent",
              color: selected ? "#fff" : "#ccc",
              cursor: "pointer",
              fontSize: 11,
              borderBottom: "1px solid #222",
              display: "flex",
              justifyContent: "space-between",
              gap: 6,
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.name}
            </span>
            <span style={{ color: "#888", flexShrink: 0 }}>
              {r.role} · {r.mat}
            </span>
          </div>
        );
      })}
    </div>
  );
}
