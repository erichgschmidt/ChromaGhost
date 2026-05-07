// Pure engine types — no UXP / Photoshop dependencies.

export interface ImageBuffer {
  width: number;
  height: number;
  /** Luminance, 0..1, length = width*height. */
  data: Float32Array;
}

export interface RGB { r: number; g: number; b: number; }   // 0..1
export interface HSL { h: number; s: number; l: number; }   // h: 0..360, s/l: 0..1
export interface OkLab { L: number; a: number; b: number; }
export interface OkLCh { L: number; C: number; h: number; }

export type LightingMode = "painterly" | "studio" | "dramatic";

export interface HueFamily {
  /** Center hue, degrees 0..360. */
  h: number;
  /** Allowed spread around the center, degrees. */
  spread: number;
  /** Target chroma in OkLCh, 0..0.4-ish. */
  chroma: number;
}

/** A 4-stop ramp: shadow / lower-mid / upper-mid / highlight. */
export type ValueRamp = [RGB, RGB, RGB, RGB];

export interface Mood {
  id: string;
  name: string;
  /** dominant, secondary, accent, support — used for zoned passes; macro pass uses dominant. */
  paletteSeeds: HueFamily[];
  lightingMode: LightingMode;
  /** 0..1, how much of source value to preserve over ramp value. Default 0.8. */
  defaultValuePreservation: number;
  /** Hue shift across the value range (degrees, applied via t in [0,1]). */
  hueShiftByValue?: number;
}

export interface ColorPassOutput {
  width: number;
  height: number;
  /** RGBA, 0..255, length = width*height*4. Premade preview buffer. */
  pixels: Uint8ClampedArray;
  /** The 4-stop ramp used (useful for emitting a Photoshop gradient map). */
  ramp: ValueRamp;
  /** The histogram quantiles the ramp was anchored to. */
  quantiles: { p05: number; p30: number; p70: number; p95: number };
  /** Effective value preservation after global overrides. */
  valuePreservation: number;
}
