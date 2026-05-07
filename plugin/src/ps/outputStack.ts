// Editable output stack. For M3 this is just one new pixel layer named
// "ChromaGhost Color Pass" placed directly above the source layer.
// Future milestones will add gradient maps, masks, and a containing group.

import type { ColorPassOutput } from "../engine/types";
import { createPixelLayerAbove, selectLayerById } from "./layers";
import { writeColorPassToLayer } from "./imaging";

export const COLOR_PASS_LAYER_NAME = "ChromaGhost Color Pass";

export interface BuildOutputArgs {
  documentId: number;
  sourceLayerId: number;
  output: ColorPassOutput;
  targetBounds?: { left: number; top: number; right: number; bottom: number };
}

/**
 * Build the output: create a new pixel layer above the source and write the
 * color-pass pixels into it. Returns the new layer id. Must be called inside
 * `executeAsModal`.
 */
export async function buildColorPassOutput(args: BuildOutputArgs): Promise<number> {
  const newLayerId = await createPixelLayerAbove(
    args.sourceLayerId,
    COLOR_PASS_LAYER_NAME,
  );
  await writeColorPassToLayer(
    args.documentId,
    newLayerId,
    args.output,
    args.targetBounds,
  );
  // Re-select the new layer so it's the active one when the modal exits.
  await selectLayerById(newLayerId);
  return newLayerId;
}
