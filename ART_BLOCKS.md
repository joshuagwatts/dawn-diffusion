# Art Blocks submission checklist — dawn-diffusion

How this repo maps to an Art Blocks drop, and what's left for Jaiye.

## Done in this repo

- [x] **Deterministic generative script** (`core.js`) — the artwork is a pure
      function of the 64-hex hash: `generate(hash, size)`. No `Math.random()`,
      no `Date.now()`, no external requests, no CDN scripts. Same hash always
      grows the same piece (verified by `node test.js`).
- [x] **Art Blocks submission script** (`dawn-diffusion-artblocks.js`, built by
      `node build_artblocks.js`) — single self-contained file: strips the `0x`
      prefix from `tokenData.hash`, renders to the generator-provided `<canvas>`
      at viewport size (resolution-agnostic), sets `window.$features`
      synchronously, and calls `window.$renderPreview()` for thumbnail capture.
      21.9KB, vanilla JS, no dependencies.
- [x] **`window.$features` traits** — every piece reports Palette, Regime,
      Iterations, derived deterministically from the hash.
- [x] **Static, capturable output** — no animation loop; `$renderPreview` fires
      when the frame is ready, so Art Blocks' thumbnail capture just works.
- [x] **Cross-browser safe** — vanilla JS + Canvas 2D only. No WebGL, no WASM,
      no fonts, no images, no `setTimeout`/`setInterval`/`fetch` in the core.
- [x] **Live demo** — https://joshuagwatts.github.io/dawn-diffusion/ (shareable
      with the application; `?hash=` links directly to a piece, accepts `0x`).
- [x] **Style fidelity** — tuned against Jaiye's actual work: thick white
      strokes on black, lines never touch, no circles, full-bleed, his
      vertical fade. Maze regime is the signature (~65% of outputs).

## Jaiye's steps

1. **Apply** at https://artblocks.io/apply — lead with the live demo link and
   2–3 favorite exported pieces. Rolling review, ~10% acceptance; they judge
   innovation in generative code, technical proficiency, conceptual depth.
   If no reply in a month, follow up at apply@artblocks.io.
2. **If accepted**, Art Blocks onboards him to the Creator Dashboard
   (create.artblocks.io) with his wallet + a V3 Engine contract. He pastes
   `dawn-diffusion-artblocks.js` into a Sepolia testnet project, mints 20–40
   test tokens to check variety, then submits for team review (1–3 weeks).
3. **Project details** (collected during onboarding):
   - Artist name: how he wants to appear (e.g. "Jaiye" / "Dawn Jaiye")
   - Project name, edition size, mint price / drop mechanic
   - Project description — lead with the artistic inquiry; what the maze and
     Turing processes mean here; the discipline of lines that never touch
   - Project website (this demo, his site, or his Instagram)
   - License — a placeholder `LICENSE` (CC BY-NC 4.0) is in this repo;
     he picks the final one

## Notes for the application

- The three regimes (Maze / Worm Field / Deep Drift) give the collection its
  range; Maze leads at ~65% because it's closest to his hand.
- Palettes are B&W only: Turing Fade (his signature fade), Pattern Tare,
  Bone Ink.
- Edition size is his call — the script holds up across hundreds of hashes
  (test mints will confirm no hash produces a broken output).
