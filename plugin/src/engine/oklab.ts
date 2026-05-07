// Color conversions. We work in OkLab/OkLCh for hue ops because hue is
// perceptually stable there — sRGB hue rotation produces ugly bends.
//
// Refs: https://bottosson.github.io/posts/oklab/

import type { OkLab, OkLCh, RGB } from "./types";

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// sRGB <-> linear
const srgbToLin = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const linToSrgb = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

export function rgbToOklab(rgb: RGB): OkLab {
  const r = srgbToLin(rgb.r);
  const g = srgbToLin(rgb.g);
  const b = srgbToLin(rgb.b);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

export function oklabToRgb(lab: OkLab): RGB {
  const l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.L - 0.0894841775 * lab.a - 1.2914855480 * lab.b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const r =  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  return {
    r: clamp01(linToSrgb(r)),
    g: clamp01(linToSrgb(g)),
    b: clamp01(linToSrgb(b)),
  };
}

export function oklabToOklch(lab: OkLab): OkLCh {
  const C = Math.hypot(lab.a, lab.b);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L: lab.L, C, h };
}

export function oklchToOklab(lch: OkLCh): OkLab {
  const rad = (lch.h * Math.PI) / 180;
  return { L: lch.L, a: Math.cos(rad) * lch.C, b: Math.sin(rad) * lch.C };
}

/** Build an sRGB color from OkLCh. Convenience for ramp construction. */
export function oklchToRgb(L: number, C: number, h: number): RGB {
  return oklabToRgb(oklchToOklab({ L, C, h }));
}
