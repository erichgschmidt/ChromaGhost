import { describe, it, expect } from "vitest";
import {
  createZoneTree,
  addZone,
  removeZone,
  moveZone,
  updateZone,
  walkDepthFirst,
  ancestorChain,
  type MaskRef,
} from "./zoneTree";

const M: MaskRef = { kind: "selection" };

describe("zoneTree", () => {
  it("creates an empty tree", () => {
    const t = createZoneTree();
    expect(t.rootIds).toEqual([]);
    expect(Object.keys(t.nodes)).toHaveLength(0);
  });

  it("adds a root zone with depth 1", () => {
    const t0 = createZoneTree();
    const { tree, id } = addZone(t0, { name: "A", maskRef: M });
    expect(tree.rootIds).toEqual([id]);
    expect(tree.nodes[id].depth).toBe(1);
    expect(tree.nodes[id].parentId).toBeNull();
    // immutability
    expect(t0.rootIds).toEqual([]);
  });

  it("adds child increments depth from parent", () => {
    const a = addZone(createZoneTree(), { name: "A", maskRef: M });
    const b = addZone(a.tree, { name: "B", maskRef: M }, a.id);
    const c = addZone(b.tree, { name: "C", maskRef: M }, b.id);
    expect(c.tree.nodes[a.id].depth).toBe(1);
    expect(c.tree.nodes[b.id].depth).toBe(2);
    expect(c.tree.nodes[c.id].depth).toBe(3);
    expect(c.tree.nodes[a.id].children).toContain(b.id);
  });

  it("removes a leaf zone", () => {
    const a = addZone(createZoneTree(), { name: "A", maskRef: M });
    const b = addZone(a.tree, { name: "B", maskRef: M }, a.id);
    const t = removeZone(b.tree, b.id);
    expect(t.nodes[b.id]).toBeUndefined();
    expect(t.nodes[a.id].children).not.toContain(b.id);
  });

  it("removes an internal node and re-parents children to grandparent", () => {
    const a = addZone(createZoneTree(), { name: "A", maskRef: M });
    const b = addZone(a.tree, { name: "B", maskRef: M }, a.id);
    const c = addZone(b.tree, { name: "C", maskRef: M }, b.id);
    const t = removeZone(c.tree, b.id);
    expect(t.nodes[b.id]).toBeUndefined();
    expect(t.nodes[c.id].parentId).toBe(a.id);
    expect(t.nodes[a.id].children).toContain(c.id);
    expect(t.nodes[c.id].depth).toBe(2);
  });

  it("removes a root and re-parents children to roots", () => {
    const a = addZone(createZoneTree(), { name: "A", maskRef: M });
    const b = addZone(a.tree, { name: "B", maskRef: M }, a.id);
    const t = removeZone(b.tree, a.id);
    expect(t.rootIds).toContain(b.id);
    expect(t.nodes[b.id].parentId).toBeNull();
    expect(t.nodes[b.id].depth).toBe(1);
  });

  it("moves a zone under another parent", () => {
    const a = addZone(createZoneTree(), { name: "A", maskRef: M });
    const b = addZone(a.tree, { name: "B", maskRef: M });
    const moved = moveZone(b.tree, b.id, a.id);
    expect(moved.nodes[b.id].parentId).toBe(a.id);
    expect(moved.nodes[a.id].children).toContain(b.id);
    expect(moved.rootIds).not.toContain(b.id);
    expect(moved.nodes[b.id].depth).toBe(2);
  });

  it("rejects cycles in moveZone", () => {
    const a = addZone(createZoneTree(), { name: "A", maskRef: M });
    const b = addZone(a.tree, { name: "B", maskRef: M }, a.id);
    expect(() => moveZone(b.tree, a.id, b.id)).toThrow(/cycle/);
    expect(() => moveZone(b.tree, a.id, a.id)).toThrow();
  });

  it("moveZone fixes descendant depths", () => {
    const a = addZone(createZoneTree(), { name: "A", maskRef: M });
    const b = addZone(a.tree, { name: "B", maskRef: M });
    const c = addZone(b.tree, { name: "C", maskRef: M }, b.id);
    const moved = moveZone(c.tree, b.id, a.id);
    expect(moved.nodes[b.id].depth).toBe(2);
    expect(moved.nodes[c.id].depth).toBe(3);
  });

  it("walks depth-first in declaration order", () => {
    const a = addZone(createZoneTree(), { name: "A", maskRef: M });
    const b = addZone(a.tree, { name: "B", maskRef: M }, a.id);
    const c = addZone(b.tree, { name: "C", maskRef: M }, b.id);
    const d = addZone(c.tree, { name: "D", maskRef: M }, a.id);
    const seen: string[] = [];
    walkDepthFirst(d.tree, (n) => seen.push(n.name));
    expect(seen).toEqual(["A", "B", "C", "D"]);
  });

  it("ancestorChain returns self -> root", () => {
    const a = addZone(createZoneTree(), { name: "A", maskRef: M });
    const b = addZone(a.tree, { name: "B", maskRef: M }, a.id);
    const c = addZone(b.tree, { name: "C", maskRef: M }, b.id);
    const chain = ancestorChain(c.tree, c.id);
    expect(chain.map((n) => n.name)).toEqual(["C", "B", "A"]);
  });

  it("updateZone patches non-structural fields and is pure", () => {
    const a = addZone(createZoneTree(), { name: "A", maskRef: M });
    const t = updateZone(a.tree, a.id, { name: "Renamed", paletteRole: "accent" });
    expect(t.nodes[a.id].name).toBe("Renamed");
    expect(t.nodes[a.id].paletteRole).toBe("accent");
    // original unchanged
    expect(a.tree.nodes[a.id].name).toBe("A");
  });

  it("updateZone ignores attempts to change structural fields", () => {
    const a = addZone(createZoneTree(), { name: "A", maskRef: M });
    const b = addZone(a.tree, { name: "B", maskRef: M }, a.id);
    const t = updateZone(b.tree, b.id, { parentId: null, depth: 4 } as never);
    expect(t.nodes[b.id].parentId).toBe(a.id);
    expect(t.nodes[b.id].depth).toBe(2);
  });

  it("throws on missing parents/ids", () => {
    const t0 = createZoneTree();
    expect(() => addZone(t0, { name: "x", maskRef: M }, "nope")).toThrow();
    expect(() => removeZone(t0, "nope")).toThrow();
    expect(() => moveZone(t0, "nope", null)).toThrow();
    expect(() => updateZone(t0, "nope", { name: "x" })).toThrow();
  });
});
