import { describe, it, expect } from "vitest";
import { rampToGradientMap, macroGradientMap } from "./gradientMap";
import { buildValueRamp, sampleRamp } from "./palette";
import { MOODS, moodById } from "./moods";
import type { ValueRamp, RGB } from "./types";

const Q_FULL = { p05: 0, p30: 0.3, p70: 0.7, p95: 1 };
const Q_TYPICAL = { p05: 0.05, p30: 0.3, p70: 0.7, p95: 0.95 };

const RAMP_A: ValueRamp = [
  { r: 0.05, g: 0.07, b: 0.20 },
  { r: 0.30, g: 0.25, b: 0.45 },
  { r: 0.70, g: 0.55, b: 0.40 },
  { r: 0.95, g: 0.92, b: 0.80 },
];

const RAMP_B: ValueRamp = [
  { r: 0.20, g: 0.05, b: 0.05 },
  { r: 0.55, g: 0.20, b: 0.15 },
  { r: 0.85, g: 0.55, b: 0.30 },
  { r: 0.98, g: 0.95, b: 0.70 },
];

function lum(c: RGB): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

describe("rampToGradientMap", () => {
  it("emits at least 2 stops", () => {
    const gm = rampToGradientMap({ ramp: RAMP_A, quantiles: Q_FULL, valuePreservation: 0.5, samples: 2 });
    expect(gm.stops.length).toBe(2);
  });

  it("emits exactly `samples` stops when given", () => {
    const gm = rampToGradientMap({ ramp: RAMP_A, quantiles: Q_FULL, valuePreservation: 0.5, samples: 17 });
    expect(gm.stops.length).toBe(17);
  });

  it("positions are strictly monotonic, start at 0, end at 1", () => {
    const gm = rampToGradientMap({ ramp: RAMP_A, quantiles: Q_TYPICAL, valuePreservation: 0.8, samples: 33 });
    expect(gm.stops[0].position).toBe(0);
    expect(gm.stops[gm.stops.length - 1].position).toBe(1);
    for (let i = 1; i < gm.stops.length; i++) {
      expect(gm.stops[i].position).toBeGreaterThan(gm.stops[i - 1].position);
    }
  });

  it("valuePreservation=1 makes stop luminance ≈ position v", () => {
    const gm = rampToGradientMap({ ramp: RAMP_A, quantiles: Q_TYPICAL, valuePreservation: 1, samples: 33 });
    for (const s of gm.stops) {
      // Color may clip near the top end where ratio>1; allow small slack near 1.
      const tol = s.position > 0.97 ? 0.05 : 1 / 255 + 1e-3;
      expect(Math.abs(lum(s.rgb) - s.position)).toBeLessThanOrEqual(tol);
    }
  });

  it("valuePreservation=0 matches sampleRamp(ramp, t) exactly", () => {
    const gm = rampToGradientMap({ ramp: RAMP_A, quantiles: Q_TYPICAL, valuePreservation: 0, samples: 33 });
    const lo = Q_TYPICAL.p05;
    const hi = Q_TYPICAL.p95;
    const denom = hi - lo;
    for (const s of gm.stops) {
      let t = (s.position - lo) / denom;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const expected = sampleRamp(RAMP_A, t);
      expect(s.rgb.r).toBeCloseTo(expected.r, 6);
      expect(s.rgb.g).toBeCloseTo(expected.g, 6);
      expect(s.rgb.b).toBeCloseTo(expected.b, 6);
    }
  });

  it("all rgb channels are within [0,1]", () => {
    const gm = rampToGradientMap({ ramp: RAMP_B, quantiles: Q_TYPICAL, valuePreservation: 0.9, samples: 33 });
    for (const s of gm.stops) {
      expect(s.rgb.r).toBeGreaterThanOrEqual(0);
      expect(s.rgb.g).toBeGreaterThanOrEqual(0);
      expect(s.rgb.b).toBeGreaterThanOrEqual(0);
      expect(s.rgb.r).toBeLessThanOrEqual(1);
      expect(s.rgb.g).toBeLessThanOrEqual(1);
      expect(s.rgb.b).toBeLessThanOrEqual(1);
    }
  });

  it("different valuePreservation produces different stops", () => {
    const gm0 = rampToGradientMap({ ramp: RAMP_A, quantiles: Q_TYPICAL, valuePreservation: 0, samples: 17 });
    const gm1 = rampToGradientMap({ ramp: RAMP_A, quantiles: Q_TYPICAL, valuePreservation: 1, samples: 17 });
    let differs = false;
    for (let i = 0; i < gm0.stops.length; i++) {
      const a = gm0.stops[i].rgb;
      const b = gm1.stops[i].rgb;
      if (Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) > 1e-3) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });

  it("different ramps produce different stops", () => {
    const gmA = rampToGradientMap({ ramp: RAMP_A, quantiles: Q_TYPICAL, valuePreservation: 0.5, samples: 17 });
    const gmB = rampToGradientMap({ ramp: RAMP_B, quantiles: Q_TYPICAL, valuePreservation: 0.5, samples: 17 });
    let differs = false;
    for (let i = 0; i < gmA.stops.length; i++) {
      const a = gmA.stops[i].rgb;
      const b = gmB.stops[i].rgb;
      if (Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) > 1e-3) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });

  it("with quantiles {p05:0,p95:1} and valuePreservation=0 matches pure-ramp fallback", () => {
    const gm = rampToGradientMap({ ramp: RAMP_A, quantiles: Q_FULL, valuePreservation: 0, samples: 33 });
    for (const s of gm.stops) {
      const expected = sampleRamp(RAMP_A, s.position);
      expect(s.rgb.r).toBeCloseTo(expected.r, 6);
      expect(s.rgb.g).toBeCloseTo(expected.g, 6);
      expect(s.rgb.b).toBeCloseTo(expected.b, 6);
    }
  });

  it("macroGradientMap matches rampToGradientMap with same args", () => {
    const a = rampToGradientMap({ ramp: RAMP_A, quantiles: Q_TYPICAL, valuePreservation: 0.7, samples: 21 });
    const b = macroGradientMap(RAMP_A, Q_TYPICAL, 0.7, 21);
    expect(b.stops.length).toBe(a.stops.length);
    for (let i = 0; i < a.stops.length; i++) {
      expect(b.stops[i].position).toBeCloseTo(a.stops[i].position, 10);
      expect(b.stops[i].rgb.r).toBeCloseTo(a.stops[i].rgb.r, 10);
      expect(b.stops[i].rgb.g).toBeCloseTo(a.stops[i].rgb.g, 10);
      expect(b.stops[i].rgb.b).toBeCloseTo(a.stops[i].rgb.b, 10);
    }
  });

  it("default samples is 33 when not specified", () => {
    const gm = rampToGradientMap({ ramp: RAMP_A, quantiles: Q_TYPICAL, valuePreservation: 0.5 });
    expect(gm.stops.length).toBe(33);
  });

  it("heroic-fantasy macro ramp has cool shadows (blue > red at dark end)", () => {
    // Find a heroic-fantasy-ish mood; otherwise use the first mood as a robust fallback.
    const mood =
      moodById?.("heroic-fantasy") ??
      MOODS.find((m) => /hero|fantasy/i.test(m.id) || /hero|fantasy/i.test(m.name)) ??
      MOODS[0];
    const ramp = buildValueRamp(mood);
    const gm = rampToGradientMap({
      ramp,
      quantiles: Q_TYPICAL,
      valuePreservation: mood.defaultValuePreservation,
      samples: 33,
    });
    const dark = gm.stops[0].rgb;
    expect(dark.b).toBeGreaterThan(dark.r);
  });
});
