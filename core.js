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
  // k=0.065 grows discrete worm segments (k=0.063 merged them into a maze).
  // Stable spots are removed by the morphological cleanup in simulate().
  { name: "Worm Field",  F: 0.058, k: 0.065, iters: 7000, t0: 0.25 },
  { name: "Deep Drift",  F: 0.060, k: 0.065, iters: 7500, t0: 0.25 },
  // Maze: dense labyrinth grown directly (not reaction-diffusion). Thick
  // non-touching lines packed to ~55% — Jaiye's dense maze hand.
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
        V[idx] = 1.0;
      }
    }
  }

  let worms = 0, attempts = 0;
  const target = 0.58 * n * n;
  let covered = 0;
  while (covered < target && attempts < 6000) {
    attempts++;
    const x = 12 + rng() * (n - 24), y = 12 + rng() * (n - 24);
    if (clearance(x, y) < LW / 2 + GAP + 2) continue;
    let px = x, py = y, ang = rng() * Math.PI * 2;
    const path = [[px, py]];
    const maxSteps = 30 + ((rng() * 30) | 0);
    for (let st = 0; st < maxSteps; st++) {
      let bestA = ang, bestC = -1;
      for (let k = -2; k <= 2; k++) {
        const a = ang + k * 0.5;
        const nx = px + Math.cos(a) * 8, ny = py + Math.sin(a) * 8;
        if (nx < 12 || ny < 12 || nx >= n - 12 || ny >= n - 12) continue;
        const c = clearance(nx, ny);
        if (c > bestC) { bestC = c; bestA = a; }
      }
      if (bestC < LW / 2 + GAP) break;
      ang = bestA;
      px += Math.cos(ang) * 8; py += Math.sin(ang) * 8;
      path.push([px, py]);
    }
    if (path.length < 4) continue;
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
  return { V, iters: 0 };
}

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
  // Motif clusters on a dense grid — each motif has the mass to survive
  // and grow; packed tight so the worms touch like Jaiye's hand.
  const gridN = 12;
  const margin = 3;
  const cell = (n - 2 * margin) / gridN;
  const fseed = (rng() * 1000) | 0;
  for (let gy = 0; gy < gridN; gy++) {
    for (let gx = 0; gx < gridN; gx++) {
      if (rng() < 0.06) continue;
      if (vnoise(gx * 0.85 + fseed, gy * 0.85, fseed ^ 0x51ab) < 0.08) continue;
      const flowAng = vnoise(gx * 0.55, gy * 0.55 + fseed, fseed ^ 0x2c7e) * Math.PI * 2;
      const cx = margin + gx * cell + cell / 2 + (rng() - 0.5) * cell * 0.9;
      const cy = margin + gy * cell + cell / 2 + (rng() - 0.5) * cell * 0.9;
      stampMotif(cx, cy, flowAng);
    }
  }
  // wild motifs, fully off-grid
  const wild = 24 + ((rng() * 8) | 0);
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
        // Maze lines are binary in V: render them bold and bright.
        // Tube shading comes from the drag/ink texture below.
        bright = smoothstep(t0 - 0.04, t0 + 0.04, v);
      } else {
        const edge = smoothstep(t0 - 0.11, t0 - 0.03, v);
        const core = smoothstep(t0 - 0.03, t0 + 0.22, v);
        bright = edge * (1 - 0.25 * core);
      }

      // dry-brush drag: streaky opacity along the stroke, like bristles skipping
      const drag = 0.72 + 0.28 * vnoise(x / W * 30 + nx, y / H * 6 + ny, (nx ^ 0x55aa));
      // blotchy paint density
      const ink = 0.78 + 0.44 * vnoise(x / W * 7 + nx, y / H * 7 + ny, (nx ^ ny) | 1);
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

function generate(hashStr, size) {
  size = size || 1080;
  const rng = hashToRng(hashStr);
  const regime = REGIMES[(rng() * REGIMES.length) | 0];
  // signature palette (his copper) gets ~45% weight
  let pal;
  const sigs = PALETTES.filter(p => p.sig), rest = PALETTES.filter(p => !p.sig);
  if (rng() < 0.45) pal = sigs[(rng() * sigs.length) | 0];
  else pal = rest[(rng() * rest.length) | 0];

  // Single field — Jaiye's lines never overlap or cross. One clean
  // reaction-diffusion field; the worms maintain their own separation.
  const sim = regime.mode === "maze" ? growMaze(rng) : simulate(rng, regime);

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

const api = { generate, checksum, hashToRng, randomHex, PALETTES, REGIMES, cyrb53, mulberry32, simulate, growMaze, renderGlow, sampleV, smoothstep };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else if (typeof window !== "undefined") window.DawnDiffusion = api;
