/* Application shell: home flow, page transitions and the debug handle. */
(function () {
  "use strict";

  const E = window.SeedMapEngine;
  const MAP = window.SeedMapMap;
  const CALC = window.SeedMapCalc;

  const HOME_TITLE = "Seedmap — offline Minecraft seed atlas";

  const app = {
    mapShown: false,
    world: null,
    seedText: "",
    homeTimer: 0,
  };

  let rootEl = null;
  let homeEl = null;
  let mapUiEl = null;
  let seedForm = null;
  let seedInput = null;
  let enchantBtn = null;

  /* ---------------------------------------------------------- transitions */

  function hideHome() {
    homeEl.classList.add("is-out");
    homeEl.setAttribute("aria-hidden", "true");
    homeEl.setAttribute("inert", "");
    clearTimeout(app.homeTimer);
    app.homeTimer = setTimeout(() => {
      if (homeEl.classList.contains("is-out")) homeEl.hidden = true;
    }, 320);
  }

  function showHome(seedText) {
    clearTimeout(app.homeTimer);
    if (seedText) app.seedText = seedText;
    homeEl.hidden = false;
    homeEl.classList.remove("is-out");
    homeEl.removeAttribute("aria-hidden");
    homeEl.removeAttribute("inert");
    seedInput.disabled = false;
    seedInput.value = app.seedText;
    rootEl.classList.remove("map-mode");
    document.title = HOME_TITLE;
    if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) {
      setTimeout(() => { seedInput.focus(); seedInput.select(); }, 120);
    }
  }

  /* ------------------------------------------------------------ map flow */

  function shakeInput() {
    const line = seedInput.parentElement;
    line.classList.remove("shake");
    void line.offsetWidth;
    line.classList.add("shake");
    seedForm.classList.add("invalid");
    seedInput.focus();
  }

  function startMap(text) {
    if (app.mapShown || CALC.isOpen()) return false;
    const parsed = E.parseSeed(text);
    if (!parsed) { shakeInput(); return false; }
    try {
      app.world = new E.World(parsed.text, parsed.seed);
    } catch (err) {
      console.error("Seed generation failed", err);
      return false;
    }
    app.seedText = parsed.text;
    seedInput.blur();
    seedInput.disabled = true;
    app.mapShown = true;
    hideHome();
    mapUiEl.hidden = false;
    rootEl.classList.add("map-mode");
    document.title = parsed.text + " — seedmap";
    MAP.show(app.world, parsed.text);
    return true;
  }

  function goHome() {
    if (!app.mapShown) return;
    app.mapShown = false;
    MAP.hide();
    mapUiEl.hidden = true;
    showHome();
  }

  function openCalc() {
    if (app.mapShown || CALC.isOpen()) return;
    hideHome();
    CALC.open(seedInput.value);
    document.title = "Enchanting table — seedmap";
  }

  function closeCalc() {
    // Carry the seed the calculator ended on back to the seed box.
    showHome(CALC.worldSeed().trim());
  }

  /* --------------------------------------------------------------- keyboard */

  function onKeyDown(e) {
    if (CALC.isOpen()) {
      CALC.keydown(e);
      return;
    }
    if (!app.mapShown) return;
    if (!MAP.keydown(e)) {
      e.preventDefault();
      goHome();
    }
  }

  /* -------------------------------------------------------------------- init */

  function init() {
    rootEl = document.getElementById("root");
    homeEl = document.getElementById("home");
    mapUiEl = document.getElementById("mapUi");
    seedForm = document.getElementById("seedForm");
    seedInput = document.getElementById("seedInput");
    enchantBtn = document.getElementById("enchantBtn");

    MAP.init({ onExit: goHome });
    CALC.init({ onClose: closeCalc });

    seedForm.addEventListener("submit", (e) => {
      e.preventDefault();
      startMap(seedInput.value);
    });
    seedInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      startMap(seedInput.value);
    });
    seedInput.addEventListener("input", () => seedForm.classList.remove("invalid"));
    enchantBtn.addEventListener("click", openCalc);
    window.addEventListener("keydown", onKeyDown);

    if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) {
      setTimeout(() => {
        if (!CALC.isOpen() && !app.mapShown) seedInput.focus();
      }, 250);
    }

    // A small debug handle keeps automated verification honest without
    // adding UI.
    window.__seedmap = {
      start: (s) => { seedInput.value = s; return startMap(s); },
      home: goHome,
      get seed() { return app.seedText; },
      get mapShown() { return app.mapShown; },
      get scale() { return MAP.scale(); },
      get center() { return MAP.center(); },
      get tiles() { return MAP.stats().tiles; },
      get readyTiles() { return MAP.stats().readyTiles; },
      get structures() { return MAP.stats().structures; },
      get strongholds() { return MAP.stats().strongholds; },
      get pendingStrongholds() { return MAP.stats().pendingStrongholds; },
      get pendingStructures() { return MAP.stats().pendingStructures; },
      get pendingDense() { return MAP.stats().pendingDense; },
      get denseCells() { return MAP.stats().denseCells; },
      get pointers() { return MAP.stats().pointers; },
      get markers() { return MAP.markers(); },
      get points() { return MAP.points(); },
      get distance() { return MAP.distance(); },
      get measureActive() { return MAP.isMeasuring(); },
      get keyOpen() { return MAP.keyOpen(); },
      get gridStep() { return MAP.gridStep(); },
      get markerSize() { return MAP.markerSize(); },
      get enchantOpen() { return CALC.isOpen(); },
      get enchant() {
        return {
          item: CALC.item(),
          material: CALC.material(),
          worldSeed: CALC.worldSeed(),
          playerSeed: CALC.playerSeed(),
          xpSeed: CALC.xpSeed(),
          table: CALC.table(),
          plan: CALC.plan(),
        };
      },
      openEnchant: openCalc,
      closeEnchant: closeCalc,
      measure: (on) => MAP.setMeasuring(on === undefined ? !MAP.isMeasuring() : on),
      clearMeasure: MAP.clearMeasure,
      addPoint: (x, z) => MAP.addPoint(x, z),
      screenToWorld: (x, y) => MAP.screenToWorld(x, y),
      biomeAt: (x, z) => MAP.biomeAt(x, z),
      zoom: (f) => MAP.zoom(f),
      pan: (dx, dz) => MAP.pan(dx, dz),
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
