// Editable output stack — "playground" architecture.
//
//   ChromaGhost Color Pass            (group, blend = Normal)
//     ├── Macro Fallback Gradient Map (when zones exist, mask = inverse-of-union)
//     ├── Zone "Cape"                 (group, masked to cape selection)
//     │   └── Cape Gradient Map
//     ├── Zone "Sword"                (group, masked to sword selection)
//     │   └── Sword Gradient Map
//     └── [source grayscale layer]    ← bottom; the playground content
//
// CG group blend = Normal so adjustments stay scoped to it; sub-groups stay
// Pass Through (default) so their GMs see the source through the CG context.
//
// We never use `move into group` — instead we create adjustments above the
// source and wrap them via `groupLayersEvent`, which is the reliable native
// PS operation. All UXP mutations must be invoked inside an existing
// `executeAsModal` block — this module never opens its own modal.

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
  insertAbove?: boolean;
}

export interface BuildEditableResult {
  groupId: number;
  zoneGroupIds: Record<ZoneId, number>;
}

const BP_OPTS = { synchronousExecution: true, modalBehavior: "execute" as const };

async function bp(commands: any[]): Promise<any[]> {
  // UXP: action.batchPlay returns an array of result descriptors.
  return action.batchPlay(commands, BP_OPTS);
}

function activeLayerId(): number {
  const doc = app.activeDocument;
  if (!doc) throw new Error("No active document.");
  const lyr = doc.activeLayers?.[0];
  if (!lyr) throw new Error("No active layer.");
  return lyr.id as number;
}

function isZoned(o: ColorPassOutput | ZonedColorPassOutput): o is ZonedColorPassOutput {
  return (o as ZonedColorPassOutput).zoneOutputs !== undefined;
}

// ---------- gradient stops ---------------------------------------------------

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
  return {
    _obj: "gradientClassEvent",
    name,
    gradientForm: { _enum: "gradientForm", _value: "customStops" },
    interfaceIconFrameDimmed: GRADIENT_RESOLUTION / 16,
    colors: gm.stops.map(toPsColorStop),
    transparency: [
      { _obj: "transferSpec", opacity: { _unit: "percentUnit", _value: 100 }, location: 0,                   midpoint: 50 },
      { _obj: "transferSpec", opacity: { _unit: "percentUnit", _value: 100 }, location: GRADIENT_RESOLUTION, midpoint: 50 },
    ],
  };
}

// ---------- core ops ---------------------------------------------------------

/** Create a Gradient Map adjustment ABOVE the currently active layer. Returns its id. */
async function makeGradientMapAdjustment(name: string, gm: GradientMap): Promise<number> {
  await bp([
    {
      _obj: "make",
      _target: [{ _ref: "adjustmentLayer" }],
      using: {
        _obj: "adjustmentLayer",
        name,
        type: { _obj: "gradientMapClass", gradient: gradientDescriptor(gm, name) },
      },
      _options: { dialogOptions: "dontDisplay" },
    },
  ]);
  return activeLayerId();
}

/**
 * Wrap the currently selected layer(s) in a new group via PS's native
 * Group operation. Returns the new group's id, with the requested name.
 */
async function groupSelected(name: string): Promise<number> {
  await bp([
    {
      _obj: "groupLayersEvent",
      _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
      using:    { _ref: "layer", _enum: "ordinal", _value: "targetEnum" },
      _options: { dialogOptions: "dontDisplay" },
    },
  ]);
  const groupId = activeLayerId();
  // Rename to the desired name.
  await bp([
    {
      _obj: "set",
      _target: [{ _ref: "layer", _id: groupId }],
      to: { _obj: "layer", name },
      _options: { dialogOptions: "dontDisplay" },
    },
  ]);
  return groupId;
}

/** Set a group's blend mode. Use "normal" to scope adjustments to the group. */
async function setGroupBlendMode(groupId: number, mode: "passThrough" | "normal"): Promise<void> {
  await bp([
    {
      _obj: "set",
      _target: [{ _ref: "layer", _id: groupId }],
      to: { _obj: "layer", mode: { _enum: "blendMode", _value: mode } },
      _options: { dialogOptions: "dontDisplay" },
    },
  ]);
}

/** Add `layerId` to the current selection (multi-select). */
async function addToSelection(layerId: number): Promise<void> {
  await bp([
    {
      _obj: "select",
      _target: [{ _ref: "layer", _id: layerId }],
      selectionModifier: { _enum: "selectionModifierType", _value: "addToSelection" },
      makeVisible: false,
      _options: { dialogOptions: "dontDisplay" },
    },
  ]);
}

// ---------- masks ------------------------------------------------------------

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
  const imageData: any = await imaging.createImageDataFromBuffer(mask, {
    width, height,
    components: 1,
    chunky: true,
    colorSpace: "Grayscale",
  });
  try {
    await imaging.putPixels({
      documentID: documentId,
      layerID: layerId,
      // UXP: channelID -2 = layer's user mask channel.
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

function computeInverseUnion(
  zoneIds: ZoneId[],
  zoneMasks: Record<ZoneId, Uint8Array>,
  size: number,
): Uint8Array {
  const out = new Uint8Array(size);
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

// ---------- regenerate cleanup ----------------------------------------------

/**
 * If a prior CG group exists, move the source layer OUT of it (to top of
 * doc) and delete the group. This preserves the user's source layer while
 * tearing down stale ChromaGhost output.
 */
async function unwindPriorCG(sourceId: number): Promise<void> {
  const doc = app.activeDocument;
  if (!doc) return;
  // doc.layers is iterable; collect ids first.
  const targets: number[] = [];
  for (const l of doc.layers as Iterable<any>) {
    if (l && l.name === TOP_GROUP_NAME) targets.push(l.id as number);
  }
  for (const groupId of targets) {
    // Try to move the source layer to the top of the doc, in case it lives
    // inside this group from a prior run. If it's already outside, the move
    // just reorders — harmless for our purposes.
    try {
      await bp([
        {
          _obj: "move",
          _target: [{ _ref: "layer", _id: sourceId }],
          to: { _ref: "layer", _enum: "ordinal", _value: "front" },
          adjustment: false,
          version: 5,
          _options: { dialogOptions: "dontDisplay" },
        },
      ]);
    } catch {
      // Source may be Background or otherwise un-movable; proceed.
    }
    try {
      await bp([
        {
          _obj: "delete",
          _target: [{ _ref: "layer", _id: groupId }],
          _options: { dialogOptions: "dontDisplay" },
        },
      ]);
    } catch {
      // Best-effort cleanup.
    }
  }
}

// ---------- main ------------------------------------------------------------

export async function buildEditableOutput(
  args: BuildEditableArgs,
): Promise<BuildEditableResult> {
  const { documentId, sourceLayerId, output, zoneMasks, zoneNames } = args;
  const { width, height } = activeDocSize();
  const pixelCount = width * height;

  await unwindPriorCG(sourceLayerId);
  await selectLayerById(sourceLayerId);

  // Macro pass (no zones).
  if (!isZoned(output)) {
    const macroGm = rampToGradientMap({
      ramp: output.ramp,
      quantiles: output.quantiles,
      valuePreservation: output.valuePreservation,
    });
    // GM appears above the source (now active).
    await makeGradientMapAdjustment("Macro Gradient Map", macroGm);
    // Multi-select source + GM, then group them.
    await addToSelection(sourceLayerId);
    const groupId = await groupSelected(TOP_GROUP_NAME);
    await setGroupBlendMode(groupId, "normal");
    try { await selectLayerById(sourceLayerId); } catch { /* ignore */ }
    return { groupId, zoneGroupIds: {} };
  }

  // Zoned pass.
  const zoneIds = Object.keys(output.zoneOutputs) as ZoneId[];
  const validZones = zoneIds.filter(
    (id) => zoneMasks[id] && zoneMasks[id].length === pixelCount,
  );

  // 1. Macro fallback GM directly above source.
  const macroGm = rampToGradientMap({
    ramp: output.ramp,
    quantiles: output.quantiles,
    valuePreservation: output.valuePreservation,
  });
  await selectLayerById(sourceLayerId);
  const macroGmId = await makeGradientMapAdjustment("Macro Fallback Gradient Map", macroGm);

  // 2. For each zone: GM above latest sibling, wrap in zone-named group, mask the group.
  const zoneGroupIds: Record<ZoneId, number> = {};
  let lastTopId = macroGmId;
  for (const zoneId of validZones) {
    const zoneOut = output.zoneOutputs[zoneId];
    const mask = zoneMasks[zoneId];
    const name = zoneNames?.[zoneId] ?? zoneId;
    const gm = rampToGradientMap({
      ramp: zoneOut.ramp,
      quantiles: zoneOut.quantiles,
      valuePreservation: zoneOut.valuePreservation,
    });

    // Anchor above the last created top-level sibling so z-order is stable.
    await selectLayerById(lastTopId);
    await makeGradientMapAdjustment(`${name} Gradient Map`, gm);
    // Wrap the just-created GM in its own named sub-group.
    const subGroupId = await groupSelected(name);
    zoneGroupIds[zoneId] = subGroupId;
    // Apply zone mask to the sub-group.
    await applyMaskToLayer(documentId, subGroupId, width, height, mask);
    lastTopId = subGroupId;
  }

  // 3. Inverse-union mask on the macro fallback GM (only when zones exist).
  if (validZones.length > 0) {
    const inverseMask = computeInverseUnion(validZones, zoneMasks, pixelCount);
    await applyMaskToLayer(documentId, macroGmId, width, height, inverseMask);
  }

  // 4. Multi-select source + all created top-level layers, then group as CG.
  await selectLayerById(sourceLayerId);
  await addToSelection(macroGmId);
  for (const id of Object.values(zoneGroupIds)) await addToSelection(id);
  const groupId = await groupSelected(TOP_GROUP_NAME);
  await setGroupBlendMode(groupId, "normal");

  try { await selectLayerById(sourceLayerId); } catch { /* ignore */ }
  return { groupId, zoneGroupIds };
}
