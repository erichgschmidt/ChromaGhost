// Effective-style resolution for a zone, walking root -> leaf.
// Locked fields on an ancestor freeze that field for descendants.

import type { Mood } from "./types";
import type { ZoneId, ZoneStyle, ZoneTree, ZoneLocks } from "./zoneTree";
import { ancestorChain } from "./zoneTree";

type StyleField = keyof ZoneStyle;

// Map style field -> lock key that controls it.
const FIELD_LOCK: Record<StyleField, keyof ZoneLocks> = {
  hueFamily: "hue",
  hueShiftByValue: "hue",
  saturation: "value",
  contrast: "value",
  valuePreservation: "value",
};

function moodDefaults(mood: Mood): ZoneStyle {
  return {
    hueFamily: mood.paletteSeeds[0],
    saturation: 0.7,
    contrast: 0.7,
    valuePreservation: mood.defaultValuePreservation,
    hueShiftByValue: mood.hueShiftByValue ?? 10,
  };
}

export function resolveEffectiveStyle(
  zoneId: ZoneId,
  tree: ZoneTree,
  mood: Mood,
): ZoneStyle {
  const node = tree.nodes[zoneId];
  if (!node) throw new Error(`resolveEffectiveStyle: ${zoneId} not found`);

  // root -> leaf order
  const chain = ancestorChain(tree, zoneId).slice().reverse();

  const style: ZoneStyle = { ...moodDefaults(mood) };
  // Track which fields are frozen by an ancestor's lock.
  const frozen: Partial<Record<StyleField, true>> = {};

  for (const ancestor of chain) {
    const ov = ancestor.overrides;
    const locks = ancestor.locks;
    const fields: StyleField[] = [
      "hueFamily",
      "saturation",
      "contrast",
      "valuePreservation",
      "hueShiftByValue",
    ];
    for (const f of fields) {
      if (frozen[f]) continue;
      if (ov[f] !== undefined) {
        // apply override
        (style as Record<StyleField, ZoneStyle[StyleField]>)[f] = ov[f] as ZoneStyle[StyleField];
      }
    }
    // After applying this ancestor's overrides, lock relevant fields for descendants.
    if (locks.all) {
      for (const f of fields) frozen[f] = true;
    } else {
      for (const f of fields) {
        const lk = FIELD_LOCK[f];
        if (locks[lk]) frozen[f] = true;
      }
    }
  }

  return style;
}
