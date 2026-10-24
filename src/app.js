/* Seedmap application — no dependencies, no network. */
(function () {
  "use strict";

  const E = window.SeedMapEngine;
  const XHTML = "http://www.w3.org/1999/xhtml";
  const SVGNS = "http://www.w3.org/2000/svg";
  const MIN_SCALE = 0.22;
  const MAX_SCALE = 8;
  const TILE_CELLS = 64;
  const PREVIEW_CELLS = 16;
  const PREVIEW_FACTOR = 4;
  const CELL_TARGET = 6;
  const TILE_BUDGET_MS = 7;
  const STRUCT_BUDGET_MS = 4;
  const DENSE_CELL = 256;
  const DENSE_BUDGET_MS = 2.0;
  const TAU = Math.PI * 2;
  const FONT_SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  /* ------------------------------------------------------------- biomes */

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
  const BIOME_FALLBACK = ["Unknown", "#5b6660"];

  // Every painted biome colour resolves to one of these entries. Families
  // whose members share a visually coherent palette are shown as a strip of
  // their exact colours; colours that do not fit a family get their own entry.
  const BIOME_GROUPS = [
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

  /* ---------------------------------------------------------- elevation */

  // The diorama uses the density zero-crossing from the same climate sample
  // as the biome. It is an approximate surface, not a block-exact terrain or
  // structure Y coordinate; water columns are flattened to sea level.
  const SEA = 63;
  const WATER_IDS = new Set([0, 7, 10, 11, 24, 44, 45, 46, 48, 49, 50]);

  const BIOME_RGB = {};
  for (const [id, biome] of Object.entries(BIOMES)) {
    const hex = biome[1].slice(1);
    BIOME_RGB[id] = [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }

  let heightSeed = 0;

  function hash2(x, z) {
    let h = Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(z | 0, 0x27d4eb2d) ^ heightSeed;
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  function valueNoise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx);
    const v = fz * fz * (3 - 2 * fz);
    const a = hash2(ix, iz), b = hash2(ix + 1, iz);
    const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
    const ab = a + (b - a) * u;
    const cd = c + (d - c) * u;
    return (ab + (cd - ab) * v) * 2 - 1;
  }

  function fbm(x, z, octaves) {
    let sum = 0, amp = 0.55, norm = 0, freq = 1;
    for (let i = 0; i < octaves; i++) {
      sum += valueNoise(x * freq, z * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / (norm || 1);
  }

  function heightForSample(id, raw) {
    // The sea is one flat plane and land always sits a little above it; that
    // gives a clean shoreline instead of a field of small pits and ridges.
    if (WATER_IDS.has(id)) return SEA;
    return Math.max(SEA + 0.9, clamp(raw, 4, 200));
  }

  function heightAtBlock(x, z) {
    if (!state.world) return SEA;
    const s = state.world.surfaceAtBlock(Math.round(x), Math.round(z));
    return heightForSample(s.biome, s.height);
  }

  // The relief is a tinted model, not a flat map: biome colours are pulled
  // toward each other, warmed by the key light and cooled in shadow. Rock and
  // snow are mixed in by height and steepness so peaks stop reading as white
  // stickers on green ground.
  const ROCK_RGB = [121, 115, 102];
  const SNOW_RGB = [235, 235, 225];
  const HAZE_RGB = [94, 108, 100];
  const SEA_RGB = [40, 86, 104];
  const SHALLOW_RGB = [70, 124, 134];
  const RELIEF_RGB = {};
  for (const id of Object.keys(BIOME_RGB)) {
    const c = BIOME_RGB[id];
    const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
    RELIEF_RGB[id] = [
      (l + (c[0] - l) * 0.94) * 1.06 + 4,
      (l + (c[1] - l) * 0.94) * 1.06 + 4,
      (l + (c[2] - l) * 0.94) * 1.06 + 1,
    ];
  }

  function smoothstep(a, b, v) {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function reliefColor(id, h, east, south, shadow, fog, col, row, x, z, coast) {
    let r, g, b;
    const dither = hash2(col * 3 + 11, row * 7 + 5) - 0.5;
    if (WATER_IDS.has(id)) {
      const shallow = coast ? 1 : 0;
      const wave = Math.sin(x * 0.013 + z * 0.021) * 0.5 +
        Math.sin(x * 0.037 - z * 0.014) * 0.5;
      const lift = 1 + wave * 0.035 + dither * 0.03;
      r = (SEA_RGB[0] + (SHALLOW_RGB[0] - SEA_RGB[0]) * shallow * 0.55) * lift;
      g = (SEA_RGB[1] + (SHALLOW_RGB[1] - SEA_RGB[1]) * shallow * 0.55) * lift;
      b = (SEA_RGB[2] + (SHALLOW_RGB[2] - SEA_RGB[2]) * shallow * 0.55) * lift;
    } else {
      const base = RELIEF_RGB[id] || [91, 102, 96];
      const steep = Math.min(1, (Math.abs(east) + Math.abs(south)) * 0.55);
      const rock = Math.min(0.5,
        Math.max(0, (h - 92) / 60) * 0.44 + steep * 0.16);
      const snow = smoothstep(122, 152, h) * (0.9 + dither * 0.1);
      r = base[0];
      g = base[1];
      b = base[2];
      r += (ROCK_RGB[0] - r) * rock;
      g += (ROCK_RGB[1] - g) * rock;
      b += (ROCK_RGB[2] - b) * rock;
      r += (SNOW_RGB[0] - r) * snow;
      g += (SNOW_RGB[1] - g) * snow;
      b += (SNOW_RGB[2] - b) * snow;

      // Key light from the upper right, cool fill in the lee. The positive
      // south term lifts the faces the camera can actually see.
      const sun = clamp(1.08 - east * 1.05 - south * 0.5, 0.55, 1.4);
      r = r * sun + (sun > 1 ? (sun - 1) * 52 : (1 - sun) * -7);
      g = g * sun + (sun > 1 ? (sun - 1) * 40 : (1 - sun) * 1);
      b = b * sun + (sun > 1 ? (sun - 1) * 18 : (1 - sun) * 10);
    }
    const shade = 1 - 0.22 * shadow;
    const f = fog || 0;
    r = r * shade * (1 - f) + HAZE_RGB[0] * f - shadow * 7;
    g = g * shade * (1 - f) + HAZE_RGB[1] * f;
    b = b * shade * (1 - f) + HAZE_RGB[2] * f + shadow * 6;
    return "rgb(" +
      clamp(r | 0, 0, 255) + "," +
      clamp(g | 0, 0, 255) + "," +
      clamp(b | 0, 0, 255) + ")";
  }

  /* ---------------------------------------------------------- structures */

  // 16x16 pixel icons. One shared pixel grid keeps the key, the map, the
  // diorama and the hover cards in the same visual language, and every
  // structure gets a distinct silhouette rather than a letter.
  const ICON_PALETTE = {
    K: "#241c13", w: "#9a6a3a", d: "#6b4522", r: "#b34a33", R: "#d2654a",
    s: "#9a9a92", S: "#c9c9be", n: "#5f5f59", g: "#5f8f3f", G: "#7fae53",
    a: "#d9c283", A: "#b39a55", b: "#3f7fa6", B: "#6aa8c8", o: "#c98f2e",
    O: "#e8bd58", p: "#6b4a8a", P: "#9a72b8", t: "#3f8f8a", T: "#74b8b0",
    x: "#efe7d4", e: "#5fc98a", c: "#a85c36", C: "#d08a55", q: "#2e2a36", Q: "#4c4350", h: "#4c5148", y: "#f0d27a",
  };

  const ICONS = {
    village: [
      "................",
      "..........KK....",
      ".........KddK...",
      "........KKddK...",
      ".....KKKKKKKK...",
      "....KRRRRRRRRK..",
      "...KRRRRRRRRRRK.",
      "..KRRRRRRRRRRRRK",
      "..KKKKKKKKKKKKKK",
      "..KwwwwwwwwwwwwK",
      "..KwwKKKKwwKKwwK",
      "..KwwKddKwwKKwwK",
      "..KwwKKKKwwKKwwK",
      "..KwwwwKKwwwwwwK",
      "..KwwwwKKwwwwwwK",
      "..KKKKKKKKKKKKKK",
    ],
    monument: [
      "................",
      "................",
      ".......KK.......",
      "......KttK......",
      ".....KttttK.....",
      "....KttttttK....",
      "...KtTTTTTTtK...",
      "..KttKKKKKKttK..",
      "..KtTKKKKKKTtK..",
      "..KtTKKKKKKTtK..",
      "..KttKKKKKKttK..",
      "..KttttttttttK..",
      ".KKKKKKKKKKKKKK.",
      ".BbbbbbbbbbbbbB.",
      ".bBbBbBbBbBbBbB.",
      "................",
    ],
    outpost: [
      "................",
      "..........KKK...",
      ".........KrrrK..",
      "..........KKK...",
      ".......KKKKKK...",
      ".......KwwwwK...",
      ".......KwKKwK...",
      ".......KwwwwK...",
      ".......KwKKwK...",
      ".......KwwwwK...",
      ".......KwwwwK...",
      "......KKKKKKKK..",
      ".....KwwK..KwwK.",
      ".....KwwK..KwwK.",
      "......KK....KK..",
      "................",
    ],
    mansion: [
      "................",
      "....KKK..KKK....",
      "...KhhhKKhhhK...",
      "..KhhhhKhhhhhK..",
      "..KKKKKKKKKKKK..",
      "..KsssssssssssK.",
      "..KsKKssssKKssK.",
      "..KsKyKssKyKssK.",
      "..KsKKssssKKssK.",
      ".KKKKKKKKKKKKKK.",
      ".KwwwwwwwwwwwwK.",
      ".KwwKKwwwwKKwwK.",
      ".KwwKKwwwwKKwwK.",
      ".KwwwwwwwwwwwwK.",
      ".KKKKKKKKKKKKKK.",
      "................",
    ],
    ancient: [
      "................",
      "...KK......KK...",
      "..KttK....KttK..",
      "..KtTTK..KTTtK..",
      "...KtTTKKTTtK...",
      "....KtTTTTtK....",
      "...KttKKKKttK...",
      "..KtTKKKKKKTtK..",
      "..KtTKKeeKKTtK..",
      "..KttKeeeeKttK..",
      "...KttKKKKttK...",
      "..KtTTK..KTTtK..",
      "...KKK....KKK...",
      "................",
      "................",
      "................",
    ],
    trial: [
      "................",
      "....KKKKKKKK....",
      "...KttttttttK...",
      "...KtTTTTTTtK...",
      "...KtKKKKKKtK...",
      "...KtKccccKtK...",
      "...KtKcCCcKtK...",
      "...KtKcCCcKtK...",
      "...KtKccccKtK...",
      "...KtKKKKKKtK...",
      "...KtTTTTTTtK...",
      "...KttttttttK...",
      "....KKKKKKKK....",
      "................",
      "................",
      "................",
    ],
    pyramid: [
      "................",
      "................",
      ".....KKKKKK.....",
      "....KaaaaaaK....",
      "....KKKKKKKK....",
      "...KaaaaaaaaK...",
      "...KKKKKKKKKK...",
      "..KaaaaaaaaaaK..",
      "..KKKKKKKKKKKK..",
      ".KaaaaaaaaaaaaK.",
      ".KKKKKKKKKKKKKK.",
      ".KAAAAKKKKAAAAK.",
      ".KAAAAKddKAAAAK.",
      ".KKKKKKKKKKKKKK.",
      "................",
      "................",
    ],
    temple: [
      "................",
      "....KKKKKKKK....",
      "...KggggggggK...",
      "...KgKKKKKKgK...",
      "..KggKGGGGKggK..",
      "..KggKGKKGKggK..",
      "..KggKGGGGKggK..",
      "..KKKKKKKKKKKK..",
      ".KssssssssssssK.",
      ".KsKKKKKKKKKKsK.",
      ".KsKggggggggKsK.",
      ".KsKggKKKKggKsK.",
      ".KKKKKKKKKKKKKK.",
      "..g..g....g..g..",
      "................",
      "................",
    ],
    hut: [
      "................",
      ".....KKKKKK.....",
      "....KddddddK....",
      "...KddddddddK...",
      "..KKKKKKKKKKKK..",
      "...KwwwwwwwwK...",
      "...KwKKKKKKwK...",
      "...KwwwwwwwwK...",
      "....KKKKKKKK....",
      ".....w....w.....",
      "....Kw....wK....",
      "....Kw....wK....",
      "....Kw....wK....",
      "...KKKK..KKKK...",
      "................",
      "................",
    ],
    igloo: [
      "................",
      "................",
      ".....KKKKKK.....",
      "....KxxxxxxK....",
      "...KxxxxxxxxK...",
      "..KxxxxxxxxxxK..",
      "..KxxxxxxxxxxK..",
      ".KxxxxxBBxxxxxK.",
      ".KxxxxKBBKxxxxK.",
      ".KxxxKBBBBKxxxK.",
      ".KKKKKKKKKKKKKK.",
      "..KBBBBBBBBBBK..",
      "..KBBBBBBBBBBK..",
      "..KKKKKKKKKKKK..",
      "................",
      "................",
    ],
    shipwreck: [
      "................",
      "................",
      "..........KK....",
      ".........KwwK...",
      "....KKKKKKwwK...",
      "...KwwwwwwwwK...",
      "..KwwwwwwwwK....",
      "..KKwwwwwwK.....",
      "...KKwwwwK......",
      ".....KwwK.......",
      "......KK........",
      ".bbbbbbbbbbbbbb.",
      ".bBbBbBbBbBbBbB.",
      ".BbbbbbbbbbbbbB.",
      "................",
      "................",
    ],
    ruin: [
      "................",
      "................",
      "...KKK....KKK...",
      "..KsssK..KsssK..",
      "..KsKsK..KsKsK..",
      "..KssssK.KssssK.",
      "...KKKK...KKKK..",
      "..KssssKKKssssK.",
      "..KsKKKsKsKKKsK.",
      "..KsssssKsssssK.",
      "..KKKKKKKKKKKKK.",
      ".bbbbbbbbbbbbbb.",
      ".BbbbbbbbbbbbbB.",
      "................",
      "................",
      "................",
    ],
    trail: [
      "................",
      ".....KK.KK......",
      "....KSsKSsK.....",
      "....KSssssK.....",
      "....KSccccK.....",
      "....KSSSSSSK....",
      "....KSccccSK....",
      "....KSSSSSSK....",
      "...KKSSSSSSKK...",
      "...KSSSSSSSSK...",
      "...KSccccccSK...",
      "...KKKKKKKKKK...",
      "..c..c..c..c....",
      "................",
      "................",
      "................",
    ],
    treasure: [
      "................",
      ".....K..K.......",
      "......KK........",
      ".....K..K.......",
      "..KKKKKKKKKK....",
      ".KwwwwwwwwwwK...",
      ".KwOOwOOwOOwK...",
      ".KwwwwwwwwwwK...",
      ".KKKKKKKKKKKK...",
      ".KwKKKKKKKKwK...",
      ".KwwwwwwwwwwK...",
      ".KKKKKKKKKKKK...",
      "..K........K....",
      "................",
      "................",
      "................",
    ],
    mineshaft: [
      "................",
      "....KKKKKKKK....",
      "....KwwwwwwK....",
      "....KwKKKKwK....",
      "....KwK..KwK....",
      "....KwK..KwK....",
      "....KwwwwwwK....",
      "..KKKKKKKKKKKK..",
      "..KnnnnnnnnnnK..",
      "..KKnnnnnnnnKK..",
      ".KKKKKKKKKKKKKK.",
      ".o..o..o..o..o..",
      "................",
      "................",
      "................",
      "................",
    ],
    portal: [
      "................",
      "..KKKKKKKKKKKK..",
      ".KqqqqqqqqqqqqK.",
      ".KqKKKKKKKKKKqK.",
      ".KqKppppppppKqK.",
      ".KqKpPPPPPPpKqK.",
      ".KqKpPPPPPPpKqK.",
      ".KqKpPPPPPPpKqK.",
      ".KqKpPPPPPPpKqK.",
      ".KqKpPPPPPPpKqK.",
      ".KqKppppppppKqK.",
      ".KqKKKKKKKKKKqK.",
      ".KqqqqqqqqqqqqK.",
      "..KKKKKKKKKKKK..",
      "................",
      "................",
    ],
    stronghold: [
      "................",
      "...KKKKKKKKKK...",
      "..KSSSSSSSSSSK..",
      ".KSSKKKKKKKKSSK.",
      ".KSKttttttttKSK.",
      ".KSKtKKKKKKtKSK.",
      ".KSKtKeeeeKtKSK.",
      ".KSKtKeeeeKtKSK.",
      ".KSKtKKKKKKtKSK.",
      ".KSKttttttttKSK.",
      ".KSSKKKKKKKKSSK.",
      "..KSSSSSSSSSSK..",
      "...KKKKKKKKKK...",
      "................",
      "................",
      "................",
    ],
  };
  const iconCache = new Map();

  // Every sprite is trimmed to its ink and fitted to the 16x16 box, so the
  // art reaches the edge of the slot instead of floating in transparent
  // padding. The fit keeps the silhouette's aspect ratio rather than
  // stretching it.
  function iconInk(rows) {
    let x0 = 16, y0 = 16, x1 = -1, y1 = -1;
    for (let y = 0; y < 16; y++) {
      const row = rows[y] || "";
      for (let x = 0; x < 16; x++) {
        if (!ICON_PALETTE[row[x]]) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  function iconCanvas(type, scale) {
    const key = type + "@" + scale;
    let c = iconCache.get(key);
    if (c) return c;
    const rows = ICONS[type] || ICONS.village;
    const ink = iconInk(rows);
    c = document.createElementNS(XHTML, "canvas");
    c.width = 16 * scale;
    c.height = 16 * scale;
    const g = c.getContext("2d");
    const fit = Math.min(16 / ink.w, 16 / ink.h);
    const w = Math.max(1, Math.round(ink.w * fit));
    const h = Math.max(1, Math.round(ink.h * fit));
    const ox = Math.floor((16 - w) / 2);
    const oy = Math.floor((16 - h) / 2);
    for (let y = 0; y < h; y++) {
      const row = rows[ink.y + Math.min(ink.h - 1, Math.floor(y * ink.h / h))] || "";
      for (let x = 0; x < w; x++) {
        const sx = ink.x + Math.min(ink.w - 1, Math.floor(x * ink.w / w));
        const colour = ICON_PALETTE[row[sx]];
        if (!colour) continue;
        g.fillStyle = colour;
        g.fillRect((ox + x) * scale, (oy + y) * scale, scale, scale);
      }
    }
    c.style.width = "16px";
    c.style.height = "16px";
    c.style.imageRendering = "pixelated";
    iconCache.set(key, c);
    return c;
  }

  function iconNode(type, size) {
    const c = iconCanvas(type, 2);
    c.style.width = size + "px";
    c.style.height = size + "px";
    return c;
  }

  const KEY_ORDER = [
    "village", "monument", "outpost", "mansion", "ancient", "trial",
    "pyramid", "temple", "hut", "igloo", "shipwreck", "ruin",
    "trail", "treasure", "mineshaft", "portal", "stronghold",
  ];

  const STRUCT_META = {};
  for (const s of E.STRUCTURES) STRUCT_META[s.key] = s;

  const LABELS = {
    village: "Village",
    monument: "Monument",
    outpost: "Outpost",
    mansion: "Mansion",
    pyramid: "Desert pyramid",
    temple: "Jungle temple",
    hut: "Swamp hut",
    igloo: "Igloo",
    shipwreck: "Shipwreck",
    ruin: "Ocean ruin",
    portal: "Ruined portal",
    ancient: "Ancient city",
    trail: "Trail ruins",
    trial: "Trial chambers",
    treasure: "Buried treasure",
    mineshaft: "Mineshaft",
    stronghold: "Stronghold",
  };

  const DENSE_TYPES = E.STRUCTURES.filter((s) => s.dense);
  const VALID_TYPES = E.STRUCTURES.filter((s) => !s.dense && s.key !== "stronghold");

  /* --------------------------------------------------------------- state */

  const state = {
    mapShown: false,
    mode: "map",
    world: null,
    seedText: "",
    seed: null,
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
    lastInteractive: 0,
    lastReadout: 0,
    lastBiome: null,
    lastCoords: "",
    dpr: 1,
    vw: 0,
    vh: 0,
    hintTimer: 0,
    hintCount: 0,
    strongholdJob: null,
    strongholdTimer: 0,
    press: null,
    suppressClick: false,
    measure: { active: false, points: [] },
    dioramaTimer: 0,
    dioramaDirty: false,
  };

  const tiles = new Map();
  const visibleTiles = [];
  let currentStep = 0;
  let tileSerial = 0;

  const struct = {
    region: new Map(),
    known: [],
    seen: new Set(),
    queue: [],
    queued: new Set(),
    enumerated: null,
    processCursor: 0,
  };

  // Treasure and mineshafts are per-chunk. They are generated in coarse
  // cells so the sparse region queue never attempts one job per chunk.
  const dense = {
    done: new Set(),
    queue: [],
    queued: new Set(),
    enumerated: null,
  };

  const screenMarkers = [];

  let canvas = null;
  let ctx = null;
  let rootEl = null;
  let homeEl = null;
  let mapUiEl = null;
  let seedInput = null;
  let seedForm = null;
  let seedOut = null;
  let coordsEl = null;
  let biomeLineEl = null;
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
  let toolsEl = null;
  let mapBtn = null;
  let dioramaBtn = null;
  let measureBtn = null;
  let measureClear = null;
  let measurePanel = null;
  let measureCountEl = null;
  let measureTotalEl = null;
  let measureTimeEl = null;
  let measureRouteEl = null;

  /* ------------------------------------------------------------ dom utils */

  function el(tag, cls) {
    const n = document.createElementNS(XHTML, tag);
    if (cls) n.setAttribute("class", cls);
    return n;
  }

  function buildKey() {
    for (const type of KEY_ORDER) {
      const item = el("div", "key-item");
      const icon = el("span", "key-icon");
      icon.appendChild(iconNode(type, 16));
      const label = el("span");
      label.textContent = LABELS[type];
      item.appendChild(icon);
      item.appendChild(label);
      keyGridEl.appendChild(item);
    }
    for (const [name, ids] of BIOME_GROUPS) {
      const colours = ids
        ? ids.map((id) => BIOMES[id][1])
        : [BIOME_FALLBACK[1]];
      const item = el("span", "biome-key");
      const swatches = el("span", "biome-swatches");
      for (const colour of colours) {
        const sw = el("i");
        sw.style.background = colour;
        swatches.appendChild(sw);
      }
      item.appendChild(swatches);
      const label = el("span", "biome-name");
      label.textContent = name;
      item.appendChild(label);
      biomeGridEl.appendChild(item);
    }
  }

  /* -------------------------------------------------------------- world */

  function resetWorldData() {
    tiles.clear();
    visibleTiles.length = 0;
    struct.region.clear();
    struct.known.length = 0;
    struct.seen.clear();
    struct.queue.length = 0;
    struct.queued.clear();
    struct.enumerated = null;
    struct.processCursor = 0;
    dense.done.clear();
    dense.queue.length = 0;
    dense.queued.clear();
    dense.enumerated = null;
    screenMarkers.length = 0;
    state.hoverMarker = null;
    state.strongholdJob = null;
    clearTimeout(state.strongholdTimer);
    state.strongholdTimer = 0;
    clearTimeout(state.dioramaTimer);
    state.dioramaTimer = 0;
    diorama.grid = null;
    currentStep = 0;
  }

  function prepareWorld(parsed) {
    if (state.world && state.world.seed === parsed.seed) return;
    resetWorldData();
    state.world = new E.World(parsed.text, parsed.seed);
    state.seed = parsed.seed;
    state.seedText = parsed.text;
    heightSeed = Number(BigInt.asIntN(32, parsed.seed));
    seedOut.textContent = parsed.text;
    // Strongholds require a 112-block biome search each. Generate one per
    // timer turn so the map can draw and stay interactive while they arrive.
    state.strongholdJob = state.world.strongholdIterator(128);
  }

  function addStructure(type, x, z) {
    const key = type + ":" + x + ":" + z;
    if (struct.seen.has(key)) return false;
    struct.seen.add(key);
    struct.known.push({ type, x, z });
    return true;
  }

  function pumpStrongholds() {
    state.strongholdTimer = 0;
    const job = state.strongholdJob;
    if (!state.mapShown || !job) return;
    let step = null;
    try {
      // Advance only a few scan rows at a time; one stronghold's 57x57
      // biome search is too long to block a frame.
      step = job.advance(12);
    } catch (err) {
      state.strongholdJob = null;
      console.error(err);
      return;
    }
    if (step.pos) {
      addStructure("stronghold", step.pos.x, step.pos.z);
      state.dirty = true;
    }
    if (job.remaining > 0) {
      state.strongholdTimer = setTimeout(pumpStrongholds, 0);
    } else {
      state.strongholdJob = null;
    }
  }

  /* ------------------------------------------------------- camera helpers */

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function screenToWorld(sx, sy, cam) {
    const c = cam || state.cam;
    return {
      x: c.x + (sx - state.vw / 2) / c.s,
      z: c.z + (sy - state.vh / 2) / c.s,
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

  /* ------------------------------------------------------- diorama view */

  // An orthographic angled projection: tops and south faces, in the spirit
  // of a tabletop diorama. Height is exaggerated so relief reads at overview
  // zoom as well as close up.
  const TILT = 50 * Math.PI / 180;
  const COS_TILT = Math.cos(TILT);
  const SIN_TILT = Math.sin(TILT);
  const SLAB_W = 0.56;
  const SLAB_W_NARROW = 0.84;
  const SLAB_D = 0.5;
  const SLAB_D_NARROW = 0.46;
  const SLAB_BASE = -32;

  // A small horizontal skew turns the tilted plane into a three-quarter
  // diorama: the far edge shifts right, so both cut side faces are visible.
  function viewSkew() {
    return state.vw < 700 ? 0.06 : 0.18;
  }

  // On a phone the key owns the bottom third of the screen, so lift the model
  // to keep its cut face above the paper instead of behind it.
  function horizonY() {
    return state.vh * (state.vw < 700 ? 0.44 : 0.53);
  }

  // Vertical exaggeration is strongest at overview zoom and eases off close
  // up, where a constant 3× would throw small hills off the screen.
  function heightExaggeration(s) {
    return clamp(2.45 * Math.sqrt(0.55 / Math.max(s, 0.05)), 0.7, 3);
  }

  function projectWorld(x, z, h) {
    const s = state.cam.s;
    return {
      x: state.vw / 2 + (x - state.cam.x) * s +
        (z - state.cam.z) * s * viewSkew(),
      y: horizonY() + (z - state.cam.z) * s * COS_TILT -
        (h - SEA) * s * SIN_TILT * heightExaggeration(s),
    };
  }

  // Iteratively invert the projection against the surface. The first guess
  // uses sea level; two corrections settle on the terrain below the cursor.
  function screenToWorld3D(sx, sy, cam) {
    const c = cam || state.cam;
    const s = c.s;
    let z = c.z + (sy - horizonY()) / (s * COS_TILT);
    let x = c.x + (sx - state.vw / 2) / s - (z - c.z) * viewSkew();
    for (let i = 0; i < 3; i++) {
      const h = dioramaSurfaceAt(x, z);
      z = c.z +
        (sy - horizonY() + (h - SEA) * s * SIN_TILT * heightExaggeration(s)) /
        (s * COS_TILT);
      x = c.x + (sx - state.vw / 2) / s - (z - c.z) * viewSkew();
    }
    return { x, z };
  }

  function screenToWorldView(sx, sy) {
    return state.mode === "diorama" ? screenToWorld3D(sx, sy) : screenToWorld(sx, sy);
  }

  function dioramaGridSpec() {
    // Bake against the settled camera target so a rebuild that starts during
    // a zoom animation does not lock in an intermediate scale.
    const c = state.target;
    const s = c.s;
    // ~7 CSS px per cell gives the relief enough resolution to read without
    // making a single seed take seconds to bake.
    const gpx = clamp(Math.sqrt((state.vw * state.vh) / 26000), 5.5, 8.5);
    const narrow = state.vw < 700;
    const slabW = narrow ? SLAB_W_NARROW : SLAB_W;
    const slabD = narrow ? SLAB_D_NARROW : SLAB_D;
    const cols = clamp(Math.ceil((state.vw * slabW) / gpx), 48, 160);
    const rows = clamp(Math.ceil((state.vh * slabD) / gpx), 40, 130);
    // A finite slab floats in the sky, with sky above and around it. At the
    // front edge its cut face drops to a base, like a tabletop model.
    const width = (state.vw * slabW) / s;
    const depth = (state.vh * slabD) / (s * COS_TILT);
    const x0 = c.x - width / 2;
    const x1 = c.x + width / 2;
    const z0 = c.z - depth / 2;
    const z1 = c.z + depth / 2;
    return {
      x0, z0, cols, rows,
      stepX: (x1 - x0) / cols,
      stepZ: (z1 - z0) / rows,
    };
  }

  const diorama = { grid: null };

  function startDiorama() {
    if (!state.mapShown || state.mode !== "diorama" || !state.world) return;
    const spec = dioramaGridSpec();
    const n = spec.cols * spec.rows;
    state.dioramaDirty = false;
    diorama.grid = {
      ...spec,
      total: n,
      done: 0,
      biome: new Uint8Array(n),
      height: new Float32Array(n),
      shadow: new Float32Array(n),
      shadowReady: false,
    };
    state.dirty = true;
  }

  function scheduleDiorama() {
    if (!state.mapShown || state.mode !== "diorama") return;
    // Rebuild only after the camera settles; rebuilding mid-zoom would bake
    // the old scale into the slab and make it swim on screen.
    state.dioramaDirty = true;
  }

  function generateDiorama() {
    const g = diorama.grid;
    if (!g || !state.world || g.done >= g.total) return false;
    const deadline = performance.now() + 5.5;
    let changed = false;
    while (g.done < g.total && performance.now() < deadline) {
      const i = g.done++;
      const col = i % g.cols;
      const row = (i - col) / g.cols;
      const x = g.x0 + (col + 0.5) * g.stepX;
      const z = g.z0 + (row + 0.5) * g.stepZ;
      const s = state.world.surfaceAtBlock(x, z);
      g.biome[i] = s.biome;
      g.height[i] = heightForSample(s.biome, s.height);
      changed = true;
    }
    if (changed) state.dirty = true;
    if (g.done >= g.total && !g.shadowReady) {
      smoothDiorama(g);
      computeDioramaShadows(g);
    }
    return changed;
  }

  // One cell of noise can put a needle in the middle of a meadow. A light
  // separable 3x3 blur settles those needles into slopes while the sea stays
  // perfectly flat; the coasts keep their step because water is pinned.
  function smoothDiorama(g) {
    const n = g.total;
    const tmp = new Float32Array(n);
    for (let pass = 0; pass < 4; pass++) {
      for (let row = 0; row < g.rows; row++) {
        const base = row * g.cols;
        for (let col = 0; col < g.cols; col++) {
          const i = base + col;
          if (WATER_IDS.has(g.biome[i])) { tmp[i] = SEA; continue; }
          const a = col > 0 ? g.height[i - 1] : g.height[i];
          const b = col < g.cols - 1 ? g.height[i + 1] : g.height[i];
          tmp[i] = (a + 2 * g.height[i] + b) * 0.25;
        }
      }
      for (let row = 0; row < g.rows; row++) {
        const base = row * g.cols;
        for (let col = 0; col < g.cols; col++) {
          const i = base + col;
          if (WATER_IDS.has(g.biome[i])) { g.height[i] = SEA; continue; }
          const a = row > 0 ? tmp[i - g.cols] : tmp[i];
          const b = row < g.rows - 1 ? tmp[i + g.cols] : tmp[i];
          g.height[i] = Math.max(SEA + 0.9, (a + 2 * tmp[i] + b) * 0.25);
        }
      }
    }
  }

  // A low sun from the northwest casts long shadows across the heightfield.
  // This is screen-space-free: it reads the same world grid and only darkens
  // cells whose ray toward the sun is blocked by higher ground.
  function computeDioramaShadows(g) {
    const reach = 10;
    const step = (g.stepX + g.stepZ) * 0.5;
    const hard = new Float32Array(g.total);
    for (let row = 0; row < g.rows; row++) {
      for (let col = 0; col < g.cols; col++) {
        const i = row * g.cols + col;
        const h = g.height[i];
        let blocked = 0;
        for (let k = 1; k <= reach; k++) {
          const c = col - k;
          const r = row - k;
          if (c < 0 || r < 0) break;
          const j = r * g.cols + c;
          if (g.height[j] - h > k * step * 0.42) { blocked = 1; break; }
        }
        hard[i] = blocked;
      }
    }
    // Soften the mask so the shadow edge is a dip in the light rather than a
    // staircase of whole cells.
    for (let row = 0; row < g.rows; row++) {
      for (let col = 0; col < g.cols; col++) {
        let sum = 0, count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          const r = row + dr;
          if (r < 0 || r >= g.rows) continue;
          for (let dc = -1; dc <= 1; dc++) {
            const c = col + dc;
            if (c < 0 || c >= g.cols) continue;
            sum += hard[r * g.cols + c];
            count++;
          }
        }
        g.shadow[row * g.cols + col] = sum / Math.max(1, count);
      }
    }
    g.shadowReady = true;
  }

  /* ------------------------------------------------------------------ uv */

  function resize() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.min(2, window.devicePixelRatio || 1);
    state.vw = Math.max(1, rect.width);
    state.vh = Math.max(1, rect.height);
    canvas.width = Math.max(1, Math.round(state.vw * state.dpr));
    canvas.height = Math.max(1, Math.round(state.vh * state.dpr));
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    state.dirty = true;
    if (state.mapShown && state.mode === "diorama") {
      // A new viewport invalidates the baked slab immediately; leaving the
      // old one stretched across the new aspect for a frame is exactly the
      // stale image the model must not show.
      if (!state.dragging && !state.pinch && state.pointers.size === 0) startDiorama();
      else scheduleDiorama();
    }
  }

  /* ------------------------------------------------------------- tiles */

  function stepForScale(scale) {
    const raw = Math.pow(2, Math.round(Math.log2(CELL_TARGET / scale)));
    // Never sample coarser than 16 blocks: at wide zoom this keeps coastlines
    // and rivers resolved instead of dissolving into single-biome confetti.
    // Cells simply get smaller on screen as the camera pulls back.
    return clamp(raw, 1, 16);
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
      id: ++tileSerial,
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

  function tileWorldRect(t) {
    return {
      x0: t.tx * t.blocks,
      z0: t.tz * t.blocks,
      x1: (t.tx + 1) * t.blocks,
      z1: (t.tz + 1) * t.blocks,
    };
  }

  function visibleWorldRect(padPx, scale) {
    const s = scale || state.cam.s;
    const pad = (padPx || 0) / s;
    const hw = state.vw / (2 * s) + pad;
    const hh = state.vh / (2 * s) + pad;
    return {
      x0: state.cam.x - hw, x1: state.cam.x + hw,
      z0: state.cam.z - hh, z1: state.cam.z + hh,
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
    const world = state.world;
    for (let col = 0; col < PREVIEW_CELLS; col++) {
      const wx = wxBase + col * step + (step >> 1);
      const id = world.biomeAtBlock(wx, wz);
      g.fillStyle = (BIOMES[id] || BIOME_FALLBACK)[1];
      g.fillRect(col, row, 1, 1);
    }
  }

  function fillTileRow(t, row) {
    const g = t.g;
    const step = t.step;
    const wzBase = t.tz * t.blocks + row * step;
    const wxBase = t.tx * t.blocks;
    const world = state.world;
    let runStart = 0;
    let runColour = null;
    for (let col = 0; col <= TILE_CELLS; col++) {
      let colour = runColour;
      if (col < TILE_CELLS) {
        const wx = wxBase + col * step + (step >> 1);
        const wz = wzBase + (step >> 1);
        const id = world.biomeAtBlock(wx, wz);
        const b = BIOMES[id] || BIOME_FALLBACK;
        colour = b[1];
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
    const step = stepForScale(state.cam.s);
    currentStep = step;
    const blocks = step * TILE_CELLS;
    const pad = 30 / state.cam.s;
    const rect = visibleWorldRect(30);
    const tx0 = Math.floor(rect.x0 / blocks);
    const tx1 = Math.floor(rect.x1 / blocks);
    const tz0 = Math.floor(rect.z0 / blocks);
    const tz1 = Math.floor(rect.z1 / blocks);
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
      const r = tileWorldRect(t);
      if (r.x1 < rect.x0 || r.x0 > rect.x1 || r.z1 < rect.z0 || r.z0 > rect.z1) continue;
      visibleTiles.push(t);
    }
    visibleTiles.sort((a, b) => {
      const ax = (a.tx + 0.5) * a.blocks - state.cam.x;
      const az = (a.tz + 0.5) * a.blocks - state.cam.z;
      const bx = (b.tx + 0.5) * b.blocks - state.cam.x;
      const bz = (b.tz + 0.5) * b.blocks - state.cam.z;
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

  function generateTiles(now) {
    const deadline = performance.now() + TILE_BUDGET_MS;
    let progressed = false;
    // Pass 1: previews for every visible tile.
    for (const t of visibleTiles) {
      while (t.prow < PREVIEW_CELLS) {
        fillPreviewRow(t, t.prow);
        t.prow++;
        progressed = true;
        if (performance.now() > deadline) break;
      }
      if (performance.now() > deadline) break;
    }
    // Pass 2: detailed rows, one per tile per sweep.
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
    if (progressed) state.dirty = true;
    return progressed;
  }

  function updateLoadBar() {
    let total = 0;
    let ready = 0;
    if (state.mode === "diorama") {
      const g = diorama.grid;
      if (g) { total = g.total; ready = g.done; }
    } else {
      for (const t of visibleTiles) {
        total += TILE_CELLS;
        ready += t.row;
      }
    }
    if (!total || !state.mapShown) {
      loadBarEl.classList.add("is-done");
      return;
    }
    const p = ready / total;
    loadFillEl.style.transform = "scaleX(" + p.toFixed(4) + ")";
    if (p >= 0.999) loadBarEl.classList.add("is-done");
    else loadBarEl.classList.remove("is-done");
  }

  /* --------------------------------------------------------- structures */

  function queueStructureRegion(type, rx, rz, cx, cz) {
    const key = type + "|" + rx + "|" + rz;
    if (struct.region.has(key) || struct.queued.has(key)) return;
    struct.queued.add(key);
    const size = STRUCT_META[type].spacing * 16;
    const x = (rx + 0.5) * size;
    const z = (rz + 0.5) * size;
    struct.queue.push({
      key, type, rx, rz,
      d: (x - cx) * (x - cx) + (z - cz) * (z - cz),
    });
  }

  function enumerateStructures() {
    if (!state.world) return;
    const rect = visibleWorldRect(180);
    const prev = struct.enumerated;
    if (prev &&
        rect.x0 > prev.x0 && rect.x1 < prev.x1 &&
        rect.z0 > prev.z0 && rect.z1 < prev.z1 &&
        rect.x1 - rect.x0 < (prev.x1 - prev.x0) * 0.92) {
      return;
    }
    const padX = (rect.x1 - rect.x0) * 0.4;
    const padZ = (rect.z1 - rect.z0) * 0.4;
    const ex = {
      x0: rect.x0 - padX, x1: rect.x1 + padX,
      z0: rect.z0 - padZ, z1: rect.z1 + padZ,
    };
    for (const st of VALID_TYPES) {
      const size = st.spacing * 16;
      const rx0 = Math.floor(ex.x0 / size) - 1;
      const rx1 = Math.floor(ex.x1 / size) + 1;
      const rz0 = Math.floor(ex.z0 / size) - 1;
      const rz1 = Math.floor(ex.z1 / size) + 1;
      for (let rz = rz0; rz <= rz1; rz++) {
        for (let rx = rx0; rx <= rx1; rx++) {
          queueStructureRegion(st.key, rx, rz, state.cam.x, state.cam.z);
        }
      }
    }
    if (struct.queue.length > 1) {
      struct.queue.sort((a, b) => a.d - b.d);
    }
    if (prev) {
      ex.x0 = Math.min(ex.x0, prev.x0); ex.x1 = Math.max(ex.x1, prev.x1);
      ex.z0 = Math.min(ex.z0, prev.z0); ex.z1 = Math.max(ex.z1, prev.z1);
    }
    struct.enumerated = ex;
  }

  function processStructures() {
    if (!state.world || !struct.queue.length) return false;
    const deadline = performance.now() + STRUCT_BUDGET_MS;
    let changed = false;
    while (struct.queue.length && performance.now() < deadline) {
      const job = struct.queue.shift();
      struct.queued.delete(job.key);
      let found = null;
      try {
        found = state.world.structureAt(job.type, job.rx, job.rz);
      } catch (err) {
        found = null;
      }
      struct.region.set(job.key, found);
      if (found && addStructure(job.type, found.x, found.z)) {
        changed = true;
      }
    }
    return changed;
  }

  function enumerateDenseStructures() {
    if (!state.world) return;
    const rect = visibleWorldRect(160);
    const cx0 = Math.floor(rect.x0 / DENSE_CELL);
    const cx1 = Math.floor(rect.x1 / DENSE_CELL);
    const cz0 = Math.floor(rect.z0 / DENSE_CELL);
    const cz1 = Math.floor(rect.z1 / DENSE_CELL);
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
          d: (mx - state.cam.x) * (mx - state.cam.x) +
             (mz - state.cam.z) * (mz - state.cam.z),
        });
      }
    }
    if (dense.queue.length > before + 1) {
      dense.queue.sort((a, b) => a.d - b.d);
    }
  }

  function processDenseStructures() {
    if (!state.world || !dense.queue.length) return false;
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

  /* ------------------------------------------------------------ measuring */

  function formatDuration(seconds) {
    const s = Math.max(1, Math.round(seconds));
    if (s < 60) return s + "s";
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m < 60) return r ? m + "m " + r + "s" : m + "m";
    const h = Math.floor(m / 60);
    return (m % 60) ? h + "h " + (m % 60) + "m" : h + "h";
  }

  function measureStats() {
    const pts = state.measure.points;
    const legs = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      legs.push(d);
      total += d;
    }
    return { total, legs };
  }

  function updateMeasureUI() {
    const pts = state.measure.points;
    const active = state.measure.active;
    measurePanel.hidden = !active && pts.length === 0;
    measureClear.hidden = pts.length === 0;
    measureBtn.classList.toggle("is-on", active);
    measureBtn.setAttribute("aria-pressed", active ? "true" : "false");
    rootEl.classList.toggle("measuring", active);
    if (!pts.length) {
      measureCountEl.textContent = "0 points";
      measureTotalEl.textContent = "—";
      measureTimeEl.textContent = "Click the map to place a point";
      measureRouteEl.textContent = "2 or more points show a route";
      return;
    }
    if (pts.length === 1) {
      measureCountEl.textContent = "1 point";
      measureTotalEl.textContent = "—";
      measureTimeEl.textContent = "Place a second point to measure";
      measureRouteEl.textContent = formatInt(pts[0].x) + ", " + formatInt(pts[0].z);
      return;
    }
    const stats = measureStats();
    const walk = stats.total / 4.317;
    const sprint = stats.total / 5.612;
    measureCountEl.textContent = pts.length + " points";
    measureTotalEl.textContent = formatInt(stats.total);
    measureTimeEl.textContent = "≈ " + formatDuration(walk) + " walk · " +
      formatDuration(sprint) + " sprint";
    measureRouteEl.textContent = stats.legs.length + (stats.legs.length === 1 ? " leg" : " legs") +
      " · straight-line";
  }

  function setMeasureActive(active) {
    state.measure.active = !!active;
    updateMeasureUI();
    state.dirty = true;
  }

  function clearMeasure() {
    state.measure.points.length = 0;
    updateMeasureUI();
    state.dirty = true;
  }

  function addMeasurePoint(x, z) {
    if (!state.measure.active) return;
    if (state.mode === "diorama" && diorama.grid) {
      const g = diorama.grid;
      if (x < g.x0 || x > g.x0 + g.cols * g.stepX ||
          z < g.z0 || z > g.z0 + g.rows * g.stepZ) return;
    }
    state.measure.points.push({ x: Math.round(x), z: Math.round(z) });
    updateMeasureUI();
    state.dirty = true;
  }

  function removeLastMeasurePoint() {
    if (!state.measure.points.length) return;
    state.measure.points.pop();
    updateMeasureUI();
    state.dirty = true;
  }

  function measureScreenPoint(p) {
    return state.mode === "diorama"
      ? projectWorld(p.x, p.z, dioramaSurfaceAt(p.x, p.z))
      : worldToScreen(p.x, p.z);
  }

  function measurePath(ax, az, bx, bz) {
    if (state.mode !== "diorama") return [worldToScreen(ax, az), worldToScreen(bx, bz)];
    const dist = Math.hypot(bx - ax, bz - az);
    const n = clamp(Math.ceil(dist / Math.max(6, 18 / state.cam.s)), 3, 70);
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      out.push(projectWorld(x, z, dioramaSurfaceAt(x, z)));
    }
    return out;
  }

  function drawMeasure() {
    const pts = state.measure.points;
    if (!pts.length) return;
    const screens = pts.map(measureScreenPoint);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // A dark casing keeps the route readable over pale beaches and snow.
    ctx.strokeStyle = "rgba(22, 17, 10, 0.55)";
    ctx.lineWidth = 4;
    for (let i = 1; i < pts.length; i++) {
      const path = measurePath(pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z);
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let k = 1; k < path.length; k++) ctx.lineTo(path[k].x, path[k].y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(240, 205, 142, 0.98)";
    ctx.lineWidth = 1.7;
    ctx.setLineDash([6, 5]);
    for (let i = 1; i < pts.length; i++) {
      const path = measurePath(pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z);
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let k = 1; k < path.length; k++) ctx.lineTo(path[k].x, path[k].y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Leg distances sit at the middle of each segment.
    ctx.font = "600 9px " + FONT_MONO;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      const mid = state.mode === "diorama"
        ? projectWorld((pts[i].x + pts[i - 1].x) / 2, (pts[i].z + pts[i - 1].z) / 2,
          dioramaSurfaceAt((pts[i].x + pts[i - 1].x) / 2, (pts[i].z + pts[i - 1].z) / 2))
        : { x: (screens[i].x + screens[i - 1].x) / 2, y: (screens[i].y + screens[i - 1].y) / 2 };
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

  /* --------------------------------------------------------------- drawing */

  function drawDotGrid() {
    const gap = 26;
    ctx.fillStyle = "rgba(242,239,231,0.045)";
    const path = new Path2D();
    for (let y = gap / 2; y < state.vh; y += gap) {
      for (let x = gap / 2; x < state.vw; x += gap) {
        path.moveTo(x + 0.7, y);
        path.arc(x, y, 0.7, 0, TAU);
      }
    }
    ctx.fill(path);
  }

  function drawCachedTiles() {
    ctx.imageSmoothingEnabled = false;
    const stepPx = currentStep * state.cam.s;
    if (stepPx < 0.5) return;
    for (const t of visibleTiles) {
      if (t.step !== currentStep) continue;
      const r = tileWorldRect(t);
      const a = worldToScreen(r.x0, r.z0);
      const size = (r.x1 - r.x0) * state.cam.s;
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
  }

  // Human-readable coordinate intervals. The chosen step keeps labels at
  // least 100 px apart on desktop and 80 px on a phone at every zoom level.
  const GRID_STEPS = [
    10, 20, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000,
  ];

  function gridSpacing() {
    const target = state.vw < 680 ? 80 : 100;
    // The camera scale eases toward its target, so exact stops can land a hair
    // under 2 px/block. Treat that as the intended interval instead of dropping
    // to the next coarser step at the boundary.
    const minSpacing = target - 1e-6;
    for (const step of GRID_STEPS) {
      if (step * state.cam.s >= minSpacing) return step;
    }
    return GRID_STEPS[GRID_STEPS.length - 1];
  }

  function drawGraticule() {
    const step = gridSpacing();
    const rect = visibleWorldRect(0);
    const x0 = Math.ceil(rect.x0 / step) * step;
    const z0 = Math.ceil(rect.z0 / step) * step;

    // A quiet etched grid: a soft dark under-stroke keeps the light dashed
    // line visible over snow, water and forest without competing with markers.
    ctx.save();
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    for (let x = x0; x <= rect.x1; x += step) {
      const sx = Math.round(worldToScreen(x, 0).x) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, state.vh);
    }
    for (let z = z0; z <= rect.z1; z += step) {
      const sy = Math.round(worldToScreen(0, z).y) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(state.vw, sy);
    }
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "rgba(16, 22, 18, 0.26)";
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(247, 240, 221, 0.30)";
    ctx.stroke();
    ctx.restore();

    // The origin axes are a stronger orange reference line when in view.
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = "rgba(224, 138, 60, 0.62)";
    ctx.beginPath();
    if (rect.x0 <= 0 && rect.x1 >= 0) {
      const sx = Math.round(worldToScreen(0, 0).x) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, state.vh);
    }
    if (rect.z0 <= 0 && rect.z1 >= 0) {
      const sy = Math.round(worldToScreen(0, 0).y) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(state.vw, sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Panels are opaque chrome and always sit above the canvas. A label under
  // one of them would be invisible, so labels are only placed in the exposed
  // map area. This also keeps the active measure card and the phone key from
  // swallowing coordinates.
  function hudBoxes() {
    const boxes = [];
    for (const selector of [
      ".hud-seed", ".hud-readout", ".tools", ".measure", ".key", ".scale", ".hint",
    ]) {
      const node = document.querySelector(selector);
      if (!node || node.hidden) continue;
      if (selector === ".hint" && !node.classList.contains("show")) continue;
      const r = node.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      boxes.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    }
    return boxes;
  }

  function boxClear(box, boxes, otherLabels) {
    if (box.x < 4 || box.y < 4 ||
        box.x + box.w > state.vw - 4 || box.y + box.h > state.vh - 4) return false;
    for (const r of boxes) {
      if (box.x < r.x + r.w + 4 && box.x + box.w > r.x - 4 &&
          box.y < r.y + r.h + 4 && box.y + box.h > r.y - 4) return false;
    }
    for (const r of otherLabels) {
      if (box.x < r.x + r.w + 3 && box.x + box.w > r.x - 3 &&
          box.y < r.y + r.h + 3 && box.y + box.h > r.y - 3) return false;
    }
    return true;
  }

  // Labels are a separate pass after the markers, so they always sit above
  // icons and terrain. They are outlined text rather than opaque plates: a
  // coordinate can cross a marker without hiding the structure underneath.
  function drawGridLabels() {
    const step = gridSpacing();
    const rect = visibleWorldRect(0);
    const x0 = Math.ceil(rect.x0 / step) * step;
    const z0 = Math.ceil(rect.z0 / step) * step;
    const phone = state.vw < 680;
    // One fixed ruler band. The measure card is positioned below it in CSS so
    // opening Measure never moves the coordinate labels.
    const labelY = phone ? 106 : 100;
    const font = "600 " + (phone ? 12 : 11) + "px " + FONT_MONO;
    const padX = 3;
    const labelH = phone ? 15 : 14;
    const chrome = hudBoxes();
    const placed = [];

    ctx.save();
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;

    function label(text, cx, cy, align, zero) {
      ctx.textAlign = align;
      ctx.strokeStyle = "rgba(246, 236, 214, 0.94)";
      ctx.lineWidth = phone ? 3.4 : 3;
      ctx.strokeText(text, cx, cy);
      ctx.fillStyle = zero ? "#a4561d" : "#1d1811";
      ctx.fillText(text, cx, cy);
    }

    // X labels on one fixed row across the map. Edge labels slide inward just
    // enough to stay whole, while their grid line remains under the text.
    for (let x = x0; x <= rect.x1; x += step) {
      const sx = worldToScreen(x, 0).x;
      const text = "X " + formatInt(x);
      const w = Math.ceil(ctx.measureText(text).width) + padX * 2;
      const px = clamp(Math.round(sx - w / 2), 4, Math.max(4, state.vw - 4 - w));
      const py = Math.round(labelY - labelH / 2);
      const box = { x: px, y: py, w, h: labelH };
      if (!boxClear(box, chrome, placed)) continue;
      label(text, px + w / 2, labelY + 0.5, "center", x === 0);
      placed.push(box);
    }

    // Z labels stay near their horizontal line. If the top-right readout, a
    // panel or the X ruler leaves no room at the right edge, the label slides
    // left along the line and, when even that is blocked, takes the nearest
    // clear row. A visible horizontal grid line should never lose its value.
    const zOffsets = [0, 18, -18, 36, -36, 54, -54];
    for (let z = z0; z <= rect.z1; z += step) {
      const sy = worldToScreen(0, z).y;
      const text = "Z " + formatInt(z);
      const w = Math.ceil(ctx.measureText(text).width) + padX * 2;
      let chosen = null;
      for (const dy of zOffsets) {
        const cy = clamp(sy + dy, 4 + labelH / 2, state.vh - 4 - labelH / 2);
        // Keep the Z rail visually distinct from the X ruler row. A Z value
        // that lands in that band tries the next clear row instead.
        if (Math.abs(cy - labelY) < labelH) continue;
        const py = Math.round(cy - labelH / 2);
        let px = Math.round(state.vw - 8 - w);
        let box = { x: px, y: py, w, h: labelH };
        while (px > 4 && !boxClear(box, chrome, placed)) {
          px -= 8;
          box = { x: px, y: py, w, h: labelH };
        }
        if (boxClear(box, chrome, placed)) {
          chosen = { px, cy, box };
          break;
        }
      }
      if (!chosen) continue;
      label(text, chosen.px, chosen.cy + 0.5, "left", z === 0);
      placed.push(chosen.box);
    }

    ctx.restore();
  }

  // Every structure is a 16x16 icon at every zoom. There is no dot or cream
  // badge layer: the sprite itself is the marker.
  const MARKER_ICON_SIZE = 16;
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
    const pad = 50;
    const slab = state.mode === "diorama" ? diorama.grid : null;
    const slabX1 = slab ? slab.x0 + slab.cols * slab.stepX : 0;
    const slabZ1 = slab ? slab.z0 + slab.rows * slab.stepZ : 0;
    for (const st of struct.known) {
      if (slab && (st.x < slab.x0 || st.x > slabX1 || st.z < slab.z0 || st.z > slabZ1)) continue;
      let p;
      if (state.mode === "diorama") {
        if (st.h === undefined) st.h = dioramaSurfaceAt(st.x, st.z);
        p = projectWorld(st.x, st.z, st.h);
      } else {
        p = worldToScreen(st.x, st.z);
      }
      if (p.x < -pad || p.x > state.vw + pad || p.y < -pad || p.y > state.vh + pad) continue;
      screenMarkers.push({
        type: st.type, x: p.x, y: p.y, wx: st.x, wz: st.z,
        r: MARKER_ICON_SIZE / 2,
      });
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
  // are hard to find. Nothing is filtered or demoted: every on-screen marker
  // gets its own 16x16 sprite at every zoom level.
  function drawMarkers() {
    const ordered = screenMarkers.slice().sort((a, b) =>
      (MARKER_LAYER[a.type] || 0) - (MARKER_LAYER[b.type] || 0) || a.y - b.y
    );
    ctx.imageSmoothingEnabled = false;
    for (const m of ordered) {
      const icon = iconCanvas(m.type, 1);
      ctx.drawImage(
        icon,
        Math.round(m.x - MARKER_ICON_SIZE / 2),
        Math.round(m.y - MARKER_ICON_SIZE / 2)
      );
    }
    ctx.imageSmoothingEnabled = true;
  }

  function drawHoverTooltip(R) {
    const m = state.hoverMarker;
    const name = LABELS[m.type] || m.type;
    const coords = formatInt(m.wx) + ", " + formatInt(m.wz);
    const mx = m.x;
    const my = m.y;
    ctx.font = "600 11.5px " + FONT_SANS;
    const nw = ctx.measureText(name).width;
    ctx.font = "500 9.5px " + FONT_MONO;
    const cw = ctx.measureText(coords).width;
    const w = Math.max(nw, cw) + 47;
    const h = 40;
    let x = mx - w / 2;
    let y = my - R - h - 11;
    let below = false;
    if (y < 8) { y = my + R + 11; below = true; }
    x = clamp(x, 8, Math.max(8, state.vw - w - 8));
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    roundRect(x, y, w, h, 3);
    ctx.fillStyle = "#f1e6ce";
    ctx.fill();
    ctx.restore();
    roundRect(x, y, w, h, 3);
    ctx.strokeStyle = "#241c13";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.textBaseline = "alphabetic";
    const icon = iconCanvas(m.type, 2);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(icon, x + 8, y + 9, 16, 16);
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = "#241c13";
    ctx.font = "600 11.5px " + FONT_SANS;
    ctx.fillText(name, x + 31, y + 17);
    ctx.fillStyle = "#a4561d";
    ctx.font = "500 9.5px " + FONT_MONO;
    ctx.fillText(coords, x + 31, y + 30);
    const tipY = below ? y : y + h;
    ctx.beginPath();
    ctx.moveTo(mx - 5, tipY);
    ctx.lineTo(mx + 5, tipY);
    ctx.lineTo(mx, below ? y - 5 : y + h + 5);
    ctx.closePath();
    ctx.fillStyle = "#f1e6ce";
    ctx.fill();
    ctx.strokeStyle = "#241c13";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  function drawMap() {
    ctx.fillStyle = "#14384a";
    ctx.fillRect(0, 0, state.vw, state.vh);
    drawDotGrid();
    drawCachedTiles();
    drawGraticule();
    projectMarkers();
    updateHoverMarker();
    drawMeasure();
    drawMarkers();
    drawGridLabels();
    if (state.hoverMarker) drawHoverTooltip(state.hoverMarker.r);
  }

  // Sampled height for pins and routes: once the smoothed mesh exists, a
  // marker should sit on the surface that is actually drawn, not on the
  // unsmoothed sample it was baked from.
  function dioramaSurfaceAt(x, z) {
    const g = diorama.grid;
    if (!g || !g.shadowReady) return heightAtBlock(x, z);
    const col = clamp(Math.floor((x - g.x0) / g.stepX), 0, g.cols - 1);
    const row = clamp(Math.floor((z - g.z0) / g.stepZ), 0, g.rows - 1);
    return g.height[row * g.cols + col];
  }

  function dioramaCornerHeight(g, col, row) {
    let sum = 0, n = 0;
    for (let dr = -1; dr <= 0; dr++) {
      for (let dc = -1; dc <= 0; dc++) {
        const c = col + dc, r = row + dr;
        if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) continue;
        const i = r * g.cols + c;
        if (i >= g.done) continue;
        sum += g.height[i];
        n++;
      }
    }
    return n ? sum / n : SEA;
  }

  // Side walls are drawn as one polygon per edge so the slab reads as a
  // solid cut block, not a sheet of terrain floating in the sky.
  function drawDioramaWall(g, edge, topOf, bottomY) {
    const path = new Path2D();
    let y0 = Infinity, y1 = -Infinity;
    if (edge === "back") {
      for (let col = 0; col <= g.cols; col++) {
        const x = g.x0 + col * g.stepX;
        const p = projectWorld(x, g.z0, topOf(col, 0));
        if (col === 0) path.moveTo(p.x, p.y); else path.lineTo(p.x, p.y);
        y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
      for (let col = g.cols; col >= 0; col--) {
        const x = g.x0 + col * g.stepX;
        const p = projectWorld(x, g.z0, SLAB_BASE);
        path.lineTo(p.x, p.y);
      }
    } else {
      const col = edge === "left" ? 0 : g.cols;
      const x = g.x0 + col * g.stepX;
      for (let row = 0; row <= g.rows; row++) {
        const z = g.z0 + row * g.stepZ;
        const p = projectWorld(x, z, topOf(col, row));
        if (row === 0) path.moveTo(p.x, p.y); else path.lineTo(p.x, p.y);
        y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
      for (let row = g.rows; row >= 0; row--) {
        const z = g.z0 + row * g.stepZ;
        const p = projectWorld(x, z, SLAB_BASE);
        path.lineTo(p.x, p.y);
      }
    }
    path.closePath();
    const grad = ctx.createLinearGradient(0, y0, 0, Math.max(y1, bottomY));
    if (edge === "left") {
      grad.addColorStop(0, "#4e4130");
      grad.addColorStop(0.45, "#2f271e");
      grad.addColorStop(1, "#16120e");
    } else if (edge === "right") {
      grad.addColorStop(0, "#6d583d");
      grad.addColorStop(0.5, "#403426");
      grad.addColorStop(1, "#1a1510");
    } else {
      grad.addColorStop(0, "#3f3528");
      grad.addColorStop(0.5, "#2a231b");
      grad.addColorStop(1, "#12100c");
    }
    ctx.fillStyle = grad;
    ctx.fill(path);
    // Stratum bands and fine vertical cuts give the faces the look of packed
    // earth and stone rather than flat brown paper.
    ctx.save();
    ctx.clip(path);
    const bottom = Math.max(y1, bottomY);
    for (let i = 1; i <= 4; i++) {
      const yy = y0 + ((bottom - y0) * i) / 5;
      ctx.fillStyle = i % 2 ? "rgba(12, 16, 12, 0.1)" : "rgba(220, 205, 168, 0.035)";
      ctx.fillRect(0, yy, state.vw, 2);
    }
    ctx.strokeStyle = "rgba(12, 10, 8, 0.14)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 16; i++) {
      const xx = (i / 16) * state.vw + (hash2(i, edge.length) - 0.5) * 9;
      ctx.beginPath();
      ctx.moveTo(xx, y0);
      ctx.lineTo(xx + 4, bottom);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(8, 12, 10, 0.45)";
    ctx.lineWidth = 1;
    ctx.stroke(path);
  }

  // A cliff face under one terrace, tinted by the ground above it. Shallow
  // creases stay close to the top colour so the terrain does not turn into a
  // stack of black contour lines.
  function drawCliffFace(id, x0, z0, x1, z1, hTop, hBottom, side, fog) {
    const base = RELIEF_RGB[id] || [91, 102, 96];
    const drop = hTop - hBottom;
    const lum = (base[0] + base[1] + base[2]) / 3;
    const earth = lum > 185 ? [170, 172, 166] : lum > 158 ? [148, 137, 116] : [108, 84, 59];
    const near = clamp(1 - drop / 9, 0, 1);
    const mix = 0.55 - near * 0.36;
    let r = base[0] * (1 - mix) + earth[0] * mix;
    let g = base[1] * (1 - mix) + earth[1] * mix;
    let b = base[2] * (1 - mix) + earth[2] * mix;
    const light = side === "west" ? 0.8 + near * 0.14 : 0.68 + near * 0.16;
    r *= light; g *= light; b *= light;
    const f = fog || 0;
    r = r * (1 - f) + HAZE_RGB[0] * f;
    g = g * (1 - f) + HAZE_RGB[1] * f;
    b = b * (1 - f) + HAZE_RGB[2] * f;
    const a = projectWorld(x0, z0, hTop);
    const b2 = projectWorld(x1, z1, hTop);
    const c = projectWorld(x1, z1, hBottom);
    const d = projectWorld(x0, z0, hBottom);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fillStyle = "rgb(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + ")";
    ctx.fill();
    if (drop > 2.5) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b2.x, b2.y);
      ctx.strokeStyle = "rgba(246, 231, 200, 0.14)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawDiorama() {
    const vw = state.vw, vh = state.vh;
    const sky = ctx.createLinearGradient(0, 0, 0, vh);
    sky.addColorStop(0, "#081216");
    sky.addColorStop(0.3, "#112224");
    sky.addColorStop(0.54, "#24332e");
    sky.addColorStop(0.72, "#4b4a38");
    sky.addColorStop(1, "#141310");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, vw, vh);

    // A broad, soft key light in the upper right; no hard sun disc, so the
    // backdrop stays a studio rather than a landscape.
    const haloX = vw * 0.78, haloY = vh * 0.12;
    const halo = ctx.createRadialGradient(haloX, haloY, 0, haloX, haloY, Math.max(vw, vh) * 0.46);
    halo.addColorStop(0, "rgba(240, 206, 148, 0.16)");
    halo.addColorStop(0.3, "rgba(206, 172, 118, 0.05)");
    halo.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, vw, vh);

    const g = diorama.grid;
    if (!g) return;

    // Contact shadow beneath the slab: soft, stretched and low.
    const shadowY = vh * 0.82;
    const shadow = ctx.createRadialGradient(vw / 2, shadowY, 0, vw / 2, shadowY, vw * 0.46);
    shadow.addColorStop(0, "rgba(0, 0, 0, 0.46)");
    shadow.addColorStop(0.55, "rgba(0, 0, 0, 0.2)");
    shadow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.save();
    ctx.translate(vw / 2, shadowY);
    ctx.scale(1, 0.1);
    ctx.translate(-vw / 2, -shadowY);
    ctx.fillStyle = shadow;
    ctx.fillRect(0, 0, vw, vh);
    ctx.restore();

    if (g.done >= g.total) {
      const top = (col, row) => dioramaCornerHeight(g, col, row);
      drawDioramaWall(g, "back", top, vh);
      drawDioramaWall(g, "left", top, vh);
      drawDioramaWall(g, "right", top, vh);
    }

    // A stepped heightfield: every cell is a flat terrace, and a real drop to
    // a lower neighbour becomes a cut face. Stretching one quad across a tall
    // cliff was what smeared hillsides into vertical streaks.
    for (let row = 0; row < g.rows; row++) {
      if ((row + 1) * g.cols >= g.done) break;
      const fog = 0.18 * Math.pow(1 - row / g.rows, 1.35);
      const z0 = g.z0 + row * g.stepZ;
      const z1 = z0 + g.stepZ;
      const rowBase = row * g.cols;
      for (let col = 0; col < g.cols; col++) {
        const i = rowBase + col;
        if (i >= g.done) break;
        const id = g.biome[i];
        const h = g.height[i];
        const water = WATER_IDS.has(id);
        const x0 = g.x0 + col * g.stepX;
        const zc = z0 + g.stepZ * 0.5;
        const x1 = x0 + g.stepX;
        const shadowAmt = g.shadowReady ? g.shadow[i] : 0;
        let coast = 0;
        if (water) {
          if (col > 0 && !WATER_IDS.has(g.biome[i - 1])) coast = 1;
          else if (col < g.cols - 1 && !WATER_IDS.has(g.biome[i + 1])) coast = 1;
          else if (row > 0 && !WATER_IDS.has(g.biome[i - g.cols])) coast = 1;
          else if (row < g.rows - 1 && !WATER_IDS.has(g.biome[i + g.cols])) coast = 1;
        }

        const left = col > 1 ? g.height[i - 2] : h;
        const right = col < g.cols - 2 && i + 2 < g.done ? g.height[i + 2] : h;
        const up = row > 1 ? g.height[i - 2 * g.cols] : h;
        const downH = row < g.rows - 2 && i + 2 * g.cols < g.done
          ? g.height[i + 2 * g.cols] : h;
        // Slope over two cells, not one: a single-cell difference flips sign
        // on every terrace and paints the hillsides with stripes.
        const east = (right - left) / (4 * g.stepX);
        const south = (downH - up) / (4 * g.stepZ);
        const nextLeft = col > 0 ? g.height[i - 1] : h;
        const nextDown = row < g.rows - 1 && i + g.cols < g.done ? g.height[i + g.cols] : h;

        if (col > 0 && nextLeft < h - 0.01) {
          drawCliffFace(id, x0, z0, x0, z1, h, nextLeft, "west", fog);
        }
        if (row < g.rows - 1 && i + g.cols < g.done && nextDown < h - 0.01) {
          drawCliffFace(id, x0, z1, x1, z1, h, nextDown, "south", fog);
        }

        const p00 = projectWorld(x0, z0, h);
        const p10 = projectWorld(x1, z0, h);
        const p11 = projectWorld(x1, z1, h);
        const p01 = projectWorld(x0, z1, h);
        ctx.beginPath();
        ctx.moveTo(p00.x, p00.y);
        ctx.lineTo(p10.x, p10.y);
        ctx.lineTo(p11.x, p11.y);
        ctx.lineTo(p01.x, p01.y);
        ctx.closePath();
        const fill = reliefColor(id, h, east, south, shadowAmt, fog,
          col, row, x0, zc, coast);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = fill;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // A pale surf line where water meets land sharpens every coastline. Each
    // edge is traced a second time, lower and wider, for a soft foam halo.
    ctx.save();
    ctx.strokeStyle = "rgba(226, 238, 226, 0.32)";
    ctx.lineWidth = 1.1;
    for (let row = 0; row < g.rows - 1; row++) {
      const rowBase = row * g.cols;
      for (let col = 0; col < g.cols - 1; col++) {
        const i = rowBase + col;
        if (i + g.cols + 1 >= g.done) break;
        const id = g.biome[i];
        if (!WATER_IDS.has(id)) continue;
        const nId = g.biome[i + g.cols];
        const eId = g.biome[i + 1];
        const z0 = g.z0 + row * g.stepZ;
        const z1 = z0 + g.stepZ;
        const x0 = g.x0 + col * g.stepX;
        const x1 = x0 + g.stepX;
        const h = dioramaCornerHeight(g, col, row);
        if (!WATER_IDS.has(eId)) {
          const a = projectWorld(x1, z0, h);
          const b = projectWorld(x1, z1, h);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        if (!WATER_IDS.has(nId)) {
          const a = projectWorld(x0, z1, h);
          const b = projectWorld(x1, z1, h);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    ctx.restore();

    // The front cut face: a solid plinth underneath the surface, with a
    // warm rim light and a narrow lip of the actual surface colour.
    if (g.done >= g.total) {
      const z1 = g.z0 + g.rows * g.stepZ;
      let topY = Infinity;
      let baseY = -Infinity;
      const frontRow = (g.rows - 1) * g.cols;
      for (let col = 0; col < g.cols; col++) {
        const h = g.height[frontRow + col];
        const x0 = g.x0 + col * g.stepX;
        topY = Math.min(topY, projectWorld(x0, z1, h).y);
        const b = projectWorld(x0, z1, SLAB_BASE);
        baseY = Math.max(baseY, b.y);
      }
      const wall = ctx.createLinearGradient(0, topY, 0, Math.max(baseY, topY + 1));
      wall.addColorStop(0, "#6a5138");
      wall.addColorStop(0.38, "#443629");
      wall.addColorStop(1, "#191510");
      for (let col = 0; col < g.cols; col++) {
        const h0 = g.height[frontRow + col];
        const x0 = g.x0 + col * g.stepX;
        const x1 = x0 + g.stepX;
        const p0 = projectWorld(x0, z1, h0);
        const p1 = projectWorld(x1, z1, h0);
        const b1 = projectWorld(x1, z1, SLAB_BASE);
        const b0 = projectWorld(x0, z1, SLAB_BASE);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(b1.x, b1.y);
        ctx.lineTo(b0.x, b0.y);
        ctx.closePath();
        ctx.fillStyle = wall;
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255," + (hash2(col, 17) > 0.72 ? 0.012 : 0.004) + ")";
        ctx.fill();
      }
      // The lip: a narrow band of the front cell's colour, so the surface
      // visibly continues over the cut instead of ending at a hard edge.
      const lipRow = (g.rows - 1) * g.cols;
      for (let col = 0; col < g.cols; col++) {
        const h0 = g.height[lipRow + col];
        const x0 = g.x0 + col * g.stepX;
        const x1 = x0 + g.stepX;
        const p0 = projectWorld(x0, z1, h0);
        const p1 = projectWorld(x1, z1, h0);
        const id = g.biome[lipRow + col] || 0;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.strokeStyle = reliefColor(id, h0, 0, 0, 0, 0.05, col, g.rows, 0, z1, 0);
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Strata across the front cut, matching the side faces.
      const face = new Path2D();
      for (let col = 0; col < g.cols; col++) {
        const x0 = g.x0 + col * g.stepX;
        const x1 = x0 + g.stepX;
        const h = g.height[frontRow + col];
        const p0 = projectWorld(x0, z1, h);
        const p1 = projectWorld(x1, z1, h);
        if (col === 0) face.moveTo(p0.x, p0.y);
        else face.lineTo(p0.x, p0.y);
        face.lineTo(p1.x, p1.y);
      }
      for (let col = g.cols; col >= 0; col--) {
        const p = projectWorld(g.x0 + col * g.stepX, z1, SLAB_BASE);
        face.lineTo(p.x, p.y);
      }
      face.closePath();
      ctx.save();
      ctx.clip(face);
      for (let i = 1; i <= 3; i++) {
        const y = topY + ((baseY - topY) * i) / 4;
        ctx.fillStyle = i % 2 ? "rgba(14, 10, 7, 0.15)" : "rgba(225, 196, 146, 0.05)";
        ctx.fillRect(0, y, vw, 2);
      }
      ctx.restore();

      // A pale bevel at the foot of the plinth makes the slab read as a solid
      // model on a table rather than a sheet with a coloured edge.
      const bevel = new Path2D();
      for (let col = 0; col <= g.cols; col++) {
        const p = projectWorld(g.x0 + col * g.stepX, z1, SLAB_BASE + 3.2);
        if (col === 0) bevel.moveTo(p.x, p.y);
        else bevel.lineTo(p.x, p.y);
      }
      for (let col = g.cols; col >= 0; col--) {
        const p = projectWorld(g.x0 + col * g.stepX, z1, SLAB_BASE);
        bevel.lineTo(p.x, p.y);
      }
      bevel.closePath();
      ctx.fillStyle = "rgba(206, 181, 137, 0.2)";
      ctx.fill(bevel);
      ctx.strokeStyle = "rgba(240, 219, 178, 0.25)";
      ctx.lineWidth = 1;
      ctx.stroke(bevel);

      // A thin dark base line closes the model underneath.
      const bl = projectWorld(g.x0, z1, SLAB_BASE);
      const br = projectWorld(g.x0 + g.cols * g.stepX, z1, SLAB_BASE);
      ctx.beginPath();
      ctx.moveTo(bl.x, bl.y);
      ctx.lineTo(br.x, br.y);
      ctx.strokeStyle = "rgba(6, 8, 6, 0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // A pale rim around the whole top face makes the cut slab read as a
    // deliberate model edge rather than a torn-out piece of the world.
    ctx.beginPath();
    for (let col = 0; col <= g.cols; col++) {
      const h = dioramaCornerHeight(g, col, 0);
      const p = projectWorld(g.x0 + col * g.stepX, g.z0, h);
      if (col === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    for (let row = 1; row <= g.rows; row++) {
      const h = dioramaCornerHeight(g, g.cols, row);
      const p = projectWorld(g.x0 + g.cols * g.stepX, g.z0 + row * g.stepZ, h);
      ctx.lineTo(p.x, p.y);
    }
    for (let col = g.cols - 1; col >= 0; col--) {
      const h = dioramaCornerHeight(g, col, g.rows);
      const p = projectWorld(g.x0 + col * g.stepX, g.z0 + g.rows * g.stepZ, h);
      ctx.lineTo(p.x, p.y);
    }
    for (let row = g.rows - 1; row >= 0; row--) {
      const h = dioramaCornerHeight(g, 0, row);
      const p = projectWorld(g.x0, g.z0 + row * g.stepZ, h);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.strokeStyle = "rgba(244, 226, 186, 0.26)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // A faint warm veil over the far side, then a vignette so the eye settles
    // on the model instead of the corners of the screen.
    const haze = ctx.createLinearGradient(0, vh * 0.05, 0, vh * 0.62);
    haze.addColorStop(0, "rgba(24, 32, 28, 0.28)");
    haze.addColorStop(0.55, "rgba(24, 32, 28, 0.08)");
    haze.addColorStop(1, "rgba(24, 32, 28, 0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, vw, vh * 0.62);

    const vignette = ctx.createRadialGradient(
      vw / 2, vh * 0.52, Math.min(vw, vh) * 0.22,
      vw / 2, vh * 0.52, Math.max(vw, vh) * 0.74);
    vignette.addColorStop(0, "rgba(6, 9, 8, 0)");
    vignette.addColorStop(1, "rgba(6, 9, 8, 0.5)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, vw, vh);

    projectMarkers();
    updateHoverMarker();
    drawMeasure();
    drawMarkers();
    if (state.hoverMarker) drawHoverTooltip(state.hoverMarker.r);
  }

  function draw() {
    if (!ctx) return;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, state.vw, state.vh);
    state.mode === "diorama" ? drawDiorama() : drawMap();
  }

  /* ------------------------------------------------------------- readout */

  function formatInt(n) {
    return Math.round(n).toLocaleString("en-US");
  }

  function updateReadout(now) {
    if (!state.world || !state.mapShown) return;
    if (now - state.lastReadout < 70) return;
    state.lastReadout = now;

    let sx = state.vw / 2;
    let sy = state.vh / 2;
    if (state.pointer.active) { sx = state.pointer.x; sy = state.pointer.y; }
    const w = screenToWorldView(sx, sy);
    const x = Math.round(w.x);
    const z = Math.round(w.z);
    const coordText = formatInt(x) + ", " + formatInt(z);
    if (coordText !== state.lastCoords) {
      state.lastCoords = coordText;
      coordsEl.textContent = coordText;
    }

    const biomeId = state.world.biomeAtBlock(x, z);
    const b = BIOMES[biomeId] || BIOME_FALLBACK;
    if (biomeNameEl.textContent !== b[0]) {
      biomeNameEl.textContent = b[0];
    }
    const hover = state.hoverMarker;
    if (hover) {
      bioSepEl.hidden = false;
      bioStructEl.hidden = false;
      const name = LABELS[hover.type] || hover.type;
      if (bioStructEl.textContent !== name) bioStructEl.textContent = name;
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
    const w = n * state.cam.s;
    scaleBarEl.style.width = w.toFixed(1) + "px";
    const label = n.toLocaleString("en-US") + " blocks";
    if (scaleNumEl.textContent !== label) scaleNumEl.textContent = label;
  }

  /* -------------------------------------------------------------- camera */

  function animateCamera(dt) {
    const c = state.cam;
    const t = state.target;
    if (state.dragging || state.pinch) return false;
    const k = 1 - Math.exp(-Math.max(1, dt) / 90);
    let moving = false;
    const ds = t.s - c.s;
    if (Math.abs(ds) > 1e-5) { c.s += ds * k; moving = true; }
    else c.s = t.s;
    const dx = t.x - c.x;
    const dz = t.z - c.z;
    if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
      c.x += dx * k;
      c.z += dz * k;
      moving = true;
    } else { c.x = t.x; c.z = t.z; }
    clampCamera(c);
    if (moving) state.dirty = true;
    return moving;
  }

  function setCameraDirect(x, z, s) {
    state.cam.x = x; state.cam.z = z; state.cam.s = clamp(s, MIN_SCALE, MAX_SCALE);
    state.target = { x: state.cam.x, z: state.cam.z, s: state.cam.s };
    clampCamera(state.cam);
    state.dirty = true;
    if (state.mode === "diorama") scheduleDiorama();
  }

  function zoomAt(sx, sy, factor) {
    const t = state.target;
    const s2 = clamp(t.s * factor, MIN_SCALE, MAX_SCALE);
    if (s2 === t.s) return;
    let before = null;
    if (state.mode === "diorama") {
      before = screenToWorld3D(sx, sy, t);
    } else {
      before = { x: t.x + (sx - state.vw / 2) / t.s, z: t.z + (sy - state.vh / 2) / t.s };
    }
    t.s = s2;
    const after = state.mode === "diorama"
      ? screenToWorld3D(sx, sy, t)
      : { x: t.x + (sx - state.vw / 2) / t.s, z: t.z + (sy - state.vh / 2) / t.s };
    t.x += before.x - after.x;
    t.z += before.z - after.z;
    clampCamera(t);
    state.dirty = true;
    scheduleDiorama();
  }

  function panBy(dxScreen, dyScreen) {
    const dz = -dyScreen / (state.cam.s * (state.mode === "diorama" ? COS_TILT : 1));
    state.cam.z += dz;
    // Compensate for the diorama skew so the slab follows the cursor.
    state.cam.x += -dxScreen / state.cam.s -
      (state.mode === "diorama" ? dz * viewSkew() : 0);
    state.target.x = state.cam.x;
    state.target.z = state.cam.z;
    clampCamera(state.cam);
    clampCamera(state.target);
    state.dirty = true;
    if (state.mode === "diorama") scheduleDiorama();
  }

  /* --------------------------------------------------------------- input */

  function onWheel(e) {
    if (!state.mapShown) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const unit = e.deltaMode === 1 ? 0.04 : e.deltaMode === 2 ? 0.4 : 1;
    const sensitivity = e.ctrlKey ? 0.0055 : 0.0022;
    let factor = Math.exp(-e.deltaY * unit * sensitivity);
    factor = clamp(factor, 0.45, 2.4);
    zoomAt(sx, sy, factor);
    state.lastInteractive = performance.now();
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
    const w = screenToWorldView(mid.x, mid.y);
    state.pinch = {
      d0: d,
      s0: state.cam.s,
      mid,
      world: w,
    };
    state.target = { x: state.cam.x, z: state.cam.z, s: state.cam.s };
    state.dirty = true;
  }

  function onPointerDown(e) {
    if (!state.mapShown) return;
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
    if (!state.mapShown) return;
    const p = pointerPos(e);
    if (state.pointers.has(e.pointerId)) {
      state.pointers.set(e.pointerId, p);
    }
    if (state.pointers.size >= 2 && state.pinch) {
      const pts = Array.from(state.pointers.values());
      const a = pts[0], b = pts[1];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const s = clamp(state.pinch.s0 * (d / state.pinch.d0), MIN_SCALE, MAX_SCALE);
      const zs = state.mode === "diorama" ? COS_TILT : 1;
      state.cam.s = s;
      state.cam.z = state.pinch.world.z - (state.pinch.mid.y - state.vh / 2) / (s * zs);
      state.cam.x = state.pinch.world.x +
        (state.pinch.world.z - state.cam.z) * viewSkew() -
        (state.pinch.mid.x - state.vw / 2) / s;
      // carry the map with the midpoint motion
      state.cam.x += (state.pinch.mid.x - mid.x) / s;
      state.cam.z += (state.pinch.mid.y - mid.y) / (s * zs);
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
    if (!state.mapShown) return;
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
    if (state.mode === "diorama") scheduleDiorama();
    state.dirty = true;
  }

  function onCanvasClick(e) {
    if (!state.mapShown || !state.measure.active) return;
    if (state.suppressClick) {
      state.suppressClick = false;
      return;
    }
    const p = pointerPos(e);
    const w = screenToWorldView(p.x, p.y);
    addMeasurePoint(w.x, w.z);
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
    if (rootEl) rootEl.classList.remove("dragging");
    state.dirty = true;
  }

  function onDoubleClick(e) {
    if (!state.mapShown || state.measure.active) return;
    const p = pointerPos(e);
    zoomAt(p.x, p.y, 1.9);
    e.preventDefault();
  }

  function onKeyDown(e) {
    if (state.mapShown) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (state.measure.active) setMeasureActive(false);
        else goHome();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        setMeasureActive(!state.measure.active);
        return;
      }
      if ((e.key === "Backspace" || e.key === "Delete") && state.measure.points.length) {
        e.preventDefault();
        removeLastMeasurePoint();
        return;
      }
      if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        setMode(state.mode === "diorama" ? "map" : "diorama");
        return;
      }
      if (e.key === "+" || e.key === "=") {
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
        scheduleDiorama();
      }
    }
  }

  /* ------------------------------------------------------------ home flow */

  function setMode(mode) {
    if (mode !== "map" && mode !== "diorama") return;
    if (state.mode === mode) return;
    state.mode = mode;
    mapBtn.classList.toggle("is-on", mode === "map");
    dioramaBtn.classList.toggle("is-on", mode === "diorama");
    mapBtn.setAttribute("aria-pressed", mode === "map" ? "true" : "false");
    dioramaBtn.setAttribute("aria-pressed", mode === "diorama" ? "true" : "false");
    rootEl.classList.toggle("diorama-mode", mode === "diorama");
    state.hoverMarker = null;
    state.lastCoords = "";
    state.dirty = true;
    loadBarEl.classList.remove("is-done");
    if (mode === "diorama") {
      startDiorama();
    } else {
      ensureTiles(performance.now());
    }
  }

  // A deterministic pixel horizon for the title card: blocky hills, a pond,
  // two trees and a low sun. It is drawn once at 280x40 and scaled by CSS.
  function drawHomeHorizon() {
    const c = document.getElementById("homeHorizon");
    if (!c) return;
    const g = c.getContext("2d");
    const W = 280, H = 40;
    g.imageSmoothingEnabled = false;

    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#0d1a1e");
    sky.addColorStop(0.55, "#16282b");
    sky.addColorStop(0.78, "#33403a");
    sky.addColorStop(1, "#4a4636");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    const sunGlow = g.createRadialGradient(226, 11, 1, 226, 11, 22);
    sunGlow.addColorStop(0, "rgba(240, 198, 128, 0.3)");
    sunGlow.addColorStop(1, "rgba(240, 198, 128, 0)");
    g.fillStyle = sunGlow;
    g.fillRect(204, 0, 44, 34);
    g.fillStyle = "#e8c07a";
    g.fillRect(222, 7, 8, 8);
    g.fillStyle = "rgba(255, 246, 220, 0.8)";
    g.fillRect(222, 7, 3, 3);

    g.fillStyle = "rgba(213, 221, 208, 0.13)";
    g.fillRect(18, 9, 20, 3);
    g.fillRect(27, 12, 11, 2);
    g.fillRect(72, 6, 26, 3);
    g.fillRect(88, 9, 15, 2);
    g.fillRect(158, 11, 17, 3);
    g.fillRect(166, 14, 10, 2);

    const columns = 70;
    for (let i = 0; i < columns; i++) {
      const x = i * 4;
      const far = Math.round(9 + 3 * Math.sin(i * 0.42) + 2 * Math.sin(i * 0.17 + 2));
      const farTop = 28 - far;
      g.fillStyle = "#22403f";
      g.fillRect(x, farTop, 4, 30 - farTop);
      g.fillStyle = "#2d5350";
      g.fillRect(x, farTop, 4, 2);
    }

    for (let i = 0; i < columns; i++) {
      const x = i * 4;
      const h = Math.round(7 + 2.4 * Math.sin(i * 0.31 + 1.4) + 1.8 * Math.sin(i * 0.13));
      const top = 33 - h;
      g.fillStyle = "#5f4026";
      g.fillRect(x, top + 3, 4, 40 - top);
      g.fillStyle = "#6b4522";
      g.fillRect(x, top + 3, 4, 3);
      g.fillStyle = "#5f8f3f";
      g.fillRect(x, top, 4, 3);
      g.fillStyle = "#7fae53";
      g.fillRect(x, top, 4, 1);
    }

    // A small lake between the hills, with a stepped shoreline.
    g.fillStyle = "#183842";
    g.fillRect(150, 34, 38, 1);
    g.fillRect(146, 35, 46, 2);
    g.fillRect(142, 37, 54, 1);
    g.fillStyle = "#2f6a78";
    g.fillRect(154, 34, 20, 1);
    g.fillRect(148, 35, 12, 1);
    g.fillStyle = "#5f8f3f";
    g.fillRect(142, 36, 4, 1);
    g.fillRect(196, 36, 4, 1);

    function tree(tx, base) {
      g.fillStyle = "#4a3018";
      g.fillRect(tx + 3, base - 8, 2, 8);
      g.fillStyle = "#3f6626";
      g.fillRect(tx, base - 13, 8, 5);
      g.fillStyle = "#5f8f3f";
      g.fillRect(tx + 1, base - 13, 6, 2);
    }
    tree(47, 30);
    tree(201, 28);

    g.fillStyle = "#14110d";
    g.fillRect(0, 38, W, 2);
  }

  function shakeInput() {
    const line = seedInput.parentElement;
    line.classList.remove("shake");
    void line.offsetWidth;
    line.classList.add("shake");
    seedInput.focus();
  }

  function startMap(text) {
    const parsed = E.parseSeed(text);
    if (!parsed) { shakeInput(); return false; }
    try {
      prepareWorld(parsed);
    } catch (err) {
      console.error("Seed generation failed", err);
      return false;
    }
    state.mapShown = true;
    homeEl.classList.add("is-out");
    seedInput.blur();
    seedInput.disabled = true;
    homeEl.setAttribute("aria-hidden", "true");
    homeEl.setAttribute("inert", "");
    mapUiEl.hidden = false;
    requestAnimationFrame(() => mapUiEl.classList.add("is-in"));
    rootEl.classList.add("map-mode");
    document.title = parsed.text + " — seedmap";
    seedOut.textContent = parsed.text;
    loadBarEl.classList.remove("is-done");
    loadFillEl.style.transform = "scaleX(0)";
    state.measure.active = false;
    state.measure.points.length = 0;
    updateMeasureUI();

    const initialScale = clamp(state.vw / 2600, 0.42, 1.05);
    setCameraDirect(0, 0, initialScale);
    state.pointer.active = false;
    state.hoverMarker = null;
    state.lastCoords = "";
    state.lastReadout = 0;
    resize();
    state.dirty = true;
    enumerateStructures();
    enumerateDenseStructures();
    clearTimeout(state.strongholdTimer);
    pumpStrongholds();
    if (state.mode === "diorama") startDiorama();
    state.hintCount++;
    showHint(state.hintCount > 1 ? 2800 : 5200);
    return true;
  }

  function goHome() {
    if (!state.mapShown) return;
    state.mapShown = false;
    clearTimeout(state.strongholdTimer);
    state.strongholdTimer = 0;
    mapUiEl.classList.remove("is-in");
    mapUiEl.hidden = true;
    homeEl.hidden = false;
    homeEl.removeAttribute("aria-hidden");
    homeEl.removeAttribute("inert");
    seedInput.disabled = false;
    homeEl.classList.remove("is-out");
    rootEl.classList.remove("map-mode", "dragging");
    document.title = "Seedmap — offline Minecraft seed atlas";
    seedInput.value = state.seedText;
    state.measure.active = false;
    state.measure.points.length = 0;
    updateMeasureUI();
    state.pointers.clear();
    state.pinch = null;
    state.dragging = false;
    state.pointer.active = false;
    state.hoverMarker = null;
    if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) {
      setTimeout(() => { seedInput.focus(); seedInput.select(); }, 120);
    }
  }

  function showHint(ms) {
    clearTimeout(state.hintTimer);
    hintEl.classList.remove("show");
    setTimeout(() => {
      if (!state.mapShown) return;
      hintEl.classList.add("show");
      state.hintTimer = setTimeout(() => hintEl.classList.remove("show"), ms);
    }, 600);
  }

  /* --------------------------------------------------------------- frame */

  let lastFrame = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = lastFrame ? now - lastFrame : 16;
    lastFrame = now;
    if (!state.mapShown) return;

    let busy = false;
    const moving = animateCamera(dt);
    busy = moving || busy;
    if (state.mode === "diorama") {
      if (state.dioramaDirty && !moving && !state.dragging &&
          !state.pinch && state.pointers.size === 0) {
        startDiorama();
      }
      busy = generateDiorama() || busy;
    } else {
      ensureTiles(now);
      busy = generateTiles(now) || busy;
    }
    updateLoadBar();

    if (!struct.enumerated || now - (state.lastStructEnum || 0) > 140) {
      enumerateStructures();
      enumerateDenseStructures();
      state.lastStructEnum = now;
    }
    busy = processStructures() || busy;
    busy = processDenseStructures() || busy;

    updateReadout(now);
    updateScale();

    if (state.dirty || busy) {
      draw();
      state.dirty = false;
    }
  }

  /* ---------------------------------------------------------------- init */

  function init() {
    rootEl = document.getElementById("root");
    canvas = document.getElementById("mapCanvas");
    ctx = canvas.getContext("2d", { alpha: false });
    homeEl = document.getElementById("home");
    mapUiEl = document.getElementById("mapUi");
    seedInput = document.getElementById("seedInput");
    seedForm = document.getElementById("seedForm");
    seedOut = document.getElementById("seedOut");
    coordsEl = document.getElementById("coords");
    biomeLineEl = document.getElementById("biomeLine");
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
    toolsEl = document.getElementById("tools");
    mapBtn = document.getElementById("mapBtn");
    dioramaBtn = document.getElementById("dioramaBtn");
    measureBtn = document.getElementById("measureBtn");
    measureClear = document.getElementById("measureClear");
    measurePanel = document.getElementById("measurePanel");
    measureCountEl = document.getElementById("measureCount");
    measureTotalEl = document.getElementById("measureTotal");
    measureTimeEl = document.getElementById("measureTime");
    measureRouteEl = document.getElementById("measureRoute");

    buildKey();
    drawHomeHorizon();
    updateMeasureUI();
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);

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

    mapBtn.addEventListener("click", () => setMode("map"));
    dioramaBtn.addEventListener("click", () => setMode("diorama"));
    measureBtn.addEventListener("click", () => setMeasureActive(!state.measure.active));
    measureClear.addEventListener("click", clearMeasure);

    seedForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (state.mapShown) return;
      startMap(seedInput.value);
    });
    seedInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (state.mapShown) return;
        startMap(seedInput.value);
      }
    });
    seedInput.addEventListener("input", () => {
      seedForm.classList.remove("invalid");
    });

    // A tiny debug handle keeps automated verification honest without adding UI.
    window.__seedmap = {
      start: (s) => { seedInput.value = s; return startMap(s); },
      home: goHome,
      get seed() { return state.seedText; },
      get scale() { return state.cam.s; },
      get center() { return { x: state.cam.x, z: state.cam.z }; },
      get tiles() { return tiles.size; },
      get readyTiles() { return visibleTiles.filter((t) => t.done).length; },
      get structures() { return struct.known.length; },
      get strongholds() { return struct.known.filter((s) => s.type === "stronghold").length; },
      get pendingStrongholds() { return state.strongholdJob ? state.strongholdJob.remaining : 0; },
      get pendingStructures() { return struct.queue.length; },
      get pendingDense() { return dense.queue.length; },
      get denseCells() { return dense.done.size; },
      get markers() { return screenMarkers.map((m) => ({ x: Math.round(m.x), y: Math.round(m.y), type: m.type })); },
      get mapShown() { return state.mapShown; },
      get pointers() { return state.pointers.size; },
      get mode() { return state.mode; },
      get points() { return state.measure.points.map((p) => ({ x: p.x, z: p.z })); },
      get distance() { return measureStats().total; },
      get diorama() {
        const g = diorama.grid;
        return g ? {
          cols: g.cols, rows: g.rows, done: g.done, total: g.total,
          x0: g.x0, z0: g.z0, stepX: g.stepX, stepZ: g.stepZ,
        } : null;
      },
      setMode,
      measure: (on) => setMeasureActive(on === undefined ? !state.measure.active : on),
      clearMeasure,
      addPoint: (x, z) => addMeasurePoint(x, z),
      heightAt: (x, z) => heightAtBlock(x, z),
      screenToWorld: (x, y) => screenToWorldView(x, y),
      biomeAt: (x, z) => state.world ? BIOMES[state.world.biomeAtBlock(x, z)] || BIOME_FALLBACK : null,
      zoom: (f) => { zoomAt(state.vw / 2, state.vh / 2, f); },
      pan: (dx, dz) => { state.cam.x += dx; state.cam.z += dz; state.target.x = state.cam.x; state.target.z = state.cam.z; state.dirty = true; if (state.mode === "diorama") startDiorama(); },
    };

    if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) {
      setTimeout(() => seedInput.focus(), 250);
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
