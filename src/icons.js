/* Structure sprites, names and key order. Original 16x16 pixel art. */
(function (global) {
  "use strict";

  const U = global.SeedMapUtil;
  const XHTML = U.XHTML;

  // One shared pixel grid keeps the key, the map and the hover cards in the
  // same visual language, and every structure gets a distinct silhouette.
  const PALETTE = {
    K: "#241c13", w: "#9a6a3a", d: "#6b4522", r: "#b34a33", R: "#d2654a",
    s: "#9a9a92", S: "#c9c9be", n: "#5f5f59", g: "#5f8f3f", G: "#7fae53",
    a: "#d9c283", A: "#b39a55", b: "#3f7fa6", B: "#6aa8c8", o: "#c98f2e",
    O: "#e8bd58", p: "#6b4a8a", P: "#9a72b8", t: "#3f8f8a", T: "#74b8b0",
    x: "#efe7d4", e: "#5fc98a", c: "#a85c36", C: "#d08a55", q: "#2e2a36",
    Q: "#4c4350", h: "#4c5148", y: "#f0d27a", l: "#d8b877",
  };

  const ART = {
    village: [
      "................",
      "....KKKKKKKK....",
      "...KRRRRRRRRK...",
      "..KRRRRRRRRRRK..",
      "..KKKKKKKKKKKK..",
      "..KwwwwwwwwwwK..",
      "..KwKKwwwwKKwK..",
      "..KwKKwwwwKKwK..",
      "..KwwwwwwwwwwK..",
      "..KwwwwKKwwwwK..",
      "..KwwwwKKwwwwK..",
      "..KwwwwKKwwwwK..",
      "..KwwwwwwwwwwK..",
      "..KKKKKKKKKKKK..",
      "..KggggggggggK..",
      "..KKKKKKKKKKKK..",
    ],
    monument: [
      "................",
      "...KKKKKKKKKK...",
      "..KtTTTTTTTTtK..",
      "..KtTTTTTTTTtK..",
      "..KKKKKKKKKKKK..",
      "..KttttttttttK..",
      "..KtKKKKKKKKtK..",
      "..KtKTTTTTTKtK..",
      "..KtKTTTTTTKtK..",
      "..KtKTTTTTTKtK..",
      "..KtKKKKKKKKtK..",
      "..KttttttttttK..",
      "..KKKKKKKKKKKK..",
      ".BbbbbbbbbbbbbB.",
      ".bBbBbBbBbBbBbB.",
      "................",
    ],
    outpost: [
      "................",
      ".......KKKK.....",
      "......KrrrrK....",
      "......KKKKKK....",
      "...KKKKKKKKKKK..",
      "...KhhhhhhhhhK..",
      "...KhKwwwwwKhK..",
      "...KhKwwwwwKhK..",
      "...KhKwwwwwKhK..",
      "...KhKwwwwwKhK..",
      "...KKKKKKKKKKK..",
      "..KhhK.....KhhK.",
      "..KhhK.....KhhK.",
      "..KKKK.....KKKK.",
      "................",
      "................",
    ],
    mansion: [
      "................",
      ".KKKKK..KKKKK...",
      ".KhhhhKKhhhhhK..",
      ".KhhhhKhhhhhhK..",
      ".KKKKKKKKKKKKKK.",
      ".KssssssssssssK.",
      ".KsKKsssKKsssKK.",
      ".KsKyKsssKyKsKK.",
      ".KsKKsssKKsssKK.",
      ".KssssssssssssK.",
      ".KKKKKKKKKKKKKK.",
      ".KhhhhhhhhhhhhK.",
      ".KhKKhhhhhhKKhK.",
      ".KhKKhhhhhhKKhK.",
      ".KhhhhhhhhhhhhK.",
      ".KKKKKKKKKKKKKK.",
    ],
    ancient: [
      "................",
      "..KKKK....KKKK..",
      ".KttttKKKKttttK.",
      ".KtTTTTTTTTTTtK.",
      ".KtTKKKKKKKKTtK.",
      ".KtTKKKKKKKKTtK.",
      ".KtTKKKeeKKKTtK.",
      ".KtTKKeeeeKKTtK.",
      ".KtTKKeeeeKKTtK.",
      ".KtTKKKeeKKKTtK.",
      ".KtTKKKKKKKKTtK.",
      ".KtTKKKKKKKKTtK.",
      ".KtTTTTTTTTTTtK.",
      ".KttttttttttttK.",
      "..KKKKKKKKKKKK..",
      "................",
    ],
    trial: [
      "................",
      "..KKKKKKKKKKKK..",
      "..KcCCCCCCCCcK..",
      "..KCcOOOOOOcCK..",
      "..KCcOKKKKOcCK..",
      "..KCcOKyyKOcCK..",
      "..KCcOKyyKOcCK..",
      "..KCcOKKKKOcCK..",
      "..KCcOOOOOOcCK..",
      "..KCcCCCCCCcCK..",
      "..KcCCCCCCCCcK..",
      "..KKKKKKKKKKKK..",
      "..KcKcKcKcKcK...",
      "..KKKKKKKKKKKK..",
      "................",
      "................",
    ],
    pyramid: [
      "................",
      ".....KKKKKK.....",
      "....KAAAAAAK....",
      "....KKKKKKKK....",
      "...KaaaaaaaaK...",
      "...KKKKKKKKKK...",
      "..KaaaaaaaaaaK..",
      "..KKKKKKKKKKKK..",
      ".KaaaaaaaaaaaaK.",
      ".KKKKKKKKKKKKKK.",
      ".KAAAAKKKKAAAAK.",
      ".KAAAAKddKAAAAK.",
      ".KKKKKKddKKKKKK.",
      ".AaaaAaaaaAaaaA.",
      ".AaAaAaAaAaAaAa.",
      "................",
    ],
    temple: [
      "................",
      "..KKKKKKKKKKKK..",
      "..KggggggggggK..",
      "..KgKKKKKKKKgK..",
      "..KgKssssssKgK..",
      "..KgKsKKKKsKgK..",
      "..KgKsKKKKsKgK..",
      "..KgKssssssKgK..",
      "..KgKKKKKKKKgK..",
      "..KggggggggggK..",
      "..KKKKKKKKKKKK..",
      ".gKssssssssssKg.",
      ".gKsKKssKKsssKg.",
      ".KKKKKKKKKKKKKK.",
      "..g..g....g..g..",
      "................",
    ],
    hut: [
      "................",
      "....KKKKKKKK....",
      "...KddddddddK...",
      "..KddddddddddK..",
      "..KKKKKKKKKKKK..",
      "...KwwwwwwwwK...",
      "...KwKKKKKKwK...",
      "...KwwwwwwwwK...",
      "...KKKKKKKKKK...",
      "....Kww..wwK....",
      "....Kww..wwK....",
      "....Kww..wwK....",
      "....Kww..wwK....",
      "....KKK..KKK....",
      ".bBbBbBbBbBbBbB.",
      ".BbbbbbbbbbbbbB.",
    ],
    igloo: [
      "................",
      ".....KKKKKK.....",
      "....KxxxxxxK....",
      "...KxxxxxxxxK...",
      "..KxxxxxxxxxxK..",
      "..KxxxxxxxxxxK..",
      ".KxxxxxxxxxxxxK.",
      ".KxxxxxBBxxxxxK.",
      ".KxxxxKBBKxxxxK.",
      ".KxxxKBBBBKxxxK.",
      ".KxxxKBBBBKxxxK.",
      ".KKKKKKKKKKKKKK.",
      "..KBBBBBBBBBBK..",
      "..KBBBBBBBBBBK..",
      "..KKKKKKKKKKKK..",
      "................",
    ],
    shipwreck: [
      "................",
      "..........KK....",
      ".........KwwK...",
      ".........KwwK...",
      "....KKKKKKwwK...",
      "...KwwwwwwwwK...",
      "..KwwwwwwwwK....",
      "..KKwwwwwwK.....",
      "...KKwwwwK......",
      ".....KwwK.......",
      "......KK........",
      ".bBbBbBbBbBbBbB.",
      ".BbbbbbbbbbbbbB.",
      ".BbbbbbbbbbbbbB.",
      "................",
      "................",
    ],
    ruin: [
      "................",
      "...KKK....KKK...",
      "..KsssK..KsssK..",
      "..KsTsK..KsTsK..",
      "..KsssK..KsssK..",
      "..KKKKKKKKKKKK..",
      "..KssssssssssK..",
      "..KsTTTTTTTTsK..",
      "..KsTsKKKKsTsK..",
      "..KsTKssssKsTK..",
      "..KssssssssssK..",
      "..KKKKKKKKKKKK..",
      ".BbbbbbbbbbbbbB.",
      ".bBbBbBbBbBbBbB.",
      "................",
      "................",
    ],
    trail: [
      "................",
      "..KKKKKKKKKKKK..",
      "..KccccccccccK..",
      "..KcKKccKKccKK..",
      "..KccccccccccK..",
      "..KKKKKKKKKKKK..",
      "..KCCCCCCCCCCK..",
      "..KCKKCCKKCCKK..",
      "..KCCCCCCCCCCK..",
      "..KKKKKKKKKKKK..",
      "..KaaaaaaaaaaK..",
      "..KaKKaaKKaaKK..",
      "..KaaaaaaaaaaK..",
      "..KKKKKKKKKKKK..",
      "..c..c....c..c..",
      "................",
    ],
    treasure: [
      "................",
      ".....K..K.......",
      "......KK........",
      ".....K..K.......",
      "..KKKKKKKKKKKK..",
      ".KwwwwwwwwwwwwK.",
      ".KwOOwOOwOOwOwK.",
      ".KwwwwwwwwwwwwK.",
      ".KKKKKKKKKKKKKK.",
      ".KwKKKKKKKKKKwK.",
      ".KwwwwwwwwwwwwK.",
      ".KKKKKKKKKKKKKK.",
      "..K..........K..",
      "..K..........K..",
      "................",
      "................",
    ],
    mineshaft: [
      "................",
      "....KKKKKKKK....",
      "....KwwwwwwK....",
      "....KwKKKKwK....",
      "....KwKllKwK....",
      "....KwKllKwK....",
      "....KwKllKwK....",
      "....KwKllKwK....",
      "....KwKKKKwK....",
      "..KKKKKKKKKKKK..",
      "..KnnnnnnnnnnK..",
      "..KKnnnnnnnnKK..",
      ".KKKKKKKKKKKKKK.",
      ".o..o..o..o..o..",
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
      "..KKKKKKKKKKKK..",
      "................",
      "................",
    ],
  };

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

  const ORDER = [
    "village", "monument", "outpost", "mansion", "ancient", "trial",
    "pyramid", "temple", "hut", "igloo", "shipwreck", "ruin",
    "trail", "treasure", "mineshaft", "portal", "stronghold",
  ];

  // Drawn in a fixed 18-cell grid: the 16-cell art plus one cell of cream
  // sticker edge, with a soft shadow. The sprite is the whole marker; there is
  // no plate or halo behind it.
  const CELL = 3;
  const GRID = 18;
  const cache = new Map();

  function canvas(type) {
    let c = cache.get(type);
    if (c) return c;
    c = document.createElementNS(XHTML, "canvas");
    c.width = GRID * CELL;
    c.height = GRID * CELL;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;

    const rows = ART[type] || ART.village;
    const filled = new Set();
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (PALETTE[rows[y][x]]) filled.add(x + "," + y);
      }
    }
    const around = [
      [-1, 0], [1, 0], [0, -1], [0, 1],
      [-1, -1], [1, -1], [-1, 1], [1, 1],
    ];

    g.fillStyle = "rgba(8, 7, 5, 0.5)";
    for (const key of filled) {
      const [x, y] = key.split(",").map(Number);
      g.fillRect((x + 1) * CELL, (y + 1) * CELL + CELL * 0.55, CELL, CELL);
    }

    g.fillStyle = "#f4eddd";
    for (const key of filled) {
      const [x, y] = key.split(",").map(Number);
      for (const [dx, dy] of around) {
        if (filled.has((x + dx) + "," + (y + dy))) continue;
        g.fillRect((x + dx + 1) * CELL, (y + dy + 1) * CELL, CELL, CELL);
      }
    }

    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const colour = PALETTE[rows[y][x]];
        if (!colour) continue;
        g.fillStyle = colour;
        g.fillRect((x + 1) * CELL, (y + 1) * CELL, CELL, CELL);
      }
    }

    c.style.imageRendering = "pixelated";
    cache.set(type, c);
    return c;
  }

  function node(type, size) {
    const c = canvas(type);
    const copy = c.cloneNode();
    copy.width = c.width;
    copy.height = c.height;
    copy.getContext("2d").drawImage(c, 0, 0);
    copy.style.width = size + "px";
    copy.style.height = size + "px";
    return copy;
  }

  global.SeedMapIcons = { LABELS, ORDER, canvas, node };
})(typeof window !== "undefined" ? window : globalThis);
