import { describe, it, expect } from "vitest";
import { rgbToOklab, oklabToRgb, oklabToOklch, oklchToOklab, oklchToRgb } from "./oklab";

describe("oklab", () => {
  it("round-trips sRGB through OkLab", () => {
    const samples = [
      { r: 0, g: 0, b: 0 },
      { r: 1, g: 1, b: 1 },
      { r: 1, g: 0, b: 0 },
      { r: 0.2, g: 0.5, b: 0.8 },
      { r: 0.9, g: 0.4, b: 0.1 },
    ];
    for (const s of samples) {
      const back = oklabToRgb(rgbToOklab(s));
      expect(back.r).toBeCloseTo(s.r, 3);
      expect(back.g).toBeCloseTo(s.g, 3);
      expect(back.b).toBeCloseTo(s.b, 3);
    }
  });

  it("round-trips OkLab through OkLCh", () => {
    const lab = rgbToOklab({ r: 0.6, g: 0.3, b: 0.7 });
    const back = oklchToOklab(oklabToOklch(lab));
    expect(back.L).toBeCloseTo(lab.L, 5);
    expect(back.a).toBeCloseTo(lab.a, 5);
    expect(back.b).toBeCloseTo(lab.b, 5);
  });

  it("oklchToRgb produces valid sRGB", () => {
    const c = oklchToRgb(0.5, 0.1, 210);
    expect(c.r).toBeGreaterThanOrEqual(0);
    expect(c.r).toBeLessThanOrEqual(1);
    expect(c.g).toBeGreaterThanOrEqual(0);
    expect(c.g).toBeLessThanOrEqual(1);
    expect(c.b).toBeGreaterThanOrEqual(0);
    expect(c.b).toBeLessThanOrEqual(1);
    // Cool blue-ish: b channel should dominate.
    expect(c.b).toBeGreaterThan(c.r);
  });
});
