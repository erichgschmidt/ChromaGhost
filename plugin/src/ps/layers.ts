// Layer-tree operations. All mutating calls must be invoked inside
// `executeAsModal` by the caller.

const { app, action } = require("photoshop");

export interface LayerRef {
  id: number;
  name: string;
  bounds: { left: number; top: number; right: number; bottom: number };
}

export function getActiveLayer(): LayerRef {
  const doc = app.activeDocument;
  if (!doc) throw new Error("No active document.");
  const layer = doc.activeLayers?.[0];
  if (!layer) throw new Error("No active layer.");
  const b = layer.bounds;
  return {
    id: layer.id,
    name: layer.name,
    bounds: { left: b.left, top: b.top, right: b.right, bottom: b.bottom },
  };
}

/**
 * Create a new empty pixel layer directly above `aboveLayerId` and return
 * its id. Must be called inside `executeAsModal`.
 */
export async function createPixelLayerAbove(
  aboveLayerId: number,
  name: string,
): Promise<number> {
  const doc = app.activeDocument;
  if (!doc) throw new Error("No active document.");

  await action.batchPlay(
    [
      {
        _obj: "select",
        _target: [{ _ref: "layer", _id: aboveLayerId }],
        makeVisible: false,
        _options: { dialogOptions: "dontDisplay" },
      },
      {
        _obj: "make",
        _target: [{ _ref: "layer" }],
        using: { _obj: "layer", name },
        _options: { dialogOptions: "dontDisplay" },
      },
    ],
    { synchronousExecution: true, modalBehavior: "execute" },
  );

  const newLayer = doc.activeLayers?.[0];
  if (!newLayer) throw new Error("Failed to create new layer.");
  return newLayer.id as number;
}

export async function selectLayerById(layerId: number): Promise<void> {
  await action.batchPlay(
    [
      {
        _obj: "select",
        _target: [{ _ref: "layer", _id: layerId }],
        makeVisible: false,
        _options: { dialogOptions: "dontDisplay" },
      },
    ],
    { synchronousExecution: true, modalBehavior: "execute" },
  );
}
