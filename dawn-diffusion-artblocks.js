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
  // Jaiye's work is black and white — spray paint / acrylic on black canvas.
  { name: "Turing Fade",  sig: true,  bg: [0, 0, 0], core: [18, 18, 18],  mid: [150, 150, 150], rim: [255, 255, 255], fade: "vertical" },
  { name: "Pattern Tare", sig: false, bg: [0, 0, 0], core: [10, 10, 10],  mid: [170, 170, 170], rim: [255, 255, 255], fade: "none" },
  { name: "Bone Ink",     sig: false, bg: [0, 0, 0], core: [30, 28, 24],  mid: [160, 152, 138], rim: [245, 238, 225], fade: "vertical" },
];

/* ---------- Gray-Scott regimes (Jaiye-tuned: tubes + dots) ---------- */

// No spots regime: Joshua ruled out round puddle-circles (2026-10-08).
// Every piece grows discrete worm segments only.
const REGIMES = [
  // Maze: dense labyrinth grown directly. Thick non-touching lines packed
  // to ~55% — Jaiye's hand. The only regime.
  { name: "Maze", mode: "maze", t0: 0.25 },
];

/* ---------- Gray-Scott simulation (128 x 128 cells) ---------- */

const SIM = 256; // 2026-10-08 — smaller-scale worms (width is fixed in cells, so finer grid = finer strokes)
const DU = 1.0, DV = 0.5;

// Dense maze grower: plants thick worms one by one, each seeking empty
// space and keeping its distance. Fills to ~55% with no touching lines.
// Deterministic from rng. Returns a V field with tube profile (bright
// center, softer edge) for the renderer.
function growMaze(rng) {
  const n = SIM;
  const LW = 12, GAP = 4;
  const V = new Float64Array(n * n);
  const occ = new Uint8Array(n * n);

  function clearance(x, y) {
    const R = 30;
    let best = R;
    const x0 = Math.max(0, Math.round(x - R)), x1 = Math.min(n - 1, Math.round(x + R));
    const y0 = Math.max(0, Math.round(y - R)), y1 = Math.min(n - 1, Math.round(y + R));
    for (let yy = y0; yy <= y1; yy += 2) for (let xx = x0; xx <= x1; xx += 2) {
      if (occ[yy * n + xx]) {
        const d = Math.hypot(xx - x, yy - y);
        if (d < best) best = d;
      }
    }
    return best;
  }

  function drawCapsule(x0, y0, x1, y1, w) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) + 1;
    for (let s2 = 0; s2 <= steps; s2++) {
      const px = x0 + (x1 - x0) * s2 / steps, py = y0 + (y1 - y0) * s2 / steps;
      const r = w / 2;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const dd = Math.sqrt(dx * dx + dy * dy);
        if (dd > r) continue;
        const nx = Math.round(px + dx), ny = Math.round(py + dy);
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        const idx = ny * n + nx;
        occ[idx] = 1;
        // gentle tube profile: bright center, softly falling to edge
        const tube = 1 - 0.18 * (dd / r) * (dd / r);
        if (tube > V[idx]) V[idx] = tube;
      }
    }
  }

  let worms = 0, attempts = 0;
  const target = 0.58 * n * n;
  let covered = 0;
  while (covered < target && attempts < 12000) {
    attempts++;
    const x = 12 + rng() * (n - 24), y = 12 + rng() * (n - 24);
    if (clearance(x, y) < LW / 2 + GAP + 2) continue;
    let px = x, py = y, ang = rng() * Math.PI * 2;
    const path = [[px, py]];
    const maxSteps = 30 + ((rng() * 30) | 0);
    for (let st = 0; st < maxSteps; st++) {
      // Confident walk: prefer going straight, only turn when crowded.
      // Momentum keeps the line smooth; narrow turn range kills the jitters.
      let bestA = ang, bestScore = -1;
      for (let k = -2; k <= 2; k++) {
        const a = ang + k * 0.42;
        const nx = px + Math.cos(a) * 10, ny = py + Math.sin(a) * 10;
        if (nx < 12 || ny < 12 || nx >= n - 12 || ny >= n - 12) continue;
        const c = clearance(nx, ny);
        // score: clearance minus turn penalty (straight = confident)
        const score = c - Math.abs(k) * 2.5;
        if (score > bestScore) { bestScore = score; bestA = a; }
      }
      if (bestScore < LW / 2 + GAP) break;
      ang = bestA;
      px += Math.cos(ang) * 10; py += Math.sin(ang) * 10;
      path.push([px, py]);
    }
    if (path.length < 4) continue;
    // Chaikin smoothing: round off the corners for flowing, confident curves
    for (let smooth = 0; smooth < 2; smooth++) {
      const sp = [path[0]];
      for (let i = 0; i < path.length - 1; i++) {
        const p0 = path[i], p1 = path[i + 1];
        sp.push([p0[0]*0.75 + p1[0]*0.25, p0[1]*0.75 + p1[1]*0.25]);
        sp.push([p0[0]*0.25 + p1[0]*0.75, p0[1]*0.25 + p1[1]*0.75]);
      }
      sp.push(path[path.length - 1]);
      path.length = 0;
      for (const p of sp) path.push(p);
    }
    for (let i = 1; i < path.length; i++)
      drawCapsule(path[i-1][0], path[i-1][1], path[i][0], path[i][1], LW);
    worms++;
    if (worms % 20 === 0) {
      covered = 0;
      for (let i = 0; i < n * n; i++) if (occ[i]) covered++;
    }
  }
  // small dots in the leftover gaps (his maze texture has them)
  for (let b = 0; b < 40; b++) {
    const x = 12 + rng() * (n - 24), y = 12 + rng() * (n - 24);
    if (clearance(x, y) < LW / 2 + GAP + 1) continue;
    const r = 3 + rng() * 2;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx*dx + dy*dy > r*r) continue;
      const nx = Math.round(x+dx), ny = Math.round(y+dy);
      if (nx<0||ny<0||nx>=n||ny>=n) continue;
      const idx = ny*n+nx;
      occ[idx] = 1;
      V[idx] = Math.max(V[idx], 0.9);
    }
  }
  // Anti-alias: blur the V field to smooth the hard binary edges.
  // Two passes of 3x3 box blur — kills the pixelated jaggies when
  // the 256-cell field upscales to 1080px.
  for (let pass = 0; pass < 2; pass++) {
    const Vs = new Float64Array(n * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let acc = 0, cnt = 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
          acc += V[ny * n + nx]; cnt++;
        }
        Vs[y * n + x] = acc / cnt;
      }
    }
    V.set(Vs);
  }
  return { V, iters: 0 };
}

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
  // Jaiye's hand: bold white brush strokes on black canvas, spray paint /
  // acrylic. Dry-brush drag, varying opacity, and his signature vertical
  // fade (bright at the top dissolving downward — "Turing Fade").
  const W = out.width, H = out.height, buf = out.data;
  const ramp = buildRamp(pal);
  const t0 = regime.t0;
  const phase = rng() * Math.PI * 2;
  const nx = seedInt & 0xffff, ny = (seedInt >>> 16) & 0xffff;
  const doFade = pal.fade === "vertical";
  const fadeDir = rng() < 0.5 ? 1 : -1; // fade runs top-down or bottom-up
  const fadeStart = 0.15 + rng() * 0.25, fadeEnd = 0.75 + rng() * 0.25;

  for (let y = 0; y < H; y++) {
    const vUv = y / H;
    for (let x = 0; x < W; x++) {
      const uUv = x / W;

      // hand-drawn wobble — edges wander like a loaded brush
      const wx = (vnoise(x / W * 10 + nx, y / H * 10, nx ^ 0x1f3a) - 0.5) * 0.009;
      const wy = (vnoise(x / W * 10, y / H * 10 + ny, ny ^ 0x7c21) - 0.5) * 0.009;
      const v = sampleV(V, uUv + wx, vUv + wy);

      // bold stroke: hard edge, solid fill — a brush mark, not a glow.
      // His lines are thick (2-4% of canvas) and never touch: we render a
      // wider band of the V field than the cleanup threshold, thickening
      // each worm while the field's natural spacing keeps them separated.
      let bright;
      if (regime.mode === "maze") {
        // Maze: clean luminous strokes. Crisp edge, subtle tube highlight
        // from the V profile, whisper of hand texture — no muddy multiply.
        bright = smoothstep(t0 - 0.05, t0 + 0.03, v) * (0.92 + 0.08 * v);
      } else {
        const edge = smoothstep(t0 - 0.11, t0 - 0.03, v);
        const core = smoothstep(t0 - 0.03, t0 + 0.22, v);
        bright = edge * (1 - 0.25 * core);
      }

      // dry-brush drag: streaky opacity along the stroke, like bristles skipping
      // (maze: whisper of texture only — his maze lines are clean and luminous)
      const dragAmp = regime.mode === "maze" ? 0.06 : 0.28;
      const inkAmp = regime.mode === "maze" ? 0.08 : 0.44;
      const drag = (1 - dragAmp) + dragAmp * vnoise(x / W * 30 + nx, y / H * 6 + ny, (nx ^ 0x55aa));
      const ink = (1 - inkAmp) + inkAmp * vnoise(x / W * 7 + nx, y / H * 7 + ny, (nx ^ ny) | 1);
      bright = Math.min(Math.max(bright * drag * ink, 0), 1);

      // bristle striation inside the strokes
      bright *= 0.94 + 0.06 * Math.sin(v * 26 + phase + 3 * vnoise(x / W * 20, y / H * 20, 7));
      // canvas grain
      let n = (x * 374761393 + y * 668265263 + seedInt * 974634211) | 0;
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      const grain = (((n ^ (n >>> 16)) >>> 0) / 4294967296 - 0.5) * 0.07;
      bright = Math.min(Math.max(bright + grain * (0.1 + bright), 0), 1);

      // Turing Fade: brightness dissolves along the vertical
      if (doFade && bright > 0.01) {
        const p = fadeDir > 0 ? vUv : 1 - vUv;
        const f = 1 - smoothstep(fadeStart, fadeEnd, p) * 0.80;
        bright *= f;
      }

      const ri = Math.min(255, (bright * 255) | 0) * 3;
      const i = (y * W + x) * 4;
      buf[i] = ramp[ri]; buf[i + 1] = ramp[ri + 1]; buf[i + 2] = ramp[ri + 2]; buf[i + 3] = 1;
    }
  }
}

/* ---------- top-level: hash -> artwork ---------- */

// Final polish: gentle blur to melt pixel roughness, then unsharp mask
// to snap edges back. Cleans the look — smooth interiors, crisp strokes.
function polish(out) {
  const W = out.width, H = out.height, d = out.data;
  const blurred = new Float32Array(W * H * 3);
  // 3x3 gaussian-ish blur (1-2-1 kernel)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0, wsum = 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const w = (ox === 0 && oy === 0) ? 4 : (ox === 0 || oy === 0) ? 2 : 1;
          acc += d[(ny * W + nx) * 4 + c] * w;
          wsum += w;
        }
        blurred[(y * W + x) * 3 + c] = acc / wsum;
      }
    }
  }
  // unsharp mask: original + 0.55 * (original - blurred)
  for (let i = 0; i < W * H; i++) {
    for (let c = 0; c < 3; c++) {
      const orig = d[i * 4 + c];
      const b = blurred[i * 3 + c];
      let s = orig + 0.55 * (orig - b);
      d[i * 4 + c] = s < 0 ? 0 : s > 1 ? 1 : s;
    }
  }
}

function generate(hashStr, size) {
  size = size || 1080;
  const rng = hashToRng(hashStr);
  const regime = REGIMES[0];
  // signature palette (his copper) gets ~45% weight
  let pal;
  const sigs = PALETTES.filter(p => p.sig), rest = PALETTES.filter(p => !p.sig);
  if (rng() < 0.45) pal = sigs[(rng() * sigs.length) | 0];
  else pal = rest[(rng() * rest.length) | 0];

  // Single field — Jaiye's lines never overlap or cross. One clean
  // reaction-diffusion field; the worms maintain their own separation.
  const sim = growMaze(rng);

  const out = {
    width: size, height: size,
    data: new Float32Array(size * size * 4),
    hash: String(hashStr),
  };
  const seedInt = cyrb53(String(hashStr).toLowerCase(), 0x51ab3c2d);
  renderGlow(sim.V, regime, pal, out, rng, seedInt);
  polish(out);

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




// ---- Art Blocks adapter ----
(function () {
  var rawHash = tokenData.hash.toLowerCase();
  var hash = rawHash.indexOf('0x') === 0 ? rawHash.slice(2) : rawHash;
  var canvas = document.querySelector('canvas');
  var size = Math.min(window.innerWidth, window.innerHeight) || 1080;
  size = Math.max(512, Math.min(2048, size));
  canvas.width = size; canvas.height = size;
  var out = generate(hash, size);
  var ctx = canvas.getContext('2d');
  var img = ctx.createImageData(size, size);
  var src = out.data, dst = img.data;
  for (var i = 0; i < size * size; i++) {
    dst[i*4]   = Math.round(src[i*4] * 255);
    dst[i*4+1] = Math.round(src[i*4+1] * 255);
    dst[i*4+2] = Math.round(src[i*4+2] * 255);
    dst[i*4+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  window.$features = out.features;
  window.$useRenderPreview = true;
  if (typeof window.$renderPreview === 'function') window.$renderPreview();
})();
