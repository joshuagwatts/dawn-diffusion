/* dawn-diffusion core — pure, DOM-free generative art engine.
 *
 * Reaction-diffusion (Gray-Scott) fields rendered in Jaiye's vocabulary:
 * hand-inked worm segments with soft rims and ink pooling on black.
 * Everything is seeded from a 64-hex hash string (Art Blocks style:
 * tokenData.hash), so the same hash always produces the same artwork.
 *
 * No Math.random() anywhere. Works in Node (for tests) and in the browser.
 */
"use strict";

/* ---------- deterministic hashing / RNG ---------- */

// cyrb53 — compact, well-distributed 53-bit string hash
function cyrb53(str, seed) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// mulberry32 — seeded PRNG
function mulberry32(seedInt) {
  let a = seedInt >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashToRng(hashStr) {
  return mulberry32(cyrb53(String(hashStr).toLowerCase(), 0x9e3779b9));
}

function randomHex(rng, len) {
  let s = "";
  const hex = "0123456789abcdef";
  for (let i = 0; i < len; i++) s += hex[(rng() * 16) | 0];
  return s;
}

/* ---------- palettes (signature copper weighted first) ---------- */

const PALETTES = [
  { name: "Copper Ember", sig: true, bg: [0, 0, 0],      core: [58, 18, 6],   mid: [196, 106, 40],  rim: [255, 233, 200] },
  { name: "Bone Glow",    sig: false, bg: [0, 0, 0],     core: [40, 36, 30],  mid: [180, 168, 148], rim: [255, 250, 240] },
  { name: "Indigo Vein",  sig: false, bg: [2, 3, 12],    core: [18, 20, 70],  mid: [70, 110, 230],  rim: [215, 232, 255] },
  { name: "Moss Light",   sig: false, bg: [2, 6, 2],     core: [24, 52, 22],  mid: [120, 180, 90],  rim: [240, 255, 220] },
  { name: "Blood Moon",   sig: false, bg: [6, 0, 0],     core: [70, 8, 8],     mid: [200, 60, 40],   rim: [255, 214, 190] },
];

/* ---------- Gray-Scott regimes (Jaiye-tuned: tubes + dots) ---------- */

// No spots regime: Joshua ruled out round puddle-circles (2026-10-08).
// Every piece grows discrete worm segments only.
const REGIMES = [
  // k=0.065 grows discrete worm segments (k=0.063 merged them into a maze).
  // Stable spots are removed by the morphological cleanup in simulate().
  { name: "Worm Field",  F: 0.058, k: 0.065, iters: 6000, t0: 0.25 },
  { name: "Deep Drift",  F: 0.060, k: 0.065, iters: 6500, t0: 0.25 },
];

/* ---------- Gray-Scott simulation (128 x 128 cells) ---------- */

const SIM = 256; // 2026-10-08 — smaller-scale worms (width is fixed in cells, so finer grid = finer strokes)
const DU = 1.0, DV = 0.5;

function simulate(rng, regime) {
  const n = SIM;
  const U = new Float64Array(n * n).fill(1);
  const V = new Float64Array(n * n).fill(0);

  // Jaiye-style seeding: REPEATED MARK MOTIFS with local flow.
  // His work is dense mark-making — a small vocabulary of marks repeated
  // across the piece with hand variation, clumping into dense regions with
  // breathing room. Never a uniform algorithmic grid, never a disc.
  // Every mark is an elongated capsule (never a disc) — no circles.
  function stampDisc(px, py, r) {
    for (let y = Math.floor(py - r - 1); y <= Math.ceil(py + r + 1); y++) {
      for (let x = Math.floor(px - r - 1); x <= Math.ceil(px + r + 1); x++) {
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        const dx = x - px, dy = y - py;
        if (dx * dx + dy * dy <= r * r) {
          const i = y * n + x;
          U[i] = 0.5; V[i] = 1.0;
        }
      }
    }
  }
  function stampStreak(cx, cy, ang, len, w) {
    // capsule sized to ignite but not nuke the field: too much seeded V-mass
    // collapses the whole domain back to (U=1, V=0) — tuned 2026-10-08.
    // Minimum 2.4:1 aspect — stubbier seeds grow into round dots (no circles).
    if (len < w * 2.4) len = w * 2.4;
    const steps = 7;
    for (let s = 0; s < steps; s++) {
      const t = (s / (steps - 1) - 0.5) * 2 * len;
      stampDisc(cx + Math.cos(ang) * t, cy + Math.sin(ang) * t, w);
    }
  }
  // motif vocabulary — one motif per grid cell, rotated by the local flow
  // angle so neighborhoods share a direction like hand-drawn hatching
  function stampMotif(cx, cy, flowAng) {
    const kind = rng();
    const rot = flowAng + (rng() - 0.5) * 1.4; // loose hand variation around the flow
    const sc = 0.8 + rng() * 0.5;
    const L = (4.0 + rng() * 2.0) * sc, W = 2.0 + rng() * 1.0;
    if (kind < 0.30) {
      // burst: 5 streaks radiating from the center, pushed outward so
      // their inner ends can't merge into a dot cluster
      const m = 5;
      const a0 = rng() * Math.PI * 2;
      for (let k = 0; k < m; k++) {
        const a = a0 + (k / m) * Math.PI * 2 + (rng() - 0.5) * 0.4;
        stampStreak(cx + Math.cos(a) * L * 0.7, cy + Math.sin(a) * L * 0.7, a, L * 0.8, W);
      }
    } else if (kind < 0.55) {
      // triad: 3 parallel hatch streaks
      for (let k = -1; k <= 1; k++) {
        const px = -Math.sin(rot), py = Math.cos(rot);
        stampStreak(cx + px * k * 3.2 * sc + (rng() - 0.5), cy + py * k * 3.2 * sc + (rng() - 0.5),
          rot + (rng() - 0.5) * 0.25, L, W);
      }
    } else if (kind < 0.80) {
      // arc: 5 streaks along a gentle curve (never curled enough to close a ring)
      const a0 = rot, R = L * 2.2;
      for (let k = 0; k < 5; k++) {
        const a = a0 + (k / 4 - 0.5) * 1.0;
        stampStreak(cx + Math.cos(a) * R * 0.45, cy + Math.sin(a) * R * 0.45,
          a + Math.PI / 2 + (rng() - 0.5) * 0.3, L * 0.7, W);
      }
    } else {
      // scatter: 3 loose streaks, well spread — no dot clusters
      for (let k = 0; k < 3; k++) {
        stampStreak(cx + (rng() - 0.5) * L * 2.4, cy + (rng() - 0.5) * L * 2.4,
          rot + (rng() - 0.5) * 1.2, L * (0.8 + rng() * 0.5), W);
      }
    }
  }
  const gridN = 9;
  const margin = 10;
  const cell = (n - 2 * margin) / gridN;
  const fseed = (rng() * 1000) | 0;
  for (let gy = 0; gy < gridN; gy++) {
    for (let gx = 0; gx < gridN; gx++) {
      if (rng() < 0.08) continue; // skip a few — breaks the lattice
      // organic clumping: dense patches and breathing room, not uniform
      if (vnoise(gx * 0.85 + fseed, gy * 0.85, fseed ^ 0x51ab) < 0.22) continue;
      const flowAng = vnoise(gx * 0.55, gy * 0.55 + fseed, fseed ^ 0x2c7e) * Math.PI * 2;
      const cx = margin + gx * cell + cell / 2 + (rng() - 0.5) * cell * 0.9;
      const cy = margin + gy * cell + cell / 2 + (rng() - 0.5) * cell * 0.9;
      stampMotif(cx, cy, flowAng);
    }
  }
  // wild motifs, fully off-grid (also kept off the edges)
  const wild = 20 + ((rng() * 6) | 0);
  for (let b = 0; b < wild; b++) {
    stampMotif(10 + rng() * (n - 20), 10 + rng() * (n - 20), rng() * Math.PI * 2);
  }
  // faint background noise so no region stays perfectly sterile
  for (let i = 0; i < n * n; i++) {
    if (V[i] === 0) V[i] = rng() * 0.05;
  }

  const F = regime.F;
  const K = regime.k;
  const iters = regime.iters + ((rng() * 300) | 0);

  const U2 = new Float64Array(n * n), V2 = new Float64Array(n * n);
  for (let t = 0; t < iters; t++) {
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < n - 1; x++) {
        const i = y * n + x;
        const u = U[i], v = V[i];
        const lapU = (U[i - 1] + U[i + 1] + U[i - n] + U[i + n]) * 0.2
                   + (U[i - n - 1] + U[i - n + 1] + U[i + n - 1] + U[i + n + 1]) * 0.05 - u;
        const lapV = (V[i - 1] + V[i + 1] + V[i - n] + V[i + n]) * 0.2
                   + (V[i - n - 1] + V[i - n + 1] + V[i + n - 1] + V[i + n + 1]) * 0.05 - v;
        const uvv = u * v * v;
        let nu = u + DU * lapU - uvv + F * (1 - u);
        let nv = v + DV * lapV + uvv - (F + K) * v;
        U2[i] = nu < 0 ? 0 : nu > 1 ? 1 : nu;
        V2[i] = nv < 0 ? 0 : nv > 1 ? 1 : nv;
      }
    }
    U.set(U2); V.set(V2);
  }
  // morphological cleanup: erase round dot components (no circles —
  // Joshua's rule). Kills components that are BOTH small (<150 cells) AND
  // round (bbox aspect < 1.8); small-but-elongated worm segments are kept.
  // Deterministic flood fill over V > regime.t0.
  (function () {
    const seen = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) {
      if (V[i] <= regime.t0 || seen[i]) continue;
      const comp = [];
      const stack = [i];
      seen[i] = 1;
      let mnx = n, mxx = -1, mny = n, mxy = -1;
      while (stack.length) {
        const c = stack.pop();
        comp.push(c);
        const x = c % n, y = (c / n) | 0;
        if (x < mnx) mnx = x; if (x > mxx) mxx = x;
        if (y < mny) mny = y; if (y > mxy) mxy = y;
        const nb = [c - 1, c + 1, c - n, c + n];
        for (let k = 0; k < 4; k++) {
          const d = nb[k];
          if (d < 0 || d >= n * n) continue;
          const dx = Math.abs((d % n) - x), dy = Math.abs(((d / n) | 0) - y);
          if (dx + dy !== 1) continue;
          if (V[d] > regime.t0 && !seen[d]) { seen[d] = 1; stack.push(d); }
        }
      }
      const w = mxx - mnx + 1, h = mxy - mny + 1;
      const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h));
      if (comp.length < 150 && aspect < 1.8) {
        // dilate the erasure by 2 cells: the dot's faint V skirt
        // (below t0 but above the render's edge threshold) would
        // otherwise survive as a ghost ring
        for (const c of comp) {
          const x = c % n, y = (c / n) | 0;
          for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
            const nx2 = x + ox, ny2 = y + oy;
            if (nx2 < 0 || ny2 < 0 || nx2 >= n || ny2 >= n) continue;
            V[ny2 * n + nx2] = 0;
          }
        }
      }
    }
  })();
  return { V, F, K, iters };
}

// bilinear sample of the V field, u/v in [0,1]
function sampleV(V, u, v) {
  const n = SIM;
  const x = Math.min(Math.max(u * (n - 1), 0), n - 1.001);
  const y = Math.min(Math.max(v * (n - 1), 0), n - 1.001);
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
  const a = V[y0 * n + x0], b = V[y0 * n + x0 + 1];
  const c = V[(y0 + 1) * n + x0], d = V[(y0 + 1) * n + x0 + 1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

function smoothstep(a, b, x) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/* ---------- Jaiye-style hand-inked rendering ---------- */

function buildRamp(pal) {
  // 256-entry ramp: bg -> core -> mid -> rim
  const ramp = new Float32Array(256 * 3);
  const stops = [
    [0.00, pal.bg], [0.42, pal.core], [0.72, pal.mid], [1.00, pal.rim],
  ];
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let s = 0;
    while (s < stops.length - 2 && t > stops[s + 1][0]) s++;
    const t0 = stops[s][0], t1 = stops[s + 1][0];
    const f = Math.min(Math.max((t - t0) / (t1 - t0), 0), 1);
    for (let c = 0; c < 3; c++) {
      ramp[i * 3 + c] = (stops[s][1][c] + (stops[s + 1][1][c] - stops[s][1][c]) * f) / 255;
    }
  }
  return ramp;
}

// deterministic 2D value noise in [0,1] — the hand-drawn wobble & ink
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  function corner(ix, iy) {
    let n = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed | 0, 974634211)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  const a = corner(xi, yi), b = corner(xi + 1, yi);
  const c = corner(xi, yi + 1), d = corner(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function renderGlow(V, regime, pal, out, rng, seedInt) {
  const W = out.width, H = out.height, buf = out.data;
  const ramp = buildRamp(pal);
  const t0 = regime.t0;
  const phase = rng() * Math.PI * 2; // marbling phase, deterministic per piece
  const nx = seedInt & 0xffff, ny = (seedInt >>> 16) & 0xffff;

  for (let y = 0; y < H; y++) {
    const vUv = y / H;
    for (let x = 0; x < W; x++) {
      const uUv = x / W;

      // hand-drawn wobble: nudge the sample point with low-frequency noise,
      // so edges wander slightly and stroke width breathes like a pen line
      const wx = (vnoise(x / W * 10 + nx, y / H * 10, nx ^ 0x1f3a) - 0.5) * 0.007;
      const wy = (vnoise(x / W * 10, y / H * 10 + ny, ny ^ 0x7c21) - 0.5) * 0.007;
      const v = sampleV(V, uUv + wx, vUv + wy);

      // Jaiye's stroke: a mostly-solid inked line, brightest just inside the
      // boundary, soft spill outside — not a neon tube
      const edge = smoothstep(t0 - 0.055, t0 + 0.02, v);  // reaches 1 at the stroke edge
      const core = smoothstep(t0 + 0.02, t0 + 0.30, v);   // fills the interior
      const halo = smoothstep(t0 - 0.30, t0 - 0.055, v) * 0.16; // soft spill outside
      let bright = Math.min(edge * (1 - 0.35 * core) + halo, 1);

      // ink pooling: blotchy low-frequency density, like ink on paper
      const ink = 0.80 + 0.40 * vnoise(x / W * 8 + nx, y / H * 8 + ny, (nx ^ ny) | 1);
      bright = Math.min(Math.max(bright * ink, 0), 1);

      // interior striation — faint pen texture inside the strokes
      bright *= 0.965 + 0.035 * Math.sin(v * 30 + phase);
      // paper grain — stronger inside the ink, faint on the background
      let n = (x * 374761393 + y * 668265263 + seedInt * 974634211) | 0;
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      const grain = (((n ^ (n >>> 16)) >>> 0) / 4294967296 - 0.5) * 0.055;
      bright = Math.min(Math.max(bright + grain * (0.15 + bright), 0), 1);

      const ri = Math.min(255, (bright * 255) | 0) * 3;
      const i = (y * W + x) * 4;
      buf[i] = ramp[ri]; buf[i + 1] = ramp[ri + 1]; buf[i + 2] = ramp[ri + 2]; buf[i + 3] = 1;
    }
  }
}

/* ---------- top-level: hash -> artwork ---------- */

function generate(hashStr, size) {
  size = size || 1080;
  const rng = hashToRng(hashStr);
  const regime = REGIMES[(rng() * REGIMES.length) | 0];
  // signature palette (his copper) gets ~45% weight
  let pal;
  const sigs = PALETTES.filter(p => p.sig), rest = PALETTES.filter(p => !p.sig);
  if (rng() < 0.45) pal = sigs[(rng() * sigs.length) | 0];
  else pal = rest[(rng() * rest.length) | 0];

  const sim = simulate(rng, regime);

  const out = {
    width: size, height: size,
    data: new Float32Array(size * size * 4),
    hash: String(hashStr),
  };
  const seedInt = cyrb53(String(hashStr).toLowerCase(), 0x51ab3c2d);
  renderGlow(sim.V, regime, pal, out, rng, seedInt);

  // Art Blocks-style traits
  out.features = {
    "Palette": pal.name,
    "Regime": regime.name,
    "Iterations": String(sim.iters),
  };
  out.palette = pal.name;
  out.regime = regime.name;
  return out;
}

// checksum for tests (deterministic fingerprints)
function checksum(out) {
  let h = 0;
  const d = out.data;
  for (let i = 0; i < d.length; i += 977) {
    h = (Math.imul(h, 31) + ((d[i] * 1000) | 0)) | 0;
  }
  return (h >>> 0).toString(16);
}

const api = { generate, checksum, hashToRng, randomHex, PALETTES, REGIMES, cyrb53, mulberry32, simulate, renderGlow, sampleV, smoothstep };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else if (typeof window !== "undefined") window.DawnDiffusion = api;
