// Bake a ChromaGhost ramp + value-preservation behavior into a Photoshop
// Gradient Map. Pure engine — no UXP / Photoshop dependencies.
//
// The output stops, when applied via PS Gradient Map adjustment to the SOURCE
// grayscale, must reproduce the per-pixel color the engine would produce at
// the same value-preservation setting (within ~1/255 luma).

import type { ValueRamp, RGB } from "./types";
import { sampleRamp } from "./palette";

export interface GradientMapStop {
  /** 0..1 along the gradient (PS uses 0..4096; your caller will scale). */
  position: number;
  rgb: RGB;
}

export interface GradientMap {
  stops: GradientMapStop[];   // length >= 2, monotonic position, ends at 0 and 1
  smooth: boolean;            // suggest false; PS interpolates between stops linearly
}

export interface RampToStopsArgs {
  ramp: ValueRamp;
  /** Source-grayscale histogram anchors used by the engine pass. */
  quantiles: { p05: number; p30: number; p70: number; p95: number };
  /** 0..1 — how much to pull color luminance back toward source luminance. */
  valuePreservation: number;
  /** How many gradient stops to emit. Default 33 (gives smooth GM in PS). */
  samples?: number;
}

const DEFAULT_SAMPLES = 33;

/**
 * Bake a ramp + value-preservation into a Gradient Map.
 *
 * Algorithm: sample N evenly-spaced source values v in [0,1]. For each:
 *   - Map v -> t over [p05, p95], clamp.
 *   - Sample ramp at t -> base RGB c.
 *   - Compute rampLum, targetLum = mix(rampLum, v, valuePreservation),
 *     scale c by ratio (clamped to 1).
 *   - Emit a stop at position v with the resulting color.
 */
export function rampToGradientMap(args: RampToStopsArgs): GradientMap {
  const { ramp, quantiles, valuePreservation } = args;
  const samples = Math.max(2, args.samples ?? DEFAULT_SAMPLES);
  const lo = quantiles.p05;
  const hi = quantiles.p95;
  const denom = Math.max(1e-6, hi - lo);

  const stops: GradientMapStop[] = new Array(samples);
  for (let i = 0; i < samples; i++) {
    const v = i / (samples - 1);
    let t = (v - lo) / denom;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const c = sampleRamp(ramp, t);

    const rampLum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const targetLum = rampLum * (1 - valuePreservation) + v * valuePreservation;
    const ratio = rampLum < 1e-6 ? 1 : targetLum / rampLum;

    const r = Math.max(0, Math.min(1, c.r * ratio));
    const g = Math.max(0, Math.min(1, c.g * ratio));
    const b = Math.max(0, Math.min(1, c.b * ratio));

    stops[i] = { position: v, rgb: { r, g, b } };
  }

  // Force exact endpoints to remove float drift.
  stops[0].position = 0;
  stops[stops.length - 1].position = 1;

  return { stops, smooth: false };
}

/**
 * Convenience: build the GM the way the macro pass would (uses the document
 * histogram anchors directly).
 */
export function macroGradientMap(
  ramp: ValueRamp,
  quantiles: { p05: number; p30: number; p70: number; p95: number },
  valuePreservation: number,
  samples?: number,
): GradientMap {
  return rampToGradientMap({ ramp, quantiles, valuePreservation, samples });
}
