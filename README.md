# ChromaGhost

> Turn a grayscale painting into a fully colored image instantly, then progressively refine it through a hierarchy of zones, materials, and accents — without losing your original values.

**Adobe Photoshop UXP plugin.** Pre-production.

- Product spec: [PRD.md](PRD.md)
- Engineering plan: [DEVELOPMENT.md](DEVELOPMENT.md)

## Status

🚧 **M0 — repo scaffold.** Not yet runnable.

## Philosophy

Start broad, refine forever. Every level of input produces a complete, usable image-wide result.

1. **Macro pass** — whole-image color from grayscale + a mood.
2. **Material pass** — assign material behavior per zone.
3. **Detail pass** — accents, trim, gems, glow.

Beginners use mood presets and macro sliders. Experts open the hood and edit histograms, ramps, and inheritance directly.

## Build (once scaffold is filled in)

```bash
cd plugin
npm install
npm run build         # production webpack
npm run watch         # dev
npm run package       # build .ccx
```

## License

MIT © Erich Schmidt
