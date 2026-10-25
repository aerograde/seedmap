/* Enchanting table calculator: owns its markup, state and rendering. */
(function (global) {
  "use strict";

  const E = global.SeedMapEngine;
  const ENCH = global.SeedMapEnchant;
  const U = global.SeedMapUtil;
  const clamp = U.clamp;
  const el = U.el;
  const svg = U.svg;

  const ROMAN = ["", "I", "II", "III", "IV", "V"];

  const MARKUP = [
    '<section class="calc" id="enchant" hidden="hidden" aria-labelledby="enchantTitle" tabindex="-1">',
    '  <header class="calc-top">',
    '    <button class="calc-back" id="enchantBack" type="button" aria-label="Back to seed entry"><span aria-hidden="true">←</span> Seedmap</button>',
    '    <span class="calc-crumb">Enchantment calculator</span>',
    '    <span class="calc-version">Java 1.21.4</span>',
    '  </header>',
    '  <div class="calc-page">',
    '    <header class="calc-intro">',
    '      <p class="calc-kicker">Tool 02</p>',
    '      <h1 id="enchantTitle">Enchanting table</h1>',
    '      <p class="calc-lede">Read the three offers at every bookshelf count, then work out how many items to throw before the roll you want.</p>',
    '    </header>',
    '    <section class="seed-board" aria-label="Seeds">',
    '      <div class="seed-field">',
    '        <label for="calcPlayerSeed">Enchantment seed</label>',
    '        <input id="calcPlayerSeed" type="text" inputmode="text" maxlength="14" spellcheck="false" autocomplete="off" value="000000000000" aria-describedby="calcPlayerNote"/>',
    '        <span class="seed-note" id="calcPlayerNote">Your table state. In game this belongs to you, not the world seed — edit it to match.</span>',
    '      </div>',
    '      <div class="seed-field">',
    '        <label for="calcWorldSeed">World seed</label>',
    '        <input id="calcWorldSeed" type="text" inputmode="text" maxlength="120" spellcheck="false" autocomplete="off" value="0" aria-describedby="calcWorldNote"/>',
    '        <span class="seed-note" id="calcWorldNote">Optional starting point: derives an enchantment seed from the map seed.</span>',
    '      </div>',
    '    </section>',
    '    <section class="calc-block">',
    '      <div class="block-head">',
    '        <h2>Gear</h2>',
    '        <span class="block-note" id="enchantGearMeta">Diamond sword · enchantability 10</span>',
    '      </div>',
    '      <div class="gear-row" id="enchantItems" role="group" aria-label="Choose gear"></div>',
    '      <div class="material-row" id="enchantMaterials" role="group" aria-label="Choose material"></div>',
    '    </section>',
    '    <section class="calc-block">',
    '      <div class="block-head">',
    '        <h2>Slot manipulation</h2>',
    '        <span class="block-note">Throw items, enchant a dummy, then take the slot you want</span>',
    '      </div>',
    '      <div class="plan-grid">',
    '        <div class="plan-controls">',
    '          <label class="level-field" for="calcLevel"><span>Player levels</span>',
    '            <input id="calcLevel" type="number" min="1" max="100" step="1" value="30"/>',
    '          </label>',
    '          <div class="wanted-head">',
    '            <span>Wanted enchantments</span>',
    '            <button id="calcWantedClear" type="button">Clear</button>',
    '          </div>',
    '          <div class="wanted-list" id="calcWanted"></div>',
    '          <button id="calcPlanBtn" class="btn-primary" type="button">Find a roll</button>',
    '          <p class="plan-note" id="calcPlanNote">Pick at least one enchantment and a tier.</p>',
    '        </div>',
    '        <div class="plan-result" id="calcPlanResult" hidden="hidden" aria-live="polite"></div>',
    '      </div>',
    '    </section>',
    '    <section class="calc-block">',
    '      <div class="block-head">',
    '        <h2>Offers at every bookshelf count</h2>',
    '        <span class="block-note">Current table state · level and enchantments</span>',
    '      </div>',
    '      <div class="book-table" id="calcOffers" role="table" aria-label="Offers at every bookshelf count"></div>',
    '    </section>',
    '    <p class="calc-foot">Offers follow the Java 1.21.4 table algorithm. In game the table uses the player\'s enchantment seed, not the world seed; the world seed field here only derives a starting state so one seed opens a full table. Each use takes the next 32 bits as its XP seed, so the three offers change as the seed advances. Throwing four items advances it by four, and enchanting a dummy by one. Treasure enchantments never roll here.</p>',
    '  </div>',
    '</section>',
  ].join("\n");

  // Small line glyphs for the gear picker. They share one 24x24 optical box
  // and a single stroke weight, so the row reads as a set.
  const GEAR_ICONS = {
    sword: ["M21 3v5.5L10.5 19 8 16.5 18.5 6z", "M6.5 14.5 12 20", "M7 17 3 21", "M2.4 20.4 3.6 21.6"],
    pickaxe: ["M3.5 9.5C6.5 4.8 15.5 4.2 20.5 8.5", "M3.5 9.5 2.8 11.4M20.5 8.5 21.2 10.4", "M12 8 8.5 21"],
    axe: ["M13 4c4.5 0 8 3.5 7.5 8.5L13.5 11z", "M13.5 7 7.5 21", "M19.4 6.6 20.5 12.5"],
    shovel: ["M10 3h4v3c2.7 1.4 3.6 4.3 2 6.5L12 16 8 12.5C6.4 10.3 7.3 7.4 10 6z", "M12 16v5"],
    helmet: ["M4.5 13C4.5 7.7 7.6 4.5 12 4.5s7.5 3.2 7.5 8.5v3H15v-3.8H9V16H4.5z", "M9 16h6"],
    chestplate: ["M8.5 4.5 12 3l3.5 1.5L20.5 7l-1.8 5.3-2.7-1V21H8v-9.7l-2.7 1L3.5 7z", "M9 4.5c.7 1.6 5.3 1.6 6 0"],
    leggings: ["M7 3h10l1 18h-4.5L12 10.5 10.5 21H6z", "M7 6.5h10"],
    boots: ["M6 4h4v9l3 3v4H4v-5l2-3z", "M4 19.5h9"],
    bow: ["M8 4c8 2.6 8 13.4 0 16", "M8 4v16", "M4 12h10M11.5 9.5 14 12l-2.5 2.5"],
    crossbow: ["M8 5c-5 2.4-5 11.6 0 14", "M8 5v14M5 12h15", "M13 12v4", "M10 9.5h7M15 8l2.5 1.5L15 11"],
    trident: ["M12 3v18", "M7 4v5c0 2.2 2 3.5 5 3.5s5-1.3 5-3.5V4", "M7 4v2.5M17 4v2.5", "M9.5 21h5"],
    fishing_rod: ["M4 21 18 4", "M18 4c-3.5 5.5 2 7.5-1.5 12.5", "M16.5 16.5c-1.5 1.8-1 3.2.8 3.2 1.5 0 2-1.4 1-2.4", "M8 13.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0"],
  };

  const state = {
    open: false,
    item: "sword",
    material: "diamond",
    level: 30,
    wanted: new Map(),
    playerSeed: null,
    worldSeed: "0",
    plan: null,
  };

  let sectionEl = null;
  let backBtn = null;
  let itemsEl = null;
  let materialsEl = null;
  let gearMetaEl = null;
  let playerSeedEl = null;
  let worldSeedEl = null;
  let offersEl = null;
  let wantedEl = null;
  let levelEl = null;
  let planBtn = null;
  let planNoteEl = null;
  let planResultEl = null;
  let wantedClearBtn = null;
  let onClose = function () {};

  /* ------------------------------------------------------------ formatting */

  function formatXp(value) {
    return (value >>> 0).toString(16).toUpperCase().padStart(8, "0");
  }

  function formatPlayerSeed(seed) {
    return seed.toString(16).toUpperCase().padStart(12, "0").slice(-12);
  }

  function parsePlayerSeed(text) {
    const clean = String(text).trim().replace(/^0x/i, "").replace(/[^0-9a-f]/gi, "");
    if (!clean || clean.length > 12) return null;
    return BigInt("0x" + clean);
  }

  function playerSeedFromWorld(text) {
    const parsed = E.parseSeed(text);
    return parsed ? ENCH.seedFromWorld(parsed.seed) : null;
  }

  function material() {
    const list = ENCH.itemMaterials(state.item);
    return list.find((m) => m.id === state.material) || list[0] || null;
  }

  function gearIcon(type) {
    const node = svg("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" });
    for (const d of GEAR_ICONS[type] || []) node.appendChild(svg("path", { d }));
    return node;
  }

  function stat(label, value) {
    const box = el("div");
    box.appendChild(el("dt", null, label));
    box.appendChild(el("dd", null, value));
    return box;
  }

  /* -------------------------------------------------------------- controls */

  function buildGear() {
    for (const [id, item] of Object.entries(ENCH.ITEMS)) {
      const button = el("button", "gear");
      button.type = "button";
      button.setAttribute("data-item", id);
      button.setAttribute("aria-pressed", "false");
      button.appendChild(gearIcon(id));
      button.appendChild(el("span", null, item.label));
      button.addEventListener("click", () => {
        if (state.item === id) return;
        state.item = id;
        const list = ENCH.itemMaterials(id);
        if (list.length && !list.some((m) => m.id === state.material)) {
          state.material = list[0].id;
        }
        state.plan = null;
        buildMaterials();
        buildWanted();
        renderPlan();
        refresh();
      });
      itemsEl.appendChild(button);
    }
  }

  function buildMaterials() {
    materialsEl.textContent = "";
    const list = ENCH.itemMaterials(state.item);
    materialsEl.hidden = list.length === 0;
    for (const mat of list) {
      const button = el("button", "material");
      button.type = "button";
      button.setAttribute("data-material", mat.id);
      button.setAttribute("aria-pressed", "false");
      const dot = el("i");
      dot.style.setProperty("--mat", mat.color);
      button.appendChild(dot);
      button.appendChild(el("span", null, mat.label));
      button.addEventListener("click", () => {
        if (state.material === mat.id) return;
        state.material = mat.id;
        state.plan = null;
        renderPlan();
        refresh();
      });
      materialsEl.appendChild(button);
    }
  }

  function buildWanted() {
    const pool = ENCH.ITEMS[state.item].pool;
    for (const id of Array.from(state.wanted.keys())) {
      if (!pool.includes(id)) state.wanted.delete(id);
    }
    wantedEl.textContent = "";
    for (const id of pool) {
      const max = ENCH.ENCHANTMENTS[id].tiers.length;
      const row = el("label", "want");
      const box = el("input");
      box.type = "checkbox";
      box.checked = state.wanted.has(id);
      box.setAttribute("data-enchant", id);
      const tier = el("select");
      for (let level = 1; level <= max; level++) {
        const option = el("option", null, ROMAN[level]);
        option.value = String(level);
        tier.appendChild(option);
      }
      tier.value = String(state.wanted.get(id) || 1);
      tier.disabled = !box.checked;
      tier.setAttribute("aria-label", ENCH.ENCHANTMENTS[id].label + " minimum tier");
      box.addEventListener("change", () => {
        if (box.checked) state.wanted.set(id, clamp(Number(tier.value) || 1, 1, max));
        else state.wanted.delete(id);
        tier.disabled = !box.checked;
        state.plan = null;
        renderPlan();
        updateNote();
      });
      tier.addEventListener("change", () => {
        state.wanted.set(id, clamp(Number(tier.value) || 1, 1, max));
        state.plan = null;
        renderPlan();
        updateNote();
      });
      row.appendChild(box);
      row.appendChild(el("span", null, ENCH.ENCHANTMENTS[id].label));
      row.appendChild(tier);
      wantedEl.appendChild(row);
    }
    updateNote();
  }

  function updateNote() {
    const hasSeed = state.playerSeed !== null;
    if (!hasSeed) {
      planNoteEl.textContent = "Enter a full enchantment seed to plan consecutive rolls.";
    } else if (!state.wanted.size) {
      planNoteEl.textContent = "Pick at least one enchantment and a tier.";
    } else {
      planNoteEl.textContent = "Checks 0–512 item throws at every shelf count, with " +
        state.level + " levels available.";
    }
    planBtn.disabled = !hasSeed || !state.wanted.size;
  }

  /* --------------------------------------------------------------- offers */

  function bookCell(offer, plan) {
    const cell = el("div", "book-cell");
    cell.setAttribute("role", "cell");
    cell.appendChild(el("span", "book-slot", offer.name));
    if (!offer.level) {
      cell.classList.add("is-empty");
      cell.appendChild(el("span", "book-level", "—"));
      cell.appendChild(el("span", "book-spells", "slot locked"));
      return cell;
    }
    const level = el("span", "book-level");
    level.appendChild(el("b", null, String(offer.level)));
    level.appendChild(document.createTextNode(offer.level === 1 ? " level" : " levels"));
    cell.appendChild(level);
    cell.appendChild(el("span", "book-spells", offer.spells.length
      ? offer.spells.map((s) => ENCH.spellLabel(s.id, s.level)).join(", ")
      : "no enchantment"));
    if (plan && plan.shelves !== undefined && plan.slot === offer.slot) cell.classList.add("is-plan");
    return cell;
  }

  function renderOffers() {
    offersEl.textContent = "";
    if (state.playerSeed === null) {
      offersEl.appendChild(el("p", "offers-empty",
        "Enter a valid 48-bit enchantment seed to read the offers."));
      return;
    }
    const mat = material();
    const table = ENCH.table(state.playerSeed, state.item, mat ? mat.id : "");
    const head = el("div", "book-head");
    head.setAttribute("role", "row");
    for (const text of ["Shelves", "Top", "Middle", "Bottom"]) {
      const cell = el("span", null, text);
      cell.setAttribute("role", "columnheader");
      head.appendChild(cell);
    }
    offersEl.appendChild(head);
    for (const row of table) {
      const line = el("div", "book-row");
      line.setAttribute("role", "row");
      if (state.plan && state.plan.shelves === row.shelves) line.classList.add("is-plan");
      const shelf = el("div", "book-shelf", String(row.shelves));
      shelf.setAttribute("role", "rowheader");
      shelf.appendChild(el("span", null, row.shelves === 1 ? "shelf" : "shelves"));
      line.appendChild(shelf);
      for (const offer of row.offers) line.appendChild(bookCell(offer, state.plan));
      offersEl.appendChild(line);
    }
  }

  function refresh() {
    if (!state.open) return;
    for (const node of itemsEl.children) {
      const on = node.getAttribute("data-item") === state.item;
      node.classList.toggle("is-on", on);
      node.setAttribute("aria-pressed", on ? "true" : "false");
    }
    for (const node of materialsEl.children) {
      const on = node.getAttribute("data-material") === state.material;
      node.classList.toggle("is-on", on);
      node.setAttribute("aria-pressed", on ? "true" : "false");
    }
    const mat = material();
    const e = ENCH.enchantability(state.item, mat ? mat.id : "");
    const itemName = ENCH.ITEMS[state.item].label;
    gearMetaEl.textContent = (mat ? mat.label + " " : "") +
      (mat ? itemName.toLowerCase() : itemName) + " · enchantability " + e;
    if (document.activeElement !== playerSeedEl) {
      playerSeedEl.value = state.playerSeed === null ? "" : formatPlayerSeed(state.playerSeed);
    }
    if (document.activeElement !== worldSeedEl) worldSeedEl.value = state.worldSeed;
    levelEl.value = String(state.level);
    renderOffers();
    updateNote();
  }

  function planSteps(plan) {
    const mat = material();
    const steps = [];
    if (plan.thrown > 0) {
      steps.push("Throw " + plan.thrown + " item" + (plan.thrown === 1 ? "" : "s") +
        ". Each one advances the enchantment seed by four.");
    }
    if (plan.dummy) {
      steps.push("Enchant one cheap dummy item at any table. It advances the seed by one and costs one level.");
    }
    steps.push("Put the " + (mat ? mat.label.toLowerCase() + " " : "") +
      ENCH.ITEMS[state.item].label.toLowerCase() + " in a table with " + plan.shelves + " bookshelves.");
    steps.push("Take the " + ENCH.SLOT_NAMES[plan.slot] + " offer at level " + plan.offer.level + ".");
    return steps;
  }

  function renderPlan() {
    const plan = state.plan;
    planResultEl.textContent = "";
    if (!plan) {
      planResultEl.hidden = true;
      return;
    }
    planResultEl.hidden = false;
    if (plan.notFound) {
      planResultEl.appendChild(el("h3", null, "No roll found"));
      planResultEl.appendChild(el("p", "plan-empty", plan.notFound));
      return;
    }
    planResultEl.appendChild(el("h3", null,
      plan.thrown === -1 ? "No dummy enchant needed" :
      plan.thrown === 0 ? "Enchant one dummy first" :
      "Throw " + plan.thrown + " item" + (plan.thrown === 1 ? "" : "s") + ", then one dummy"));
    planResultEl.appendChild(el("p", "plan-big", ENCH.SLOT_NAMES[plan.slot] + " · " + plan.shelves + " shelves"));
    planResultEl.appendChild(el("p", "plan-sub",
      "Level " + plan.offer.level + " offer · costs " + (plan.slot + 1) +
      (plan.slot ? " levels" : " level") + (plan.dummy ? " plus 1 for the dummy" : "") +
      " · " + plan.levelsAfter + " left"));
    const steps = el("ol", "plan-steps");
    for (const text of planSteps(plan)) steps.appendChild(el("li", null, text));
    planResultEl.appendChild(steps);

    const stats = el("dl", "plan-stats");
    stats.appendChild(stat("XP seed", formatXp(plan.xpSeed) + " → " + formatXp(ENCH.xpFromSeed(plan.seedAfter))));
    stats.appendChild(stat("Enchantment seed after", formatPlayerSeed(plan.seedAfter)));
    stats.appendChild(stat("Items to throw", plan.thrown === -1 ? "None" : String(plan.thrown)));
    stats.appendChild(stat("Levels after", String(plan.levelsAfter)));
    planResultEl.appendChild(stats);

    planResultEl.appendChild(el("p", "plan-sub", "This offer contains " +
      plan.offer.spells.map((s) => ENCH.spellLabel(s.id, s.level)).join(", ") + "."));

    const actions = el("div", "plan-actions");
    const apply = el("button", "btn-secondary", "Mark this roll as used");
    apply.type = "button";
    apply.addEventListener("click", () => {
      state.playerSeed = plan.seedAfter;
      state.level = Math.max(1, plan.levelsAfter);
      state.plan = null;
      renderPlan();
      refresh();
    });
    actions.appendChild(apply);
    planResultEl.appendChild(actions);
  }

  function findRoll() {
    if (state.playerSeed === null || !state.wanted.size) {
      updateNote();
      return;
    }
    const mat = material();
    state.plan = ENCH.searchPlan({
      playerSeed: state.playerSeed,
      itemId: state.item,
      materialId: mat ? mat.id : "",
      maxShelves: 15,
      playerLevel: state.level,
      wanted: Array.from(state.wanted, ([id, level]) => ({ id, level })),
      maxThrows: 512,
    });
    if (!state.plan) {
      state.plan = { notFound: "No offer with those enchantments appeared in the first 512 item throws. Lower a tier, choose fewer enchantments, or add player levels." };
      renderPlan();
    } else {
      renderPlan();
      renderOffers();
    }
  }

  /* ---------------------------------------------------------------- seeds */

  function markField(input, valid) {
    input.closest(".seed-field").classList.toggle("is-invalid", !valid);
  }

  function rerender() {
    state.plan = null;
    renderPlan();
    renderOffers();
    updateNote();
  }

  function setPlayerSeedFromInput() {
    const seed = parsePlayerSeed(playerSeedEl.value);
    markField(playerSeedEl, seed !== null);
    // An unreadable seed clears the table instead of leaving stale offers.
    state.playerSeed = seed;
    rerender();
  }

  function setWorldSeedFromInput() {
    state.worldSeed = worldSeedEl.value;
    const seed = playerSeedFromWorld(state.worldSeed);
    markField(worldSeedEl, seed !== null);
    if (seed === null) return;
    state.playerSeed = seed;
    if (document.activeElement !== playerSeedEl) playerSeedEl.value = formatPlayerSeed(seed);
    rerender();
  }

  /* ------------------------------------------------------------- lifecycle */

  function open(worldSeedText) {
    if (state.open) return;
    state.open = true;
    const typed = String(worldSeedText || "").trim() || "0";
    const world = playerSeedFromWorld(typed) === null ? "0" : typed;
    // Keep a seed that was rolled forward in this session; a new home seed
    // re-derives the starting state instead.
    if (state.playerSeed === null || world !== state.worldSeed) {
      state.worldSeed = world;
      state.playerSeed = playerSeedFromWorld(world);
    }
    state.plan = null;
    sectionEl.hidden = false;
    sectionEl.querySelector(".calc-page").scrollTop = 0;
    renderPlan();
    refresh();
    requestAnimationFrame(() => sectionEl.focus({ preventScroll: true }));
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    sectionEl.hidden = true;
    onClose();
  }

  function keydown(e) {
    if (e.key !== "Escape") return true;
    e.preventDefault();
    close();
    return true;
  }

  /* ------------------------------------------------------------------ init */

  function init(opts) {
    onClose = (opts && opts.onClose) || function () {};
    const mount = document.getElementById("calcMount");
    mount.innerHTML = MARKUP;

    sectionEl = document.getElementById("enchant");
    backBtn = document.getElementById("enchantBack");
    itemsEl = document.getElementById("enchantItems");
    materialsEl = document.getElementById("enchantMaterials");
    gearMetaEl = document.getElementById("enchantGearMeta");
    playerSeedEl = document.getElementById("calcPlayerSeed");
    worldSeedEl = document.getElementById("calcWorldSeed");
    offersEl = document.getElementById("calcOffers");
    wantedEl = document.getElementById("calcWanted");
    levelEl = document.getElementById("calcLevel");
    planBtn = document.getElementById("calcPlanBtn");
    planNoteEl = document.getElementById("calcPlanNote");
    planResultEl = document.getElementById("calcPlanResult");
    wantedClearBtn = document.getElementById("calcWantedClear");

    buildGear();
    buildMaterials();
    buildWanted();

    backBtn.addEventListener("click", close);
    playerSeedEl.addEventListener("input", setPlayerSeedFromInput);
    playerSeedEl.addEventListener("blur", () => {
      if (state.playerSeed !== null) playerSeedEl.value = formatPlayerSeed(state.playerSeed);
    });
    worldSeedEl.addEventListener("input", setWorldSeedFromInput);
    levelEl.addEventListener("input", () => {
      state.level = clamp(Math.round(Number(levelEl.value) || 1), 1, 100);
      updateNote();
    });
    planBtn.addEventListener("click", findRoll);
    wantedClearBtn.addEventListener("click", () => {
      state.wanted.clear();
      state.plan = null;
      buildWanted();
      renderPlan();
    });
  }

  global.SeedMapCalc = {
    init,
    open,
    close,
    keydown,
    isOpen: () => state.open,
    item: () => state.item,
    material: () => (material() ? material().id : ""),
    worldSeed: () => state.worldSeed,
    playerSeed: () => (state.playerSeed === null ? null : formatPlayerSeed(state.playerSeed)),
    xpSeed: () => formatXp(ENCH.xpFromSeed(state.playerSeed === null ? 0n : state.playerSeed)),
    table: () => ENCH.table(state.playerSeed === null ? 0n : state.playerSeed, state.item,
      material() ? material().id : ""),
    plan: () => state.plan,
  };
})(typeof window !== "undefined" ? window : globalThis);
