// In-memory app store: zone tree + selection. No persistence.
// Pure React (useSyncExternalStore) — keeps test surface free of React rendering.

import { useSyncExternalStore } from "react";
import {
  createZoneTree,
  addZone as addZoneOp,
  removeZone as removeZoneOp,
  updateZone as updateZoneOp,
  moveZone as moveZoneOp,
} from "../engine/zoneTree";
import type {
  ZoneTree,
  ZoneId,
  ZoneNode,
  MaskRef,
  PaletteRole,
} from "../engine/zoneTree";

export interface AppState {
  tree: ZoneTree;
  selectedZoneId: ZoneId | null;
}

export interface AddZoneInput {
  name: string;
  parentId: ZoneId | null;
  maskKind: MaskRef["kind"];
  paletteRole?: PaletteRole;
  materialId?: string | null;
}

export interface StoreActions {
  addZone: (input: AddZoneInput) => ZoneId;
  removeZone: (id: ZoneId) => void;
  selectZone: (id: ZoneId | null) => void;
  updateZone: (id: ZoneId, patch: Partial<ZoneNode>) => void;
  moveZone: (id: ZoneId, newParentId: ZoneId | null) => void;
  setZoneMask: (id: ZoneId, bitmap: Uint8Array) => void;
  reset: () => void;
}

function initialState(): AppState {
  return { tree: createZoneTree(), selectedZoneId: null };
}

// Module-level singleton store. Test resets via actions.reset().
let state: AppState = initialState();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getState(): AppState {
  return state;
}

export const actions: StoreActions = {
  addZone(input) {
    // TODO: wire maskRef.id/bitmap to actual Photoshop selection/channel later.
    const maskRef: MaskRef = { kind: input.maskKind };
    const { tree, id } = addZoneOp(
      state.tree,
      {
        name: input.name,
        maskRef,
        paletteRole: input.paletteRole ?? "secondary",
        materialId: input.materialId ?? null,
      },
      input.parentId,
    );
    state = { tree, selectedZoneId: id };
    emit();
    return id;
  },
  removeZone(id) {
    const tree = removeZoneOp(state.tree, id);
    const sel = state.selectedZoneId === id ? null : state.selectedZoneId;
    state = { tree, selectedZoneId: sel };
    emit();
  },
  selectZone(id) {
    if (state.selectedZoneId === id) return;
    state = { ...state, selectedZoneId: id };
    emit();
  },
  updateZone(id, patch) {
    const tree = updateZoneOp(state.tree, id, patch);
    state = { ...state, tree };
    emit();
  },
  moveZone(id, newParentId) {
    const tree = moveZoneOp(state.tree, id, newParentId);
    state = { ...state, tree };
    emit();
  },
  setZoneMask(id, bitmap) {
    const node = state.tree.nodes[id];
    if (!node) return;
    const tree = updateZoneOp(state.tree, id, {
      maskRef: { ...node.maskRef, kind: "bitmap", bitmap },
    });
    state = { ...state, tree };
    emit();
  },
  reset() {
    state = initialState();
    emit();
  },
};

export function useStore(): [AppState, StoreActions] {
  const s = useSyncExternalStore(subscribe, getState, getState);
  return [s, actions];
}

// Test-only direct accessor.
export function _getStateForTests(): AppState {
  return state;
}
