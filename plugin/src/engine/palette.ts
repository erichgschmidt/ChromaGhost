// Build a 4-stop value ramp from a Mood's dominant hue family + lighting mode.
// The ramp is what every "macro" (zero-zone) pass interpolates across the
// histogram-anchored value range.

import type { Mood, ValueRamp, LightingMode, RGB } from "./types";
import { oklchToRgb } from "./oklab";

interface RampShape {
  /** OkLab L values for shadow / lower-mid / upper-mid / highlight. */
  L: [number, number, number, number];
  /** Chroma multipliers per stop (shadows usually carry less chroma). */
  Cmul: [number, number, number, number];
  /** Hue offsets per stop (degrees). Shadows cool, highlights warm — or per mood. */
  Hoff: [number, number, number, number];
}

const SHAPES: Record<LightingMode, RampShape> = {
  painterly: {
    L:    [0.18, 0.42, 0.70, 0.92],
    Cmul: [0.55, 0.95, 1.00, 0.55],
    Hoff: [-12,   -4,    4,   12], // cool shadows, warm highlights
  },
  studio: {
    L:    [0.22, 0.48, 0.72, 0.95],
    Cmul: [0.65, 1.00, 1.00, 0.45],
    Hoff: [-6,   -2,    2,    6],
  },
  dramatic: {
    L:    [0.10, 0.35, 0.72, 0.96],
    Cmul: [0.45, 1.00, 1.05, 0.65],
    Hoff: [-20,  -8,    8,   20],
  },
};

/**
 * Build a 4-stop ramp from the mood's dominant hue family.
 * A `hueDriftScale` of 1.0 uses the lighting-mode default; 0 disables.
 */
export function buildValueRamp(mood: Mood, hueDriftScale = 1): ValueRamp {
  const seed = mood.paletteSeeds[0];
  const shape = SHAPES[mood.lightingMode];
  const stops: RGB[] = [];
  for (let i = 0; i < 4; i++) {
    const L = shape.L[i];
    const C = seed.chroma * shape.Cmul[i];
    const h = seed.h + shape.Hoff[i] * hueDriftScale;
    stops.push(oklchToRgb(L, C, h));
  }
  return [stops[0], stops[1], stops[2], stops[3]];
}

/** Linear interpolation between two RGBs in straight (already-srgb) space. */
export function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

/** Sample a 4-stop ramp at t in [0,1] using piecewise lerp at 0, 1/3, 2/3, 1. */
export function sampleRamp(ramp: ValueRamp, t: number): RGB {
  if (t <= 0) return ramp[0];
  if (t >= 1) return ramp[3];
  const seg = t * 3;
  const i = Math.min(2, Math.floor(seg));
  return lerpRgb(ramp[i], ramp[i + 1], seg - i);
}
