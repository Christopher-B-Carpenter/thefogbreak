/**
 * Topographic contour background for The Fog Break.
 * Procedurally generated on every page load — marching squares algorithm,
 * subtle ink lines at ~10% opacity, cursor ripple interaction.
 * From the Claude Design ambient studies exploration (topo variant).
 */
(function () {
  'use strict';

  // Mulberry32 — fast seeded PRNG
  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // New random terrain layout every page load
  const rng = mulberry32(Math.floor(Math.random() * 0xffffff));

  const hills = [
    { x: 0.15 + rng() * 0.35, y: 0.15 + rng() * 0.35, amp:  1.2 + rng() * 0.5,  s: 0.25 + rng() * 0.12 },
    { x: 0.45 + rng() * 0.35, y: 0.40 + rng() * 0.30, amp: -(0.9 + rng() * 0.5), s: 0.22 + rng() * 0.12 },
    { x: 0.10 + rng() * 0.40, y: 0.55 + rng() * 0.30, amp:  0.7 + rng() * 0.4,  s: 0.20 + rng() * 0.10 },
    { x: 0.55 + rng() * 0.35, y: 0.10 + rng() * 0.35, amp: -(0.5 + rng() * 0.4), s: 0.20 + rng() * 0.12 },
  ];

  const T = {
    reliefAmp:   1.55,
    hillSize:    2.3,
    lineCount:   31,
    heightRange: 1.6,
    lineOpacity: 0.095,
    lineWeight:  0.3,
    resolution:  7,
    rippleAmp:   0.54,
    rippleFreq:  11,
  };

  // --- Canvas setup ---
  const canvas = document.createElement('canvas');
  canvas.id = 'topo-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;' +
    'pointer-events:none;z-index:0;';
  document.body.insertBefore(canvas, document.body.firstChild);

  const ctx = canvas.getContext('2d');
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  let W = 0, H = 0;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width  = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  // --- Mouse / touch tracking ---
  const mouse = { x: 0.5, y: 0.5, active: false };

  window.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX / W;
    mouse.y = e.clientY / H;
    mouse.active = true;
    scheduleDraw();
  });

  window.addEventListener('mouseleave', function () {
    mouse.active = false;
    scheduleDraw();
  });

  window.addEventListener('touchmove', function (e) {
    const t = e.touches[0];
    mouse.x = t.clientX / W;
    mouse.y = t.clientY / H;
    mouse.active = true;
    scheduleDraw();
  }, { passive: true });

  // --- Height field ---
  function heightAt(nx, ny) {
    var h = 0;
    for (var i = 0; i < hills.length; i++) {
      var hh = hills[i];
      var dx = nx - hh.x, dy = ny - hh.y;
      var s  = hh.s * T.hillSize;
      h += hh.amp * T.reliefAmp * Math.exp(-(dx * dx + dy * dy) / (2 * s * s));
    }
    if (mouse.active) {
      var mx = mouse.x, my = mouse.y;
      var dx2 = nx - mx, dy2 = ny - my;
      var d = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      h += T.rippleAmp * Math.cos(d * T.rippleFreq) * Math.exp(-d * 6);
    }
    return h;
  }

  // --- Marching squares contour renderer ---
  function draw() {
    ctx.clearRect(0, 0, W, H);

    var res   = T.resolution;
    var cols  = Math.ceil(W / res) + 1;
    var rows  = Math.ceil(H / res) + 1;
    var range = T.heightRange;
    var N     = Math.round(T.lineCount);

    for (var L = 0; L < N; L++) {
      var level  = -range + (L / (N - 1)) * range * 2;
      var isZero = Math.abs(level) < range * 0.12;
      var alpha  = T.lineOpacity * (isZero ? 1.6 : 1);

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(29,31,28,' + alpha + ')';
      ctx.lineWidth   = isZero ? T.lineWeight * 1.8 : T.lineWeight;

      for (var j = 0; j < rows - 1; j++) {
        for (var i = 0; i < cols - 1; i++) {
          var x0 = i * res, y0 = j * res;
          var x1 = (i + 1) * res, y1 = (j + 1) * res;

          var a = heightAt(x0 / W, y0 / H);
          var b = heightAt(x1 / W, y0 / H);
          var c = heightAt(x1 / W, y1 / H);
          var d = heightAt(x0 / W, y1 / H);

          var code = 0;
          if (a > level) code |= 1;
          if (b > level) code |= 2;
          if (c > level) code |= 4;
          if (d > level) code |= 8;
          if (code === 0 || code === 15) continue;

          function interp(v1, v2, ax, ay, bx, by) {
            var t = (level - v1) / (v2 - v1);
            return [ax + t * (bx - ax), ay + t * (by - ay)];
          }

          var top    = interp(a, b, x0, y0, x1, y0);
          var right  = interp(b, c, x1, y0, x1, y1);
          var bottom = interp(d, c, x0, y1, x1, y1);
          var left   = interp(a, d, x0, y0, x0, y1);

          function seg(p, q) {
            ctx.moveTo(p[0], p[1]);
            ctx.lineTo(q[0], q[1]);
          }

          switch (code) {
            case 1:  case 14: seg(left,  top);    break;
            case 2:  case 13: seg(top,   right);  break;
            case 3:  case 12: seg(left,  right);  break;
            case 4:  case 11: seg(right, bottom); break;
            case 5:  seg(left, top); seg(right, bottom); break;
            case 6:  case 9:  seg(top,   bottom); break;
            case 7:  case 8:  seg(left,  bottom); break;
            case 10: seg(left, bottom); seg(top, right); break;
          }
        }
      }
      ctx.stroke();
    }

    // Clear topo lines inside opaque content blocks
    clearBlocks();
  }

  // Selectors for opaque content blocks that should be clear of topo lines.
  // After drawing all contours we clearRect inside each matching element so
  // lines only appear in open margins and gaps — not through cards or panels.
  var BLOCK_SEL = [
    '.controls', '.viz-box', '.card-preview', '.card-diagram', '.hero-diagram',
    '.stats', '.dist-stats', '.stat', '.dist-stat',
    '.subscribe-box', '.data-card', '.insight', '.pullquote',
    '.tool-card', '.article-card', '.archive-card',
    '.presets', '.section-label',
  ].join(', ');

  function clearBlocks() {
    var els = document.querySelectorAll(BLOCK_SEL);
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        ctx.clearRect(r.left - 1, r.top - 1, r.width + 2, r.height + 2);
      }
    }
  }

  var drawQueued = false;
  function scheduleDraw() {
    if (!drawQueued) {
      drawQueued = true;
      requestAnimationFrame(function () {
        drawQueued = false;
        draw();
      });
    }
  }

  // Initial render
  resize();
  draw();

  window.addEventListener('resize', function () {
    resize();
    scheduleDraw();
  });

  // --- Motion vocabulary: ink draw-on for article figures ---
  // Figures fade + rise when scrolled into view. Fires once per figure.
  if ('IntersectionObserver' in window) {
    var figObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('topo-visible');
          figObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    // Mark figures for animation, then observe
    document.querySelectorAll('.article-figure').forEach(function (fig) {
      fig.classList.add('topo-fade');
      figObs.observe(fig);
    });
  }

})();
