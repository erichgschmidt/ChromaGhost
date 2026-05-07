// Public engine entrypoint. Pure TypeScript — no UXP imports.
//
// MVP (M1): zero-zone whole-image color pass.
// - Compute histogram of grayscale source.
// - Anchor a 4-stop ramp to the histogram's P05/P30/P70/P95.
// - For each pixel, remap its luminance to a position along the ramp,
//   blend with mood.defaultValuePreservation against the source value.

import type { ImageBuffer, Mood, ColorPassOutput, RGB } from "./types";
import { computeHistogram, quartileAnchors } from "./histogram";
import { buildValueRamp, sampleRamp } from "./palette";

export * from "./types";
export { MOODS, moodById } from "./moods";
export { buildValueRamp, sampleRamp } from "./palette";
export { computeHistogram, quartileAnchors } from "./histogram";
export {
  MATERIALS,
  materialById,
  listMaterials,
  applyMaterialToRamp,
} from "./materials";
export type { Material, MaterialFinish } from "./materials";
export {
  createZoneTree,
  addZone,
  removeZone,
  moveZone,
  updateZone,
  walkDepthFirst,
  ancestorChain,
} from "./zoneTree";
export type {
  ZoneId,
  ZoneNode,
  ZoneTree,
  ZoneStyle,
  ZoneLocks,
  ZoneDepth,
  MaskRef,
  PaletteRole,
} from "./zoneTree";
export { resolveEffectiveStyle } from "./inheritance";

export interface GenerateColorPassInput {
  grayscale: ImageBuffer;
  mood: Mood;
  /** 0..1, overrides mood.defaultValuePreservation if provided. */
  valuePreservation?: number;
  /** 0..2, scales lighting-mode hue drift. Default 1. */
  hueDriftScale?: number;
  /** 0..2, multiplies chroma across the ramp (saturation). Default 1. */
  chromaScale?: number;
  /** Degrees, added to every ramp stop's hue (warm/cool nudge). Default 0. */
  hueOffset?: number;
}

export function generateColorPass(input: GenerateColorPassInput): ColorPassOutput {
  const { grayscale, mood } = input;
  const hist = computeHistogram(grayscale);
  const q = quartileAnchors(hist);
  const ramp = buildValueRamp(mood, {
    hueDriftScale: input.hueDriftScale ?? 1,
    chromaScale: input.chromaScale ?? 1,
    hueOffset: input.hueOffset ?? 0,
  });
  const valuePres = input.valuePreservation ?? mood.defaultValuePreservation;

  const w = grayscale.width;
  const h = grayscale.height;
  const src = grayscale.data;
  const out = new Uint8ClampedArray(w * h * 4);

  // Map source luminance v -> normalized t over [p05, p95], with soft endpoints.
  const lo = q.p05;
  const hi = q.p95;
  const denom = Math.max(1e-6, hi - lo);

  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    let t = (v - lo) / denom;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const c: RGB = sampleRamp(ramp, t);

    // Value preservation: blend the ramp's luminance toward the source value.
    // Cheap luminance approximation in sRGB; perceptual enough for blending.
    const rampLum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const targetLum = rampLum * (1 - valuePres) + v * valuePres;
    const ratio = rampLum < 1e-6 ? 1 : targetLum / rampLum;

    const r = Math.min(1, c.r * ratio);
    const g = Math.min(1, c.g * ratio);
    const b = Math.min(1, c.b * ratio);

    const j = i * 4;
    out[j]     = (r * 255 + 0.5) | 0;
    out[j + 1] = (g * 255 + 0.5) | 0;
    out[j + 2] = (b * 255 + 0.5) | 0;
    out[j + 3] = 255;
  }

  return {
    width: w,
    height: h,
    pixels: out,
    ramp,
    quantiles: q,
    valuePreservation: valuePres,
  };
}
