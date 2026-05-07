# ChromaGhost — Product Requirements Document

**Version:** 0.1 (Draft)
**Owner:** Erich Schmidt
**Last updated:** 2026-05-06
**Status:** Pre-production

---

## 1. One-line pitch

> Turn a grayscale painting into a fully colored image instantly, then progressively refine it through a hierarchy of zones, materials, and accents — without losing your original values.

## 2. Product promise

**Start broad, refine forever.** Every level of input — from "nothing but a grayscale layer" to "fully zoned masterwork" — must produce a complete, usable, image-wide color result. The user is never blocked waiting to define enough zones.

## 3. Target users

| Persona | Need |
|---|---|
| **Concept artist (beginner)** | One-click color pass on a value sketch; mood presets; macro sliders. |
| **Concept artist (veteran)** | Per-zone histogram remap, palette role assignment, material editor, locked variants. |
| **Production studio artist** | Repeatable colorways, layered editable output, design variants on locked subzones. |

## 4. Core philosophy (product rules)

1. Always produce a usable full-image result, regardless of input fidelity.
2. Never require perfect setup.
3. Broad decisions guide smaller decisions (parent → child inheritance).
4. Preserve the artist's values unless explicitly told otherwise.
5. Color harmony is automatic, but always editable.
6. Materials feel smart, not random.
7. Beginners use mood presets; experts open the hood. **Same plugin, both users.**

## 5. Three levels of color intelligence

### Level 1 — Macro Color Pass
- Input: source layer (+ optional silhouette).
- Output: cohesive whole-image color treatment.
- Controls: overall palette, lighting mode, mood, dominant/accent hue, value preservation.

### Level 2 — Material Zone Pass
- Input: macro zones + assigned materials (skin, metal, cloth, leather, glow, stone, wood, crystal…).
- Output: each region behaves like the right material.
- Controls: material type, saturation, contrast, shadow/highlight tint, metallic feel, local color strength.

### Level 3 — Detail / Accent Pass
- Input: small zones (trim, runes, gems, eyes, edge highlights, blood, paint…).
- Output: focal hierarchy + storytelling polish.
- Controls: accent strength, glow, specular pop, hue shift, color contrast, detail priority.

## 6. Zone hierarchy

Zones are **nested**, not flat. Every zone has a depth level:

| Level | Role | Drives |
|---|---|---|
| 0 | Whole image | Global mood / grade |
| 1 | Macro silhouette (Character, BG, Prop) | Palette structure |
| 2 | Material zones (Armor, Cape, Skin) | Material color |
| 3 | Detail zones (Trim, Scratches) | Detail variation |
| 4 | Accents/FX (Gem, Runes, Glow) | Specular, glow, focal pop |

**Inheritance rule:** child zones inherit hue family, lighting, contrast, and value preservation from their parent unless overridden. A child can override any single field.

**Locking:** every zone supports lock-hue, lock-value, lock-material, lock-palette-role, lock-mask, lock-output-layers, lock-entire-zone.

## 7. Materials

Materials are **behaviors**, not just colors. A material preset defines:
- Value ramp (shadow → midtone → light → highlight color stops)
- Saturation curve
- Value preservation %
- Shadow chroma, highlight pop, contrast
- Hue shift by value
- Finish axes: matte↔glossy, flat↔reflective, natural↔magical

Built-in presets (MVP shortlist): Brushed Steel, Aged Gold, Velvet Cape, Skin (warm/cool), Leather, Stone, Glow/Emissive, Crystal, Obsidian, Wood.

Custom material editor (post-MVP for full editor; MVP exposes the underlying fields read-only with override sliders).

## 8. Workflow states (UI guides through these)

1. **Mood** — pick overall direction (Heroic, Dark Fantasy, Earthy, Royal, Cyberpunk, Painterly…).
2. **Block** — define big zones (Character, BG, Prop).
3. **Material** — assign material behavior per zone.
4. **Accent** — add small design colors.
5. **Finish** — global grade, contrast polish, atmosphere, palette clamp.

## 9. Refine flow

The "Refine" button does **not** regenerate from scratch. It diffs the zone tree:
- What zones are new?
- Which are children of existing zones?
- What palette relationships should be preserved?
- What needs rebalancing?

Existing decisions are preserved; new zones get coherent local color; locked zones never move.

## 10. Variants

Generate N variants at any stage:
- Macro: 12 palette directions
- Material: 8 material options per zone
- Accent: 10 accent combinations
- Finish: 6 grades

Locked zones are held constant across variants.

## 11. Beginner UX

```
1. Select grayscale layer
2. Click "Create Color Pass"
3. Paint rough zones (body / face / cape / sword)
4. Pick a style (Heroic Fantasy)
5. Apply
```

Then macro sliders only: More Colorful · More Dramatic · More Natural · Warmer · Cooler · Keep My Shading · More Material Detail.

## 12. Expert UX

Advanced panel exposes: zone hierarchy tree, material inheritance, per-zone histogram, P05/P50/P95 value mapping, gradient ramp, chroma curve, saturation-by-value, shadow/midtone/highlight hue bias, blend stack, output layer strategy, mask refinement.

## 13. Output

- **Editable mode (default):** layered output stack — one Curves/Gradient-Map/Solid-Color group per zone, masked, blendable.
- **Exact mode:** flattened pixel-accurate result.
- Output stack is non-destructive; the original grayscale layer is never modified.

## 14. Inputs accepted

- Grayscale source layer (required).
- Optional silhouette (subject mask).
- Optional zone ID layer (flat color regions auto-detected as zones).
- Optional existing PS masks / selections (imported as zones).

## 15. MVP scope

**MVP name:** Zone Palette Pass.

**In:**
- Grayscale → full-image color pass with no zones.
- Macro zone creation from selection / mask / flat-color ID layer.
- Zone hierarchy (parent/child), max depth 3.
- Mood preset library (8 presets).
- Material preset library (10 presets).
- Per-zone histogram normalization.
- Lighting mode presets (3: Painterly / Studio / Dramatic).
- Editable layered output.
- Lock + regenerate per zone.
- Variant grid (4 variants per stage).

**Out (post-MVP):**
- Custom material editor UI.
- Detail/Accent (Level 3) pass.
- Finish/grade stage.
- Cross-image palette transfer.
- AI-assisted zone segmentation.

## 16. Non-goals

- Not a generative AI image tool.
- Not a replacement for hand-painting.
- No cloud dependency for core color math (must run fully local in Photoshop).

## 17. Success metrics

| Metric | Target |
|---|---|
| Time-to-first-color-pass (new user) | < 30 seconds |
| Zones supported per document | ≥ 64 |
| Color pass generation latency (4k image, 8 zones) | < 2 s |
| Output layers always editable (non-destructive) | 100 % |
| Beginner satisfaction with 0-zone result | "usable as-is" ≥ 70 % |

## 18. Risks

| Risk | Mitigation |
|---|---|
| Histogram remap destroys artist's values | Default value-preservation = 80 %; lock-value per zone. |
| Zone tree feels complex | Hide hierarchy until user adds 2nd zone; macro sliders default. |
| UXP performance on 4k+ images | Tile-based processing; downsample previews. |
| Material presets feel generic | Ship with 10 strong opinionated presets; expert override sliders. |

## 19. Reference plugins (internal)

- **ColorSmash** — most complete. Reference for: per-channel histogram remap, single-Curves output, manifest/build pipeline, packaging (.ccx).
- **Blendify** — reference for blend-stack output strategy.
- **LayerSquish** — reference for layer-tree manipulation patterns.
- **Selectrix** — reference for selection/mask import flow.

## 20. Open questions

- Should mood presets be data-driven (JSON) or code-driven? *(Lean: JSON, hot-swappable.)*
- Should material editor ship in MVP read-only or be deferred entirely?
- Variant grid — generate eagerly or on-demand?
- Single panel or wizard-style stage panels?
