# Art Blocks submission checklist — dawn-diffusion

How this repo maps to an Art Blocks drop, and what's left for Jaiye.

## Done in this repo

- [x] **Deterministic generative script** (`core.js`) — the artwork is a pure
      function of the 64-hex hash: `generate(hash, size)`. No `Math.random()`,
      no `Date.now()`, no external requests, no CDN scripts. Same hash always
      grows the same piece (verified by `node test.js`).
- [x] **`window.$features` traits** — every piece reports Palette, Regime,
      Iterations. The browser demo sets
      `window.tokenData = { hash, tokenId }` exactly the way Art Blocks injects it.
- [x] **Static, capturable output** — 1080×1080, renders in ~1–2s (Maze) or
      ~15s (Gray-Scott), no animation loop, so Art Blocks' static thumbnail
      capture just works.
- [x] **Cross-browser safe** — vanilla JS + Canvas 2D only. No WebGL, no WASM,
      no fonts, no images loaded at runtime.
- [x] **Live demo** — https://joshuagwatts.github.io/dawn-diffusion/ (shareable
      with the application; `?hash=` links directly to a piece).
- [x] **Style fidelity** — tuned against Jaiye's actual work: thick white
      strokes on black, lines never touch, no circles, full-bleed, his
      vertical fade. Maze regime is the signature (~65% of outputs).

## Jaiye's steps

1. **Apply** at https://artblocks.io/apply — lead with the live demo link and
   2–3 favorite exported pieces. Rolling review; they judge innovation in
   generative code, technical proficiency, conceptual depth.
2. **If accepted**, Art Blocks onboards him to the Creator Dashboard with his
   wallet. He pastes this script into a testnet project on
   `artist-staging.artblocks.io`, mints 20–40 test outputs to check variety,
   then submits for review.
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
