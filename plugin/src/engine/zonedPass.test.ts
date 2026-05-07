import { describe, it, expect } from "vitest";
import { generateZonedColorPass, buildOwnerMap } from "./zonedPass";
import { addZone, createZoneTree } from "./zoneTree";
import { moodById } from "./moods";
import type { ImageBuffer } from "./types";

function gradient(w: number, h: number): ImageBuffer {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data[y * w + x] = x / (w - 1);
  return { width: w, height: h, data };
}

function fullMask(n: number): Uint8Array {
  const m = new Uint8Array(n);
  m.fill(255);
  return m;
}

function leftHalfMask(w: number, h: number): Uint8Array {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w / 2; x++) m[y * w + x] = 255;
  return m;
}

function rightHalfMask(w: number, h: number): Uint8Array {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = Math.floor(w / 2); x < w; x++) m[y * w + x] = 255;
  return m;
}

const stubMaskRef = { kind: "bitmap" as const };

describe("generateZonedColorPass", () => {
  it("with empty tree behaves like the macro pass", () => {
    const img = gradient(64, 16);
    const out = generateZonedColorPass({
      grayscale: img,
      mood: moodById("heroic-fantasy"),
      tree: createZoneTree(),
      zoneMasks: {},
    });
    expect(out.width).toBe(64);
    expect(out.height).toBe(16);
    expect(out.pixels.length).toBe(64 * 16 * 4);
    for (let i = 3; i < out.pixels.length; i += 4) expect(out.pixels[i]).toBe(255);
    expect(Object.keys(out.zoneOutputs)).toHaveLength(0);
  });

  it("a single full-coverage zone owns every pixel", () => {
    const img = gradient(32, 8);
    const t0 = createZoneTree();
    const { tree, id } = addZone(t0, { name: "All", maskRef: stubMaskRef });
    const out = generateZonedColorPass({
      grayscale: img,
      mood: moodById("heroic-fantasy"),
      tree,
      zoneMasks: { [id]: fullMask(32 * 8) },
    });
    expect(out.zoneOutputs[id].pixelCount).toBe(32 * 8);
    for (let i = 0; i < out.ownerMap.length; i++) expect(out.ownerMap[i]).toBe(id);
  });

  it("two sibling zones split coverage; deeper child wins on overlap", () => {
    const img = gradient(40, 4);
    const n = 40 * 4;
    let { tree } = addZone(createZoneTree(), { name: "Left", maskRef: stubMaskRef });
    const leftId = tree.rootIds[0];
    const r = addZone(tree, { name: "Right", maskRef: stubMaskRef });
    tree = r.tree;
    const rightId = r.id;
    // Add a child of Left that covers the entire image — should override Left
    // wherever its mask is set, but here we only mask its left-quarter.
    const leftQuarter = new Uint8Array(n);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 10; x++) leftQuarter[y * 40 + x] = 255;
    const c = addZone(tree, { name: "LeftDetail", maskRef: stubMaskRef }, leftId);
    tree = c.tree;
    const detailId = c.id;

    const out = generateZonedColorPass({
      grayscale: img,
      mood: moodById("dark-fantasy"),
      tree,
      zoneMasks: {
        [leftId]:  leftHalfMask(40, 4),
        [rightId]: rightHalfMask(40, 4),
        [detailId]: leftQuarter,
      },
    });

    expect(out.ownerMap[0]).toBe(detailId);          // x=0 owned by deepest
    expect(out.ownerMap[15]).toBe(leftId);            // x=15 only Left covers
    expect(out.ownerMap[25]).toBe(rightId);           // x=25 right side
    expect(out.zoneOutputs[detailId].pixelCount).toBe(40); // 10 cols × 4 rows
    expect(out.zoneOutputs[leftId].pixelCount).toBe(40);   // 10 cols × 4 rows (right of detail)
    expect(out.zoneOutputs[rightId].pixelCount).toBe(80);  // 20 cols × 4 rows
  });

  it("pixels with no zone fall back to macro ramp", () => {
    const img = gradient(20, 1);
    const { tree, id } = addZone(createZoneTree(), { name: "L", maskRef: stubMaskRef });
    const out = generateZonedColorPass({
      grayscale: img,
      mood: moodById("heroic-fantasy"),
      tree,
      zoneMasks: { [id]: leftHalfMask(20, 1) },
    });
    for (let x = 0; x < 10; x++) expect(out.ownerMap[x]).toBe(id);
    for (let x = 10; x < 20; x++) expect(out.ownerMap[x]).toBe("");
  });

  it("buildOwnerMap is deterministic and respects mask threshold", () => {
    const t0 = createZoneTree();
    const { tree, id } = addZone(t0, { name: "Z", maskRef: stubMaskRef });
    const mask = new Uint8Array(10);
    mask[0] = 127;  // below threshold
    mask[1] = 128;  // exactly threshold
    mask[2] = 255;
    const owners = buildOwnerMap(tree, { [id]: mask }, 10);
    expect(owners[0]).toBe("");
    expect(owners[1]).toBe(id);
    expect(owners[2]).toBe(id);
    expect(owners[5]).toBe("");
  });

  it("zones with assigned material produce distinct ramps from no-material zones", () => {
    const img = gradient(16, 2);
    let { tree, id } = addZone(createZoneTree(), { name: "A", maskRef: stubMaskRef });
    const r = addZone(tree, { name: "B", maskRef: stubMaskRef });
    tree = r.tree;
    const bId = r.id;
    tree = { ...tree, nodes: { ...tree.nodes, [bId]: { ...tree.nodes[bId], materialId: "glow-emissive" } } };

    const out = generateZonedColorPass({
      grayscale: img,
      mood: moodById("heroic-fantasy"),
      tree,
      zoneMasks: {
        [id]: leftHalfMask(16, 2),
        [bId]: rightHalfMask(16, 2),
      },
    });

    const a = out.zoneOutputs[id].ramp[2];
    const b = out.zoneOutputs[bId].ramp[2];
    const distance = Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
    expect(distance).toBeGreaterThan(0.05);
  });
});
