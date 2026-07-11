# decibel

An interactive dB-math playground. Three "labs" teach decibel intuition: a draggable
dial (dB ↔ ratio ↔ watts), a polar antenna-pattern explorer with a phased-array
builder, and a link-budget waterfall.

## Stack — deliberately boring

Static HTML/CSS/JS. **No build step, no dependencies, no framework, no modules.**
Plain `<script>` tags in order: `main.js` → `lab-dial.js` → `lab-gain.js` → `lab-link.js`.
Rendering is hand-rolled canvas 2D + SVG. Fonts (Space Grotesk, JetBrains Mono; OFL)
are self-hosted in `assets/fonts/` — the site makes zero external requests.

```
index.html            all markup for the three labs + MODEL NOTES footer
assets/styles.css     design system (tokens, glass panels, chips, sliders)
assets/main.js        shared utils on window.DB (tween, hi-DPI canvas, formatters)
assets/lab-dial.js    LAB 01 — the dial            (exposes window.LAB1, LAB1_MATH)
assets/lab-gain.js    LAB 02 — the shape of gain   (exposes window.LAB2, LAB2_MATH)
assets/lab-link.js    LAB 03 — the link budget     (exposes window.LAB3, LAB3_MATH)
```

## Conventions

- Design tokens live in `:root` in styles.css and in `DB.tokens` in main.js — keep them
  in sync: bg `#0A0F1A`, cyan `#38E1FF`, violet `#8B7CFF`, pink `#FF5CA8`,
  amber `#FFC24B` (reserved for −3 dB / sensitivity markers), lime `#B7F34D` (success).
- Each lab file is one IIFE: pure math first, exposed on `window.LABn_MATH`, then a DOM
  guard (`if (!container) return`). Every lab file must eval cleanly in Node with only
  `global.window = {}` and a stub `document` — that's what the math tests rely on.
- Canvases never paint opaque backgrounds (glass panels sit behind them); rAF loops must
  self-stop when values settle.
- Keep the MODEL NOTES footer honest: if you change a formula or a constant, update it.
- Git identity for commits: `realvivek <realvivek@users.noreply.github.com>`.

## Run locally

```
python3 -m http.server 8000        # from the repo root
# open http://localhost:8000
```

(Any static server works; file:// mostly works too since nothing is a module, but fonts
and some browsers behave better over http.)

## Verify

1. Math (no browser needed):
   ```
   node tests/math-checks.js
   ```
   Stubs `window`/`document`, evals `main.js` + each lab file, asserts the physics
   (array-factor nulls and grating lobes, FSPL constants, HPBW extraction, SI formatting).
2. Behavior: serve the site, open it, and use the test hooks from the console or a
   Playwright script — `LAB1.set(23)`, `LAB2.setPreset('array')`, `LAB2.stats()`,
   `LAB3.set({ km: 30, band: 28000, rain: true })`. `tests/browser-check.js` does this
   end-to-end and captures desktop + 375 px screenshots
   (`NODE_PATH=$(npm root -g) node tests/browser-check.js`).
3. Eyeball the three labs at 1440 px and 375 px — layout must hold at both.

## Deploy

Render static site (API: `https://api.render.com/v1`), owner `tea-d95ciprtqb8s73emcicg`,
branch `main`, publish path `.`, autoDeploy on. Needs `RENDER_API_KEY` in the env.
After creating a deploy, poll it for the pushed commit SHA, then hit the live URL until
content is stable (fresh services flap while the edge propagates).

## Roadmap (one slice at a time, screenshot each)

1. 3D rotating radiation lobe (three.js as an optional module w/ graceful fallback)
   beside the polar plot.
2. dB quiz mode: flash-card chips ("−6 dB = ?") with a streak counter.
3. Grating-lobe warning callout when spacing > 0.5 λ and steered; tooltip cards on
   every control.
4. Link-budget preset scenarios (city small cell / rural macro / satellite).

When the site is live, add a project card to `realvivek/portfolio` (PROJECTS array in
`assets/app.js` — read that repo's CLAUDE.md first) linking the live URL.
