/* Terrain data: biome tiles, structure enumeration, stronghold streaming. */
(function (global) {
  "use strict";

  const E = global.SeedMapEngine;
  const B = global.SeedMapBiomes;
  const U = global.SeedMapUtil;
  const XHTML = U.XHTML;

  const TILE_CELLS = 64;
  const PREVIEW_CELLS = 16;
  const PREVIEW_FACTOR = 4;
  const CELL_TARGET = 6;
  const TILE_BUDGET_MS = 7;
  const STRUCT_BUDGET_MS = 4;
  const DENSE_CELL = 256;
  const DENSE_BUDGET_MS = 2.0;

  const DENSE_TYPES = E.STRUCTURES.filter((s) => s.dense);
  const VALID_TYPES = E.STRUCTURES.filter((s) => !s.dense && s.key !== "stronghold");
  const STRUCT_META = {};
  for (const s of E.STRUCTURES) STRUCT_META[s.key] = s;

  const tiles = new Map();
  const visibleTiles = [];
  let currentStep = 0;
  let tileSerial = 0;

  const known = [];
  const seen = new Set();
  const region = new Map();
  const queue = [];
  const queued = new Set();
  let enumerated = null;

  // Treasure and mineshafts are per-chunk. They are generated in coarse
  // cells so the sparse region queue never attempts one job per chunk.
  const dense = { done: new Set(), queue: [], queued: new Set() };

  const state = {
    world: null,
    active: false,
    strongholdJob: null,
    strongholdTimer: 0,
    lastEnum: 0,
  };

  let view = null;
  let onChange = function () {};

  function rect(padPx) {
    const v = view();
    const s = v.cam.s;
    const pad = (padPx || 0) / s;
    const hw = v.vw / (2 * s) + pad;
    const hh = v.vh / (2 * s) + pad;
    return {
      x0: v.cam.x - hw, x1: v.cam.x + hw,
      z0: v.cam.z - hh, z1: v.cam.z + hh,
    };
  }

  /* ---------------------------------------------------------------- tiles */

  function stepForScale(scale) {
    const raw = Math.pow(2, Math.round(Math.log2(CELL_TARGET / scale)));
    // Never sample coarser than 16 blocks: at wide zoom this keeps coastlines
    // and rivers resolved instead of dissolving into single-biome confetti.
    return U.clamp(raw, 1, 16);
  }

  function tileKey(step, tx, tz) {
    return step + "|" + tx + "|" + tz;
  }

  function makeTile(step, tx, tz, now) {
    const c = document.createElementNS(XHTML, "canvas");
    c.width = TILE_CELLS;
    c.height = TILE_CELLS;
    const pc = document.createElementNS(XHTML, "canvas");
    pc.width = PREVIEW_CELLS;
    pc.height = PREVIEW_CELLS;
    const t = {
      step, tx, tz,
      blocks: step * TILE_CELLS,
      canvas: c,
      g: c.getContext("2d", { alpha: true }),
      pcanvas: pc,
      pg: pc.getContext("2d", { alpha: true }),
      prow: 0,
      row: 0,
      done: false,
      used: now,
    };
    t.g.imageSmoothingEnabled = false;
    t.pg.imageSmoothingEnabled = false;
    return t;
  }

  function tileRect(t) {
    return {
      x0: t.tx * t.blocks,
      z0: t.tz * t.blocks,
      x1: (t.tx + 1) * t.blocks,
      z1: (t.tz + 1) * t.blocks,
    };
  }

  // Every tile gets a 4x coarser preview first. Previews are cheap enough to
  // cover a fresh viewport within a couple of frames, so a new zoom level is
  // never a blank rectangle while the detailed rows stream in behind it.
  function fillPreviewRow(t, row) {
    const g = t.pg;
    const step = t.step * PREVIEW_FACTOR;
    const wz = t.tz * t.blocks + row * step + (step >> 1);
    const wxBase = t.tx * t.blocks;
    for (let col = 0; col < PREVIEW_CELLS; col++) {
      const wx = wxBase + col * step + (step >> 1);
      g.fillStyle = B.colour(state.world.biomeAtBlock(wx, wz));
      g.fillRect(col, row, 1, 1);
    }
  }

  function fillTileRow(t, row) {
    const g = t.g;
    const step = t.step;
    const wzBase = t.tz * t.blocks + row * step;
    const wxBase = t.tx * t.blocks;
    let runStart = 0;
    let runColour = null;
    for (let col = 0; col <= TILE_CELLS; col++) {
      let colour = runColour;
      if (col < TILE_CELLS) {
        const wx = wxBase + col * step + (step >> 1);
        colour = B.colour(state.world.biomeAtBlock(wx, wzBase + (step >> 1)));
      }
      if (col === 0) {
        runColour = colour;
      } else if (colour !== runColour || col === TILE_CELLS) {
        g.fillStyle = runColour;
        g.fillRect(runStart, row, col - runStart, 1);
        runStart = col;
        runColour = colour;
      }
    }
  }

  function ensureTiles(now) {
    const v = view();
    const step = stepForScale(v.cam.s);
    currentStep = step;
    const blocks = step * TILE_CELLS;
    const area = rect(30);
    const tx0 = Math.floor(area.x0 / blocks);
    const tx1 = Math.floor(area.x1 / blocks);
    const tz0 = Math.floor(area.z0 / blocks);
    const tz1 = Math.floor(area.z1 / blocks);
    for (let tz = tz0; tz <= tz1; tz++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = tileKey(step, tx, tz);
        let t = tiles.get(key);
        if (!t) {
          t = makeTile(step, tx, tz, now);
          tiles.set(key, t);
        }
        t.used = now;
      }
    }

    visibleTiles.length = 0;
    for (const t of tiles.values()) {
      if (t.step !== step) continue;
      const r = tileRect(t);
      if (r.x1 < area.x0 || r.x0 > area.x1 || r.z1 < area.z0 || r.z0 > area.z1) continue;
      visibleTiles.push(t);
    }
    visibleTiles.sort((a, b) => {
      const ax = (a.tx + 0.5) * a.blocks - v.cam.x;
      const az = (a.tz + 0.5) * a.blocks - v.cam.z;
      const bx = (b.tx + 0.5) * b.blocks - v.cam.x;
      const bz = (b.tz + 0.5) * b.blocks - v.cam.z;
      return (ax * ax + az * az) - (bx * bx + bz * bz);
    });

    if (tiles.size > 280) {
      const keep = new Set();
      for (const t of visibleTiles) keep.add(tileKey(t.step, t.tx, t.tz));
      const sorted = Array.from(tiles.values()).sort((a, b) => a.used - b.used);
      for (const t of sorted) {
        if (tiles.size <= 220) break;
        if (keep.has(tileKey(t.step, t.tx, t.tz))) continue;
        tiles.delete(tileKey(t.step, t.tx, t.tz));
      }
    }
  }

  function generateTiles() {
    const deadline = performance.now() + TILE_BUDGET_MS;
    let progressed = false;
    for (const t of visibleTiles) {
      while (t.prow < PREVIEW_CELLS) {
        fillPreviewRow(t, t.prow);
        t.prow++;
        progressed = true;
        if (performance.now() > deadline) break;
      }
      if (performance.now() > deadline) break;
    }
    while (performance.now() < deadline) {
      let any = false;
      for (const t of visibleTiles) {
        if (t.row >= TILE_CELLS) continue;
        fillTileRow(t, t.row);
        t.row++;
        any = true;
        progressed = true;
        if (t.row === TILE_CELLS) t.done = true;
        if (performance.now() > deadline) break;
      }
      if (!any) break;
    }
    return progressed;
  }

  /* ----------------------------------------------------------- structures */

  function addStructure(type, x, z) {
    const key = type + ":" + x + ":" + z;
    if (seen.has(key)) return false;
    seen.add(key);
    known.push({ type, x, z });
    return true;
  }

  function queueRegion(type, rx, rz, cx, cz) {
    const key = type + "|" + rx + "|" + rz;
    if (region.has(key) || queued.has(key)) return;
    queued.add(key);
    const size = STRUCT_META[type].spacing * 16;
    const x = (rx + 0.5) * size;
    const z = (rz + 0.5) * size;
    queue.push({ key, type, rx, rz, d: (x - cx) * (x - cx) + (z - cz) * (z - cz) });
  }

  function enumerateStructures() {
    const v = view();
    const area = rect(180);
    const prev = enumerated;
    if (prev &&
        area.x0 > prev.x0 && area.x1 < prev.x1 &&
        area.z0 > prev.z0 && area.z1 < prev.z1 &&
        area.x1 - area.x0 < (prev.x1 - prev.x0) * 0.92) {
      return;
    }
    const padX = (area.x1 - area.x0) * 0.4;
    const padZ = (area.z1 - area.z0) * 0.4;
    const ex = {
      x0: area.x0 - padX, x1: area.x1 + padX,
      z0: area.z0 - padZ, z1: area.z1 + padZ,
    };
    for (const st of VALID_TYPES) {
      const size = st.spacing * 16;
      const rx0 = Math.floor(ex.x0 / size) - 1;
      const rx1 = Math.floor(ex.x1 / size) + 1;
      const rz0 = Math.floor(ex.z0 / size) - 1;
      const rz1 = Math.floor(ex.z1 / size) + 1;
      for (let rz = rz0; rz <= rz1; rz++) {
        for (let rx = rx0; rx <= rx1; rx++) {
          queueRegion(st.key, rx, rz, v.cam.x, v.cam.z);
        }
      }
    }
    if (queue.length > 1) queue.sort((a, b) => a.d - b.d);
    if (prev) {
      ex.x0 = Math.min(ex.x0, prev.x0); ex.x1 = Math.max(ex.x1, prev.x1);
      ex.z0 = Math.min(ex.z0, prev.z0); ex.z1 = Math.max(ex.z1, prev.z1);
    }
    enumerated = ex;
  }

  function processStructures() {
    if (!queue.length) return false;
    const deadline = performance.now() + STRUCT_BUDGET_MS;
    let changed = false;
    while (queue.length && performance.now() < deadline) {
      const job = queue.shift();
      queued.delete(job.key);
      let found = null;
      try {
        found = state.world.structureAt(job.type, job.rx, job.rz);
      } catch (err) {
        found = null;
      }
      region.set(job.key, found);
      if (found && addStructure(job.type, found.x, found.z)) changed = true;
    }
    return changed;
  }

  function enumerateDense() {
    const area = rect(160);
    const cam = view().cam;
    const cx0 = Math.floor(area.x0 / DENSE_CELL);
    const cx1 = Math.floor(area.x1 / DENSE_CELL);
    const cz0 = Math.floor(area.z0 / DENSE_CELL);
    const cz1 = Math.floor(area.z1 / DENSE_CELL);
    const before = dense.queue.length;
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = cx + "|" + cz;
        if (dense.done.has(key) || dense.queued.has(key)) continue;
        dense.queued.add(key);
        const x0 = cx * DENSE_CELL, z0 = cz * DENSE_CELL;
        const mx = x0 + DENSE_CELL / 2, mz = z0 + DENSE_CELL / 2;
        dense.queue.push({
          key, x0, z0, x1: x0 + DENSE_CELL - 1, z1: z0 + DENSE_CELL - 1,
          d: (mx - cam.x) * (mx - cam.x) + (mz - cam.z) * (mz - cam.z),
        });
      }
    }
    if (dense.queue.length > before + 1) dense.queue.sort((a, b) => a.d - b.d);
  }

  function processDense() {
    if (!dense.queue.length) return false;
    const deadline = performance.now() + DENSE_BUDGET_MS;
    let changed = false;
    while (dense.queue.length && performance.now() < deadline) {
      const job = dense.queue.shift();
      dense.queued.delete(job.key);
      let complete = true;
      for (const st of DENSE_TYPES) {
        try {
          for (const p of state.world.denseStructures(st.key, job.x0, job.z0, job.x1, job.z1)) {
            if (addStructure(st.key, p.x, p.z)) changed = true;
          }
        } catch (err) {
          complete = false;
          console.error(err);
        }
      }
      if (complete) dense.done.add(job.key);
    }
    return changed;
  }

  // Strongholds need a 112-block biome search each, so they stream in one
  // per timer turn and never block the map.
  function pumpStrongholds() {
    state.strongholdTimer = 0;
    const job = state.strongholdJob;
    if (!state.active || !job) return;
    let step = null;
    try {
      step = job.advance(12);
    } catch (err) {
      state.strongholdJob = null;
      console.error(err);
      return;
    }
    if (step.pos) {
      addStructure("stronghold", step.pos.x, step.pos.z);
      onChange();
    }
    if (job.remaining > 0) state.strongholdTimer = setTimeout(pumpStrongholds, 0);
    else state.strongholdJob = null;
  }

  /* ------------------------------------------------------------- lifecycle */

  function reset() {
    tiles.clear();
    visibleTiles.length = 0;
    known.length = 0;
    seen.clear();
    region.clear();
    queue.length = 0;
    queued.clear();
    enumerated = null;
    dense.done.clear();
    dense.queue.length = 0;
    dense.queued.clear();
    currentStep = 0;
    state.strongholdJob = null;
    clearTimeout(state.strongholdTimer);
    state.strongholdTimer = 0;
    state.lastEnum = 0;
  }

  function setWorld(world) {
    reset();
    state.world = world;
    state.active = true;
    state.strongholdJob = world.strongholdIterator(128);
    enumerateStructures();
    enumerateDense();
    pumpStrongholds();
  }

  function stop() {
    state.active = false;
    clearTimeout(state.strongholdTimer);
    state.strongholdTimer = 0;
    state.strongholdJob = null;
  }

  function update(now) {
    if (!state.active || !state.world) return false;
    ensureTiles(now);
    let busy = generateTiles();
    if (!enumerated || now - state.lastEnum > 140) {
      enumerateStructures();
      enumerateDense();
      state.lastEnum = now;
    }
    if (processStructures() || processDense()) {
      busy = true;
      onChange();
    }
    return busy;
  }

  function progress() {
    let total = 0;
    let ready = 0;
    for (const t of visibleTiles) {
      total += TILE_CELLS;
      ready += t.row;
    }
    return { total, ready };
  }

  global.SeedMapTerrain = {
    init(opts) {
      view = opts.view;
      onChange = opts.onChange || function () {};
    },
    setWorld,
    stop,
    update,
    progress,
    world: () => state.world,
    known,
    visibleTiles,
    step: () => currentStep,
    stats: () => ({
      tiles: tiles.size,
      readyTiles: visibleTiles.filter((t) => t.done).length,
      structures: known.length,
      strongholds: known.filter((s) => s.type === "stronghold").length,
      pendingStrongholds: state.strongholdJob ? state.strongholdJob.remaining : 0,
      pendingStructures: queue.length,
      pendingDense: dense.queue.length,
      denseCells: dense.done.size,
    }),
  };
})(typeof window !== "undefined" ? window : globalThis);
