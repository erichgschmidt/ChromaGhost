// Zone tree data model + pure tree operations.
// No UXP / Photoshop dependencies. All ops return new trees (no mutation).

import type { HueFamily } from "./types";

export type ZoneId = string;
export type PaletteRole =
  | "dominant"
  | "secondary"
  | "accent"
  | "support"
  | "protected";

export interface MaskRef {
  kind: "selection" | "channel" | "flatColorId" | "bitmap";
  /** PS channel name, layer id, or flat-color id. */
  id?: string;
  /** Optional inline mask payload. */
  bitmap?: Uint8Array;
}

export interface ZoneLocks {
  hue?: boolean;
  value?: boolean;
  material?: boolean;
  paletteRole?: boolean;
  mask?: boolean;
  outputLayers?: boolean;
  all?: boolean;
}

export interface ZoneStyle {
  hueFamily: HueFamily;
  /** 0..1 */
  saturation: number;
  /** 0..1 */
  contrast: number;
  /** 0..1 */
  valuePreservation: number;
  /** -180..180 */
  hueShiftByValue: number;
}

export type ZoneDepth = 0 | 1 | 2 | 3 | 4;

export interface ZoneNode {
  id: ZoneId;
  parentId: ZoneId | null;
  name: string;
  depth: ZoneDepth;
  maskRef: MaskRef;
  paletteRole: PaletteRole;
  /** null = inherit material from parent. */
  materialId: string | null;
  overrides: Partial<ZoneStyle>;
  locks: ZoneLocks;
  children: ZoneId[];
}

export interface ZoneTree {
  rootIds: ZoneId[];
  nodes: Record<ZoneId, ZoneNode>;
}

// ---------- helpers ----------

let __zoneIdCounter = 0;
function genId(): string {
  __zoneIdCounter += 1;
  return `z_${Date.now().toString(36)}_${__zoneIdCounter.toString(36)}`;
}

function clamp(d: number): ZoneDepth {
  if (d < 0) return 0;
  if (d > 4) return 4;
  return d as ZoneDepth;
}

function cloneTree(tree: ZoneTree): ZoneTree {
  const nodes: Record<ZoneId, ZoneNode> = {};
  for (const id of Object.keys(tree.nodes)) {
    const n = tree.nodes[id];
    nodes[id] = { ...n, children: [...n.children], overrides: { ...n.overrides }, locks: { ...n.locks } };
  }
  return { rootIds: [...tree.rootIds], nodes };
}

// ---------- public ops ----------

export function createZoneTree(): ZoneTree {
  return { rootIds: [], nodes: {} };
}

export function addZone(
  tree: ZoneTree,
  partial: Partial<ZoneNode> & { name: string; maskRef: MaskRef },
  parentId: ZoneId | null = null,
): { tree: ZoneTree; id: ZoneId } {
  if (parentId !== null && !tree.nodes[parentId]) {
    throw new Error(`addZone: parent ${parentId} not found`);
  }
  const next = cloneTree(tree);
  const id = partial.id ?? genId();
  if (next.nodes[id]) throw new Error(`addZone: id ${id} already exists`);

  const parentDepth = parentId ? next.nodes[parentId].depth : 0;
  const depth = clamp((partial.depth ?? (parentId ? parentDepth + 1 : 1)) as number);

  const node: ZoneNode = {
    id,
    parentId,
    name: partial.name,
    depth,
    maskRef: partial.maskRef,
    paletteRole: partial.paletteRole ?? "secondary",
    materialId: partial.materialId ?? null,
    overrides: { ...(partial.overrides ?? {}) },
    locks: { ...(partial.locks ?? {}) },
    children: [],
  };
  next.nodes[id] = node;
  if (parentId) {
    next.nodes[parentId].children.push(id);
  } else {
    next.rootIds.push(id);
  }
  return { tree: next, id };
}

/** Remove a zone; re-parent its children to its parent (or root if none). */
export function removeZone(tree: ZoneTree, id: ZoneId): ZoneTree {
  const node = tree.nodes[id];
  if (!node) throw new Error(`removeZone: ${id} not found`);
  const next = cloneTree(tree);
  const target = next.nodes[id];
  const newParentId = target.parentId;

  // detach from parent / roots
  if (newParentId) {
    const p = next.nodes[newParentId];
    p.children = p.children.filter((c) => c !== id);
  } else {
    next.rootIds = next.rootIds.filter((r) => r !== id);
  }

  // re-parent children
  for (const childId of target.children) {
    const child = next.nodes[childId];
    child.parentId = newParentId;
    const pDepth = newParentId ? next.nodes[newParentId].depth : 0;
    child.depth = clamp(newParentId ? pDepth + 1 : 1);
    if (newParentId) {
      next.nodes[newParentId].children.push(childId);
    } else {
      next.rootIds.push(childId);
    }
    // recurse depth-fix for descendants
    fixDepths(next, childId);
  }

  delete next.nodes[id];
  return next;
}

function fixDepths(tree: ZoneTree, id: ZoneId): void {
  const node = tree.nodes[id];
  if (!node) return;
  for (const c of node.children) {
    tree.nodes[c].depth = clamp(node.depth + 1);
    fixDepths(tree, c);
  }
}

function isAncestor(tree: ZoneTree, ancestorId: ZoneId, candidateId: ZoneId): boolean {
  let cur: ZoneId | null = candidateId;
  while (cur) {
    if (cur === ancestorId) return true;
    const n: ZoneNode | undefined = tree.nodes[cur];
    cur = n ? n.parentId : null;
  }
  return false;
}

export function moveZone(tree: ZoneTree, id: ZoneId, newParentId: ZoneId | null): ZoneTree {
  const node = tree.nodes[id];
  if (!node) throw new Error(`moveZone: ${id} not found`);
  if (newParentId !== null && !tree.nodes[newParentId]) {
    throw new Error(`moveZone: parent ${newParentId} not found`);
  }
  if (newParentId !== null && isAncestor(tree, id, newParentId)) {
    throw new Error(`moveZone: would create a cycle`);
  }
  if (newParentId === id) {
    throw new Error(`moveZone: cannot parent a node to itself`);
  }
  if (node.parentId === newParentId) return tree;

  const next = cloneTree(tree);
  const target = next.nodes[id];

  // detach
  if (target.parentId) {
    const p = next.nodes[target.parentId];
    p.children = p.children.filter((c) => c !== id);
  } else {
    next.rootIds = next.rootIds.filter((r) => r !== id);
  }

  // attach
  target.parentId = newParentId;
  if (newParentId) {
    next.nodes[newParentId].children.push(id);
    target.depth = clamp(next.nodes[newParentId].depth + 1);
  } else {
    next.rootIds.push(id);
    target.depth = 1;
  }
  fixDepths(next, id);
  return next;
}

export function updateZone(tree: ZoneTree, id: ZoneId, patch: Partial<ZoneNode>): ZoneTree {
  const node = tree.nodes[id];
  if (!node) throw new Error(`updateZone: ${id} not found`);
  const next = cloneTree(tree);
  const target = next.nodes[id];
  // disallow structural fields via patch (use moveZone / addZone / removeZone)
  const { id: _i, parentId: _p, children: _c, depth: _d, ...safe } = patch;
  void _i; void _p; void _c; void _d;
  Object.assign(target, safe);
  if (patch.overrides) target.overrides = { ...patch.overrides };
  if (patch.locks) target.locks = { ...patch.locks };
  return next;
}

export function walkDepthFirst(
  tree: ZoneTree,
  visit: (node: ZoneNode, depth: number) => void,
): void {
  const stack: { id: ZoneId; depth: number }[] = [];
  // push roots in reverse so first root visited first
  for (let i = tree.rootIds.length - 1; i >= 0; i--) {
    stack.push({ id: tree.rootIds[i], depth: 0 });
  }
  while (stack.length) {
    const { id, depth } = stack.pop()!;
    const node = tree.nodes[id];
    if (!node) continue;
    visit(node, depth);
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push({ id: node.children[i], depth: depth + 1 });
    }
  }
}

/** Returns [self, parent, grandparent, ...]. */
export function ancestorChain(tree: ZoneTree, id: ZoneId): ZoneNode[] {
  const out: ZoneNode[] = [];
  let cur: ZoneId | null = id;
  while (cur) {
    const n: ZoneNode | undefined = tree.nodes[cur];
    if (!n) break;
    out.push(n);
    cur = n.parentId;
  }
  return out;
}
