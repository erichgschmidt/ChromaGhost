import { describe, it, expect } from "vitest";
import { generateColorPass } from "./index";
import { moodById } from "./moods";
import type { ImageBuffer } from "./types";

function gradient(w: number, h: number): ImageBuffer {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data[y * w + x] = x / (w - 1);
  return { width: w, height: h, data };
}

describe("generateColorPass (M1, zero-zone)", () => {
  it("produces correctly-sized RGBA output", () => {
    const img = gradient(64, 32);
    const out = generateColorPass({ grayscale: img, mood: moodById("heroic-fantasy") });
    expect(out.width).toBe(64);
    expect(out.height).toBe(32);
    expect(out.pixels.length).toBe(64 * 32 * 4);
    for (let i = 3; i < out.pixels.length; i += 4) {
      expect(out.pixels[i]).toBe(255); // alpha
    }
  });

  it("dark pixels map to shadow-end of ramp; bright to highlight-end", () => {
    const img = gradient(256, 1);
    const out = generateColorPass({
      grayscale: img,
      mood: moodById("heroic-fantasy"),
      valuePreservation: 0,
    });
    const lum = (i: number) =>
      0.2126 * out.pixels[i] + 0.7152 * out.pixels[i + 1] + 0.0722 * out.pixels[i + 2];
    expect(lum(0)).toBeLessThan(lum(out.pixels.length - 4));
  });

  it("returns histogram quantiles in monotonic order", () => {
    const out = generateColorPass({
      grayscale: gradient(128, 128),
      mood: moodById("dark-fantasy"),
    });
    expect(out.quantiles.p05).toBeLessThan(out.quantiles.p30);
    expect(out.quantiles.p30).toBeLessThan(out.quantiles.p70);
    expect(out.quantiles.p70).toBeLessThan(out.quantiles.p95);
  });

  it("ramp has 4 stops moving from dark to light", () => {
    const out = generateColorPass({
      grayscale: gradient(32, 32),
      mood: moodById("muted-painterly"),
    });
    expect(out.ramp.length).toBe(4);
    const lum = (c: { r: number; g: number; b: number }) =>
      0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    expect(lum(out.ramp[0])).toBeLessThan(lum(out.ramp[3]));
  });

  it("high value preservation keeps source luminance close to original", () => {
    const img = gradient(256, 1);
    const out = generateColorPass({
      grayscale: img,
      mood: moodById("heroic-fantasy"),
      valuePreservation: 1,
    });
    // Mid-pixel source value ~ 0.5; output luminance should track closely.
    const i = 128 * 4;
    const lum = (0.2126 * out.pixels[i] + 0.7152 * out.pixels[i + 1] + 0.0722 * out.pixels[i + 2]) / 255;
    expect(Math.abs(lum - 0.5)).toBeLessThan(0.1);
  });
});
