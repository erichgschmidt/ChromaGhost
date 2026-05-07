// Materials catalog — materials are BEHAVIORS, not just colors (PRD §7).
// Each material defines a 4-stop value ramp plus surface response parameters
// that downstream passes use to modulate chroma, hue shift, and specular pop.

import type { RGB, ValueRamp } from "./types";
import { oklchToRgb } from "./oklab";

export interface MaterialFinish {
  /** 0 = matte, 1 = glossy. */
  matte: number;
  /** 0 = flat, 1 = reflective. */
  reflective: number;
  /** 0 = natural, 1 = magical/emissive. */
  magical: number;
}

export interface Material {
  id: string;
  name: string;
  /** 4-stop ramp: shadow / lower-mid / upper-mid / highlight. */
  valueRamp: ValueRamp;
  /** 0..1, multiplier for chroma. */
  saturation: number;
  /** 0..1. */
  valuePreservation: number;
  /** 0..1, how much chroma survives in shadows. */
  shadowChroma: number;
  /** 0..1, specular response. */
  highlightPop: number;
  /** 0..1. */
  contrast: number;
  /** -180..180. */
  hueShiftByValue: number;
  finish: MaterialFinish;
}

interface RampSpec {
  /** [shadow, lower-mid, upper-mid, highlight] OkLab L. */
  L: [number, number, number, number];
  /** Per-stop chroma. */
  C: [number, number, number, number];
  /** Per-stop hue (degrees). */
  h: [number, number, number, number];
}

function buildRamp(spec: RampSpec): ValueRamp {
  const stops: RGB[] = [];
  for (let i = 0; i < 4; i++) {
    stops.push(oklchToRgb(spec.L[i], spec.C[i], spec.h[i]));
  }
  return [stops[0], stops[1], stops[2], stops[3]];
}

export const MATERIALS: Material[] = [
  {
    id: "brushed-steel",
    name: "Brushed Steel",
    valueRamp: buildRamp({
      L: [0.20, 0.45, 0.72, 0.97],
      C: [0.020, 0.025, 0.020, 0.010],
      h: [230, 225, 220, 215],
    }),
    saturation: 0.25,
    valuePreservation: 0.85,
    shadowChroma: 0.4,
    highlightPop: 0.9,
    contrast: 0.85,
    hueShiftByValue: -8,
    finish: { matte: 0.2, reflective: 0.85, magical: 0.0 },
  },
  {
    id: "aged-gold",
    name: "Aged Gold",
    valueRamp: buildRamp({
      L: [0.22, 0.48, 0.74, 0.94],
      C: [0.04, 0.10, 0.13, 0.09],
      h: [55, 70, 80, 85],
    }),
    saturation: 0.7,
    valuePreservation: 0.78,
    shadowChroma: 0.55,
    highlightPop: 0.8,
    contrast: 0.75,
    hueShiftByValue: 14,
    finish: { matte: 0.3, reflective: 0.7, magical: 0.05 },
  },
  {
    id: "velvet-cape",
    name: "Velvet Cape",
    valueRamp: buildRamp({
      L: [0.12, 0.32, 0.55, 0.78],
      C: [0.06, 0.16, 0.18, 0.05],
      h: [355, 350, 350, 348],
    }),
    saturation: 0.85,
    valuePreservation: 0.82,
    shadowChroma: 0.7,
    highlightPop: 0.15,
    contrast: 0.6,
    hueShiftByValue: -4,
    finish: { matte: 0.9, reflective: 0.05, magical: 0.0 },
  },
  {
    id: "skin-warm",
    name: "Skin (Warm)",
    valueRamp: buildRamp({
      L: [0.28, 0.52, 0.74, 0.92],
      C: [0.05, 0.09, 0.08, 0.04],
      h: [20, 28, 35, 50],
    }),
    saturation: 0.55,
    valuePreservation: 0.88,
    shadowChroma: 0.65,
    highlightPop: 0.4,
    contrast: 0.55,
    hueShiftByValue: 18,
    finish: { matte: 0.7, reflective: 0.2, magical: 0.0 },
  },
  {
    id: "skin-cool",
    name: "Skin (Cool)",
    valueRamp: buildRamp({
      L: [0.26, 0.50, 0.73, 0.93],
      C: [0.04, 0.07, 0.06, 0.03],
      h: [10, 20, 30, 60],
    }),
    saturation: 0.45,
    valuePreservation: 0.88,
    shadowChroma: 0.5,
    highlightPop: 0.45,
    contrast: 0.55,
    hueShiftByValue: 30,
    finish: { matte: 0.7, reflective: 0.2, magical: 0.0 },
  },
  {
    id: "leather",
    name: "Leather",
    valueRamp: buildRamp({
      L: [0.16, 0.36, 0.58, 0.82],
      C: [0.04, 0.08, 0.09, 0.05],
      h: [30, 35, 40, 50],
    }),
    saturation: 0.5,
    valuePreservation: 0.85,
    shadowChroma: 0.55,
    highlightPop: 0.55,
    contrast: 0.7,
    hueShiftByValue: 10,
    finish: { matte: 0.55, reflective: 0.35, magical: 0.0 },
  },
  {
    id: "stone",
    name: "Stone",
    valueRamp: buildRamp({
      L: [0.20, 0.42, 0.66, 0.88],
      C: [0.012, 0.018, 0.020, 0.010],
      h: [60, 70, 80, 90],
    }),
    saturation: 0.2,
    valuePreservation: 0.9,
    shadowChroma: 0.35,
    highlightPop: 0.2,
    contrast: 0.6,
    hueShiftByValue: 6,
    finish: { matte: 0.95, reflective: 0.05, magical: 0.0 },
  },
  {
    id: "glow-emissive",
    name: "Glow (Emissive)",
    valueRamp: buildRamp({
      L: [0.45, 0.65, 0.85, 0.99],
      C: [0.18, 0.22, 0.18, 0.06],
      h: [180, 190, 200, 210],
    }),
    saturation: 0.95,
    valuePreservation: 0.95,
    shadowChroma: 0.95,
    highlightPop: 0.95,
    contrast: 0.5,
    hueShiftByValue: 25,
    finish: { matte: 0.1, reflective: 0.3, magical: 0.95 },
  },
  {
    id: "crystal",
    name: "Crystal",
    valueRamp: buildRamp({
      L: [0.30, 0.55, 0.78, 0.98],
      C: [0.08, 0.12, 0.10, 0.04],
      h: [200, 210, 220, 230],
    }),
    saturation: 0.75,
    valuePreservation: 0.7,
    shadowChroma: 0.7,
    highlightPop: 0.9,
    contrast: 0.85,
    hueShiftByValue: 22,
    finish: { matte: 0.1, reflective: 0.8, magical: 0.4 },
  },
  {
    id: "wood",
    name: "Wood",
    valueRamp: buildRamp({
      L: [0.18, 0.38, 0.60, 0.84],
      C: [0.05, 0.09, 0.10, 0.06],
      h: [25, 32, 40, 50],
    }),
    saturation: 0.55,
    valuePreservation: 0.88,
    shadowChroma: 0.5,
    highlightPop: 0.3,
    contrast: 0.65,
    hueShiftByValue: 12,
    finish: { matte: 0.75, reflective: 0.2, magical: 0.0 },
  },
];

export function materialById(id: string): Material {
  const m = MATERIALS.find((x) => x.id === id);
  if (!m) throw new Error(`unknown material: ${id}`);
  return m;
}

export function listMaterials(): Material[] {
  return MATERIALS;
}

/**
 * Blend a base ramp toward a material ramp.
 * blend=0 returns base unchanged; blend=1 returns the material ramp.
 * Per stop, we lerp each RGB channel.
 */
export function applyMaterialToRamp(
  base: ValueRamp,
  mat: Material,
  blend: number,
): ValueRamp {
  const t = blend < 0 ? 0 : blend > 1 ? 1 : blend;
  const out: RGB[] = [];
  for (let i = 0; i < 4; i++) {
    const a = base[i];
    const b = mat.valueRamp[i];
    out.push({
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t,
    });
  }
  return [out[0], out[1], out[2], out[3]];
}
