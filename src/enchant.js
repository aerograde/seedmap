/* Seedmap enchanting table calculator — Java 1.21.4 table algorithm, no DOM.
 *
 * The model follows Earthcomputer/EnchantmentCracker: a 48-bit player seed
 * drives every offer. Each use takes the top 32 bits as the XP seed, rolls
 * three slot levels from one java.util.Random stream, and rolls each slot's
 * enchantments from Random(xpSeed + slot). Throwing four items and enchanting
 * one dummy advances the player seed by five LCG steps.
 */
(function (global) {
  "use strict";

  // Table enchantments only: their modified-level ranges, selection weights
  // and conflicts. Treasure enchantments never roll at a table.
  const ENCHANTMENTS = {
    protection: { label: "Protection", weight: 10, conflicts: ["fire_protection", "blast_protection", "projectile_protection"], tiers: [[1, 12], [12, 23], [23, 34], [34, 45]] },
    fire_protection: { label: "Fire Protection", weight: 5, conflicts: ["protection", "blast_protection", "projectile_protection"], tiers: [[10, 18], [18, 26], [26, 34], [34, 42]] },
    feather_falling: { label: "Feather Falling", weight: 5, conflicts: [], tiers: [[5, 11], [11, 17], [17, 23], [23, 29]] },
    blast_protection: { label: "Blast Protection", weight: 2, conflicts: ["protection", "fire_protection", "projectile_protection"], tiers: [[5, 13], [13, 21], [21, 29], [29, 37]] },
    projectile_protection: { label: "Projectile Protection", weight: 5, conflicts: ["protection", "fire_protection", "blast_protection"], tiers: [[3, 9], [9, 15], [15, 21], [21, 27]] },
    respiration: { label: "Respiration", weight: 2, conflicts: [], tiers: [[10, 40], [20, 50], [30, 60]] },
    aqua_affinity: { label: "Aqua Affinity", weight: 2, conflicts: [], tiers: [[1, 41]] },
    thorns: { label: "Thorns", weight: 1, conflicts: [], tiers: [[10, 60], [30, 70], [50, 80]] },
    depth_strider: { label: "Depth Strider", weight: 2, conflicts: [], tiers: [[10, 25], [20, 35], [30, 45]] },
    sharpness: { label: "Sharpness", weight: 10, conflicts: ["smite", "bane_of_arthropods"], tiers: [[1, 21], [12, 32], [23, 43], [34, 54], [45, 65]] },
    smite: { label: "Smite", weight: 5, conflicts: ["sharpness", "bane_of_arthropods"], tiers: [[5, 25], [13, 33], [21, 41], [29, 49], [37, 57]] },
    bane_of_arthropods: { label: "Bane of Arthropods", weight: 5, conflicts: ["sharpness", "smite"], tiers: [[5, 25], [13, 33], [21, 41], [29, 49], [37, 57]] },
    knockback: { label: "Knockback", weight: 5, conflicts: [], tiers: [[5, 55], [25, 75]] },
    fire_aspect: { label: "Fire Aspect", weight: 2, conflicts: [], tiers: [[10, 60], [30, 80]] },
    looting: { label: "Looting", weight: 2, conflicts: ["silk_touch"], tiers: [[15, 65], [24, 74], [33, 83]] },
    sweeping_edge: { label: "Sweeping Edge", weight: 2, conflicts: [], tiers: [[5, 20], [14, 29], [23, 38]] },
    efficiency: { label: "Efficiency", weight: 10, conflicts: [], tiers: [[1, 51], [11, 61], [21, 71], [31, 81], [41, 91]] },
    silk_touch: { label: "Silk Touch", weight: 1, conflicts: ["fortune", "looting"], tiers: [[15, 65]] },
    fortune: { label: "Fortune", weight: 2, conflicts: ["silk_touch"], tiers: [[15, 65], [24, 74], [33, 83]] },
    power: { label: "Power", weight: 10, conflicts: [], tiers: [[1, 16], [11, 26], [21, 36], [31, 46], [41, 56]] },
    punch: { label: "Punch", weight: 2, conflicts: [], tiers: [[12, 37], [32, 57]] },
    flame: { label: "Flame", weight: 2, conflicts: [], tiers: [[20, 50]] },
    infinity: { label: "Infinity", weight: 1, conflicts: [], tiers: [[20, 50]] },
    luck_of_the_sea: { label: "Luck of the Sea", weight: 2, conflicts: ["silk_touch"], tiers: [[15, 65], [24, 74], [33, 83]] },
    lure: { label: "Lure", weight: 2, conflicts: [], tiers: [[15, 65], [24, 74], [33, 83]] },
    unbreaking: { label: "Unbreaking", weight: 5, conflicts: [], tiers: [[5, 55], [13, 63], [21, 71]] },
    channeling: { label: "Channeling", weight: 1, conflicts: ["riptide"], tiers: [[25, 50]] },
    impaling: { label: "Impaling", weight: 2, conflicts: [], tiers: [[1, 21], [9, 29], [17, 37], [25, 45], [33, 53]] },
    loyalty: { label: "Loyalty", weight: 5, conflicts: ["riptide"], tiers: [[12, 50], [19, 50], [26, 50]] },
    riptide: { label: "Riptide", weight: 2, conflicts: ["loyalty", "channeling"], tiers: [[17, 50], [24, 50], [31, 50]] },
    multishot: { label: "Multishot", weight: 2, conflicts: ["piercing"], tiers: [[20, 50]] },
    piercing: { label: "Piercing", weight: 10, conflicts: ["multishot"], tiers: [[1, 50], [11, 50], [21, 50], [31, 50]] },
    quick_charge: { label: "Quick Charge", weight: 5, conflicts: [], tiers: [[12, 50], [32, 50], [52, 50]] },
  };

  // `kind` selects the material table. Ranged gear, tridents and rods use
  // enchantability 1, like the game.
  const ITEMS = {
    sword: { label: "Sword", kind: "tool", pool: ["sharpness", "smite", "bane_of_arthropods", "knockback", "fire_aspect", "looting", "sweeping_edge", "unbreaking"] },
    pickaxe: { label: "Pickaxe", kind: "tool", pool: ["efficiency", "silk_touch", "fortune", "unbreaking"] },
    axe: { label: "Axe", kind: "tool", pool: ["sharpness", "smite", "bane_of_arthropods", "efficiency", "silk_touch", "fortune", "unbreaking"] },
    shovel: { label: "Shovel", kind: "tool", pool: ["efficiency", "silk_touch", "fortune", "unbreaking"] },
    helmet: { label: "Helmet", kind: "armor", pool: ["protection", "fire_protection", "blast_protection", "projectile_protection", "respiration", "aqua_affinity", "thorns", "unbreaking"] },
    chestplate: { label: "Chestplate", kind: "armor", pool: ["protection", "fire_protection", "blast_protection", "projectile_protection", "thorns", "unbreaking"] },
    leggings: { label: "Leggings", kind: "armor", pool: ["protection", "fire_protection", "blast_protection", "projectile_protection", "thorns", "unbreaking"] },
    boots: { label: "Boots", kind: "armor", pool: ["protection", "fire_protection", "blast_protection", "projectile_protection", "feather_falling", "depth_strider", "thorns", "unbreaking"] },
    bow: { label: "Bow", kind: "other", pool: ["power", "punch", "flame", "infinity", "unbreaking"] },
    crossbow: { label: "Crossbow", kind: "other", pool: ["multishot", "piercing", "quick_charge", "unbreaking"] },
    trident: { label: "Trident", kind: "other", pool: ["loyalty", "impaling", "riptide", "channeling", "unbreaking"] },
    fishing_rod: { label: "Fishing rod", kind: "other", pool: ["luck_of_the_sea", "lure", "unbreaking"] },
  };

  const MATERIALS = {
    tool: [
      { id: "wood", label: "Wood", color: "#9a7446", enchantability: 15 },
      { id: "stone", label: "Stone", color: "#8b908d", enchantability: 5 },
      { id: "iron", label: "Iron", color: "#b2b8b6", enchantability: 14 },
      { id: "gold", label: "Gold", color: "#c9a24a", enchantability: 22 },
      { id: "diamond", label: "Diamond", color: "#77b6b0", enchantability: 10 },
      { id: "netherite", label: "Netherite", color: "#75646a", enchantability: 15 },
    ],
    armor: [
      { id: "leather", label: "Leather", color: "#a8764a", enchantability: 15 },
      { id: "chain", label: "Chain", color: "#9ca5a5", enchantability: 12 },
      { id: "iron", label: "Iron", color: "#b2b8b6", enchantability: 9 },
      { id: "gold", label: "Gold", color: "#c9a24a", enchantability: 25 },
      { id: "diamond", label: "Diamond", color: "#77b6b0", enchantability: 10 },
      { id: "netherite", label: "Netherite", color: "#75646a", enchantability: 15 },
    ],
  };

  const SLOT_NAMES = ["Top", "Middle", "Bottom"];
  const SLOT_COSTS = [1, 2, 3];
  const MULTIPLIER = 0x5deece66dn;
  const ADDEND = 0xbn;
  const MASK = (1n << 48n) - 1n;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function advance(seed) {
    return (seed * MULTIPLIER + ADDEND) & MASK;
  }

  function xpFromSeed(seed) {
    return Number((seed >> 16n) & 0xffffffffn) | 0;
  }

  // The exact java.util.Random stream, including the 48-bit seed scramble.
  class JavaRandom {
    constructor(seed) {
      this.state = (BigInt(seed) ^ MULTIPLIER) & MASK;
    }
    next(bits) {
      this.state = (this.state * MULTIPLIER + ADDEND) & MASK;
      return Number(this.state >> BigInt(48 - bits));
    }
    nextInt(bound) {
      if (bound <= 0) throw new RangeError("bound must be positive");
      if ((bound & (bound - 1)) === 0) {
        return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
      }
      let bits, value;
      do {
        bits = this.next(31);
        value = bits % bound;
      } while (bits - value + (bound - 1) < 0);
      return value;
    }
    nextFloat() {
      return this.next(24) / 16777216;
    }
  }

  // In game the table uses the player's enchantment seed, not the world seed.
  // This calculator still starts from the world seed the map was opened with:
  // draw one value from Random(worldSeed) so the same seed always opens the
  // same table. The player seed stays editable and is labelled as derived.
  function seedFromWorld(worldSeed) {
    const rand = new JavaRandom(BigInt(worldSeed) & MASK);
    rand.next(32);
    return rand.state;
  }

  function itemMaterials(itemId) {
    const item = ITEMS[itemId];
    if (!item || item.kind === "other") return [];
    return MATERIALS[item.kind];
  }

  function enchantability(itemId, materialId) {
    const item = ITEMS[itemId];
    if (!item) return 1;
    if (item.kind === "other") return 1;
    const list = MATERIALS[item.kind];
    const material = list.find((m) => m.id === materialId) || list[0];
    return material ? material.enchantability : 1;
  }

  // The three slot levels come from one Random(xpSeed) stream. Slots whose
  // level is below their own index are unusable and show as zero.
  function offerLevels(xpSeed, shelves) {
    const b = clamp(Math.round(shelves), 0, 15);
    const rand = new JavaRandom(xpSeed);
    const out = [];
    for (let slot = 0; slot < 3; slot++) {
      let level = rand.nextInt(8) + 1 + (b >> 1) + rand.nextInt(b + 1);
      if (slot === 0) level = Math.max(Math.floor(level / 3), 1);
      else if (slot === 1) level = Math.floor((level * 2) / 3) + 1;
      else level = Math.max(level, b * 2);
      if (level < slot + 1) level = 0;
      out.push(level);
    }
    return out;
  }

  function highestAllowed(itemId, modifiedLevel) {
    const item = ITEMS[itemId];
    if (!item) return [];
    const out = [];
    for (const id of item.pool) {
      const tiers = ENCHANTMENTS[id].tiers;
      for (let level = tiers.length; level >= 1; level--) {
        if (modifiedLevel >= tiers[level - 1][0] && modifiedLevel <= tiers[level - 1][1]) {
          out.push({ id, level, weight: ENCHANTMENTS[id].weight });
          break;
        }
      }
    }
    return out;
  }

  function weightedPick(rand, list) {
    let total = 0;
    for (const entry of list) total += entry.weight;
    let roll = rand.nextInt(total);
    for (const entry of list) {
      roll -= entry.weight;
      if (roll < 0) return entry;
    }
    return list[list.length - 1];
  }

  function compatible(id, chosen) {
    if (chosen.includes(id)) return false;
    const conflicts = ENCHANTMENTS[id].conflicts;
    for (const other of chosen) {
      if (conflicts.includes(other) || ENCHANTMENTS[other].conflicts.includes(id)) return false;
    }
    return true;
  }

  // Vanilla addRandomEnchantments: two enchantability rolls, the 0.85..1.15
  // modifier, one guaranteed pick, then the repeating /50 bonus roll.
  function rollEnchantments(xpSeed, itemId, materialId, slot, level) {
    const e = enchantability(itemId, materialId);
    if (e <= 0 || level <= 0) return [];
    const rand = new JavaRandom((xpSeed + slot) | 0);
    let modified = level + 1 + rand.nextInt(Math.floor(e / 4) + 1) + rand.nextInt(Math.floor(e / 4) + 1);
    const percent = (rand.nextFloat() + rand.nextFloat() - 1) * 0.15;
    modified = Math.max(1, modified + Math.round(modified * percent));

    let allowed = highestAllowed(itemId, modified);
    if (!allowed.length) return [];
    const spells = [];
    let pick = weightedPick(rand, allowed);
    spells.push({ id: pick.id, level: pick.level });
    allowed = allowed.filter((entry) => compatible(entry.id, spells.map((s) => s.id)));
    while (rand.nextInt(50) <= modified) {
      if (!allowed.length) break;
      pick = weightedPick(rand, allowed);
      spells.push({ id: pick.id, level: pick.level });
      allowed = allowed.filter((entry) => compatible(entry.id, spells.map((s) => s.id)));
      modified = Math.floor(modified / 2);
    }
    return spells;
  }

  function offers(xpSeed, shelves, itemId, materialId) {
    const levels = offerLevels(xpSeed, shelves);
    return levels.map((level, slot) => ({
      slot,
      name: SLOT_NAMES[slot],
      level,
      levelsSpent: SLOT_COSTS[slot],
      spells: level ? rollEnchantments(xpSeed, itemId, materialId, slot, level) : [],
    }));
  }

  // Every bookshelf count for the current player seed, all from one XP seed.
  function table(playerSeed, itemId, materialId) {
    const xpSeed = xpFromSeed(playerSeed);
    const out = [];
    for (let shelves = 0; shelves <= 15; shelves++) {
      out.push({ shelves, offers: offers(xpSeed, shelves, itemId, materialId) });
    }
    return out;
  }

  // Slot manipulation: walk the player seed forward. thrown >= 0 means throw
  // that many items (four LCG steps each) then enchant one cheap dummy (one
  // step). The real item is then the next use, which costs its slot level.
  function searchPlan(opts) {
    const playerSeed = BigInt(opts.playerSeed) & MASK;
    const itemId = opts.itemId;
    const materialId = opts.materialId || "";
    const maxShelves = clamp(Math.round(opts.maxShelves === undefined ? 15 : opts.maxShelves), 0, 15);
    const playerLevel = clamp(Math.round(opts.playerLevel || 0), 0, 100);
    const wanted = (opts.wanted || []).map((w) => (typeof w === "string" ? { id: w, level: 1 } : w));
    const unwanted = opts.unwanted || [];
    const maxThrows = opts.maxThrows === undefined ? 512 : opts.maxThrows;
    if (!ITEMS[itemId] || !wanted.length) return null;

    let state = playerSeed;
    for (let thrown = -1; thrown <= maxThrows; thrown++) {
      if (thrown === 0) {
        state = advance(state);
      } else if (thrown > 0) {
        for (let step = 0; step < 4; step++) state = advance(state);
      }
      const xpSeed = xpFromSeed(state);
      for (let shelves = 0; shelves <= maxShelves; shelves++) {
        const slots = offers(xpSeed, shelves, itemId, materialId);
        for (const offer of slots) {
          if (!offer.level) continue;
          if (playerLevel < offer.level + (thrown >= 0 ? 1 : 0)) continue;
          const ids = offer.spells.map((s) => s.id);
          if (!wanted.every((w) => {
            const match = offer.spells.find((s) => s.id === w.id);
            return match && match.level >= (w.level || 1);
          })) continue;
          if (unwanted.some((id) => ids.includes(id))) continue;
          return {
            thrown,
            dummy: thrown >= 0,
            shelves,
            slot: offer.slot,
            xpSeed,
            offer,
            seedAfter: advance(state),
            levelsAfter: playerLevel - (thrown >= 0 ? 1 : 0) - SLOT_COSTS[offer.slot],
          };
        }
      }
    }
    return null;
  }

  function spellLabel(id, level) {
    const name = ENCHANTMENTS[id] ? ENCHANTMENTS[id].label : id;
    const roman = ["", "I", "II", "III", "IV", "V"][level] || String(level);
    return name + " " + roman;
  }

  const API = {
    ENCHANTMENTS,
    ITEMS,
    MATERIALS,
    SLOT_NAMES,
    SLOT_COSTS,
    JavaRandom,
    advance,
    xpFromSeed,
    seedFromWorld,
    itemMaterials,
    enchantability,
    offerLevels,
    rollEnchantments,
    offers,
    table,
    searchPlan,
    spellLabel,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (global) global.SeedMapEnchant = API;
})(typeof window !== "undefined" ? window : globalThis);
