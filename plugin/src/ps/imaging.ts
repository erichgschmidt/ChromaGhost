// Pixel I/O bridge between Photoshop's Imaging API and the engine's
// `ImageBuffer` / `ColorPassOutput` types.

import type { ImageBuffer, ColorPassOutput } from "../engine/types";

const { imaging, app } = require("photoshop");

/**
 * Read pixels of a layer and convert RGBA8 -> luminance Float32 (0..1).
 * Must be called inside `executeAsModal`.
 */
export async function readLayerAsImageBuffer(
  documentId: number,
  layerId: number,
): Promise<ImageBuffer> {
  if (!imaging || !imaging.getPixels) {
    throw new Error("Imaging API unavailable. Requires Photoshop 24.2+.");
  }

  // UXP: getPixels returns a PhotoshopImageData wrapper; exact shape isn't
  // strictly typed in the host, so cast at the boundary.
  const result: any = await imaging.getPixels({
    documentID: documentId,
    layerID: layerId,
    componentSize: 8,
    applyAlpha: false,
    colorSpace: "RGB",
  });

  const id = result.imageData;
  const raw = await id.getData();
  const src: Uint8Array = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  const w: number = id.width;
  const h: number = id.height;
  const components: number = id.components ?? (src.length / (w * h));

  const data = new Float32Array(w * h);
  if (components === 4 || components === 3) {
    for (let i = 0, p = 0; i < data.length; i++, p += components) {
      const r = src[p] / 255;
      const g = src[p + 1] / 255;
      const b = src[p + 2] / 255;
      // Rec. 709 luma — cheap and good enough as input to the engine.
      data[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
  } else if (components === 1) {
    for (let i = 0; i < data.length; i++) data[i] = src[i] / 255;
  } else {
    if (id.dispose) id.dispose();
    throw new Error(`Unexpected pixel components: ${components}`);
  }

  if (id.dispose) id.dispose();
  return { width: w, height: h, data };
}

/**
 * Write a `ColorPassOutput.pixels` (RGBA8) buffer to an existing layer.
 * Must be called inside `executeAsModal`.
 */
export async function writeColorPassToLayer(
  documentId: number,
  layerId: number,
  output: ColorPassOutput,
  targetBounds?: { left: number; top: number; right: number; bottom: number },
): Promise<void> {
  if (!imaging || !imaging.putPixels) {
    throw new Error("imaging.putPixels unavailable. Requires Photoshop 24.2+.");
  }

  // ColorPassOutput.pixels is Uint8ClampedArray; UXP wants Uint8Array.
  const buf = new Uint8Array(
    output.pixels.buffer,
    output.pixels.byteOffset,
    output.pixels.byteLength,
  );

  // UXP: createImageDataFromBuffer is the supported path for writing back
  // RGBA pixel data on recent PS builds.
  const imageData: any = await imaging.createImageDataFromBuffer(buf, {
    width: output.width,
    height: output.height,
    components: 4,
    chunky: true,
    colorProfile: "sRGB IEC61966-2.1",
    colorSpace: "RGB",
  });

  try {
    const opts: any = {
      documentID: documentId,
      layerID: layerId,
      imageData,
    };
    if (targetBounds) opts.targetBounds = targetBounds;
    await imaging.putPixels(opts);
  } finally {
    if (imageData.dispose) imageData.dispose();
  }
}

/** Convenience: dimensions of the active document, for full-canvas writes. */
export function activeDocSize(): { width: number; height: number } {
  const doc = app.activeDocument;
  if (!doc) throw new Error("No active document.");
  return { width: doc.width, height: doc.height };
}
