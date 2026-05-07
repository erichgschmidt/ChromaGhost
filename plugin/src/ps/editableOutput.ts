// Editable output stack. Emits a top-level Group ("ChromaGhost Color Pass")
// containing per-zone sub-groups (each masked to its zone) with a Gradient Map
// adjustment layer inside, plus a macro fallback Gradient Map masked to the
// inverse of the union of all zone masks.
//
// All UXP mutations must be invoked inside an existing `executeAsModal` block
// — this module never opens its own modal.

import type { ZoneId } from "../engine/zoneTree";
import {
  rampToGradientMap,
  type ColorPassOutput,
  type GradientMap,
  type GradientMapStop,
  type ZonedColorPassOutput,
} from "../engine/index";
import { activeDocSize } from "./imaging";
import { selectLayerById } from "./layers";

// UXP: photoshop is provided by the host as a CommonJS external.
const { app, action, imaging } = require("photoshop");

const TOP_GROUP_NAME = "ChromaGhost Color Pass";
const GRADIENT_RESOLUTION = 4096;

export interface BuildEditableArgs {
  documentId: number;
  sourceLayerId: number;
  output: ColorPassOutput | ZonedColorPassOutput;
  /** Map of zoneId -> mask bitmap (Uint8Array, 0..255, length=w*h). */
  zoneMasks: Record<ZoneId, Uint8Array>;
  /** Optional human-readable zone names (id -> name). Falls back to id. */
  zoneNames?: Record<ZoneId, string>;
  /** Reserved for future placement control. Default: above the source layer. */
  insertAbove?: boolean;
}

export interface BuildEditableResult {
  groupId: number;
  zoneGroupIds: Record<ZoneId, number>;
}

function isZoned(o: ColorPassOutput | ZonedColorPassOutput): o is ZonedColorPassOutput {
  return (o as ZonedColorPassOutput).zoneOutputs !== undefined;
}

// ---------- batchPlay helpers -----------------------------------------------

const BP_OPTS = { synchronousExecution: true, modalBehavior: "execute" as const };

async function bp(commands: any[]): Promise<any[]> {
  // UXP: action.batchPlay returns an array of result descriptors.
  return action.batchPlay(commands, BP_OPTS);
}

/** Active layer id after a make/select. */
function activeLayerId(): number {
  const doc = app.activeDocument;
  if (!doc) throw new Error("No active document.");
  const lyr = doc.activeLayers?.[0];
  if (!lyr) throw new Error("No active layer after batchPlay.");
  return lyr.id as number;
}

// ---------- gradient stop conversion ----------------------------------------

function toPsColorStop(stop: GradientMapStop) {
  return {
    _obj: "colorStop",
    color: {
      _obj: "RGBColor",
      red: Math.round(stop.rgb.r * 255),
      // UXP: PS gradient color objects historically use "grain" for green.
      grain: Math.round(stop.rgb.g * 255),
      blue: Math.round(stop.rgb.b * 255),
    },
    type: { _enum: "colorStopType", _value: "userStop" },
    location: Math.round(stop.position * GRADIENT_RESOLUTION),
    midpoint: 50,
  };
}

function gradientDescriptor(gm: GradientMap, name: string) {
  const colors = gm.stops.map(toPsColorStop);
  // Emit a flat opaque transparency stop pair.
  const transparency = [
    {
      _obj: "transferSpec",
      opacity: { _unit: "percentUnit", _value: 100 },
      location: 0,
      midpoint: 50,
    },
    {
      _obj: "transferSpec",
      opacity: { _unit: "percentUnit", _value: 100 },
      location: GRADIENT_RESOLUTION,
      midpoint: 50,
    },
  ];
  return {
    _obj: "gradientClassEvent",
    name,
    gradientForm: { _enum: "gradientForm", _value: "customStops" },
    interfaceIconFrameDimmed: GRADIENT_RESOLUTION / 16,
    colors,
    transparency,
  };
}

// ---------- batchPlay actions ------------------------------------------------

/** Create a layer group at the current insertion point. Returns its id. */
async function makeGroup(name: string): Promise<number> {
  await bp([
    {
      _obj: "make",
      _target: [{ _ref: "layerSection" }],
      using: { _obj: "layerSection", name },
      _options: { dialogOptions: "dontDisplay" },
    },
  ]);
  return activeLayerId();
}

/** Create a Gradient Map adjustment layer above the current selection. */
async function makeGradientMapLayer(
  name: string,
  gm: GradientMap,
): Promise<number> {
  await bp([
    {
      _obj: "make",
      _target: [{ _ref: "adjustmentLayer" }],
      using: {
        _obj: "adjustmentLayer",
        name,
        type: {
          _obj: "gradientMapClass",
          gradient: gradientDescriptor(gm, name),
        },
      },
      _options: { dialogOptions: "dontDisplay" },
    },
  ]);
  return activeLayerId();
}

/** Create an empty (white) layer mask channel on the current selected layer. */
async function addLayerMaskRevealAll(): Promise<void> {
  await bp([
    {
      _obj: "make",
      new: { _class: "channel" },
      at: { _ref: "channel", _enum: "channel", _value: "mask" },
      using: { _enum: "userMaskEnabled", _value: "revealAll" },
      _options: { dialogOptions: "dontDisplay" },
    },
  ]);
}

/**
 * Remove any pre-existing top-level groups with the given name, so re-running
 * Generate replaces the previous output instead of stacking duplicates.
 */
async function deleteExistingTopGroups(name: string): Promise<void> {
  const doc = app.activeDocument;
  if (!doc) return;
  // doc.layers is the top-level z-order list (deepest at end). Collect ids
  // first; deleting while iterating shifts the array.
  const targets: number[] = [];
  // UXP: `layers` is iterable on the photoshop Document.
  for (const l of doc.layers as Iterable<any>) {
    if (l && l.name === name) targets.push(l.id as number);
  }
  for (const id of targets) {
    try {
      await bp([
        {
          _obj: "delete",
          _target: [{ _ref: "layer", _id: id }],
          _options: { dialogOptions: "dontDisplay" },
        },
      ]);
    } catch {
      // Best-effort cleanup; ignore failures on individual layers.
    }
  }
}

/** Move `childId` into `groupId` so it becomes the topmost child of the group. */
async function moveLayerIntoGroup(childId: number, groupId: number): Promise<void> {
  await bp([
    {
      _obj: "move",
      _target: [{ _ref: "layer", _id: childId }],
      to: { _ref: "layer", _id: groupId },
      adjustment: false,
      version: 5,
      _options: { dialogOptions: "dontDisplay" },
    },
  ]);
}

// ---------- mask pixel writes -----------------------------------------------

async function writeLayerMaskPixels(
  documentId: number,
  layerId: number,
  width: number,
  height: number,
  mask: Uint8Array,
): Promise<void> {
  if (!imaging || !imaging.putPixels || !imaging.createImageDataFromBuffer) {
    throw new Error("Imaging API unavailable. Requires Photoshop 24.2+.");
  }
  // UXP: createImageDataFromBuffer wants a Uint8Array. Mask is single-channel.
  const imageData: any = await imaging.createImageDataFromBuffer(mask, {
    width,
    height,
    components: 1,
    chunky: true,
    colorSpace: "Grayscale",
  });
  try {
    await imaging.putPixels({
      documentID: documentId,
      layerID: layerId,
      // UXP: channelID -2 selects the layer's user mask channel.
      channelID: -2,
      imageData,
    });
  } finally {
    if (imageData.dispose) imageData.dispose();
  }
}

async function applyMaskToLayer(
  documentId: number,
  layerId: number,
  width: number,
  height: number,
  mask: Uint8Array,
): Promise<void> {
  await selectLayerById(layerId);
  await addLayerMaskRevealAll();
  await writeLayerMaskPixels(documentId, layerId, width, height, mask);
}

// ---------- mask math -------------------------------------------------------

function computeInverseUnion(
  zoneIds: ZoneId[],
  zoneMasks: Record<ZoneId, Uint8Array>,
  size: number,
): Uint8Array {
  const out = new Uint8Array(size);
  // Start with 255 ("everywhere"), subtract each zone's coverage.
  out.fill(255);
  for (const id of zoneIds) {
    const m = zoneMasks[id];
    if (!m || m.length !== size) continue;
    for (let i = 0; i < size; i++) {
      const inv = 255 - m[i];
      if (inv < out[i]) out[i] = inv;
    }
  }
  return out;
}

// ---------- main ------------------------------------------------------------

export async function buildEditableOutput(
  args: BuildEditableArgs,
): Promise<BuildEditableResult> {
  const { documentId, sourceLayerId, output, zoneMasks, zoneNames } = args;
  const { width, height } = activeDocSize();
  const pixelCount = width * height;

  // Replace any prior ChromaGhost output so regenerate doesn't stack duplicates.
  await deleteExistingTopGroups(TOP_GROUP_NAME);

  // Anchor insertion above the source layer.
  await selectLayerById(sourceLayerId);

  // Top-level group.
  const groupId = await makeGroup(TOP_GROUP_NAME);

  const zoneGroupIds: Record<ZoneId, number> = {};

  if (!isZoned(output)) {
    // Non-zoned: single Gradient Map inside the group, no mask.
    const gm = rampToGradientMap({
      ramp: output.ramp,
      quantiles: output.quantiles,
      valuePreservation: output.valuePreservation,
    });
    // Ensure new adjustment lands inside the group.
    await selectLayerById(groupId);
    const adjId = await makeGradientMapLayer("Macro Gradient Map", gm);
    // PS places the new adjustment above the group; move it inside.
    await moveLayerIntoGroup(adjId, groupId);
    try {
      await selectLayerById(sourceLayerId);
    } catch {
      // ignore
    }
    return { groupId, zoneGroupIds };
  }

  // Zoned: per-zone sub-groups + macro fallback at bottom.
  const zoneIds = Object.keys(output.zoneOutputs) as ZoneId[];

  for (const zoneId of zoneIds) {
    const zoneOut = output.zoneOutputs[zoneId];
    const mask = zoneMasks[zoneId];
    if (!mask) continue;

    const name = zoneNames?.[zoneId] ?? zoneId;

    // Place sub-group inside the top-level group.
    await selectLayerById(groupId);
    const subId = await makeGroup(name);
    await moveLayerIntoGroup(subId, groupId);
    zoneGroupIds[zoneId] = subId;

    // Mask the sub-group with the zone mask.
    await applyMaskToLayer(documentId, subId, width, height, mask);

    // Gradient Map adjustment inside the sub-group.
    const gm = rampToGradientMap({
      ramp: zoneOut.ramp,
      quantiles: zoneOut.quantiles,
      valuePreservation: zoneOut.valuePreservation,
    });
    await selectLayerById(subId);
    const adjId = await makeGradientMapLayer(`${name} Gradient Map`, gm);
    await moveLayerIntoGroup(adjId, subId);
  }

  // Macro fallback at the bottom of the top group, masked to inverse union.
  const inverseMask = computeInverseUnion(zoneIds, zoneMasks, pixelCount);
  const macroGm = rampToGradientMap({
    ramp: output.ramp,
    quantiles: output.quantiles,
    valuePreservation: output.valuePreservation,
  });
  await selectLayerById(groupId);
  const macroId = await makeGradientMapLayer("Macro Fallback Gradient Map", macroGm);
  await moveLayerIntoGroup(macroId, groupId);
  await applyMaskToLayer(documentId, macroId, width, height, inverseMask);

  // Tidy exit: restore the source layer as active so a follow-up
  // "Generate" or "Capture from selection" finds the right anchor.
  try {
    await selectLayerById(sourceLayerId);
  } catch {
    // Source layer may have been removed mid-flight; not fatal.
  }

  return { groupId, zoneGroupIds };
}
