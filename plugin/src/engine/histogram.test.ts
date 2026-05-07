import { describe, it, expect } from "vitest";
import { computeHistogram, quantile, quartileAnchors } from "./histogram";
import type { ImageBuffer } from "./types";

function ramp(n: number): ImageBuffer {
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = i / (n - 1);
  return { width: n, height: 1, data };
}

describe("histogram", () => {
  it("counts every pixel into 256 bins", () => {
    const img = ramp(1000);
    const h = computeHistogram(img);
    expect(h.total).toBe(1000);
    let sum = 0;
    for (const v of h.bins) sum += v;
    expect(sum).toBe(1000);
  });

  it("respects masks", () => {
    const img = ramp(100);
    const mask = new Uint8Array(100);
    for (let i = 0; i < 50; i++) mask[i] = 255;
    const h = computeHistogram(img, mask);
    expect(h.total).toBe(50);
  });

  it("quantile of a uniform ramp is approximately q", () => {
    const img = ramp(10_000);
    const h = computeHistogram(img);
    expect(quantile(h, 0.5)).toBeCloseTo(0.5, 1);
    expect(quantile(h, 0.05)).toBeCloseTo(0.05, 1);
    expect(quantile(h, 0.95)).toBeCloseTo(0.95, 1);
  });

  it("quartile anchors are monotonic", () => {
    const img = ramp(10_000);
    const q = quartileAnchors(computeHistogram(img));
    expect(q.p05).toBeLessThan(q.p30);
    expect(q.p30).toBeLessThan(q.p70);
    expect(q.p70).toBeLessThan(q.p95);
  });
});
