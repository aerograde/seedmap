/* Measure tool: route points, the route card and the drawn route. */
(function (global) {
  "use strict";

  const U = global.SeedMapUtil;
  const formatInt = U.formatInt;
  const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const TAU = Math.PI * 2;

  const state = { active: false, points: [] };

  let ctx = null;
  let view = null;
  let rootEl = null;
  let onChange = function () {};
  let panelEl = null;
  let btnEl = null;
  let clearEl = null;
  let countEl = null;
  let totalEl = null;
  let timeEl = null;
  let routeEl = null;

  function screen(p) {
    const v = view();
    return {
      x: v.vw / 2 + (p.x - v.cam.x) * v.cam.s,
      y: v.vh / 2 + (p.z - v.cam.z) * v.cam.s,
    };
  }

  function formatDuration(seconds) {
    const s = Math.max(1, Math.round(seconds));
    if (s < 60) return s + "s";
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m < 60) return r ? m + "m " + r + "s" : m + "m";
    const h = Math.floor(m / 60);
    return (m % 60) ? h + "h " + (m % 60) + "m" : h + "h";
  }

  function stats() {
    const pts = state.points;
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    }
    return { total };
  }

  function updateUI() {
    const pts = state.points;
    panelEl.hidden = !state.active && pts.length === 0;
    clearEl.hidden = pts.length === 0;
    btnEl.classList.toggle("is-on", state.active);
    btnEl.setAttribute("aria-pressed", state.active ? "true" : "false");
    rootEl.classList.toggle("measuring", state.active);
    if (!pts.length) {
      countEl.textContent = "0 points";
      totalEl.textContent = "—";
      timeEl.textContent = "Click the map to place a point";
      routeEl.textContent = "2 or more points show a route";
      return;
    }
    if (pts.length === 1) {
      countEl.textContent = "1 point";
      totalEl.textContent = "—";
      timeEl.textContent = "Place a second point to measure";
      routeEl.textContent = formatInt(pts[0].x) + ", " + formatInt(pts[0].z);
      return;
    }
    const d = stats().total;
    countEl.textContent = pts.length + " points";
    totalEl.textContent = formatInt(d);
    timeEl.textContent = "≈ " + formatDuration(d / 4.317) + " walk · " +
      formatDuration(d / 5.612) + " sprint";
    routeEl.textContent = (pts.length - 1) + (pts.length === 2 ? " leg" : " legs") +
      " · straight-line";
  }

  function changed() {
    updateUI();
    onChange();
  }

  function setActive(active) {
    state.active = !!active;
    changed();
  }

  function clear() {
    state.points.length = 0;
    changed();
  }

  function addPoint(x, z) {
    if (!state.active) return;
    state.points.push({ x: Math.round(x), z: Math.round(z) });
    changed();
  }

  function removeLast() {
    if (!state.points.length) return;
    state.points.pop();
    changed();
  }

  function reset() {
    state.active = false;
    state.points.length = 0;
    updateUI();
  }

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

  function draw() {
    const pts = state.points;
    if (!pts.length) return;
    const screens = pts.map(screen);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // A dark casing keeps the route readable over pale beaches and snow.
    ctx.strokeStyle = "rgba(22, 17, 10, 0.55)";
    ctx.lineWidth = 4;
    for (let i = 1; i < pts.length; i++) {
      ctx.beginPath();
      ctx.moveTo(screens[i - 1].x, screens[i - 1].y);
      ctx.lineTo(screens[i].x, screens[i].y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(240, 205, 142, 0.98)";
    ctx.lineWidth = 1.7;
    ctx.setLineDash([6, 5]);
    for (let i = 1; i < pts.length; i++) {
      ctx.beginPath();
      ctx.moveTo(screens[i - 1].x, screens[i - 1].y);
      ctx.lineTo(screens[i].x, screens[i].y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.font = "600 9px " + FONT_MONO;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      const mid = { x: (screens[i].x + screens[i - 1].x) / 2, y: (screens[i].y + screens[i - 1].y) / 2 };
      const label = formatInt(d) + " blocks";
      const w = ctx.measureText(label).width + 12;
      roundRect(mid.x - w / 2, mid.y - 9, w, 16, 3);
      ctx.fillStyle = "#f1e6ce";
      ctx.fill();
      ctx.strokeStyle = "#241c13";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#241c13";
      ctx.fillText(label, mid.x, mid.y);
    }

    for (let i = 0; i < screens.length; i++) {
      const p = screens[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, TAU);
      ctx.fillStyle = i === 0 ? "#e08a3c" : "#f1e6ce";
      ctx.fill();
      ctx.strokeStyle = "#241c13";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.font = "600 9px " + FONT_MONO;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#241c13";
      ctx.fillText(String(i + 1), p.x, p.y + 0.3);
    }
    ctx.restore();
  }

  function init(opts) {
    ctx = opts.ctx;
    view = opts.view;
    rootEl = opts.root;
    onChange = opts.onChange || function () {};
    panelEl = document.getElementById("measurePanel");
    btnEl = document.getElementById("measureBtn");
    clearEl = document.getElementById("measureClear");
    countEl = document.getElementById("measureCount");
    totalEl = document.getElementById("measureTotal");
    timeEl = document.getElementById("measureTime");
    routeEl = document.getElementById("measureRoute");
    btnEl.addEventListener("click", () => setActive(!state.active));
    clearEl.addEventListener("click", clear);
    updateUI();
  }

  global.SeedMapMeasure = {
    init,
    draw,
    setActive,
    toggle: () => setActive(!state.active),
    clear,
    addPoint,
    removeLast,
    reset,
    isActive: () => state.active,
    points: () => state.points.map((p) => ({ x: p.x, z: p.z })),
    distance: () => stats().total,
  };
})(typeof window !== "undefined" ? window : globalThis);
