# ChromaGhost — Development Document

**Companion to:** [PRD.md](PRD.md)
**Target host:** Adobe Photoshop (UXP, manifestVersion 5, apiVersion 2)
**Min PS version:** 25.0.0
**Stack:** TypeScript + React 18 + Webpack 5 (mirrors ColorSmash).

---

## 1. Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│                     ChromaGhost Panel (UXP)                 │
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │  UI (React)  │←→│  App State    │←→│  Color Engine  │  │
│  │  panels,     │   │  (zone tree, │   │  (TS, pure)    │  │
│  │  sliders     │   │   materials) │   │                │  │
│  └──────────────┘   └──────────────┘   └───────┬────────┘  │
│                                                │           │
│                                       ┌────────▼────────┐  │
│                                       │ PS Adapter      │  │
│                                       │ (UXP batchPlay, │  │
│                                       │  imaging API)   │  │
│                                       └────────┬────────┘  │
└────────────────────────────────────────────────┼───────────┘
                                                 ▼
                                         Photoshop document
```

**Hard rule:** the Color Engine is pure TS, no UXP imports — fully unit-testable in Vitest.

## 2. Repo layout (target)

```
ChromaGhost/
├── PRD.md
├── DEVELOPMENT.md
├── README.md
├── LICENSE
├── .gitignore
├── plugin/
│   ├── manifest.json
│   ├── package.json
│   ├── tsconfig.json
│   ├── webpack.config.js
│   ├── index.html
│   ├── icons/
│   ├── src/
│   │   ├── index.tsx                  # entry, mounts <App/>
│   │   ├── ui/
│   │   │   ├── App.tsx
│   │   │   ├── panels/
│   │   │   │   ├── MoodPanel.tsx
│   │   │   │   ├── ZonePanel.tsx
│   │   │   │   ├── MaterialPanel.tsx
│   │   │   │   ├── VariantsPanel.tsx
│   │   │   │   └── AdvancedPanel.tsx
│   │   │   └── components/            # buttons, sliders, ZoneTree
│   │   ├── state/
│   │   │   ├── store.ts               # zustand or simple reducer
│   │   │   └── types.ts               # ZoneNode, Material, Mood, etc.
│   │   ├── engine/                    # PURE — no UXP
│   │   │   ├── histogram.ts
│   │   │   ├── palette.ts
│   │   │   ├── inheritance.ts
│   │   │   ├── materials.ts
│   │   │   ├── moods.ts
│   │   │   ├── variants.ts
│   │   │   └── index.ts
│   │   ├── ps/                        # PS adapter
│   │   │   ├── document.ts
│   │   │   ├── layers.ts
│   │   │   ├── masks.ts
│   │   │   ├── imaging.ts
│   │   │   └── outputStack.ts
│   │   └── data/
│   │       ├── moods.json
│   │       └── materials.json
│   └── scripts/
│       └── package-ccx.js
└── docs/
    └── (research, mockups)
```

## 3. Core data model (TypeScript)

```ts
type ZoneId = string;

interface ZoneNode {
  id: ZoneId;
  parentId: ZoneId | null;
  name: string;
  depth: 0 | 1 | 2 | 3 | 4;          // PRD §6
  maskRef: MaskRef;                  // selection / channel / flat-color id
  paletteRole: 'dominant' | 'secondary' | 'accent' | 'support' | 'protected';
  material: MaterialRef | null;      // null = inherit
  overrides: Partial<ZoneStyle>;     // explicit overrides
  locks: ZoneLocks;
  children: ZoneId[];
}

interface ZoneStyle {
  hueFamily: HueFamily;              // e.g. {h:210, spread:30}
  saturation: number;                // 0..1
  contrast: number;                  // 0..1
  valuePreservation: number;         // 0..1, default 0.8
  shadowTint: HSL; midTint: HSL; highlightTint: HSL;
  hueShiftByValue: number;           // -180..180
}

interface ZoneLocks {
  hue?: boolean; value?: boolean; material?: boolean;
  paletteRole?: boolean; mask?: boolean; outputLayers?: boolean; all?: boolean;
}

interface Material {
  id: string; name: string;
  valueRamp: [HSL, HSL, HSL, HSL];   // shadow, mid, light, highlight
  saturation: number; valuePreservation: number;
  shadowChroma: number; highlightPop: number; contrast: number;
  hueShiftByValue: number;
  finish: { matte: number; reflective: number; magical: number };
}

interface Mood {
  id: string; name: string;
  paletteSeeds: HueFamily[];          // dominant, secondary, accent, support
  lightingMode: 'painterly' | 'studio' | 'dramatic';
  defaultValuePreservation: number;
}
```

## 4. Color engine — public API

```ts
// engine/index.ts
export function generateColorPass(input: {
  grayscale: ImageBuffer;            // float32 luminance, 0..1
  zones: ZoneTree;                   // may be empty
  mood: Mood;
  globalOverrides?: Partial<ZoneStyle>;
}): ColorPassResult;

export function refineColorPass(prev: ColorPassResult, next: ZoneTree): ColorPassResult;

export function generateVariants(base: ColorPassResult, count: number, lockedZones: ZoneId[]): ColorPassResult[];
```

`ColorPassResult` is engine-only — a list of zone-keyed gradient maps + per-zone Curves data + masks. The PS adapter turns it into actual layers.

## 5. Algorithm sketches

### 5.1 Zero-zone whole-image pass
1. Compute global histogram of grayscale source.
2. Pick dominant + secondary + accent hue families from mood.
3. Build a 4-stop value ramp (P05, P30, P70, P95) using mood ramp.
4. Emit single gradient-map adjustment in editable mode.

### 5.2 Zoned pass (Level 1+)
For each zone (DFS, parents first):
1. Resolve effective `ZoneStyle` via inheritance walk (child overrides parent).
2. Compute zone-local histogram on grayscale, masked by zone.
3. Build value ramp from zone material's `valueRamp`, scaled by zone histogram quantiles.
4. Apply hue shift, saturation, value preservation.
5. Emit per-zone gradient map + mask.

### 5.3 Refine (diff)
1. Tree-diff old vs new zone tree.
2. Untouched + locked → reuse cached output.
3. New child zones → recompute under preserved parent palette.
4. Modified zones → recompute, propagate to children only if hue/material changed.

### 5.4 Variants
- Hold locked subtrees fixed.
- Vary palette seeds in unlocked subtrees with a controlled hue rotation + saturation jitter, keeping role relationships intact.

## 6. PS adapter (UXP) — responsibilities

- `document.ts`: get active doc, dimensions, color profile.
- `layers.ts`: enumerate layers, find selected grayscale source, create groups.
- `masks.ts`: convert selections / alpha channels / flat-color regions → bitmap masks (via Imaging API).
- `imaging.ts`: read pixels (downsampled for preview, full-res for commit), write back via `imaging.putPixels`.
- `outputStack.ts`: build the editable layer stack — per zone, a Group containing Solid Color or Gradient Map clipped to mask; or in Exact mode, a flattened pixel layer.

All PS calls go through batchPlay or the typed APIs (`require("photoshop").app`). Wrap in `core.executeAsModal`.

## 7. UI flow (mirrors PRD §8)

- **Stage 0 — Welcome:** detect grayscale layer; one big "Create Color Pass" button.
- **Stage 1 — Mood:** preset grid (8 cards) + custom seed.
- **Stage 2 — Block:** zone tree (empty allowed); add zone from selection / mask / flat-color layer.
- **Stage 3 — Material:** drag material onto zone, or pick from dropdown.
- **Stage 4 — Variants:** 4-up grid; click to commit; locks per zone.
- **Advanced:** collapsible drawer exposing histograms, ramps, hue-shift curves.

Macro sliders (always visible): More Colorful · More Dramatic · More Natural · Warmer · Cooler · Keep My Shading · More Material Detail. These translate to global `ZoneStyle` deltas.

## 8. Build & packaging

Mirrors ColorSmash:

```
npm run build          # webpack production → plugin/dist
npm run watch          # dev mode
npm run typecheck      # tsc --noEmit
npm run test           # vitest run
npm run package        # node scripts/package-ccx.js → ChromaGhost-x.y.z.ccx
npm run build:package  # build + package
```

`scripts/package-ccx.js` lifted from ColorSmash with rename. Drop `.ccx` into Photoshop or use UXP Developer Tool for live-load.

## 9. Testing strategy

| Layer | Tool | What |
|---|---|---|
| Engine | Vitest | Pure functions: histogram, inheritance, palette, variants. Golden-image tests against fixture grayscales. |
| PS adapter | Manual + UXP devtool | Smoke: open fixture PSD, run pass, assert layer-stack shape. |
| UI | Vitest + RTL | Reducer/store transitions; zone-tree mutation. |
| End-to-end | UXP Developer Tool | Scripted scenarios: 0-zone, 3-zone, 8-zone refine, locked variant. |

## 10. Milestones

| M | Goal | Exit criteria |
|---|---|---|
| **M0** | Repo scaffold + CI | `npm run build` green, panel loads in PS, "Hello" shows. |
| **M1** | Engine MVP — zero-zone | `generateColorPass` works on grayscale buffer, vitest goldens pass. |
| **M2** | Mood presets + macro sliders | 8 moods loaded from JSON, sliders affect output. |
| **M3** | PS adapter + editable output | Full panel produces layered output in PS. |
| **M4** | Zone tree + inheritance | Add/remove/nest zones from selection; child override works. |
| **M5** | Materials | 10 presets; assignment to zones; per-zone histogram. |
| **M6** | Refine (diff) | Adding zones doesn't regenerate untouched ones. |
| **M7** | Locks + variants | 4-variant grid, locked zones constant. |
| **M8** | Polish + package | `.ccx` ships, README + marketplace listing. |

## 11. Coding conventions

- Files < 500 lines (CLAUDE.md rule).
- No secrets, no network calls in core engine.
- Engine pure; side effects only in `ps/`.
- Type-first: every public engine function has explicit input/output types.
- Tests precede implementation for engine math (Red-Green-Refactor).

## 12. Open technical questions

1. **State management:** zustand vs reducer. Lean zustand for small panel.
2. **Imaging API vs batchPlay** for pixel reads on large docs — benchmark M3.
3. **Mask storage:** in-memory bitmap vs PS channels. Probably channels for persistence.
4. **Color space:** engine works in linear-light or perceptual (Oklab)? Lean Oklab for hue ops.
5. **Preview strategy:** always downsampled to ~512px longest edge; commit at full res inside `executeAsModal`.

## 13. Reference: what to lift from sibling plugins

| From | Lift |
|---|---|
| ColorSmash | `webpack.config.js`, `tsconfig.json`, `manifest.json` shape, `scripts/package-ccx.js`, output-stack patterns, vitest setup. |
| Blendify | Per-layer blend mode strategy. |
| LayerSquish | Layer-tree walking helpers. |
| Selectrix | Selection → mask conversion patterns. |

## 14. License

MIT (matches ColorSmash). Author: Erich Schmidt.
