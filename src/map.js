/* Map view: camera, drawing, marker hit-testing, chrome and input. */
(function (global) {
  "use strict";

  const B = global.SeedMapBiomes;
  const U = global.SeedMapUtil;
  const I = global.SeedMapIcons;
  const TERRAIN = global.SeedMapTerrain;
  const GRID = global.SeedMapGrid;
  const MEASURE = global.SeedMapMeasure;
  const clamp = U.clamp;
  const el = U.el;
  const formatInt = U.formatInt;
  const FONT_SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  const MIN_SCALE = 0.22;
  const MAX_SCALE = 8;
  const PREVIEW_CELLS = 16;
  const TILE_CELLS = 64;

  const state = {
    shown: false,
    cam: { x: 0, z: 0, s: 0.55 },
    target: { x: 0, z: 0, s: 0.55 },
    dragging: false,
    dragId: null,
    dragLast: null,
    pointers: new Map(),
    pinch: null,
    pointer: { x: 0, y: 0, active: false },
    hoverMarker: null,
    dirty: true,
    lastReadout: 0,
    lastCoords: "",
    dpr: 1,
    vw: 0,
    vh: 0,
    hintTimer: 0,
    hintCount: 0,
    press: null,
    suppressClick: false,
  };

  const screenMarkers = [];

  let canvas = null;
  let ctx = null;
  let rootEl = null;
  let seedOutEl = null;
  let coordsEl = null;
  let biomeNameEl = null;
  let bioSepEl = null;
  let bioStructEl = null;
  let loadBarEl = null;
  let loadFillEl = null;
  let scaleNumEl = null;
  let scaleBarEl = null;
  let hintEl = null;
  let keyGridEl = null;
  let biomeGridEl = null;
  let keyToggleBtn = null;
  let keyEl = null;
  let keyCloseBtn = null;
  let onExit = function () {};

  const view = () => ({ cam: state.cam, vw: state.vw, vh: state.vh });

  /* -------------------------------------------------------------- chrome */

  function setKeyOpen(open) {
    keyEl.classList.toggle("is-open", !!open);
    keyToggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function buildKey() {
    for (const type of I.ORDER) {
      const item = el("div", "key-item");
      const icon = el("span", "key-icon");
      icon.appendChild(I.node(type, 24));
      item.appendChild(icon);
      item.appendChild(el("span", null, I.LABELS[type]));
      keyGridEl.appendChild(item);
    }
    for (const [name, ids] of B.GROUPS) {
      const colours = ids ? ids.map((id) => B.BIOMES[id][1]) : [B.FALLBACK[1]];
      const item = el("span", "biome-key");
      const swatches = el("span", "biome-swatches");
      for (const colour of colours) {
        const sw = el("i");
        sw.style.background = colour;
        swatches.appendChild(sw);
      }
      item.appendChild(swatches);
      item.appendChild(el("span", "biome-name", name));
      biomeGridEl.appendChild(item);
    }
  }

  function showHint(ms) {
    clearTimeout(state.hintTimer);
    hintEl.classList.remove("show");
    setTimeout(() => {
      if (!state.shown) return;
      hintEl.classList.add("show");
      state.hintTimer = setTimeout(() => hintEl.classList.remove("show"), ms);
    }, 600);
  }

  /* ------------------------------------------------------------- lifecycle */

  function show(world, seedText) {
    state.shown = true;
    seedOutEl.textContent = seedText;
    loadBarEl.classList.remove("is-done");
    loadFillEl.style.transform = "scaleX(0)";
    MEASURE.reset();
    setKeyOpen(false);
    state.pointers.clear();
    state.pinch = null;
    state.dragging = false;
    state.pointer.active = false;
    state.hoverMarker = null;
    state.lastCoords = "";
    state.lastReadout = 0;
    setCameraDirect(0, 0, clamp(state.vw / 2600, 0.42, 1.05));
    resize();
    TERRAIN.setWorld(world);
    state.dirty = true;
    state.hintCount++;
    showHint(state.hintCount > 1 ? 2800 : 5200);
  }

  function hide() {
    state.shown = false;
    TERRAIN.stop();
    state.pointers.clear();
    state.pinch = null;
    state.dragging = false;
    state.pointer.active = false;
    state.hoverMarker = null;
    MEASURE.reset();
    setKeyOpen(false);
    rootEl.classList.remove("dragging");
  }

  /* --------------------------------------------------------------- camera */

  function screenToWorld(sx, sy) {
    return {
      x: state.cam.x + (sx - state.vw / 2) / state.cam.s,
      z: state.cam.z + (sy - state.vh / 2) / state.cam.s,
    };
  }

  function worldToScreen(x, z) {
    return {
      x: state.vw / 2 + (x - state.cam.x) * state.cam.s,
      y: state.vh / 2 + (z - state.cam.z) * state.cam.s,
    };
  }

  function clampCamera(cam) {
    const lim = 29999900;
    cam.x = clamp(cam.x, -lim, lim);
    cam.z = clamp(cam.z, -lim, lim);
    cam.s = clamp(cam.s, MIN_SCALE, MAX_SCALE);
  }

  function setCameraDirect(x, z, s) {
    state.cam = { x, z, s: clamp(s, MIN_SCALE, MAX_SCALE) };
    state.target = { x, z, s: state.cam.s };
    clampCamera(state.cam);
    state.dirty = true;
  }

  function zoomAt(sx, sy, factor) {
    const t = state.target;
    const s2 = clamp(t.s * factor, MIN_SCALE, MAX_SCALE);
    if (s2 === t.s) return;
    const before = { x: t.x + (sx - state.vw / 2) / t.s, z: t.z + (sy - state.vh / 2) / t.s };
    t.s = s2;
    const after = { x: t.x + (sx - state.vw / 2) / t.s, z: t.z + (sy - state.vh / 2) / t.s };
    t.x += before.x - after.x;
    t.z += before.z - after.z;
    clampCamera(t);
    state.dirty = true;
  }

  function panBy(dxScreen, dyScreen) {
    state.cam.z -= dyScreen / state.cam.s;
    state.cam.x -= dxScreen / state.cam.s;
    state.target.x = state.cam.x;
    state.target.z = state.cam.z;
    clampCamera(state.cam);
    clampCamera(state.target);
    state.dirty = true;
  }

  function animateCamera(dt) {
    const c = state.cam;
    const t = state.target;
    if (state.dragging || state.pinch) return false;
    const k = 1 - Math.exp(-Math.max(1, dt) / 90);
    let moving = false;
    const ds = t.s - c.s;
    if (Math.abs(ds) > 1e-5) {
      c.s += ds * k;
      moving = true;
    } else if (c.s !== t.s) {
      c.s = t.s;
      moving = true;
    }
    const dx = t.x - c.x;
    const dz = t.z - c.z;
    if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
      c.x += dx * k;
      c.z += dz * k;
      moving = true;
    } else if (c.x !== t.x || c.z !== t.z) {
      c.x = t.x;
      c.z = t.z;
      moving = true;
    }
    clampCamera(c);
    if (moving) state.dirty = true;
    return moving;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.min(2, window.devicePixelRatio || 1);
    state.vw = Math.max(1, rect.width);
    state.vh = Math.max(1, rect.height);
    canvas.width = Math.max(1, Math.round(state.vw * state.dpr));
    canvas.height = Math.max(1, Math.round(state.vh * state.dpr));
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    state.dirty = true;
  }

  /* --------------------------------------------------------------- drawing */

  function drawCachedTiles() {
    ctx.imageSmoothingEnabled = false;
    const step = TERRAIN.step();
    if (step * state.cam.s < 0.5) return;
    for (const t of TERRAIN.visibleTiles) {
      if (t.step !== step) continue;
      const a = worldToScreen(t.tx * t.blocks, t.tz * t.blocks);
      const size = t.blocks * state.cam.s;
      if (a.x + size < -1 || a.y + size < -1 || a.x > state.vw + 1 || a.y > state.vh + 1) continue;
      t.used = performance.now();
      if (t.prow > 0) {
        ctx.drawImage(
          t.pcanvas,
          0, 0, PREVIEW_CELLS, t.prow,
          a.x, a.y, size + 0.7, size * (t.prow / PREVIEW_CELLS) + 0.7
        );
      }
      if (t.row > 0) {
        ctx.drawImage(
          t.canvas,
          0, 0, TILE_CELLS, t.row,
          a.x, a.y, size + 0.7, size * (t.row / TILE_CELLS) + 0.7
        );
      }
    }
    ctx.imageSmoothingEnabled = true;
  }

  // Sprites shrink at wide zoom so the marker field leaves the terrain
  // readable, and grow back as soon as a shape needs to be told apart.
  function markerSize() {
    const s = state.cam.s;
    if (s <= 0.3) return 18;
    if (s >= 0.75) return 24;
    return Math.round(18 + ((s - 0.3) / 0.45) * 6);
  }

  const MARKER_LAYER = {
    mineshaft: 0, treasure: 0, ruin: 1, shipwreck: 1, trial: 1, portal: 1,
    trail: 1, igloo: 2, temple: 2, hut: 2, pyramid: 2, monument: 3,
    outpost: 3, village: 3, mansion: 3, ancient: 3, stronghold: 4,
  };

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function projectMarkers() {
    screenMarkers.length = 0;
    const pad = 40;
    const { band, rail } = GRID.metrics();
    const edge = markerSize() / 2;
    const fieldRight = state.vw - rail;
    for (const st of TERRAIN.known) {
      const p = worldToScreen(st.x, st.z);
      if (p.x < -pad || p.x > state.vw + pad || p.y < -pad || p.y > state.vh + pad) continue;
      if (p.x + edge > fieldRight || p.y - edge < band) continue;
      screenMarkers.push({ type: st.type, x: p.x, y: p.y, wx: st.x, wz: st.z, r: edge });
    }
  }

  function updateHoverMarker() {
    if (!state.pointer.active || state.dragging) {
      state.hoverMarker = null;
      return;
    }
    let best = null;
    let bestD = Infinity;
    for (const m of screenMarkers) {
      const dx = m.x - state.pointer.x;
      const dy = m.y - state.pointer.y;
      const d = dx * dx + dy * dy;
      const lim = (m.r + 5) * (m.r + 5);
      if (d < lim && d < bestD) { bestD = d; best = m; }
    }
    state.hoverMarker = best;
  }

  // Draw the rarest layer last so dense families cannot mask the icons that
  // are hard to find. Every on-screen marker is drawn at every zoom level.
  function drawMarkers() {
    if (!screenMarkers.length) return;
    const size = markerSize();
    const ordered = screenMarkers.slice().sort((a, b) =>
      (MARKER_LAYER[a.type] || 0) - (MARKER_LAYER[b.type] || 0) || a.y - b.y
    );
    ctx.imageSmoothingEnabled = false;
    for (const m of ordered) {
      ctx.drawImage(I.canvas(m.type), Math.round(m.x - size / 2), Math.round(m.y - size / 2), size, size);
    }
    ctx.imageSmoothingEnabled = true;
  }

  function drawHoverTooltip() {
    const m = state.hoverMarker;
    const name = I.LABELS[m.type] || m.type;
    const coords = formatInt(m.wx) + ", " + formatInt(m.wz);
    const mx = m.x;
    const my = m.y;
    ctx.font = "600 11.5px " + FONT_SANS;
    const nw = ctx.measureText(name).width;
    ctx.font = "500 9.5px " + FONT_MONO;
    const cw = ctx.measureText(coords).width;
    const w = Math.max(nw, cw) + 47;
    const h = 44;
    let x = mx - w / 2;
    let y = my - m.r - h - 11;
    let below = false;
    if (y < 8) { y = my + m.r + 11; below = true; }
    x = clamp(x, 8, Math.max(8, state.vw - w - 8));
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    roundRect(x, y, w, h, 3);
    ctx.fillStyle = "#1b1c17";
    ctx.fill();
    ctx.restore();
    roundRect(x, y, w, h, 3);
    ctx.strokeStyle = "rgba(178, 163, 137, 0.32)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.textBaseline = "alphabetic";
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(I.canvas(m.type), x + 7, y + 9, 24, 24);
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = "#f1e9d8";
    ctx.font = "600 12px " + FONT_SANS;
    ctx.fillText(name, x + 34, y + 19);
    ctx.fillStyle = "#b9ab93";
    ctx.font = "500 10.5px " + FONT_MONO;
    ctx.fillText(coords, x + 34, y + 33);
    const tipY = below ? y : y + h;
    ctx.beginPath();
    ctx.moveTo(mx - 5, tipY);
    ctx.lineTo(mx + 5, tipY);
    ctx.lineTo(mx, below ? y - 5 : y + h + 5);
    ctx.closePath();
    ctx.fillStyle = "#1b1c17";
    ctx.fill();
    ctx.strokeStyle = "rgba(178, 163, 137, 0.32)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  function draw() {
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.fillStyle = "#10262e";
    ctx.fillRect(0, 0, state.vw, state.vh);
    drawCachedTiles();
    GRID.drawGraticule();
    projectMarkers();
    updateHoverMarker();
    MEASURE.draw();
    drawMarkers();
    GRID.drawLabels();
    if (state.hoverMarker) drawHoverTooltip();
  }

  /* -------------------------------------------------------------- readout */

  function updateReadout(now) {
    if (now - state.lastReadout < 70) return;
    state.lastReadout = now;

    let sx = state.vw / 2;
    let sy = state.vh / 2;
    if (state.pointer.active) { sx = state.pointer.x; sy = state.pointer.y; }
    const w = screenToWorld(sx, sy);
    const x = Math.round(w.x);
    const z = Math.round(w.z);
    const coordText = formatInt(x) + ", " + formatInt(z);
    if (coordText !== state.lastCoords) {
      state.lastCoords = coordText;
      coordsEl.textContent = coordText;
    }

    const name = B.name(TERRAIN.world().biomeAtBlock(x, z));
    if (biomeNameEl.textContent !== name) biomeNameEl.textContent = name;
    const hover = state.hoverMarker;
    if (hover) {
      bioSepEl.hidden = false;
      bioStructEl.hidden = false;
      const label = I.LABELS[hover.type] || hover.type;
      if (bioStructEl.textContent !== label) bioStructEl.textContent = label;
    } else {
      bioSepEl.hidden = true;
      bioStructEl.hidden = true;
    }
  }

  function updateScale() {
    const target = 110 / state.cam.s;
    const p = Math.pow(10, Math.floor(Math.log10(target)));
    let mult = 1;
    for (const m of [5, 2, 1]) {
      if (m * p <= target) { mult = m; break; }
    }
    const n = Math.max(1, mult * p);
    scaleBarEl.style.width = (n * state.cam.s).toFixed(1) + "px";
    const label = n.toLocaleString("en-US") + " blocks";
    if (scaleNumEl.textContent !== label) scaleNumEl.textContent = label;
  }

  /* ---------------------------------------------------------------- input */

  function onWheel(e) {
    if (!state.shown) return;
    // Let the key and the route card scroll under the wheel instead of
    // zooming the map behind them.
    if (e.target.closest && e.target.closest(".key, .measure, .map-bar")) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const unit = e.deltaMode === 1 ? 0.04 : e.deltaMode === 2 ? 0.4 : 1;
    const sensitivity = e.ctrlKey ? 0.0055 : 0.0022;
    const factor = clamp(Math.exp(-e.deltaY * unit * sensitivity), 0.45, 2.4);
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
  }

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function beginPinch() {
    const pts = Array.from(state.pointers.values());
    if (pts.length < 2) return;
    const a = pts[0], b = pts[1];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    state.pinch = {
      d0: d,
      s0: state.cam.s,
      mid,
      world: screenToWorld(mid.x, mid.y),
    };
    state.target = { x: state.cam.x, z: state.cam.z, s: state.cam.s };
    state.dirty = true;
  }

  function onPointerDown(e) {
    if (!state.shown) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const p = pointerPos(e);
    state.pointers.set(e.pointerId, p);
    canvas.setPointerCapture(e.pointerId);
    if (state.pointers.size === 1) {
      state.press = { x: p.x, y: p.y };
      state.suppressClick = false;
      state.dragging = true;
      state.dragId = e.pointerId;
      state.dragLast = p;
      rootEl.classList.add("dragging");
      state.pointer.active = false;
      state.dirty = true;
    } else if (state.pointers.size === 2) {
      state.dragging = false;
      state.dragId = null;
      rootEl.classList.remove("dragging");
      beginPinch();
    }
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!state.shown) return;
    const p = pointerPos(e);
    if (state.pointers.has(e.pointerId)) state.pointers.set(e.pointerId, p);
    if (state.pointers.size >= 2 && state.pinch) {
      const pts = Array.from(state.pointers.values());
      const a = pts[0], b = pts[1];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const s = clamp(state.pinch.s0 * (d / state.pinch.d0), MIN_SCALE, MAX_SCALE);
      state.cam.s = s;
      state.cam.z = state.pinch.world.z - (state.pinch.mid.y - state.vh / 2) / s;
      state.cam.x = state.pinch.world.x - (state.pinch.mid.x - state.vw / 2) / s;
      // Carry the map with the midpoint motion.
      state.cam.x += (state.pinch.mid.x - mid.x) / s;
      state.cam.z += (state.pinch.mid.y - mid.y) / s;
      clampCamera(state.cam);
      state.target = { x: state.cam.x, z: state.cam.z, s };
      state.dirty = true;
      return;
    }
    if (state.dragging && state.dragId === e.pointerId && state.dragLast) {
      const dx = p.x - state.dragLast.x;
      const dy = p.y - state.dragLast.y;
      if (state.press && Math.hypot(p.x - state.press.x, p.y - state.press.y) > 4) {
        state.suppressClick = true;
      }
      if (dx || dy) panBy(dx, dy);
      state.dragLast = p;
      return;
    }
    if (e.pointerType !== "touch") {
      state.pointer.x = p.x;
      state.pointer.y = p.y;
      state.pointer.active = true;
      const prev = state.hoverMarker;
      updateHoverMarker();
      if (state.hoverMarker !== prev) state.dirty = true;
    }
  }

  function onPointerUp(e) {
    // Window-level pointerup also fires for clicks on the map chrome; only a
    // gesture that began on the canvas may update the map pointer.
    if (!state.shown || !state.pointers.has(e.pointerId)) return;
    state.pointers.delete(e.pointerId);
    if (state.pointers.size === 0) {
      state.dragging = false;
      state.dragId = null;
      state.dragLast = null;
      state.pinch = null;
      rootEl.classList.remove("dragging");
      if (e.pointerType !== "touch") {
        const p = pointerPos(e);
        state.pointer.x = p.x; state.pointer.y = p.y; state.pointer.active = true;
        updateHoverMarker();
      }
    } else if (state.pointers.size === 1) {
      const rest = Array.from(state.pointers.values())[0];
      state.pinch = null;
      state.dragging = true;
      state.dragId = Array.from(state.pointers.keys())[0];
      state.dragLast = rest;
      rootEl.classList.add("dragging");
    }
    if (state.press) {
      if (state.suppressClick) setTimeout(() => { state.suppressClick = false; }, 0);
      state.press = null;
    }
    state.dirty = true;
  }

  function onCanvasClick(e) {
    if (!state.shown || !MEASURE.isActive()) return;
    if (state.suppressClick) {
      state.suppressClick = false;
      return;
    }
    const p = pointerPos(e);
    const w = screenToWorld(p.x, p.y);
    MEASURE.addPoint(w.x, w.z);
  }

  function onPointerLeave() {
    state.pointer.active = false;
    state.hoverMarker = null;
    state.dirty = true;
  }

  // A mouse released outside the window would otherwise leave a phantom
  // pointer behind, turning the next drag into a pinch. Clean up globally.
  function cancelGestures() {
    state.pointers.clear();
    state.dragging = false;
    state.dragId = null;
    state.dragLast = null;
    state.pinch = null;
    state.press = null;
    if (rootEl) rootEl.classList.remove("dragging");
    state.dirty = true;
  }

  function onDoubleClick(e) {
    if (!state.shown || MEASURE.isActive()) return;
    const p = pointerPos(e);
    zoomAt(p.x, p.y, 1.9);
    e.preventDefault();
  }

  // Returns false for Escape when the map does not consume it, so the shell
  // can leave the map.
  function keydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (MEASURE.isActive()) {
        MEASURE.setActive(false);
        return true;
      }
      return false;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return true;
    if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      MEASURE.toggle();
    } else if ((e.key === "Backspace" || e.key === "Delete") && MEASURE.points().length) {
      e.preventDefault();
      MEASURE.removeLast();
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomAt(state.vw / 2, state.vh / 2, 1.35);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomAt(state.vw / 2, state.vh / 2, 1 / 1.35);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault(); panBy(state.vw * 0.18, 0);
    } else if (e.key === "ArrowRight") {
      e.preventDefault(); panBy(-state.vw * 0.18, 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault(); panBy(0, state.vh * 0.18);
    } else if (e.key === "ArrowDown") {
      e.preventDefault(); panBy(0, -state.vh * 0.18);
    } else if (e.key === "Home") {
      e.preventDefault();
      state.target = { x: 0, z: 0, s: state.target.s };
    }
    return true;
  }

  /* ---------------------------------------------------------------- frame */

  let lastFrame = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = lastFrame ? now - lastFrame : 16;
    lastFrame = now;
    if (!state.shown) return;

    let busy = animateCamera(dt);
    if (TERRAIN.update(now)) busy = true;
    updateLoadBar();
    updateReadout(now);
    updateScale();

    if (state.dirty || busy) {
      draw();
      state.dirty = false;
    }
  }

  function updateLoadBar() {
    const { total, ready } = TERRAIN.progress();
    if (!total) {
      loadBarEl.classList.add("is-done");
      return;
    }
    const p = ready / total;
    loadFillEl.style.transform = "scaleX(" + p.toFixed(4) + ")";
    loadBarEl.classList.toggle("is-done", p >= 0.999);
  }

  /* ----------------------------------------------------------------- init */

  function init(opts) {
    onExit = (opts && opts.onExit) || function () {};
    rootEl = document.getElementById("root");
    canvas = document.getElementById("mapCanvas");
    ctx = canvas.getContext("2d", { alpha: false });
    seedOutEl = document.getElementById("seedOut");
    coordsEl = document.getElementById("coords");
    biomeNameEl = document.getElementById("biomeName");
    bioSepEl = document.getElementById("bioSep");
    bioStructEl = document.getElementById("bioStruct");
    loadBarEl = document.getElementById("loadBar");
    loadFillEl = document.getElementById("loadBarFill");
    scaleNumEl = document.getElementById("scaleNum");
    scaleBarEl = document.getElementById("scaleBar");
    hintEl = document.getElementById("hint");
    keyGridEl = document.getElementById("keyGrid");
    biomeGridEl = document.getElementById("biomeGrid");
    keyToggleBtn = document.getElementById("keyToggle");
    keyEl = document.getElementById("key");
    keyCloseBtn = document.getElementById("keyClose");

    TERRAIN.init({ view, onChange: () => { state.dirty = true; } });
    GRID.init({ ctx, root: rootEl, view });
    MEASURE.init({ ctx, view, root: rootEl, onChange: () => { state.dirty = true; } });

    buildKey();
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("wheel", onWheel, { passive: false });

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("blur", cancelGestures);
    canvas.addEventListener("dblclick", onDoubleClick);
    canvas.addEventListener("click", onCanvasClick);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    document.getElementById("mapHome").addEventListener("click", () => onExit());
    keyToggleBtn.addEventListener("click", () => setKeyOpen(!keyEl.classList.contains("is-open")));
    keyCloseBtn.addEventListener("click", () => setKeyOpen(false));

    requestAnimationFrame(frame);
  }

  global.SeedMapMap = {
    init,
    show,
    hide,
    keydown,
    isMeasuring: () => MEASURE.isActive(),
    setMeasuring: MEASURE.setActive,
    clearMeasure: MEASURE.clear,
    addPoint: MEASURE.addPoint,
    distance: () => MEASURE.distance(),
    points: () => MEASURE.points(),
    markers: () => screenMarkers.map((m) => ({ x: Math.round(m.x), y: Math.round(m.y), type: m.type })),
    scale: () => state.cam.s,
    center: () => ({ x: state.cam.x, z: state.cam.z }),
    zoom: (factor) => zoomAt(state.vw / 2, state.vh / 2, factor),
    pan: (dx, dz) => {
      state.cam.x += dx; state.cam.z += dz;
      state.target.x = state.cam.x; state.target.z = state.cam.z;
      state.dirty = true;
    },
    screenToWorld,
    biomeAt: (x, z) => TERRAIN.world() ? B.name(TERRAIN.world().biomeAtBlock(x, z)) : null,
    keyOpen: () => keyEl.classList.contains("is-open"),
    stats: TERRAIN.stats,
    gridStep: GRID.step,
    markerSize,
  };
})(typeof window !== "undefined" ? window : globalThis);
