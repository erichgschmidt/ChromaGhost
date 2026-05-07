// Zone-aware color pass.
//
// Algorithm:
//   1. Build a per-pixel "owning zone" map: the deepest zone whose mask covers
//      this pixel. Pixels covered by no zone fall back to the macro pass.
//   2. For each owning zone, resolve its effective ZoneStyle (inheritance walk)
//      and build a zone ramp (mood + material + style overrides).
//   3. Compute a per-zone histogram from the source grayscale, masked to the
//      pixels owned by that zone. Anchor the ramp to that local histogram.
//   4. For each pixel, sample its owner's ramp at the histogram-normalized
//      position of its source value, blend with valuePreservation against the
//      source luminance.

import type { ImageBuffer, Mood, ColorPassOutput, RGB, ValueRamp } from "./types";
import type { ZoneId, ZoneTree } from "./zoneTree";
import { walkDepthFirst } from "./zoneTree";
import { resolveEffectiveStyle } from "./inheritance";
import { computeHistogram, quartileAnchors, type Quantiles } from "./histogram";
import { buildValueRamp, sampleRamp } from "./palette";
import { materialById, applyMaterialToRamp } from "./materials";

export interface ZonedColorPassInput {
  grayscale: ImageBuffer;
  mood: Mood;
  tree: ZoneTree;
  /** Mask per zone, length = w*h, 0..255. Missing entries treated as no coverage. */
  zoneMasks: Record<ZoneId, Uint8Array>;
  /** Macro overrides applied to the root (no-zone) ramp. */
  globalOverrides?: {
    chromaScale?: number;
    hueOffset?: number;
    hueDriftScale?: number;
    valuePreservation?: number;
  };
  /** Material assignment override map (zone.materialId is preferred if set). */
  materialOverrides?: Record<ZoneId, string>;
  /**
   * If true, pixels not owned by any zone are written as fully transparent
   * (alpha=0) instead of the macro-pass color. Default: false.
   * Set to true so the output layer masks itself to the union of captured zones.
   */
  unownedTransparent?: boolean;
}

export interface ZonedColorPassOutput extends ColorPassOutput {
  /** Per-zone resolved data, useful for the UI / editable layer stack. */
  zoneOutputs: Record<ZoneId, {
    ramp: ValueRamp;
    quantiles: Quantiles;
    pixelCount: number;
    valuePreservation: number;
  }>;
  /** Pixel ownership: zoneId per pixel, or "" for "fallback to macro". */
  ownerMap: string[];
}

interface ZoneCompiled {
  id: ZoneId;
  ramp: ValueRamp;
  quantiles: Quantiles;
  pixelCount: number;
  valuePres: number;
}

const MASK_THRESHOLD = 128;

function zoneRamp(
  mood: Mood,
  style: ReturnType<typeof resolveEffectiveStyle>,
  materialId: string | null,
  globalOverrides: ZonedColorPassInput["globalOverrides"],
): ValueRamp {
  // Compose overrides: zone style nudges hue offset / chroma relative to mood.
  const moodDom = mood.paletteSeeds[0];
  const styleHueOffset = style.hueFamily.h - moodDom.h;
  const styleChromaScale = moodDom.chroma > 0 ? style.hueFamily.chroma / moodDom.chroma : 1;

  const base = buildValueRamp(mood, {
    hueDriftScale: globalOverrides?.hueDriftScale ?? 1,
    chromaScale: (globalOverrides?.chromaScale ?? 1) * styleChromaScale * (style.saturation / 0.7),
    hueOffset: (globalOverrides?.hueOffset ?? 0) + styleHueOffset,
  });

  if (!materialId) return base;
  const mat = materialById(materialId);
  return applyMaterialToRamp(base, mat, 0.85);
}

/** Build zoneMasks-aware owner map: deepest covering zone wins. "" = no zone. */
export function buildOwnerMap(
  tree: ZoneTree,
  zoneMasks: Record<ZoneId, Uint8Array>,
  pixelCount: number,
): string[] {
  const owners = new Array<string>(pixelCount).fill("");
  const depths = new Int8Array(pixelCount); // 0 = unset
  walkDepthFirst(tree, (node, depth) => {
    const mask = zoneMasks[node.id];
    if (!mask || mask.length !== pixelCount) return;
    const d = depth + 1; // depth starts at 0 here for roots, +1 so 0 means "unset"
    for (let i = 0; i < pixelCount; i++) {
      if (mask[i] >= MASK_THRESHOLD && d > depths[i]) {
        depths[i] = d;
        owners[i] = node.id;
      }
    }
  });
  return owners;
}

export function generateZonedColorPass(input: ZonedColorPassInput): ZonedColorPassOutput {
  const { grayscale, mood, tree, zoneMasks, globalOverrides, materialOverrides } = input;
  const w = grayscale.width;
  const h = grayscale.height;
  const src = grayscale.data;
  const n = w * h;

  // 1. Owner map.
  const owners = buildOwnerMap(tree, zoneMasks, n);

  // 2. Macro fallback ramp + quantiles (used wherever owners[i] === "").
  const macroRamp = buildValueRamp(mood, {
    hueDriftScale: globalOverrides?.hueDriftScale ?? 1,
    chromaScale: globalOverrides?.chromaScale ?? 1,
    hueOffset: globalOverrides?.hueOffset ?? 0,
  });
  const macroPres = globalOverrides?.valuePreservation ?? mood.defaultValuePreservation;
  const macroQ = quartileAnchors(computeHistogram(grayscale));

  // 3. Per-zone compilation: resolve style, build ramp, compute zone-local histogram.
  const compiled: Record<ZoneId, ZoneCompiled> = {};
  const zoneOutputs: ZonedColorPassOutput["zoneOutputs"] = {};

  walkDepthFirst(tree, (node) => {
    const mask = zoneMasks[node.id];
    if (!mask) return;
    // Build a coverage mask restricted to pixels this zone actually OWNS
    // (deepest cover) — children don't steal from parent's histogram.
    const ownerMask = new Uint8Array(n);
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (owners[i] === node.id) { ownerMask[i] = 255; count++; }
    }
    if (count === 0) return;

    const style = resolveEffectiveStyle(node.id, tree, mood);
    const matId = materialOverrides?.[node.id] ?? node.materialId ?? null;
    const ramp = zoneRamp(mood, style, matId, globalOverrides);
    const hist = computeHistogram(grayscale, ownerMask);
    const q = quartileAnchors(hist);
    const valuePres = style.valuePreservation;

    compiled[node.id] = { id: node.id, ramp, quantiles: q, pixelCount: count, valuePres };
    zoneOutputs[node.id] = { ramp, quantiles: q, pixelCount: count, valuePreservation: valuePres };
  });

  // 4. Pixel pass.
  const unownedTransparent = input.unownedTransparent ?? false;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const ownerId = owners[i];
    const owned = ownerId !== "" && !!compiled[ownerId];
    if (!owned && unownedTransparent) {
      // alpha already 0 (Uint8ClampedArray init), leave RGB at 0
      continue;
    }
    let ramp: ValueRamp;
    let q: Quantiles;
    let valuePres: number;
    if (owned) {
      const c = compiled[ownerId];
      ramp = c.ramp;
      q = c.quantiles;
      valuePres = c.valuePres;
    } else {
      ramp = macroRamp;
      q = macroQ;
      valuePres = macroPres;
    }

    const v = src[i];
    const denom = Math.max(1e-6, q.p95 - q.p05);
    let t = (v - q.p05) / denom;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const c: RGB = sampleRamp(ramp, t);

    const rampLum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const targetLum = rampLum * (1 - valuePres) + v * valuePres;
    const ratio = rampLum < 1e-6 ? 1 : targetLum / rampLum;

    const r = Math.min(1, c.r * ratio);
    const g = Math.min(1, c.g * ratio);
    const b = Math.min(1, c.b * ratio);

    const j = i * 4;
    out[j] = (r * 255 + 0.5) | 0;
    out[j + 1] = (g * 255 + 0.5) | 0;
    out[j + 2] = (b * 255 + 0.5) | 0;
    out[j + 3] = 255;
  }

  return {
    width: w,
    height: h,
    pixels: out,
    ramp: macroRamp,
    quantiles: macroQ,
    valuePreservation: macroPres,
    zoneOutputs,
    ownerMap: owners,
  };
}

