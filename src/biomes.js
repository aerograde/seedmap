/* Biome names and the colours the map paints for them. */
(function (global) {
  "use strict";

  // [display name, colour]. IDs follow cubiomes' 1.21 biome registry order.
  const BIOMES = {
    0: ["Ocean", "#2c6a86"],
    1: ["Plains", "#9cba69"],
    2: ["Desert", "#e3cd94"],
    3: ["Windswept Hills", "#8f9a91"],
    4: ["Forest", "#5b8d52"],
    5: ["Taiga", "#4a7b66"],
    6: ["Swamp", "#5e7452"],
    7: ["River", "#3a8098"],
    10: ["Frozen Ocean", "#3d6f7e"],
    11: ["Frozen River", "#b9d3d4"],
    12: ["Snowy Plains", "#eef3ee"],
    14: ["Mushroom Fields", "#b9a8a3"],
    16: ["Beach", "#dccda3"],
    21: ["Jungle", "#2f8045"],
    23: ["Sparse Jungle", "#679553"],
    24: ["Deep Ocean", "#1d4a63"],
    25: ["Stony Shore", "#98a29b"],
    26: ["Snowy Beach", "#eaebe1"],
    27: ["Birch Forest", "#9ab377"],
    29: ["Dark Forest", "#386249"],
    30: ["Snowy Taiga", "#b6c9bd"],
    32: ["Old Growth Pine Taiga", "#46705c"],
    34: ["Windswept Forest", "#6f8f76"],
    35: ["Savanna", "#c8b874"],
    36: ["Savanna Plateau", "#bfae6a"],
    37: ["Badlands", "#bc8158"],
    38: ["Wooded Badlands", "#a3785a"],
    44: ["Warm Ocean", "#2f8b93"],
    45: ["Lukewarm Ocean", "#2f7c8a"],
    46: ["Cold Ocean", "#2f6880"],
    48: ["Deep Lukewarm Ocean", "#276572"],
    49: ["Deep Cold Ocean", "#244f5f"],
    50: ["Deep Frozen Ocean", "#2e5866"],
    129: ["Sunflower Plains", "#b7c276"],
    131: ["Windswept Gravelly Hills", "#87938b"],
    132: ["Flower Forest", "#85a96b"],
    140: ["Ice Spikes", "#dcecee"],
    155: ["Old Growth Birch Forest", "#8aa46f"],
    160: ["Old Growth Spruce Taiga", "#406854"],
    163: ["Windswept Savanna", "#b7ab6a"],
    165: ["Eroded Badlands", "#b06f52"],
    168: ["Bamboo Jungle", "#7fa257"],
    174: ["Dripstone Caves", "#9a8270"],
    175: ["Lush Caves", "#5c8b5c"],
    177: ["Meadow", "#93b573"],
    178: ["Grove", "#9bbcab"],
    179: ["Snowy Slopes", "#e4ebe7"],
    180: ["Jagged Peaks", "#bccac8"],
    181: ["Frozen Peaks", "#f2f7f5"],
    182: ["Stony Peaks", "#a8b1aa"],
    183: ["Deep Dark", "#2e323a"],
    184: ["Mangrove Swamp", "#4d7058"],
    185: ["Cherry Grove", "#edc3d0"],
    186: ["Pale Garden", "#b0bdb2"],
  };
  const FALLBACK = ["Unknown", "#5b6660"];

  // Every painted biome colour resolves to one of these entries. Families
  // whose members share a visually coherent palette are shown as a strip of
  // their exact colours; colours that do not fit a family get their own entry.
  const GROUPS = [
    ["Ocean", [0, 7, 10, 44, 45, 46]],
    ["Deep ocean", [24, 48, 49, 50]],
    ["Shore", [16, 25, 26]],
    ["Plains", [1, 129, 177]],
    ["Savanna", [35, 36, 163]],
    ["Forest", [4, 27, 29, 34, 132, 155, 175]],
    ["Cherry Grove", [185]],
    ["Taiga", [5, 30, 32, 160, 178]],
    ["Jungle", [21, 23, 168]],
    ["Swamp", [6, 184]],
    ["Mushroom Fields", [14]],
    ["Desert", [2]],
    ["Badlands", [37, 38, 165]],
    ["Snow", [11, 12, 140, 179, 181]],
    ["Peaks", [3, 131, 180, 182]],
    ["Dripstone Caves", [174]],
    ["Deep Dark", [183]],
    ["Pale Garden", [186]],
    ["Unknown", null],
  ];

  function colour(id) {
    return (BIOMES[id] || FALLBACK)[1];
  }

  function name(id) {
    return (BIOMES[id] || FALLBACK)[0];
  }

  global.SeedMapBiomes = { BIOMES, FALLBACK, GROUPS, colour, name };
})(typeof window !== "undefined" ? window : globalThis);
