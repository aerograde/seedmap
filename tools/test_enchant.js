#!/usr/bin/env node
"use strict";

const assert = require("assert");
const E = require("../src/enchant.js");

// The offer-level envelope for every bookshelf count, independent of seed.
const RANGES = {
  top: [
    [1, 2], [1, 3], [1, 3], [1, 4], [1, 4], [1, 5], [1, 5], [1, 6],
    [1, 6], [1, 7], [2, 7], [2, 8], [2, 8], [2, 9], [2, 9], [2, 10],
  ],
  middle: [
    [1, 6], [1, 7], [2, 8], [2, 9], [3, 10], [3, 11], [3, 12], [3, 13],
    [4, 14], [4, 15], [5, 16], [5, 17], [5, 18], [5, 19], [6, 20], [6, 21],
  ],
  bottom: [
    [1, 8], [2, 9], [4, 11], [6, 12], [8, 14], [10, 15], [12, 17], [14, 18],
    [16, 20], [18, 21], [20, 23], [22, 24], [24, 26], [26, 27], [28, 29], [30, 30],
  ],
};

let checks = 0;

// java.util.Random is the source of every level and every enchantment. Two
// canonical outputs of new Random(0) pin the LCG to the real class.
let r = new E.JavaRandom(0);
assert.strictEqual((r.next(32) | 0), -1155484576);
r = new E.JavaRandom(0);
assert.strictEqual(r.nextInt(100), 60);
checks += 2;

for (let shelves = 0; shelves <= 15; shelves++) {
  for (let seed = 0; seed < 40; seed++) {
    const levels = E.offerLevels((seed * 2654435761) | 0, shelves);
    for (let slot = 0; slot < 3; slot++) {
      const name = E.SLOT_NAMES[slot].toLowerCase();
      const range = RANGES[name][shelves];
      const level = levels[slot];
      if (level === 0) continue;
      assert.ok(level >= range[0] && level <= range[1],
        `${name} level ${level} outside ${range.join("-")} at ${shelves} shelves`);
    }
  }
  checks += 3;
}

assert.deepStrictEqual(E.offerLevels(0, 15), [8, 13, 30]);
assert.strictEqual(E.offerLevels(0, 15)[2], 30, "the bottom offer is always 30 at the cap");
assert.strictEqual(E.xpFromSeed(0x1234_5678_9abcn), 0x12345678);

// The world seed always opens the same derived player seed.
const derived = E.seedFromWorld(0n);
assert.strictEqual(derived, E.seedFromWorld(0n));
assert.ok(derived >= 0n && derived < (1n << 48n), "derived seed fits 48 bits");

const TREASURE = ["mending", "frost_walker", "soul_speed", "swift_sneak"];
for (const id of TREASURE) {
  assert.strictEqual(E.ENCHANTMENTS[id], undefined, `${id} is not a table enchantment`);
}
const used = new Set(Object.values(E.ITEMS).flatMap((item) => item.pool));
for (const id of Object.keys(E.ENCHANTMENTS)) {
  assert.ok(used.has(id), `${id} is reachable from at least one item pool`);
}
checks += 2;

const ITEM_COUNT = Object.keys(E.ITEMS).length;
assert.ok(ITEM_COUNT >= 10, "expected a broad gear list");

for (const [id, item] of Object.entries(E.ITEMS)) {
  assert.ok(item.pool.length > 0, `${id} has a pool`);
  for (const enchantment of item.pool) {
    assert.ok(E.ENCHANTMENTS[enchantment], `${id} references ${enchantment}`);
  }
  const offers = E.offers(0, 15, id, E.itemMaterials(id)[0] ? E.itemMaterials(id)[0].id : "");
  assert.strictEqual(offers.length, 3);
  assert.ok(offers[2].spells.length > 0, `${id} has a bottom-slot offer at 15 shelves`);
  for (const offer of offers) {
    for (const spell of offer.spells) {
      assert.ok(E.ENCHANTMENTS[spell.id], `${id} produced a table enchantment`);
      assert.ok(spell.level >= 1 && spell.level <= E.ENCHANTMENTS[spell.id].tiers.length,
        `${id}/${spell.id} tier bounded`);
    }
    const ids = offer.spells.map((s) => s.id);
    assert.strictEqual(new Set(ids).size, ids.length, "no duplicate enchantment in one offer");
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        assert.ok(!E.ENCHANTMENTS[ids[a]].conflicts.includes(ids[b]),
          `${ids[a]} cannot share an offer with ${ids[b]}`);
      }
    }
  }
  checks += 3;
}

const table = E.table(0n, "sword", "diamond");
assert.strictEqual(table.length, 16, "one row per bookshelf count");
assert.strictEqual(table[15].offers[2].level, 30);
assert.deepStrictEqual(E.table(0n, "sword", "diamond"), table, "the table is deterministic");

const diamondSword = E.offers(0, 15, "sword", "diamond");
assert.strictEqual(diamondSword[2].spells[0].id, "unbreaking");
assert.ok(diamondSword[2].spells.some((s) => s.id === "looting"));

// Slot manipulation: the planner must return an offer that really contains
// every wanted enchantment, at a state reachable by throwing items and then
// enchanting one dummy.
const plan = E.searchPlan({
  playerSeed: 0n,
  itemId: "sword",
  materialId: "diamond",
  maxShelves: 15,
  playerLevel: 30,
  wanted: [{ id: "sharpness", level: 1 }],
  maxThrows: 512,
});
assert.ok(plan, "a Sharpness plan exists");
const planSpells = plan.offer.spells.map((s) => s.id);
assert.ok(planSpells.includes("sharpness"), "the plan contains the wanted enchantment");

let state = 0n;
if (plan.thrown >= 0) {
  for (let i = 0; i < plan.thrown * 4 + 1; i++) state = E.advance(state);
}
assert.strictEqual(plan.xpSeed, E.xpFromSeed(state), "the plan's XP seed matches its throw count");
assert.deepStrictEqual(E.offers(plan.xpSeed, plan.shelves, "sword", "diamond")[plan.slot].spells,
  plan.offer.spells, "the plan's offer really exists at that seed");
assert.strictEqual(plan.seedAfter, E.advance(state), "seedAfter is the next state after the planned use");
assert.strictEqual(plan.levelsAfter, 30 - (plan.dummy ? 1 : 0) - (plan.slot + 1));

const fail = E.searchPlan({
  playerSeed: 0n,
  itemId: "bow",
  materialId: "",
  maxShelves: 15,
  playerLevel: 30,
  wanted: ["silk_touch"],
  maxThrows: 8,
});
assert.strictEqual(fail, null, "a bow can never offer Silk Touch");

assert.strictEqual(E.spellLabel("sharpness", 4), "Sharpness IV");
assert.strictEqual(E.spellLabel("unbreaking", 3), "Unbreaking III");

console.log(`ok — ${checks} enchantment checks across ${ITEM_COUNT} gear types; seed ${plan.seedAfter.toString(16)} after ${plan.thrown} throws`);
