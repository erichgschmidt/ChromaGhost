import { describe, it, expect } from "vitest";
import type { RGB, ValueRamp } from "./types";
import { rgbToOklab, oklabToOklch } from "./oklab";
import {
  MATERIALS,
  materialById,
  listMaterials,
  applyMaterialToRamp,
} from "./materials";

const lum = (c: RGB) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const chroma = (c: RGB) => oklabToOklch(rgbToOklab(c)).C;

const sampleBase: ValueRamp = [
  { r: 0.05, g: 0.05, b: 0.05 },
  { r: 0.30, g: 0.30, b: 0.30 },
  { r: 0.65, g: 0.65, b: 0.65 },
  { r: 0.95, g: 0.95, b: 0.95 },
];

describe("materials catalog", () => {
  it("has exactly 10 entries", () => {
    expect(MATERIALS.length).toBe(10);
    expect(listMaterials().length).toBe(10);
  });

  it("every material has a 4-stop ramp with valid RGB channels", () => {
    for (const m of MATERIALS) {
      expect(m.valueRamp.length).toBe(4);
      for (const stop of m.valueRamp) {
        expect(stop.r).toBeGreaterThanOrEqual(0);
        expect(stop.r).toBeLessThanOrEqual(1);
        expect(stop.g).toBeGreaterThanOrEqual(0);
        expect(stop.g).toBeLessThanOrEqual(1);
        expect(stop.b).toBeGreaterThanOrEqual(0);
        expect(stop.b).toBeLessThanOrEqual(1);
      }
    }
  });

  it("materialById returns correct material and throws on unknown", () => {
    expect(materialById("aged-gold").id).toBe("aged-gold");
    expect(() => materialById("does-not-exist")).toThrow(/unknown material/);
  });

  it("glow-emissive has magical >= 0.6", () => {
    expect(materialById("glow-emissive").finish.magical).toBeGreaterThanOrEqual(0.6);
  });

  it("brushed-steel has saturation < 0.4", () => {
    expect(materialById("brushed-steel").saturation).toBeLessThan(0.4);
  });

  it("velvet-cape midtone chroma > highlight chroma", () => {
    const v = materialById("velvet-cape").valueRamp;
    const midC = Math.max(chroma(v[1]), chroma(v[2]));
    const hiC = chroma(v[3]);
    expect(midC).toBeGreaterThan(hiC);
  });

  it("aged-gold ramp luminance is monotonically increasing", () => {
    const r = materialById("aged-gold").valueRamp;
    expect(lum(r[0])).toBeLessThan(lum(r[1]));
    expect(lum(r[1])).toBeLessThan(lum(r[2]));
    expect(lum(r[2])).toBeLessThan(lum(r[3]));
  });

  it("applyMaterialToRamp(blend=0) returns base unchanged", () => {
    const mat = materialById("aged-gold");
    const out = applyMaterialToRamp(sampleBase, mat, 0);
    for (let i = 0; i < 4; i++) {
      expect(out[i].r).toBeCloseTo(sampleBase[i].r, 6);
      expect(out[i].g).toBeCloseTo(sampleBase[i].g, 6);
      expect(out[i].b).toBeCloseTo(sampleBase[i].b, 6);
    }
  });

  it("applyMaterialToRamp(blend=1) returns the material ramp", () => {
    const mat = materialById("velvet-cape");
    const out = applyMaterialToRamp(sampleBase, mat, 1);
    for (let i = 0; i < 4; i++) {
      expect(out[i].r).toBeCloseTo(mat.valueRamp[i].r, 6);
      expect(out[i].g).toBeCloseTo(mat.valueRamp[i].g, 6);
      expect(out[i].b).toBeCloseTo(mat.valueRamp[i].b, 6);
    }
  });

  it("applyMaterialToRamp(blend=0.5) is luminance-monotonic", () => {
    for (const mat of MATERIALS) {
      const out = applyMaterialToRamp(sampleBase, mat, 0.5);
      expect(lum(out[0])).toBeLessThanOrEqual(lum(out[1]) + 1e-6);
      expect(lum(out[1])).toBeLessThanOrEqual(lum(out[2]) + 1e-6);
      expect(lum(out[2])).toBeLessThanOrEqual(lum(out[3]) + 1e-6);
    }
  });

  it("all material ids are unique", () => {
    const ids = new Set(MATERIALS.map((m) => m.id));
    expect(ids.size).toBe(MATERIALS.length);
  });
});
