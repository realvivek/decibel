# decibel

An interactive dB-math playground set on a bright residential small-cell street.
Three "labs" teach decibel intuition: a draggable dial (dB ↔ ratio ↔ watts), a polar
antenna-pattern explorer with a phased-array builder, and a link-budget waterfall whose
receiver literally walks down the street. The recurring hero object is a light pole
carrying a small cell radio and a canister panel antenna.

## Stack — deliberately boring

Static HTML/CSS/JS. **No build step, no dependencies, no framework, no modules.**
Plain `<script>` tags in order: `main.js` → `scene.js` → `lab-dial.js` → `lab-gain.js`
→ `lab-link.js`. Rendering is hand-rolled canvas 2D + SVG; the street scenes are inline
SVG sprites (`<defs>` at the top of index.html) reused via `<use>` with per-instance CSS
custom properties (`--wall`, `--leaf`, …) and texture `<pattern>`s. Fonts (Space Grotesk,
JetBrains Mono; OFL) are self-hosted in `assets/fonts/` — the site makes zero external
requests.

```
index.html            sprite/texture defs, hero street scene, three labs, MODEL NOTES
assets/styles.css     design system (tokens, cards, chips, sliders, scene animations)
assets/main.js        shared utils on window.DB (tween, hi-DPI canvas, formatters)
assets/scene.js       hero parallax + offscreen pausing of scene animations
assets/lab-dial.js    LAB 01 — the dial            (exposes window.LAB1, LAB1_MATH)
assets/lab-gain.js    LAB 02 — the shape of gain   (exposes window.LAB2, LAB2_MATH)
assets/lab-link.js    LAB 03 — the link budget     (exposes window.LAB3, LAB3_MATH;
                      also drives the #street-strip walker)
```

## Conventions

- Bright daylight theme — dark backgrounds are banned. Design tokens live in `:root`
  in styles.css and in `DB.tokens` in main.js — keep them in sync: bg `#EEF4F8`,
  ink `#17293C`, cyan `#0999C4`, violet `#6C5CE7`, pink `#E5548E`, amber `#E9A23B`
  (reserved for −3 dB / sensitivity markers), lime `#4C9F45` (success),
  halo `rgba(255,255,255,0.92)` (text halos over canvas art).
- Each lab file is one IIFE: pure math first, exposed on `window.LABn_MATH`, then a DOM
  guard (`if (!container) return`). Every lab file must eval cleanly in Node with only
  `global.window = {}` and a stub `document` — that's what the math tests rely on.
- Canvases never paint opaque backgrounds (white cards sit behind them); rAF loops must
  self-stop when values settle. Scene animations are CSS; they pause offscreen and are
  disabled entirely under prefers-reduced-motion.
- SVG filter gotcha: never apply a bbox-relative filter to a horizontal/vertical line —
  its zero-area bbox makes the element vanish. Use a thin polygon instead.
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

Live at **https://decibel-34c7.onrender.com** — a Render static site (owner
`tea-d95ciprtqb8s73emcicg`, publish path `.`) tracking branch
`claude/decibel-project-setup-xovup4` (this repo's only branch) with autoDeploy on:
**every push deploys**. The `RENDER_API_KEY` lives in the repo's GitHub Actions
secrets, so API work happens in `.github/workflows/deploy.yml` (runs on push and
manual dispatch; it created the service and verifies each deploy with five
consecutive clean reads of the live URL — fresh edges flap while propagating, and
a stray 404 during propagation can get edge-cached until the next deploy purges it).

## Roadmap (one slice at a time, screenshot each)

1. 3D rotating radiation lobe (three.js as an optional module w/ graceful fallback)
   beside the polar plot.
2. dB quiz mode: flash-card chips ("−6 dB = ?") with a streak counter.
3. Grating-lobe warning callout when spacing > 0.5 λ and steered; tooltip cards on
   every control.
4. Link-budget preset scenarios (city small cell / rural macro / satellite).

When the site is live, add a project card to `realvivek/portfolio` (PROJECTS array in
`assets/app.js` — read that repo's CLAUDE.md first) linking the live URL.
