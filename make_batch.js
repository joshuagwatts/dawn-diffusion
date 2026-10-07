/* dawn-diffusion batch renderer — node make_batch.js <count> <out-dir> [seed-word]
 * Writes 1080x1080 PNGs (via BMP + ffmpeg) for a run of fresh hashes. */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const core = require("./core.js");

const count = parseInt(process.argv[2] || "5", 10);
const outDir = process.argv[3] || "./batch_out";
const seedWord = process.argv[4] || "dawn-diffusion";
fs.mkdirSync(outDir, { recursive: true });

function toBmp(out) {
  const W = out.width, H = out.height, d = out.data;
  const rowPad = (4 - ((W * 3) % 4)) % 4, rowSize = W * 3 + rowPad;
  const buf = Buffer.alloc(54 + rowSize * H);
  buf.write("BM"); buf.writeUInt32LE(54 + rowSize * H, 2); buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14); buf.writeInt32LE(W, 18); buf.writeInt32LE(-H, 22);
  buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  let o = 54;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      buf[o++] = Math.max(0, Math.min(255, Math.round(d[i + 2] * 255)));
      buf[o++] = Math.max(0, Math.min(255, Math.round(d[i + 1] * 255)));
      buf[o++] = Math.max(0, Math.min(255, Math.round(d[i] * 255)));
    }
    o += rowPad;
  }
  return buf;
}

const rng = core.hashToRng(seedWord);
for (let i = 0; i < count; i++) {
  const hash = core.randomHex(rng, 64);
  const t0 = Date.now();
  const out = core.generate(hash, 1080);
  const base = path.join(outDir, "dawn-diffusion-" + hash.slice(0, 12));
  const bmpPath = base + ".bmp";
  fs.writeFileSync(bmpPath, toBmp(out));
  try {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", bmpPath, base + ".png"]);
    fs.unlinkSync(bmpPath);
  } catch (e) {
    console.log("ffmpeg missing — kept BMP:", bmpPath);
  }
  console.log(
    "piece", i + 1, "|", hash.slice(0, 12) + "…",
    "|", out.regime, "|", out.palette,
    "|", Date.now() - t0, "ms"
  );
}
