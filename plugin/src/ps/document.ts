// Photoshop document utilities. Thin wrappers around the UXP DOM so the rest
// of the adapter (and especially the UI) doesn't import `photoshop` directly.

// UXP: photoshop module is provided by the host as a CommonJS external.
const { app, core } = require("photoshop");

export interface ActiveDoc {
  id: number;
  width: number;
  height: number;
  /** "RGB", "Grayscale", "CMYK", etc. */
  mode: string;
}

export function getActiveDoc(): ActiveDoc {
  const doc = app.activeDocument;
  if (!doc) throw new Error("No active document.");
  // UXP: doc.mode is a string-ish enum; coerce to string for our own use.
  const mode: string = (doc.mode && (doc.mode as any).toString?.()) ?? String(doc.mode ?? "");
  return {
    id: doc.id,
    width: doc.width,
    height: doc.height,
    mode,
  };
}

export async function executeAsModal<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  return core.executeAsModal(fn, { commandName: name });
}
