import type { Mood } from "./types";

// MVP mood library — 8 opinionated presets per PRD §15.
// HueFamily centers (deg): 0=red, 30=orange, 60=yellow, 120=green,
// 180=cyan, 210=blue, 270=purple, 330=magenta.
//
// Chroma values are OkLCh chroma (~0.0..0.4 for sRGB-displayable).

export const MOODS: Mood[] = [
  {
    id: "heroic-fantasy",
    name: "Heroic Fantasy",
    paletteSeeds: [
      { h: 215, spread: 25, chroma: 0.10 }, // dominant: cool steel blue
      { h: 30,  spread: 20, chroma: 0.12 }, // secondary: warm skin/cloth
      { h: 70,  spread: 15, chroma: 0.16 }, // accent: gold trim
      { h: 0,   spread: 20, chroma: 0.14 }, // support: crimson cape
    ],
    lightingMode: "painterly",
    defaultValuePreservation: 0.8,
    hueShiftByValue: 12,
  },
  {
    id: "dark-fantasy",
    name: "Dark Fantasy",
    paletteSeeds: [
      { h: 270, spread: 25, chroma: 0.08 }, // dominant: cold violet
      { h: 200, spread: 20, chroma: 0.10 }, // secondary: ice blue
      { h: 150, spread: 15, chroma: 0.14 }, // accent: emerald
      { h: 0,   spread: 15, chroma: 0.16 }, // support: blood red
    ],
    lightingMode: "dramatic",
    defaultValuePreservation: 0.85,
    hueShiftByValue: 20,
  },
  {
    id: "earthy-natural",
    name: "Earthy Natural",
    paletteSeeds: [
      { h: 35,  spread: 20, chroma: 0.10 }, // dominant: ochre
      { h: 90,  spread: 25, chroma: 0.10 }, // secondary: olive
      { h: 20,  spread: 15, chroma: 0.12 }, // accent: rust
      { h: 200, spread: 20, chroma: 0.06 }, // support: muted sky
    ],
    lightingMode: "painterly",
    defaultValuePreservation: 0.8,
    hueShiftByValue: 8,
  },
  {
    id: "royal-fantasy",
    name: "Royal Fantasy",
    paletteSeeds: [
      { h: 280, spread: 20, chroma: 0.12 }, // dominant: royal purple
      { h: 50,  spread: 15, chroma: 0.18 }, // secondary: gold
      { h: 0,   spread: 15, chroma: 0.16 }, // accent: ruby
      { h: 200, spread: 20, chroma: 0.08 }, // support: sapphire shadow
    ],
    lightingMode: "studio",
    defaultValuePreservation: 0.75,
    hueShiftByValue: 10,
  },
  {
    id: "cyberpunk-neon",
    name: "Cyberpunk Neon",
    paletteSeeds: [
      { h: 320, spread: 20, chroma: 0.18 }, // dominant: hot magenta
      { h: 195, spread: 15, chroma: 0.18 }, // secondary: cyan
      { h: 60,  spread: 15, chroma: 0.20 }, // accent: yellow
      { h: 270, spread: 20, chroma: 0.14 }, // support: violet
    ],
    lightingMode: "dramatic",
    defaultValuePreservation: 0.7,
    hueShiftByValue: 30,
  },
  {
    id: "muted-painterly",
    name: "Muted Painterly",
    paletteSeeds: [
      { h: 25,  spread: 25, chroma: 0.06 }, // dominant: dusty warm
      { h: 200, spread: 25, chroma: 0.06 }, // secondary: dusty cool
      { h: 350, spread: 15, chroma: 0.08 }, // accent: muted rose
      { h: 100, spread: 25, chroma: 0.05 }, // support: sage
    ],
    lightingMode: "painterly",
    defaultValuePreservation: 0.9,
    hueShiftByValue: 6,
  },
  {
    id: "anime-vivid",
    name: "Anime Vivid",
    paletteSeeds: [
      { h: 210, spread: 15, chroma: 0.16 }, // dominant: clean blue
      { h: 30,  spread: 15, chroma: 0.16 }, // secondary: peach
      { h: 350, spread: 15, chroma: 0.18 }, // accent: pink
      { h: 90,  spread: 15, chroma: 0.12 }, // support: green
    ],
    lightingMode: "studio",
    defaultValuePreservation: 0.7,
    hueShiftByValue: 14,
  },
  {
    id: "warm-villain",
    name: "Warm Villain",
    paletteSeeds: [
      { h: 15,  spread: 15, chroma: 0.16 }, // dominant: ember
      { h: 350, spread: 15, chroma: 0.14 }, // secondary: blood
      { h: 45,  spread: 15, chroma: 0.18 }, // accent: hot gold
      { h: 270, spread: 20, chroma: 0.08 }, // support: cold shadow
    ],
    lightingMode: "dramatic",
    defaultValuePreservation: 0.8,
    hueShiftByValue: 18,
  },
];

export function moodById(id: string): Mood {
  const m = MOODS.find((x) => x.id === id);
  if (!m) throw new Error(`unknown mood: ${id}`);
  return m;
}
