import { describe, it, expect, beforeEach } from "vitest";
import { actions, _getStateForTests } from "./store";

beforeEach(() => {
  actions.reset();
});

describe("store", () => {
  it("starts empty", () => {
    const s = _getStateForTests();
    expect(s.tree.rootIds).toEqual([]);
    expect(s.selectedZoneId).toBeNull();
  });

  it("addZone appends to root and selects it", () => {
    const id = actions.addZone({ name: "Skin", parentId: null, maskKind: "selection" });
    const s = _getStateForTests();
    expect(s.tree.rootIds).toContain(id);
    expect(s.selectedZoneId).toBe(id);
    expect(s.tree.nodes[id].name).toBe("Skin");
    expect(s.tree.nodes[id].maskRef.kind).toBe("selection");
  });

  it("addZone with parent nests", () => {
    const a = actions.addZone({ name: "Body", parentId: null, maskKind: "bitmap" });
    const b = actions.addZone({ name: "Hand", parentId: a, maskKind: "bitmap" });
    const s = _getStateForTests();
    expect(s.tree.nodes[b].parentId).toBe(a);
    expect(s.tree.nodes[a].children).toContain(b);
  });

  it("removeZone clears selection if removed", () => {
    const id = actions.addZone({ name: "X", parentId: null, maskKind: "selection" });
    actions.removeZone(id);
    const s = _getStateForTests();
    expect(s.tree.nodes[id]).toBeUndefined();
    expect(s.selectedZoneId).toBeNull();
  });

  it("removeZone keeps other selection", () => {
    const a = actions.addZone({ name: "A", parentId: null, maskKind: "selection" });
    const b = actions.addZone({ name: "B", parentId: null, maskKind: "selection" });
    actions.selectZone(a);
    actions.removeZone(b);
    expect(_getStateForTests().selectedZoneId).toBe(a);
  });

  it("updateZone applies patch", () => {
    const id = actions.addZone({ name: "X", parentId: null, maskKind: "selection" });
    actions.updateZone(id, { name: "Renamed", paletteRole: "accent", materialId: "aged-gold" });
    const n = _getStateForTests().tree.nodes[id];
    expect(n.name).toBe("Renamed");
    expect(n.paletteRole).toBe("accent");
    expect(n.materialId).toBe("aged-gold");
  });

  it("selectZone toggles selection", () => {
    const id = actions.addZone({ name: "X", parentId: null, maskKind: "selection" });
    actions.selectZone(null);
    expect(_getStateForTests().selectedZoneId).toBeNull();
    actions.selectZone(id);
    expect(_getStateForTests().selectedZoneId).toBe(id);
  });

  it("moveZone reparents", () => {
    const a = actions.addZone({ name: "A", parentId: null, maskKind: "selection" });
    const b = actions.addZone({ name: "B", parentId: null, maskKind: "selection" });
    actions.moveZone(b, a);
    const s = _getStateForTests();
    expect(s.tree.nodes[b].parentId).toBe(a);
    expect(s.tree.nodes[a].children).toContain(b);
  });

  it("reset clears everything", () => {
    actions.addZone({ name: "X", parentId: null, maskKind: "selection" });
    actions.reset();
    const s = _getStateForTests();
    expect(s.tree.rootIds).toEqual([]);
    expect(s.selectedZoneId).toBeNull();
  });
});
