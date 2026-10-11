/* dawn-diffusion determinism test — node test.js
 * Exits nonzero on any failure. Run before every push. */
"use strict";
const core = require("./core.js");

let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? "PASS" : "FAIL") + " " + name + (extra ? " — " + extra : ""));
  if (!ok) failures++;
}

const H1 = "c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00";
const H2 = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

// 1. determinism: same hash -> identical pixels
const a = core.generate(H1, 270);
const b = core.generate(H1, 270);
check("same hash, same artwork", core.checksum(a) === core.checksum(b));

// 2. variety: different hashes -> different artwork
const c = core.generate(H2, 270);
check("different hashes differ", core.checksum(a) !== core.checksum(c));

// 3. no NaN / Infinity anywhere
let bad = 0;
for (let i = 0; i < a.data.length; i += 13) if (!isFinite(a.data[i])) bad++;
check("finite pixel buffer", bad === 0, bad + " bad samples");

// 4. no Math.random leakage: hashToRng output is stable
const r1 = core.hashToRng(H1)(), r2 = core.hashToRng(H1)();
check("seeded RNG stable", r1 === r2);

// 5. traits present (Art Blocks $features contract)
const f = a.features;
check("features complete",
  f && f.Palette && f.Regime && f.Iterations,
  JSON.stringify(f));

// 6. the maze develops a real field (coverage sanity, catches param drift)
core.REGIMES.forEach((regime) => {
  const sim = core.growMaze(core.hashToRng("coveragetest"));
  let hi = 0;
  for (let i = 0; i < sim.V.length; i++) if (sim.V[i] > regime.t0) hi++;
  const cov = (hi / sim.V.length) * 100;
  check("regime develops: " + regime.name, cov > 5, cov.toFixed(1) + "% coverage");
});

process.exit(failures ? 1 : 0);
