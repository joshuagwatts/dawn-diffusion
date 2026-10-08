/* dawn-diffusion app — browser wiring for core.js (no external dependencies) */
(function () {
  "use strict";

  var SIZE = 1536;
  var canvas = document.getElementById("art");
  var ctx = canvas.getContext("2d");
  var img = ctx.createImageData(SIZE, SIZE);

  var hashInput = document.getElementById("hash");
  var statusEl = document.getElementById("status");
  var traitsEl = document.getElementById("traits");

  function qs(name) {
    var m = new RegExp("[?&]" + name + "=([^&#]*)").exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function paint(out) {
    var d = img.data, src = out.data;
    for (var i = 0; i < d.length; i += 4) {
      d[i]     = Math.max(0, Math.min(255, Math.round(src[i] * 255)));
      d[i + 1] = Math.max(0, Math.min(255, Math.round(src[i + 1] * 255)));
      d[i + 2] = Math.max(0, Math.min(255, Math.round(src[i + 2] * 255)));
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  function render(hash) {
    statusEl.textContent = "Rendering " + hash.slice(0, 12) + "…";
    // let the status paint before the (fast, synchronous) render
    requestAnimationFrame(function () {
      setTimeout(function () {
        var t0 = performance.now();
        var out = DawnDiffusion.generate(hash, SIZE);
        paint(out);
        var ms = Math.round(performance.now() - t0);
        statusEl.textContent = "Rendered in " + ms + " ms";

        // Art Blocks-style surfaces
        window.tokenData = { hash: hash, tokenId: "0" };
        window.$features = out.features;

        traitsEl.innerHTML = "";
        Object.keys(out.features).forEach(function (k) {
          var li = document.createElement("li");
          li.innerHTML = "<span></span>";
          li.firstChild.textContent = k + ": ";
          li.appendChild(document.createTextNode(out.features[k]));
          traitsEl.appendChild(li);
        });
        history.replaceState(null, "", "?hash=" + hash);
      }, 30);
    });
  }

  function currentHash() {
    var h = hashInput.value.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(h)) {
      h = DawnDiffusion.randomHex(DawnDiffusion.hashToRng("dawn-diffusion-" + Date.now()), 64);
      hashInput.value = h;
    }
    return h;
  }

  document.getElementById("reroll").addEventListener("click", function () {
    hashInput.value = DawnDiffusion.randomHex(
      DawnDiffusion.hashToRng("dawn-diffusion-" + Date.now() + Math.random()), 64);
    render(hashInput.value);
  });
  document.getElementById("generate").addEventListener("click", function () {
    render(currentHash());
  });
  document.getElementById("export").addEventListener("click", function () {
    var a = document.createElement("a");
    a.download = "dawn-diffusion-" + hashInput.value.slice(0, 12) + ".png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  });

  // expose core under a friendly namespace for core.js (loaded via <script>)
  window.DawnDiffusion = window.DawnDiffusion || {};

  var h = qs("hash");
  if (h && /^[0-9a-f]{64}$/i.test(h)) {
    hashInput.value = h.toLowerCase();
  } else {
    hashInput.value = DawnDiffusion.randomHex(
      DawnDiffusion.hashToRng("dawn-diffusion-" + Date.now()), 64);
  }
  render(hashInput.value);
})();
