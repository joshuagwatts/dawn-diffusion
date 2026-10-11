# dawn-diffusion

Generative art in **Jaiye**'s hand — thick white brush strokes on black, dense
maze labyrinths and scattered Turing worms, his signature vertical fade. A
working, deterministic mint demo in the Art Blocks style, built for
[@dawnjaiye](https://www.instagram.com/dawnjaiye/).

Live demo: https://joshuagwatts.github.io/dawn-diffusion/

## What it does

Three generative regimes, all obeying his rules — lines never touch, never
overlap, no circles, full-bleed, black and white only:

- **Maze** (signature, ~65%) — a direct worm-grower plants thick labyrinth
  lines one by one, each seeking empty space and keeping its distance.
  Concentric ring portals emerge naturally. ~55% ink coverage, dots in the gaps.
- **Worm Field** — Gray-Scott reaction-diffusion grows discrete worm segments
  with rounded caps and dry-brush texture.
- **Deep Drift** — longer, drifting Gray-Scott worms.

Palettes: **Turing Fade** (his signature — bright top dissolving down),
**Pattern Tare**, **Bone Ink**. Final polish pass: gentle blur + unsharp mask
for clean luminous strokes.

Everything derives from a 64-hex hash (like `tokenData.hash`):
- same hash → same artwork, every time (seeded PRNG, no `Math.random()` anywhere)
- palette, regime, and all marks derive from the hash
- traits exposed as `window.$features` (Palette, Regime, Iterations)

## Run it

Open `index.html` in a browser — no build step, no dependencies.

- Type/paste a 64-hex hash and hit **Grow**, or **Re-roll** for a new one
- **Export PNG** saves the 1080×1080 piece
- Share a piece: `index.html?hash=<64-hex>` links directly to it

Generate a batch from the command line:

```sh
node make_batch.js <count> <out-dir>
```

Run the test suite (8 checks, run before every push):

```sh
node test.js
```

## Art Blocks path

This engine is structured the way Art Blocks projects work:

1. Deterministic script: artwork = f(hash), traits = `window.$features`
2. The Art Blocks submission is a JavaScript project (testnet staging on
   `artist-staging.artblocks.io`), not a set of finished images
3. Apply at [artblocks.io/apply](https://artblocks.io/apply); this repo is the
   live-demo material to lead the application with

See `ART_BLOCKS.md` for the full submission checklist.

## Files

- `core.js` — the engine (DOM-free; `node test.js` verifies determinism)
- `app.js` — browser wiring: canvas, controls, PNG export
- `index.html` — the viewer page (shims `window.tokenData` from `?hash=`,
  exactly as Art Blocks injects it)
- `test.js` — determinism + regime-coverage test suite
- `make_batch.js` — CLI batch renderer
- `ART_BLOCKS.md` — submission checklist: what's done, Jaiye's steps

Built by Muse for Joshua Watts & Jaiye, October 2026.
