#!/usr/bin/env node
"use strict";

const assert = require("assert");
const E = require("../src/enchant.js");

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

for (let shelves = 0; shelves <= 15; shelves++) {
  const slots = E.offers(shelves);
  for (const slot of slots) {
    const expected = RANGES[slot.name.toLowerCase()][shelves];
    assert.strictEqual(slot.min, expected[0], `${slot.name} min at ${shelves} shelves`);
    assert.strictEqual(slot.max, expected[1], `${slot.name} max at ${shelves} shelves`);
    let sum = 0;
    for (const p of slot.probability.values()) sum += p;
    assert.ok(Math.abs(sum - 1) < 1e-12, `${slot.name} probabilities sum at ${shelves} shelves`);
    checks += 3;
  }
}

assert.strictEqual(E.offers(15)[2].min, 30);
assert.strictEqual(E.offers(15)[2].max, 30);
assert.deepStrictEqual(E.offers(15).map((slot) => slot.lapis), [1, 2, 3]);

const TREASURE = ["mending", "frost_walker", "soul_speed", "swift_sneak"];
for (const id of TREASURE) {
  assert.strictEqual(E.ENCHANTMENTS[id], undefined, `${id} must not be a table enchantment`);
  checks++;
}

const ITEM_COUNT = Object.keys(E.ITEMS).length;
assert.ok(ITEM_COUNT >= 10, "expected a broad gear list");

for (const [id, item] of Object.entries(E.ITEMS)) {
  assert.ok(item.pool.length > 0, `${id} has a pool`);
  for (const enchantment of item.pool) {
    assert.ok(E.ENCHANTMENTS[enchantment], `${id} references ${enchantment}`);
  }
  const rows = E.odds(id, E.itemMaterials(id)[0] ? E.itemMaterials(id)[0].id : "", 15, 2);
  assert.ok(rows.length > 0, `${id} has at least one possible bottom-slot enchantment`);
  for (const row of rows) {
    assert.ok(row.chance > 0 && row.chance <= 1, `${id}/${row.id} chance bounded`);
    assert.ok(row.maxLevel >= 1 && row.maxLevel <= 5, `${id}/${row.id} tier bounded`);
  }
  checks += 2 + rows.length;
}

const diamondSword = E.odds("sword", "diamond", 15, 2);
const goldSword = E.odds("sword", "gold", 15, 2);
const diamondSharp = diamondSword.find((row) => row.id === "sharpness");
const goldSharp = goldSword.find((row) => row.id === "sharpness");
assert.ok(diamondSharp && diamondSharp.maxLevel === 4, "diamond sword caps at Sharpness IV");
assert.ok(goldSharp && goldSharp.maxLevel === 5, "gold sword can reach Sharpness V");
assert.strictEqual(E.enchantability("sword", "diamond"), 10);
assert.strictEqual(E.enchantability("helmet", "gold"), 25);
assert.strictEqual(E.enchantability("bow", "diamond"), 1);

const rodLow = E.odds("fishing_rod", "", 0, 0);
assert.deepStrictEqual(rodLow, [], "a level-1 fishing rod offer can be empty");

const again = E.odds("sword", "diamond", 15, 2);
assert.deepStrictEqual(again, diamondSword, "odds are deterministic");

console.log(`ok — ${checks} enchanting checks across ${ITEM_COUNT} gear types`);
