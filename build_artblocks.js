// Builds the single-file Art Blocks submission script.
// Usage: node build_artblocks.js
const fs = require('fs');
let core = fs.readFileSync('core.js', 'utf8');
// strip the Node/browser UMD footer — the submission runs in the generator
core = core.replace(/if \(typeof module[^]*?window\.DawnDiffusion = api;/, '');
core = core.replace(/const api = \{[^}]*\};/, '');

const adapter = `
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
`;

fs.writeFileSync('dawn-diffusion-artblocks.js', core + adapter);
const bytes = fs.statSync('dawn-diffusion-artblocks.js').size;
console.log('wrote dawn-diffusion-artblocks.js', (bytes/1024).toFixed(1) + 'KB');
