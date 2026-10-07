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
- [x] **Static, capturable output** — 1080×1080, renders in ~1s, no animation
      loop, so Art Blocks' static thumbnail capture just works.
- [x] **Cross-browser safe** — vanilla JS + Canvas 2D only. No WebGL, no WASM,
      no fonts, no images loaded at runtime.
- [x] **Live demo** — https://joshuagwatts.github.io/dawn-diffusion/ (shareable
      with the application; `?hash=` links directly to a piece).
- [x] **Reference piece** — `docs/reference.jpg` is one of Jaiye's actual works,
      the style target this engine was tuned against.

## Jaiye's steps

1. **Apply** at https://artblocks.io/apply — lead with the live demo link and
   2–3 favorite exported pieces. Rolling review; ~10% acceptance. They judge
   innovation in generative code, technical proficiency, conceptual depth.
2. **If accepted**, Art Blocks onboards him to the Creator Dashboard with his
   wallet. He pastes this script into a testnet project on
   `artist-staging.artblocks.io`, mints 20–40 test outputs to check variety,
   then emails apply@artblocks.io with the testnet link for review.
3. **Project details** (collected during onboarding — draft prompts below):
   - Artist name: how he wants to appear (e.g. "Jaiye" / "Dawn Jaiye")
   - Project name, edition size, mint price / drop mechanic
   - Project description — prompts: lead with the artistic inquiry; what does
     the reaction-diffusion process mean here; describe the palette, the tubes,
     the rings; how do the algorithm's outputs answer the inquiry
   - Project website (this demo, his site, or his Instagram)
   - Creative license — a placeholder `LICENSE` (CC BY-NC 4.0) is in this repo;
     he picks the final one (Art Blocks suggests aligning it with his values)

## Notes for the application

- The engine's three regimes (Deep Veins / Worm Trails / Ember Seeds) give the
  collection its range; palettes are weighted ~45% to his signature Copper Ember.
- Edition size is his call — the script holds up across hundreds of hashes
  (test mints will confirm no hash produces a broken output).
- Follow-up: if the application goes quiet for a month, email apply@artblocks.io.
