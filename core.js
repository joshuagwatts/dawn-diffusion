/* dawn-diffusion core — pure, DOM-free generative art engine.
 *
 * Reaction-diffusion (Gray-Scott) simulation driving stylized hand-drawn-style
 * flow lines. Everything is seeded from a 64-hex hash string (Art Blocks style:
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

/* ---------- palettes (name kept as a trait) ---------- */

const PALETTES = [
  { name: "Ink Paper",    bg: [244, 239, 230], ink: [26, 24, 22],   tint: [150, 132, 100] },
  { name: "Indigo Night", bg: [14, 16, 48],    ink: [141, 205, 255], tint: [52, 58, 150] },
  { name: "Copper Ember", bg: [20, 11, 8],     ink: [224, 138, 60],  tint: [120, 52, 20] },
  { name: "Moss",         bg: [16, 20, 8],     ink: [157, 192, 139], tint: [48, 74, 40] },
  { name: "Ultraviolet",  bg: [23, 10, 46],    ink: [180, 107, 255], tint: [74, 34, 130] },
  { name: "Bone",         bg: [239, 233, 220], ink: [64, 52, 42],    tint: [168, 146, 120] },
];

/* ---------- Gray-Scott regimes (feed/kill + feel) ---------- */

const REGIMES = [
  { name: "Coral Bloom",   F: 0.0545, k: 0.062,  iters: 1050, lineLen: 200, lineWidth: 1.0 },
  { name: "Mitosis",       F: 0.014,  k: 0.054,  iters: 1400, lineLen: 170, lineWidth: 1.2 },
  { name: "Worm Trails",   F: 0.058,  k: 0.065,  iters: 950,  lineLen: 230, lineWidth: 0.9 },
  { name: "Stone Spots",   F: 0.039,  k: 0.058,  iters: 1250, lineLen: 150, lineWidth: 1.3 },
  { name: "Deep Current",  F: 0.062,  k: 0.0609, iters: 900,  lineLen: 240, lineWidth: 0.8 },
];

/* ---------- Gray-Scott simulation (128 x 128 cells) ---------- */

const SIM = 128;
const DU = 1.0, DV = 0.5;

function simulate(rng, regime) {
  const n = SIM;
  const U = new Float64Array(n * n).fill(1);
  const V = new Float64Array(n * n).fill(0);

  // deterministic seed blobs scattered across the field
  const blobCount = 8 + ((rng() * 12) | 0);
  for (let b = 0; b < blobCount; b++) {
    const cx = 12 + rng() * (n - 24);
    const cy = 12 + rng() * (n - 24);
    const r = 2 + rng() * 3;
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

  const F = regime.F + (rng() - 0.5) * 0.004;
  const K = regime.k + (rng() - 0.5) * 0.004;
  const iters = regime.iters + ((rng() * 400) | 0);

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
  return { V, blobCount, F, K, iters };
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

/* ---------- flow-line rendering (the "hand drawn" layer) ---------- */

function renderLines(rng, V, regime, pal, out) {
  const W = out.width, H = out.height, buf = out.data;
  const lineCount = 4200 + ((rng() * 4200) | 0);
  const step = 3;
  const baseLen = regime.lineLen + ((rng() * 60) | 0);
  const wobbleAmp = 0.25 + rng() * 0.55;
  const followContour = 0.72 + rng() * 0.2; // bias toward contour-following
  const ink = pal.ink;

  for (let l = 0; l < lineCount; l++) {
    let px = rng() * W, py = rng() * H;
    const len = baseLen * (0.45 + rng() * 1.1);
    const phase = rng() * Math.PI * 2;
    const wobbleFreq = 0.05 + rng() * 0.08;
    const width = regime.lineWidth * (0.7 + rng() * 0.8);
    const alphaBase = 0.16 + rng() * 0.30;
    const steps = Math.max(8, (len / step) | 0);

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      // field at current point
      const vHere = sampleV(V, px / W, py / H);
      const e = 1.5 / W;
      const gx = (sampleV(V, (px + e * W) / W, py / H) - sampleV(V, (px - e * W) / W, py / H)) / (2 * e);
      const gy = (sampleV(V, px / W, (py + e * H) / H) - sampleV(V, px / W, (py - e * H) / H)) / (2 * e);
      const gLen = Math.hypot(gx, gy) + 1e-6;
      // contour direction (perpendicular to gradient) blended with gradient
      const cx = -gy / gLen, cy = gx / gLen;
      let dx = cx * followContour + (gx / gLen) * (1 - followContour) * (vHere > 0.5 ? 1 : -1);
      let dy = cy * followContour + (gy / gLen) * (1 - followContour) * (vHere > 0.5 ? 1 : -1);
      // hand-drawn wobble
      const w = Math.sin(s * wobbleFreq + phase) * wobbleAmp;
      const ang = Math.atan2(dy, dx) + w;
      const dl = Math.hypot(dx, dy) + 1e-6;
      px += (Math.cos(ang)) * step; py += (Math.sin(ang)) * step;
      if (px < 0 || py < 0 || px >= W || py >= H) break;

      const taper = Math.sin(Math.PI * Math.min(Math.max(t, 0), 1));
      const a = alphaBase * taper * (0.55 + 0.45 * vHere);
      if (a <= 0.003) continue;
      // 3x3 splat
      const xi = px | 0, yi = py | 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const X = xi + ox, Y = yi + oy;
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          const fall = ox === 0 && oy === 0 ? 1 : 0.45;
          const i = (Y * W + X) * 4;
          const aa = a * fall * width;
          buf[i]   += (ink[0] / 255 - buf[i])   * aa;
          buf[i+1] += (ink[1] / 255 - buf[i+1]) * aa;
          buf[i+2] += (ink[2] / 255 - buf[i+2]) * aa;
          buf[i+3] = 1;
        }
      }
    }
  }
  return { lineCount, lineLen: baseLen };
}

// soft tint underlay from the V field (the "reaction diffusion read")
function renderTint(V, pal, out) {
  const W = out.width, H = out.height, buf = out.data;
  const stride = 4;
  const tint = pal.tint;
  for (let y = 0; y < H; y += stride) {
    for (let x = 0; x < W; x += stride) {
      const v = sampleV(V, x / W, y / H);
      if (v < 0.04) continue;
      const a = Math.min(0.55, v * 0.6);
      for (let oy = 0; oy < stride && y + oy < H; oy++) {
        for (let ox = 0; ox < stride && x + ox < W; ox++) {
          const i = ((y + oy) * W + (x + ox)) * 4;
          buf[i]   = buf[i]   * (1 - a) + (tint[0] / 255) * a;
          buf[i+1] = buf[i+1] * (1 - a) + (tint[1] / 255) * a;
          buf[i+2] = buf[i+2] * (1 - a) + (tint[2] / 255) * a;
          buf[i+3] = 1;
        }
      }
    }
  }
}

/* ---------- top-level: hash -> artwork ---------- */

function generate(hashStr, size) {
  size = size || 1080;
  const rng = hashToRng(hashStr);
  const regime = REGIMES[(rng() * REGIMES.length) | 0];
  const pal = PALETTES[(rng() * PALETTES.length) | 0];

  const sim = simulate(rng, regime);

  const out = {
    width: size, height: size,
    data: new Float32Array(size * size * 4),
    hash: String(hashStr),
  };
  // background fill
  const buf = out.data;
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = pal.bg[0] / 255; buf[i + 1] = pal.bg[1] / 255;
    buf[i + 2] = pal.bg[2] / 255; buf[i + 3] = 1;
  }

  renderTint(sim.V, pal, out);
  const lines = renderLines(rng, sim.V, regime, pal, out);

  // Art Blocks-style traits
  out.features = {
    "Palette": pal.name,
    "Regime": regime.name,
    "Line count": String(lines.lineCount),
    "Seed blooms": String(sim.blobCount),
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

const api = { generate, checksum, hashToRng, randomHex, PALETTES, REGIMES, cyrb53, mulberry32 };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else if (typeof window !== "undefined") window.DawnDiffusion = api;
