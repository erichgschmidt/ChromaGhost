// Mask import helpers for the Photoshop adapter.
//
// Produces Uint8Array masks aligned to the active document canvas:
//   0   = outside zone
//   255 = fully inside
//   intermediate = partial coverage
//
// All `imaging.getPixels` calls below must run inside `core.executeAsModal`
// at the call site (same idiom as `imaging.ts`).

// UXP: photoshop is provided by the host as a CommonJS external.
const { app, action, imaging } = require("photoshop");

import type { RGB } from "../engine/types";

// ---------- shared helpers ---------------------------------------------------

interface DocSize {
  width: number;
  height: number;
}

function getDocSize(documentId: number): DocSize {
  // UXP: app.documents is iterable but not a real array; use a plain loop.
  const docs: any[] = (app as any).documents ?? [];
  for (const d of docs) {
    if (d.id === documentId) return { width: d.width, height: d.height };
  }
  // Fallback to the active document if the id isn't found in the listing.
  const active = app.activeDocument;
  if (!active) throw new Error("No active document.");
  return { width: active.width, height: active.height };
}

/**
 * Read raw pixel bytes from a UXP `imaging.getPixels` result. Returns the
 * concrete Uint8Array, the source dimensions, and component count.
 */
async function getPixelsRaw(opts: any): Promise<{
  src: Uint8Array;
  width: number;
  height: number;
  components: number;
  dispose: () => void;
}> {
  if (!imaging || !imaging.getPixels) {
    throw new Error("Imaging API unavailable. Requires Photoshop 24.2+.");
  }
  const result: any = await imaging.getPixels(opts);
  const id = result.imageData;
  const raw = await id.getData();
  const src: Uint8Array = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  const width: number = id.width;
  const height: number = id.height;
  const components: number = id.components ?? (src.length / (width * height));
  return {
    src,
    width,
    height,
    components,
    dispose: () => { if (id.dispose) id.dispose(); },
  };
}

/**
 * Composite a sub-rectangle grayscale buffer onto a full-canvas Uint8Array.
 * `srcChannel` selects which channel of an N-component source is used as the
 * grayscale value (use 0 for single-channel sources).
 */
function pasteGrayIntoCanvas(args: {
  out: Uint8Array;
  canvasW: number;
  canvasH: number;
  src: Uint8Array;
  srcW: number;
  srcH: number;
  components: number;
  srcChannel: number;
  bounds: { left: number; top: number };
}) {
  const { out, canvasW, canvasH, src, srcW, srcH, components, srcChannel, bounds } = args;
  for (let y = 0; y < srcH; y++) {
    const dy = bounds.top + y;
    if (dy < 0 || dy >= canvasH) continue;
    for (let x = 0; x < srcW; x++) {
      const dx = bounds.left + x;
      if (dx < 0 || dx >= canvasW) continue;
      const sIdx = (y * srcW + x) * components + srcChannel;
      out[dy * canvasW + dx] = src[sIdx];
    }
  }
}

// ---------- selection --------------------------------------------------------

/**
 * Read the active document's current pixel selection as a mask aligned to the
 * canvas. Returns null if there is no active selection.
 *
 * Strategy: many UXP builds don't expose a direct `imaging.getSelection`. We
 * snapshot the selection into a temporary alpha channel via batchPlay, read
 * that channel's pixels with `imaging.getPixels`, then delete the channel.
 */
export async function readSelectionAsMask(documentId: number): Promise<Uint8Array | null> {
  const doc = app.activeDocument;
  if (!doc || doc.id !== documentId) {
    // We need the doc to be active for the channel-roundtrip strategy.
    throw new Error("readSelectionAsMask: target document must be active.");
  }

  // Quick existence probe via DOM (cheap, doesn't always reflect feathered).
  const selBounds = doc.selection?.bounds;
  if (!selBounds) return null;

  const tempName = `__chromaghost_sel_${Date.now()}`;
  const { width, height } = getDocSize(documentId);
  const out = new Uint8Array(width * height);

  // Save current selection to a new alpha channel.
  // UXP: equivalent of Select > Save Selection... > New Channel.
  await action.batchPlay(
    [
      {
        _obj: "duplicate",
        _target: [{ _ref: "channel", _property: "selection" }],
        name: tempName,
        _options: { dialogOptions: "dontDisplay" },
      },
    ],
    { synchronousExecution: true, modalBehavior: "execute" },
  );

  let info: { src: Uint8Array; width: number; height: number; components: number; dispose: () => void } | null = null;
  try {
    // Read by channel name. Some PS builds want `channelName`, others
    // `channelID`. We try by name first; on failure fall back to the
    // currently-active channel id (-3 selectedChannel) after selecting it.
    try {
      info = await getPixelsRaw({
        documentID: documentId,
        // UXP: channelName is the supported selector on recent builds.
        channelName: tempName,
        componentSize: 8,
        applyAlpha: false,
      });
    } catch {
      // Fall back: select the temp channel so it becomes the active channel.
      await action.batchPlay(
        [{
          _obj: "select",
          _target: [{ _ref: "channel", _name: tempName }],
          _options: { dialogOptions: "dontDisplay" },
        }],
        { synchronousExecution: true, modalBehavior: "execute" },
      );
      info = await getPixelsRaw({
        documentID: documentId,
        channelID: -3, // selectedChannel
        componentSize: 8,
        applyAlpha: false,
      });
    }

    // Channel pixels cover the full canvas in PS — paste at (0,0).
    pasteGrayIntoCanvas({
      out,
      canvasW: width,
      canvasH: height,
      src: info.src,
      srcW: info.width,
      srcH: info.height,
      components: info.components,
      srcChannel: 0,
      bounds: { left: 0, top: 0 },
    });
  } finally {
    if (info) info.dispose();
    // Clean up: re-select RGB composite, then delete temp channel.
    try {
      await action.batchPlay(
        [
          {
            _obj: "select",
            _target: [{ _ref: "channel", _enum: "channel", _value: "RGB" }],
            _options: { dialogOptions: "dontDisplay" },
          },
          {
            _obj: "delete",
            _target: [{ _ref: "channel", _name: tempName }],
            _options: { dialogOptions: "dontDisplay" },
          },
        ],
        { synchronousExecution: true, modalBehavior: "execute" },
      );
    } catch {
      // Best-effort cleanup; surface nothing.
    }
  }

  return out;
}

// ---------- layer mask -------------------------------------------------------

/**
 * Read a layer's user mask (pixel or rasterized vector mask) as a Uint8Array
 * aligned to the canvas. Returns null if the layer has no mask.
 */
export async function readLayerMask(
  documentId: number,
  layerId: number,
): Promise<Uint8Array | null> {
  const { width, height } = getDocSize(documentId);

  let info;
  try {
    info = await getPixelsRaw({
      documentID: documentId,
      layerID: layerId,
      componentSize: 8,
      applyAlpha: false,
      // UXP: channelID -2 targets the layer's user mask.
      channelID: -2,
    });
  } catch {
    return null;
  }

  // If the imaging API reports a tiny / empty mask, treat as absent.
  if (info.width === 0 || info.height === 0) {
    info.dispose();
    return null;
  }

  // The mask raster covers the canvas; paste at (0,0).
  const out = new Uint8Array(width * height);
  pasteGrayIntoCanvas({
    out,
    canvasW: width,
    canvasH: height,
    src: info.src,
    srcW: info.width,
    srcH: info.height,
    components: info.components,
    srcChannel: 0,
    bounds: { left: 0, top: 0 },
  });
  info.dispose();
  return out;
}

// ---------- flat-color masks -------------------------------------------------

interface FlatColorArgs {
  documentId: number;
  layerId: number;
  targetRgb: RGB;
  tolerance?: number;
}

async function readLayerRgba(documentId: number, layerId: number) {
  return getPixelsRaw({
    documentID: documentId,
    layerID: layerId,
    componentSize: 8,
    applyAlpha: false,
    colorSpace: "RGB",
  });
}

/**
 * Build a mask of pixels in `layerId` whose sRGB color matches `targetRgb`
 * within `tolerance` (0..255 max abs per-channel diff, default 8).
 */
export async function readFlatColorMask(args: FlatColorArgs): Promise<Uint8Array> {
  const tol = Math.max(0, args.tolerance ?? 8);
  const { width: canvasW, height: canvasH } = getDocSize(args.documentId);
  const out = new Uint8Array(canvasW * canvasH);

  const info = await readLayerRgba(args.documentId, args.layerId);
  try {
    const tr = Math.round(args.targetRgb.r * 255);
    const tg = Math.round(args.targetRgb.g * 255);
    const tb = Math.round(args.targetRgb.b * 255);

    const c = info.components;
    const hasAlpha = c === 4;
    // Layer pixel buffers cover the layer bounds. We don't know the bounds
    // here, so assume full-canvas (the typical case for a zone-ID layer).
    const w = info.width;
    const h = info.height;
    const limitW = Math.min(w, canvasW);
    const limitH = Math.min(h, canvasH);

    for (let y = 0; y < limitH; y++) {
      for (let x = 0; x < limitW; x++) {
        const p = (y * w + x) * c;
        if (hasAlpha && info.src[p + 3] === 0) continue;
        const dr = Math.abs(info.src[p] - tr);
        const dg = Math.abs(info.src[p + 1] - tg);
        const db = Math.abs(info.src[p + 2] - tb);
        if (dr <= tol && dg <= tol && db <= tol) {
          out[y * canvasW + x] = 255;
        }
      }
    }
  } finally {
    info.dispose();
  }
  return out;
}

interface DetectArgs {
  documentId: number;
  layerId: number;
  minPixels?: number;
}

/**
 * Auto-segment a flat-color zone-ID layer into one mask per distinct color.
 *
 * Note: O(W*H) on the source layer. For very large documents this may be
 * slow; consumers can downscale beforehand or pre-bucket via the layer's
 * indexed-color flatten.
 */
export async function detectFlatColorZones(args: DetectArgs): Promise<
  Array<{ rgb: RGB; mask: Uint8Array; pixelCount: number }>
> {
  const minPixels = args.minPixels ?? 64;
  const { width: canvasW, height: canvasH } = getDocSize(args.documentId);

  const info = await readLayerRgba(args.documentId, args.layerId);
  try {
    const c = info.components;
    const hasAlpha = c === 4;
    const w = info.width;
    const h = info.height;
    const limitW = Math.min(w, canvasW);
    const limitH = Math.min(h, canvasH);

    // Bucket by packed RGB key (24-bit). Map<number, count>.
    const counts = new Map<number, number>();
    for (let y = 0; y < limitH; y++) {
      for (let x = 0; x < limitW; x++) {
        const p = (y * w + x) * c;
        if (hasAlpha && info.src[p + 3] === 0) continue;
        const key = (info.src[p] << 16) | (info.src[p + 1] << 8) | info.src[p + 2];
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    // Keep only buckets above threshold.
    const keep = new Map<number, { mask: Uint8Array; count: number }>();
    for (const [key, n] of counts) {
      if (n >= minPixels) keep.set(key, { mask: new Uint8Array(canvasW * canvasH), count: n });
    }

    // Second pass: write mask pixels.
    for (let y = 0; y < limitH; y++) {
      for (let x = 0; x < limitW; x++) {
        const p = (y * w + x) * c;
        if (hasAlpha && info.src[p + 3] === 0) continue;
        const key = (info.src[p] << 16) | (info.src[p + 1] << 8) | info.src[p + 2];
        const entry = keep.get(key);
        if (entry) entry.mask[y * canvasW + x] = 255;
      }
    }

    const result: Array<{ rgb: RGB; mask: Uint8Array; pixelCount: number }> = [];
    for (const [key, entry] of keep) {
      const r = ((key >> 16) & 0xff) / 255;
      const g = ((key >> 8) & 0xff) / 255;
      const b = (key & 0xff) / 255;
      result.push({ rgb: { r, g, b }, mask: entry.mask, pixelCount: entry.count });
    }
    // Sort largest first — usually the most useful ordering for UI.
    result.sort((a, b) => b.pixelCount - a.pixelCount);
    return result;
  } finally {
    info.dispose();
  }
}
