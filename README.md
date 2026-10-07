# dawn-diffusion

Generative reaction-diffusion line art — a working, deterministic mint demo in
the Art Blocks style, built for **Jaiye** ([@dawnjaiye](https://www.instagram.com/dawnjaiye/)).

## What it does

A Gray-Scott reaction-diffusion simulation grows an organic field from seeded
"blooms"; thousands of flow lines then follow the field's contours with
hand-drawn wobble, taper, and alpha variation — reaction-diffusion stylized
line work, rendered as a 1080×1080 piece.

Everything derives from a 64-hex hash (like `tokenData.hash`):
- same hash → same artwork, every time (seeded PRNG, no `Math.random()` anywhere)
- palettes, Gray-Scott regime, seed blooms, line count all derive from the hash
- traits exposed as `window.$features` (Palette, Regime, Line count, Seed blooms, Iterations)

## Run it

Open `index.html` in a browser — no build step, no dependencies.

- Type/paste a 64-hex hash and hit **Grow**, or **Re-roll** for a new one
- **Export PNG** saves the 1080×1080 piece
- Share a piece: `index.html?hash=<64-hex>` links directly to it

Generate a batch from the command line:

```sh
node make_batch.js <count> <out-dir>
```

## Art Blocks path

This engine is structured the way Art Blocks projects work:

1. Deterministic script: artwork = f(hash), traits = `window.$features`
2. The Art Blocks submission is a JavaScript project (testnet staging on
   `artist-staging.artblocks.io`), not a set of finished images
3. Apply at [artblocks.io/apply](https://artblocks.io/apply); this repo is the
   live-demo material to lead the application with

## Files

- `core.js` — the engine (DOM-free; tested in Node for determinism)
- `app.js` — browser wiring: canvas, controls, PNG export
- `index.html` — the viewer page
- `make_batch.js` — CLI batch renderer

Built by Muse for Joshua Watts & Jaiye, October 2026.
