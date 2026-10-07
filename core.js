/* dawn-diffusion core — pure, DOM-free generative art engine.
 *
 * Reaction-diffusion (Gray-Scott) fields rendered in Jaiye's vocabulary:
 * thick glowing tubes with bright rims on black, scattered pill dots.
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

const REGIMES = [
  { name: "Worm Field",  F: 0.058, k: 0.065, iters: 4500, t0: 0.25 },
  { name: "Deep Drift",  F: 0.058, k: 0.065, iters: 6500, t0: 0.25 },
  { name: "Ember Seeds", F: 0.036, k: 0.062, iters: 4000, t0: 0.28 },
];

/* ---------- Gray-Scott simulation (128 x 128 cells) ---------- */

const SIM = 128;
const DU = 1.0, DV = 0.5;

function simulate(rng, regime) {
  const n = SIM;
  const U = new Float64Array(n * n).fill(1);
  const V = new Float64Array(n * n).fill(0);

  // Jaiye-style seeding: dense jittered grid of fat seeds, full-bleed —
  // his pieces are fields of discrete worm segments edge-to-edge,
  // not a connected maze and not framed
  const gridN = 10;
  const margin = 4;
  const cell = (n - 2 * margin) / gridN;
  for (let gy = 0; gy < gridN; gy++) {
    for (let gx = 0; gx < gridN; gx++) {
      if (rng() < 0.05) continue; // skip a few — breaks the lattice
      const cx = margin + gx * cell + cell / 2 + (rng() - 0.5) * cell * 1.0;
      const cy = margin + gy * cell + cell / 2 + (rng() - 0.5) * cell * 1.0;
      const r = 2 + rng() * 1.5;
      for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
        for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
          if (x < 0 || y < 0 || x >= n || y >= n) continue;
          const dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy <= r * r) {
            const i = y * n + x;
            U[i] = 0.5; V[i] = 1.0;
          }
        }
      }
    }
  }
  // a few wild seeds, fully off-grid (also kept off the edges)
  const wild = 10 + ((rng() * 8) | 0);
  for (let b = 0; b < wild; b++) {
    const cx = 6 + rng() * (n - 12);
    const cy = 6 + rng() * (n - 12);
    const r = 2 + rng() * 1.5;
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r * r) {
          const i = y * n + x;
          U[i] = 0.5; V[i] = 1.0;
        }
      }
    }
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

/* ---------- Jaiye-style glow-tube rendering ---------- */

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

function renderGlow(V, regime, pal, out, rng, seedInt) {
  const W = out.width, H = out.height, buf = out.data;
  const ramp = buildRamp(pal);
  const t0 = regime.t0;
  const phase = rng() * Math.PI * 2; // marbling phase, deterministic per piece

  for (let y = 0; y < H; y++) {
    const vUv = y / H;
    for (let x = 0; x < W; x++) {
      const uUv = x / W;
      const v = sampleV(V, uUv, vUv);

      // Jaiye's tube: brightest ring right at the boundary, darker core inside
      const edge = smoothstep(t0 - 0.06, t0 + 0.015, v);  // reaches 1 at the tube edge
      const core = smoothstep(t0 + 0.015, t0 + 0.28, v);   // fills the interior
      const halo = smoothstep(t0 - 0.28, t0 - 0.06, v) * 0.22; // faint spill outside
      let bright = Math.min(edge * (1 - 0.62 * core) + halo, 1);

      // interior marbling — subtle striation inside the tubes
      bright *= 0.96 + 0.04 * Math.sin(v * 36 + phase);
      // hand grain — tiny deterministic pixel noise
      let n = (x * 374761393 + y * 668265263 + seedInt * 974634211) | 0;
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      const grain = (((n ^ (n >>> 16)) >>> 0) / 4294967296 - 0.5) * 0.035;
      bright = Math.min(Math.max(bright + grain * (0.2 + bright), 0), 1);

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
