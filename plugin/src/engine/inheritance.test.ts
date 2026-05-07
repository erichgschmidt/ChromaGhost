import { describe, it, expect } from "vitest";
import { addZone, createZoneTree, type MaskRef } from "./zoneTree";
import { resolveEffectiveStyle } from "./inheritance";
import { MOODS } from "./moods";

const M: MaskRef = { kind: "selection" };
const mood = MOODS[0];

describe("resolveEffectiveStyle", () => {
  it("returns mood defaults when no overrides", () => {
    const a = addZone(createZoneTree(), { name: "A", maskRef: M });
    const s = resolveEffectiveStyle(a.id, a.tree, mood);
    expect(s.hueFamily).toEqual(mood.paletteSeeds[0]);
    expect(s.valuePreservation).toBe(mood.defaultValuePreservation);
    expect(s.saturation).toBeCloseTo(0.7);
    expect(s.contrast).toBeCloseTo(0.7);
    expect(s.hueShiftByValue).toBe(mood.hueShiftByValue ?? 10);
  });

  it("child inherits parent overrides", () => {
    const a = addZone(createZoneTree(), {
      name: "A",
      maskRef: M,
      overrides: { saturation: 0.2 },
    });
    const b = addZone(a.tree, { name: "B", maskRef: M }, a.id);
    const s = resolveEffectiveStyle(b.id, b.tree, mood);
    expect(s.saturation).toBeCloseTo(0.2);
  });

  it("child override beats parent override", () => {
    const a = addZone(createZoneTree(), {
      name: "A",
      maskRef: M,
      overrides: { saturation: 0.2 },
    });
    const b = addZone(a.tree, {
      name: "B",
      maskRef: M,
      overrides: { saturation: 0.9 },
    }, a.id);
    const s = resolveEffectiveStyle(b.id, b.tree, mood);
    expect(s.saturation).toBeCloseTo(0.9);
  });

  it("parent lock prevents child from overriding that field", () => {
    const a = addZone(createZoneTree(), {
      name: "A",
      maskRef: M,
      overrides: { saturation: 0.2 },
      locks: { value: true },
    });
    const b = addZone(a.tree, {
      name: "B",
      maskRef: M,
      overrides: { saturation: 0.9, contrast: 0.9 },
    }, a.id);
    const s = resolveEffectiveStyle(b.id, b.tree, mood);
    expect(s.saturation).toBeCloseTo(0.2); // frozen by parent
    expect(s.contrast).toBeCloseTo(0.7); // frozen at default since child can't override
  });

  it("hue lock freezes hueFamily and hueShiftByValue together", () => {
    const a = addZone(createZoneTree(), {
      name: "A",
      maskRef: M,
      overrides: { hueShiftByValue: 5 },
      locks: { hue: true },
    });
    const b = addZone(a.tree, {
      name: "B",
      maskRef: M,
      overrides: { hueShiftByValue: 90, hueFamily: { h: 0, spread: 5, chroma: 0.1 } },
    }, a.id);
    const s = resolveEffectiveStyle(b.id, b.tree, mood);
    expect(s.hueShiftByValue).toBe(5);
    expect(s.hueFamily).toEqual(mood.paletteSeeds[0]);
  });

  it("locks.all freezes everything for descendants", () => {
    const a = addZone(createZoneTree(), {
      name: "A",
      maskRef: M,
      overrides: { saturation: 0.1, contrast: 0.1 },
      locks: { all: true },
    });
    const b = addZone(a.tree, {
      name: "B",
      maskRef: M,
      overrides: { saturation: 1, contrast: 1, valuePreservation: 0 },
    }, a.id);
    const s = resolveEffectiveStyle(b.id, b.tree, mood);
    expect(s.saturation).toBeCloseTo(0.1);
    expect(s.contrast).toBeCloseTo(0.1);
    expect(s.valuePreservation).toBe(mood.defaultValuePreservation);
  });

  it("three-level inheritance chains overrides correctly", () => {
    const a = addZone(createZoneTree(), {
      name: "A",
      maskRef: M,
      overrides: { saturation: 0.3 },
    });
    const b = addZone(a.tree, {
      name: "B",
      maskRef: M,
      overrides: { contrast: 0.4 },
    }, a.id);
    const c = addZone(b.tree, {
      name: "C",
      maskRef: M,
      overrides: { valuePreservation: 0.5 },
    }, b.id);
    const s = resolveEffectiveStyle(c.id, c.tree, mood);
    expect(s.saturation).toBeCloseTo(0.3);
    expect(s.contrast).toBeCloseTo(0.4);
    expect(s.valuePreservation).toBeCloseTo(0.5);
  });
});
