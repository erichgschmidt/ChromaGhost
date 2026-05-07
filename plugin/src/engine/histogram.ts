import type { ImageBuffer } from "./types";

export interface Histogram {
  /** 256 bins, summing to data.length (or masked count). */
  bins: Uint32Array;
  total: number;
}

export function computeHistogram(img: ImageBuffer, mask?: Uint8Array): Histogram {
  const bins = new Uint32Array(256);
  const d = img.data;
  let total = 0;
  if (mask) {
    if (mask.length !== d.length) throw new Error("mask length mismatch");
    for (let i = 0; i < d.length; i++) {
      if (mask[i] === 0) continue;
      const b = Math.max(0, Math.min(255, (d[i] * 255) | 0));
      bins[b]++;
      total++;
    }
  } else {
    for (let i = 0; i < d.length; i++) {
      const b = Math.max(0, Math.min(255, (d[i] * 255) | 0));
      bins[b]++;
    }
    total = d.length;
  }
  return { bins, total };
}

/** Returns the value (0..1) at the given quantile (0..1). */
export function quantile(h: Histogram, q: number): number {
  if (h.total === 0) return q;
  const target = q * h.total;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += h.bins[i];
    if (acc >= target) return i / 255;
  }
  return 1;
}

export interface Quantiles { p05: number; p30: number; p70: number; p95: number; }

export function quartileAnchors(h: Histogram): Quantiles {
  return {
    p05: quantile(h, 0.05),
    p30: quantile(h, 0.30),
    p70: quantile(h, 0.70),
    p95: quantile(h, 0.95),
  };
}
