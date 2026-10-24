/* Seedmap enchanting table — pure Java 1.21.4 model, no DOM. */
(function (global) {
  "use strict";

  // Modified-enchantment-level ranges per tier, the weights used by the table
  // selection, and the conflicts that remove an enchantment after another is
  // chosen. Treasure enchantments are deliberately absent: the table cannot
  // produce them. Ranges and weights follow the Java 1.14+ algorithm, which is
  // still the 1.21.4 table algorithm.
  const ENCHANTMENTS = {
    protection: {
      label: "Protection", weight: 10, conflicts: ["fire_protection", "blast_protection", "projectile_protection"],
      tiers: [[1, 12], [12, 23], [23, 34], [34, 45]],
    },
    fire_protection: {
      label: "Fire Protection", weight: 5, conflicts: ["protection", "blast_protection", "projectile_protection"],
      tiers: [[10, 18], [18, 26], [26, 34], [34, 42]],
    },
    feather_falling: {
      label: "Feather Falling", weight: 5, conflicts: [],
      tiers: [[5, 11], [11, 17], [17, 23], [23, 29]],
    },
    blast_protection: {
      label: "Blast Protection", weight: 2, conflicts: ["protection", "fire_protection", "projectile_protection"],
      tiers: [[5, 13], [13, 21], [21, 29], [29, 37]],
    },
    projectile_protection: {
      label: "Projectile Protection", weight: 5, conflicts: ["protection", "fire_protection", "blast_protection"],
      tiers: [[3, 9], [9, 15], [15, 21], [21, 27]],
    },
    respiration: {
      label: "Respiration", weight: 2, conflicts: [],
      tiers: [[10, 40], [20, 50], [30, 60]],
    },
    aqua_affinity: {
      label: "Aqua Affinity", weight: 2, conflicts: [],
      tiers: [[1, 41]],
    },
    thorns: {
      label: "Thorns", weight: 1, conflicts: [],
      tiers: [[10, 60], [30, 70], [50, 80]],
    },
    depth_strider: {
      label: "Depth Strider", weight: 2, conflicts: [],
      tiers: [[10, 25], [20, 35], [30, 45]],
    },
    sharpness: {
      label: "Sharpness", weight: 10, conflicts: ["smite", "bane_of_arthropods"],
      tiers: [[1, 21], [12, 32], [23, 43], [34, 54], [45, 65]],
    },
    smite: {
      label: "Smite", weight: 5, conflicts: ["sharpness", "bane_of_arthropods"],
      tiers: [[5, 25], [13, 33], [21, 41], [29, 49], [37, 57]],
    },
    bane_of_arthropods: {
      label: "Bane of Arthropods", weight: 5, conflicts: ["sharpness", "smite"],
      tiers: [[5, 25], [13, 33], [21, 41], [29, 49], [37, 57]],
    },
    knockback: {
      label: "Knockback", weight: 5, conflicts: [],
      tiers: [[5, 55], [25, 75]],
    },
    fire_aspect: {
      label: "Fire Aspect", weight: 2, conflicts: [],
      tiers: [[10, 60], [30, 80]],
    },
    looting: {
      label: "Looting", weight: 2, conflicts: ["silk_touch"],
      tiers: [[15, 65], [24, 74], [33, 83]],
    },
    sweeping_edge: {
      label: "Sweeping Edge", weight: 2, conflicts: [],
      tiers: [[5, 20], [14, 29], [23, 38]],
    },
    efficiency: {
      label: "Efficiency", weight: 10, conflicts: [],
      tiers: [[1, 51], [11, 61], [21, 71], [31, 81], [41, 91]],
    },
    silk_touch: {
      label: "Silk Touch", weight: 1, conflicts: ["fortune", "looting"],
      tiers: [[15, 65]],
    },
    fortune: {
      label: "Fortune", weight: 2, conflicts: ["silk_touch"],
      tiers: [[15, 65], [24, 74], [33, 83]],
    },
    power: {
      label: "Power", weight: 10, conflicts: [],
      tiers: [[1, 16], [11, 26], [21, 36], [31, 46], [41, 56]],
    },
    punch: {
      label: "Punch", weight: 2, conflicts: [],
      tiers: [[12, 37], [32, 57]],
    },
    flame: {
      label: "Flame", weight: 2, conflicts: [],
      tiers: [[20, 50]],
    },
    infinity: {
      label: "Infinity", weight: 1, conflicts: [],
      tiers: [[20, 50]],
    },
    luck_of_the_sea: {
      label: "Luck of the Sea", weight: 2, conflicts: ["silk_touch"],
      tiers: [[15, 65], [24, 74], [33, 83]],
    },
    lure: {
      label: "Lure", weight: 2, conflicts: [],
      tiers: [[15, 65], [24, 74], [33, 83]],
    },
    unbreaking: {
      label: "Unbreaking", weight: 5, conflicts: [],
      tiers: [[5, 55], [13, 63], [21, 71]],
    },
    channeling: {
      label: "Channeling", weight: 1, conflicts: ["riptide"],
      tiers: [[25, 50]],
    },
    impaling: {
      label: "Impaling", weight: 2, conflicts: [],
      tiers: [[1, 21], [9, 29], [17, 37], [25, 45], [33, 53]],
    },
    loyalty: {
      label: "Loyalty", weight: 5, conflicts: ["riptide"],
      tiers: [[12, 50], [19, 50], [26, 50]],
    },
    riptide: {
      label: "Riptide", weight: 2, conflicts: ["loyalty", "channeling"],
      tiers: [[17, 50], [24, 50], [31, 50]],
    },
    multishot: {
      label: "Multishot", weight: 2, conflicts: ["piercing"],
      tiers: [[20, 50]],
    },
    piercing: {
      label: "Piercing", weight: 10, conflicts: ["multishot"],
      tiers: [[1, 50], [11, 50], [21, 50], [31, 50]],
    },
    quick_charge: {
      label: "Quick Charge", weight: 5, conflicts: [],
      tiers: [[12, 50], [32, 50], [52, 50]],
    },
  };

  // `kind` chooses the material table and whether material affects the roll.
  // Ranged gear, tridents, rods and books all use enchantability 1, matching
  // the game.
  const ITEMS = {
    sword: {
      label: "Sword", kind: "tool",
      pool: ["sharpness", "smite", "bane_of_arthropods", "knockback", "fire_aspect", "looting", "sweeping_edge", "unbreaking"],
    },
    pickaxe: {
      label: "Pickaxe", kind: "tool",
      pool: ["efficiency", "silk_touch", "fortune", "unbreaking"],
    },
    axe: {
      label: "Axe", kind: "tool",
      pool: ["sharpness", "smite", "bane_of_arthropods", "efficiency", "silk_touch", "fortune", "unbreaking"],
    },
    shovel: {
      label: "Shovel", kind: "tool",
      pool: ["efficiency", "silk_touch", "fortune", "unbreaking"],
    },
    helmet: {
      label: "Helmet", kind: "armor",
      pool: ["protection", "fire_protection", "blast_protection", "projectile_protection", "respiration", "aqua_affinity", "thorns", "unbreaking"],
    },
    chestplate: {
      label: "Chestplate", kind: "armor",
      pool: ["protection", "fire_protection", "blast_protection", "projectile_protection", "thorns", "unbreaking"],
    },
    leggings: {
      label: "Leggings", kind: "armor",
      pool: ["protection", "fire_protection", "blast_protection", "projectile_protection", "thorns", "unbreaking"],
    },
    boots: {
      label: "Boots", kind: "armor",
      pool: ["protection", "fire_protection", "blast_protection", "projectile_protection", "feather_falling", "depth_strider", "thorns", "unbreaking"],
    },
    bow: {
      label: "Bow", kind: "other",
      pool: ["power", "punch", "flame", "infinity", "unbreaking"],
    },
    crossbow: {
      label: "Crossbow", kind: "other",
      pool: ["multishot", "piercing", "quick_charge", "unbreaking"],
    },
    trident: {
      label: "Trident", kind: "other",
      pool: ["loyalty", "impaling", "riptide", "channeling", "unbreaking"],
    },
    fishing_rod: {
      label: "Fishing rod", kind: "other",
      pool: ["luck_of_the_sea", "lure", "unbreaking"],
    },
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
  const cache = new Map();

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  // Triangular CDF for u1 + u2, used to integrate the 0.85..1.15 modifier
  // exactly instead of rounding a sampled float.
  function triangularCdf(s) {
    if (s <= 0) return 0;
    if (s >= 2) return 1;
    return s <= 1 ? (s * s) / 2 : 1 - ((2 - s) * (2 - s)) / 2;
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

  // The three slots use the vanilla base roll and its slot transforms.
  function offerDistribution(shelves, slot) {
    const b = clamp(Math.round(shelves), 0, 15);
    const out = new Map();
    let total = 0;
    for (let r1 = 1; r1 <= 8; r1++) {
      for (let r2 = 0; r2 <= b; r2++) {
        const base = r1 + Math.floor(b / 2) + r2;
        let level;
        if (slot === 0) level = Math.max(Math.floor(base / 3), 1);
        else if (slot === 1) level = Math.floor((base * 2) / 3) + 1;
        else level = Math.max(base, b * 2);
        out.set(level, (out.get(level) || 0) + 1);
        total++;
      }
    }
    for (const [level, n] of out) out.set(level, n / total);
    return out;
  }

  function offers(shelves) {
    const b = clamp(Math.round(shelves), 0, 15);
    return SLOT_NAMES.map((name, slot) => {
      const levels = offerDistribution(b, slot);
      const values = Array.from(levels.keys()).sort((a, c) => a - c);
      return {
        slot,
        name,
        min: values[0],
        max: values[values.length - 1],
        levels: values,
        probability: levels,
        lapis: SLOT_COSTS[slot],
        levelsSpent: SLOT_COSTS[slot],
      };
    });
  }

  // Enchantability adds two triangular rolls, then the 0.85..1.15 multiplier
  // is integrated over each possible rounded result. This is the exact
  // distribution of the first step of the vanilla algorithm.
  function modifiedDistribution(level, enchantabilityValue) {
    const n = Math.floor(enchantabilityValue / 4) + 1;
    const out = new Map();
    for (let a = 0; a < n; a++) {
      for (let c = 0; c < n; c++) {
        const k = level + 1 + a + c;
        const p = 1 / (n * n);
        const lo = Math.ceil(k * 0.85);
        const hi = Math.floor(k * 1.15);
        for (let v = lo; v <= hi; v++) {
          const sLo = ((v - 0.5) / k - 0.85) / 0.15;
          const sHi = ((v + 0.5) / k - 0.85) / 0.15;
          const q = triangularCdf(Math.min(2, sHi)) - triangularCdf(Math.max(0, sLo));
          if (q > 0) out.set(v, (out.get(v) || 0) + p * q);
        }
      }
    }
    let sum = 0;
    for (const p of out.values()) sum += p;
    for (const [v, p] of out) out.set(v, p / (sum || 1));
    return out;
  }

  function tierAt(enchantmentId, modifiedLevel) {
    const tiers = ENCHANTMENTS[enchantmentId].tiers;
    let best = 0;
    for (let i = 0; i < tiers.length; i++) {
      if (modifiedLevel >= tiers[i][0] && modifiedLevel <= tiers[i][1]) best = i + 1;
    }
    return best;
  }

  function availableAt(itemId, modifiedLevel) {
    return ITEMS[itemId].pool
      .map((id) => ({ id, level: tierAt(id, modifiedLevel), weight: ENCHANTMENTS[id].weight }))
      .filter((entry) => entry.level > 0);
  }

  // Walk every possible pick sequence. The first pick is guaranteed; each
  // further pick continues with probability (level + 1) / 50, halves the
  // level for the next roll, and removes the chosen enchantment and its
  // conflicts. The result is exact for a single table roll.
  function outcomeAt(itemId, modifiedLevel) {
    const key = itemId + ":" + modifiedLevel;
    const hit = cache.get(key);
    if (hit) return hit;

    const pAppear = Object.create(null);
    const maxTier = Object.create(null);

    function walk(list, level, probability) {
      if (!list.length) return;
      let total = 0;
      for (const entry of list) total += entry.weight;
      for (const entry of list) {
        const p = probability * (entry.weight / total);
        pAppear[entry.id] = (pAppear[entry.id] || 0) + p;
        if (entry.level > (maxTier[entry.id] || 0)) maxTier[entry.id] = entry.level;
        const nextLevel = Math.floor(level / 2);
        const continueChance = clamp((level + 1) / 50, 0, 1);
        if (continueChance > 0) {
          const blocked = new Set([entry.id].concat(ENCHANTMENTS[entry.id].conflicts));
          walk(list.filter((candidate) => !blocked.has(candidate.id)), nextLevel, p * continueChance);
        }
      }
    }

    walk(availableAt(itemId, modifiedLevel), modifiedLevel, 1);
    const result = { pAppear, maxTier };
    cache.set(key, result);
    return result;
  }

  // Weighted odds for one slot across the random offer level. The result is
  // the chance an enchantment appears anywhere in that roll, not a prediction
  // of a particular seed.
  function odds(itemId, materialId, shelves, slot) {
    const key = [itemId, materialId, shelves, slot].join("|");
    const hit = cache.get(key);
    if (hit) return hit;

    const levels = offerDistribution(shelves, slot);
    const e = enchantability(itemId, materialId);
    const pTotal = Object.create(null);
    const tierMax = Object.create(null);

    for (const [level, pLevel] of levels) {
      for (const [modified, pModified] of modifiedDistribution(level, e)) {
        const outcome = outcomeAt(itemId, modified);
        const weight = pLevel * pModified;
        for (const id in outcome.pAppear) {
          pTotal[id] = (pTotal[id] || 0) + outcome.pAppear[id] * weight;
        }
        for (const id in outcome.maxTier) {
          if (outcome.maxTier[id] > (tierMax[id] || 0)) tierMax[id] = outcome.maxTier[id];
        }
      }
    }

    const result = Object.keys(pTotal)
      .filter((id) => pTotal[id] > 1e-9)
      .map((id) => ({
        id,
        label: ENCHANTMENTS[id].label,
        chance: clamp(pTotal[id], 0, 1),
        maxLevel: tierMax[id] || 1,
      }))
      .sort((a, c) => c.chance - a.chance || a.label.localeCompare(c.label));

    cache.set(key, result);
    return result;
  }

  const API = {
    ENCHANTMENTS,
    ITEMS,
    MATERIALS,
    SLOT_NAMES,
    SLOT_COSTS,
    itemMaterials,
    enchantability,
    offers,
    odds,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (global) global.SeedMapEnchant = API;
})(typeof window !== "undefined" ? window : globalThis);
