/* Coordinate grid: labelled X/Z ticks on a reserved rail, zero-axis emphasis,
 * and a sliding Z=right label that moves along the line when the right rail is
 * blocked by chrome. No new product capability; the map, measure tool, key,
 * seed entry and diorama (if any) keep behaving exactly as they do.
 */
(function (global) {
  "use strict";

  const U = global.SeedMapUtil;
  const clamp = U.clamp;
  const formatInt = U.formatInt;
  const SVGNS = U.SVGNS;

  let ctx = null;
  let rootEl = null;
  let view = null;
  let markers = null;

  /* --------------------------------------------------------------- helpers */

  function viewRect() {
    const vw = Math.max(1, ctx.canvas.width);
    const vh = Math.max(1, ctx.canvas.height);
    return { vw, vh, cx: ctx.canvas.clientWidth || vw, cy: ctx.canvas.clientHeight || vh };
  }

  function metrics() {
    // Keep the same signature the rest of the app already reads.
    const r = viewRect();
    const pad = 11;
    const band = pad;
    const rulerW = Math.max(36, Math.min(64, r.vw * 0.055));
    const rail = Math.max(38, Math.min(74, r.vw * 0.062));
    return { vw: r.vw, vh: r.vh, pad, band, rulerW, rail };
  }

  function screen(x, z) {
    const m = metrics();
    const v = view();
    const px = v.origin.x + x * v.cam.s;
    const pz = v.origin.z + z * v.cam.s;
    return { x: m.rulerW + px, y: m.band + pz };
  }

  function blockX(z) {
    // World x that sits exactly on the drawn Z line.
    const v = view();
    return Math.round(-v.origin.x / v.cam.s);
  }

  function step() {
    const m = metrics();
    const v = view();
    const span = Math.max(0.5, Math.max(m.vw - m.rulerW - m.rail, m.vh - 2 * m.band) / v.cam.s);
    // ---- visible block span --> label step ----
    // Same scale-adaptive interval that the earlier grid pass chose; the values
    // below are what the user asked to keep behaving as they do.
    return Math.max(1, Math.round(span / (v.cam.s >= 2 ? 200 : 100)));
  }

  /* --------------------------------------------------------------- drawing */

  function drawGraticule(zStart, zEnd, xStart, xEnd) {
    const v = view();
    const m = metrics();
    const s = v.cam.s;

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();

    // Vertical gridlines (X bands) — skip across the ruler and rail.
    const xMin = Math.floor(xStart);
    const xMax = Math.ceil(xEnd);
    for (let x = xMin; x <= xMax; x++) {
      if (x % step() !== 0) continue;
      const sx = m.rulerW + (x - v.origin.x / v.cam.s) * s;
      if (sx < m.rulerW - 0.5 || sx > m.vw - m.rail + 0.5) continue;
      ctx.moveTo(sx + 0.5, m.band);
      ctx.lineTo(sx + 0.5, m.vh - m.band);
    }

    // Horizontal gridlines (Z bands) — skip across the ruler band.
    const zMin = Math.floor(zStart);
    const zMax = Math.ceil(zEnd);
    for (let z = zMin; z <= zMax; z++) {
      if (z % step() !== 0) continue;
      const sz = m.band + (z - v.origin.z / v.cam.s) * s;
      if (sz < m.band - 0.5 || sz > m.vh - m.band + 0.5) continue;
      ctx.moveTo(m.rulerW, sz + 0.5);
      ctx.lineTo(m.vw - m.rail, sz + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawLabels(zStart, zEnd, xStart, xEnd) {
    const v = view();
    const m = metrics();
    const s = v.cam.s;

    ctx.save();
    ctx.textBaseline = "middle";
    ctx.font = "600 " + Math.round(Math.max(10, Math.min(13, s * 0.55))) + "px -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Arial, sans-serif";

    // ---- X labels: top rail, centered on each line, no plate ----
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    const xMin = Math.floor(xStart);
    const xMax = Math.ceil(xEnd);
    for (let x = xMin; x <= xMax; x++) {
      if (x % step() !== 0) continue;
      const sx = m.rulerW + (x - v.origin.x / v.cam.s) * s;
      if (sx < m.rulerW - 0.5 || sx > m.vw - m.rail + 0.5) continue;
      const tx = sx;
      const ty = m.band - 4;
      const tw = ctx.measureText(formatInt(x)).width + 12;
      const boxLeft = tx - tw / 2;
      roundRectFill(ctx, boxLeft, ty - 8, tw, 16, 3, "rgba(255,255,255,0.10)");
      ctx.fillText(formatInt(x), tx, ty);
    }

    // ---- Z labels: right rail, each on its own line; zero slides ----
    const zMin = Math.floor(zStart);
    const zMax = Math.ceil(zEnd);
    const railLeft = m.vw - m.rail;
    const railW = m.rail - 8;
    const outerHalf = 9;

    // Visible Z labels first.
    const visibleZs = [];
    for (let z = zMin; z <= zMax; z++) {
      if (z % step() !== 0) continue;
      const sz = m.band + (z - v.origin.z / v.cam.s) * s;
      if (sz < m.band - 0.5 || sz > m.vh - m.band + 0.5) continue;
      visibleZs.push(z);
    }

    // The zero Z line gets the strongest treatment and may slide along the rail.
    const zeroZ = 0;
    const zeroOn = visibleZs.includes(zeroZ) || (zeroZ >= zMin && zeroZ <= zMax && zeroZ % step() === 0);
    const zeroY = m.band + (zeroZ - v.origin.z / v.cam.s) * s;

    // Find a clear vertical slot on the right rail for the zero label. Other
    // visible Z labels already occupy the rail, so we only need to avoid them
    // plus the top/bottom pad.
    let zeroYFinal = zeroY;
    if (zeroOn && zeroY >= m.band && zeroY <= m.vh - m.band) {
      const railTop = m.band + outerHalf;
      const railBottom = m.vh - m.band - outerHalf;
      if (railTop <= railBottom) {
        const want = Math.round(zeroY);
        const blocked = new Set();
        for (const z of visibleZs) {
          if (z === zeroZ) continue;
          const sz = m.band + (z - v.origin.z / v.cam.s) * s;
          for (let y = Math.round(sz - outerHalf); y <= Math.round(sz + outerHalf); y++) {
            blocked.add(y);
          }
        }
        const clearSlots = [];
        for (let y = Math.ceil(railTop); y <= Math.floor(railBottom); y++) {
          if (!blocked.has(y)) clearSlots.push(y);
        }
        if (clearSlots.length) {
          let best = null, bestDist = Infinity;
          for (const y of clearSlots) {
            const d = Math.abs(y - want);
            if (d < bestDist) { bestDist = d; best = y; }
          }
          if (best != null) zeroYFinal = best;
        }
      }
    }

    // Draw every visible Z label centered on its own line. The zero label uses
    // the (possibly slid) clear slot and a cream plate.
    for (const z of visibleZs) {
      const sz = m.band + (z - v.origin.z / v.cam.s) * s;
      drawZLabel(ctx, m, railLeft, railW, outerHalf, sz, z, z === zeroZ && zeroOn);
    }
    if (zeroOn && zeroYFinal >= m.band && zeroYFinal <= m.vh - m.band) {
      drawZLabel(ctx, m, railLeft, railW, outerHalf, zeroYFinal, zeroZ, true);
    }

    // ---- Zero axis emphasis: stronger line at Z = 0 where it is in view ----
    if (zeroY >= m.band && zeroY <= m.vh - m.band) {
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(m.rulerW, Math.round(zeroY) + 0.5);
      ctx.lineTo(m.vw - m.rail, Math.round(zeroY) + 0.5);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawZLabel(ctx, m, railLeft, railW, outerHalf, centerY, z, isZero) {
    const labelText = formatInt(z);
    const textW = ctx.measureText(labelText).width;
    const textLeft = railLeft + 4 + (railW - textW) / 2;

    ctx.save();
    if (isZero) {
      // Cream contrast plate so the zero label is always legible against the
      // terrain at the line.
      roundRectFill(ctx, railLeft + 4, centerY - outerHalf, railW, outerHalf * 2, 4,
        "rgba(243,238,227,0.92)");
      ctx.fillStyle = "rgba(20,20,20,0.95)";
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.55)";
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(labelText, textLeft + textW / 2, centerY);
    ctx.restore();
  }

  function drawAxisCovers() {
    // No-op in this pass: we do not paint a translucent wash over structure
    // markers. The axis and labels sit in reserved rails outside the live marker
    // field, so nothing needs to be covered.
  }

  function roundRectFill(ctx, x, y, w, h, r, fill) {
    if (w <= 0 || h <= 0) return;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  /* --------------------------------------------------------------- public api */

  global.SeedMapGrid = {
    init(opts) {
      ctx = (opts.ctx && opts.ctx.getContext && opts.ctx.getContext("2d")) || opts.ctx;
      rootEl = opts.root;
      view = opts.view;
      markers = opts.markers || null;
    },
    metrics,
    step,
    drawGraticule,
    drawLabels,
    drawAxisCovers,
  };
})(typeof window !== "undefined" ? window : globalThis);
