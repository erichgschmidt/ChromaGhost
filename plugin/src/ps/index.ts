// Public API of the Photoshop adapter. The UI imports only from this module;
// nothing else in the codebase should `require("photoshop")` directly.

export { getActiveDoc, executeAsModal } from "./document";
export type { ActiveDoc } from "./document";

export { getActiveLayer, createPixelLayerAbove, selectLayerById } from "./layers";
export type { LayerRef } from "./layers";

export { readLayerAsImageBuffer, writeColorPassToLayer, activeDocSize } from "./imaging";

export {
  readSelectionAsMask,
  readLayerMask,
  readFlatColorMask,
  detectFlatColorZones,
} from "./masks";

export { buildColorPassOutput, COLOR_PASS_LAYER_NAME } from "./outputStack";
export type { BuildOutputArgs } from "./outputStack";

export { buildEditableOutput } from "./editableOutput";
export type { BuildEditableArgs, BuildEditableResult } from "./editableOutput";
