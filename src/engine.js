/*
 * Seed-map world engine — a compact JS port of the relevant parts of
 * Cubitect/cubiomes (MIT): Xoroshiro128++, Java LCG, Minecraft's Perlin
 * octave noise, the 1.18+ climate parameter router, the vanilla biome
 * parameter search tree, and structure placement RNG.
 *
 * All randomness is 64-bit accurate via BigInt. Climate sampling is 2D:
 * every column is evaluated at block y=316 (noise y=79), the same noise layer
 * as vanilla's structure checks, so this is a surface-biome map rather than a
 * true 3D biome volume.
 */
(function () {
  "use strict";

  const M64 = (1n << 64n) - 1n;
  const M48 = (1n << 48n) - 1n;
  const KLCG = 0x5deece66dn;

  // ------------------------------------------------------------------ RNG

  const rotl64 = (x, b) => BigInt.asUintN(64, (x << b) | (x >> (64n - b)));

  class Xoroshiro {
    constructor(lo = 0n, hi = 0n) { this.lo = lo; this.hi = hi; }

    setSeed(value) {
      const XL = 0x9e3779b97f4a7c15n;
      const XH = 0x6a09e667f3bcc909n;
      const A = 0xbf58476d1ce4e5b9n;
      const B = 0x94d049bb133111ebn;
      let l = BigInt.asUintN(64, value ^ XH);
      let h = BigInt.asUintN(64, l + XL);
      l = BigInt.asUintN(64, (l ^ (l >> 30n)) * A);
      h = BigInt.asUintN(64, (h ^ (h >> 30n)) * A);
      l = BigInt.asUintN(64, (l ^ (l >> 27n)) * B);
      h = BigInt.asUintN(64, (h ^ (h >> 27n)) * B);
      this.lo = l ^ (l >> 31n);
      this.hi = h ^ (h >> 31n);
      return this;
    }

    nextLong() {
      const l = this.lo, h = this.hi;
      const n = BigInt.asUintN(64, rotl64(BigInt.asUintN(64, l + h), 17n) + l);
      const x = h ^ l;
      this.lo = rotl64(l, 49n) ^ x ^ BigInt.asUintN(64, x << 21n);
      this.hi = rotl64(x, 28n);
      return n;
    }

    nextDouble() {
      return Number(this.nextLong() >> 11n) * 1.1102230246251565e-16;
    }

    nextFloat() {
      return Number(this.nextLong() >> 40n) * 5.960464477539063e-8;
    }

    nextInt(n) {
      let r = (this.nextLong() & 0xffffffffn) * BigInt(n);
      if (BigInt.asUintN(32, r) < BigInt(n)) {
        const limit = BigInt((4294967296 - n) % n);
        while (BigInt.asUintN(32, r) < limit) {
          r = (this.nextLong() & 0xffffffffn) * BigInt(n);
        }
      }
      return Number(r >> 32n);
    }
  }

  // Java's 48-bit LCG, used for structure placement and strongholds.
  function lcgFromSeed(value) {
    return BigInt.asUintN(48, BigInt.asUintN(64, value) ^ KLCG);
  }
  function lcgNext(s, bits) {
    s = BigInt.asUintN(48, s * KLCG + 0xbn);
    return { s, v: Number(s >> BigInt(48 - bits)) };
  }
  function lcgNextInt(s, n) {
    const m = n - 1;
    if ((m & n) === 0) {
      // Java's power-of-two branch keeps the full 64-bit product; masking it
      // to 32 bits truncates the result for n >= 4.
      const a = lcgNext(s, 31);
      const x = BigInt(n) * BigInt(a.v);
      return { s: a.s, v: Number(x >> 31n) };
    }
    let bits, val;
    do {
      const a = lcgNext(s, 31);
      s = a.s; bits = a.v;
      val = bits % n;
    } while (((bits - val + m) | 0) < 0);
    return { s, v: val };
  }
  function lcgNextDouble(s) {
    const a = lcgNext(s, 26);
    const b = lcgNext(a.s, 27);
    const x = (BigInt(a.v) << 27n) + BigInt(b.v);
    return { s: b.s, v: Number(x) / 9007199254740992 };
  }
  function lcgNextFloat(s) {
    const a = lcgNext(s, 24);
    return { s: a.s, v: a.v / 16777216 };
  }

  // --------------------------------------------------------------- Perlin

  const GRAD = new Float64Array([
    1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
    1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
    0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
    1, 1, 0, 0, -1, 1, -1, 1, 0, 0, -1, -1,
  ]);

  const lerp = (t, a, b) => a + t * (b - a);

  class Perlin {
    constructor() {
      this.p = new Uint8Array(257);
      this.a = 0; this.b = 0; this.c = 0;
      this.h2 = 0; this.d2 = 0; this.t2 = 0;
      this.amplitude = 1;
      this.lacunarity = 1;
    }
  }

  function perlinInit(noise, xr) {
    const p = noise.p;
    noise.a = xr.nextDouble() * 256;
    noise.b = xr.nextDouble() * 256;
    noise.c = xr.nextDouble() * 256;
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 0; i < 256; i++) {
      const j = xr.nextInt(256 - i) + i;
      const n = p[i]; p[i] = p[j]; p[j] = n;
    }
    p[256] = p[0];
    const ib = Math.floor(noise.b);
    const d2 = noise.b - ib;
    noise.h2 = ib & 255;
    noise.d2 = d2;
    noise.t2 = fade(d2);
  }

  const fade = (d) => d * d * d * (d * (d * 6 - 15) + 10);

  // Full 3D improved Perlin sample; yamp is always zero for climate noise.
  // The hash/gradient section is kept flat and branch-free: this is the hot
  // loop for every biome pixel, so every lookup counts.
  function samplePerlin(noise, d1, d2in, d3) {
    const p = noise.p;
    let d2, h2, t2;
    if (d2in === 0) {
      d2 = noise.d2; h2 = noise.h2; t2 = noise.t2;
    } else {
      d2 = d2in + noise.b;
      const i2 = Math.floor(d2);
      d2 -= i2;
      h2 = i2 & 255;
      t2 = fade(d2);
    }
    d1 += noise.a;
    d3 += noise.c;
    const i1 = Math.floor(d1);
    const i3 = Math.floor(d3);
    d1 -= i1;
    d3 -= i3;
    const h1 = i1 & 255;
    const h3 = i3 & 255;
    const t1 = fade(d1);
    const t3 = fade(d3);

    const a1 = (p[h1] + h2) & 255, b1 = (p[h1 + 1] + h2) & 255;
    const a2 = (p[a1] + h3) & 255, b2 = (p[a1 + 1] + h3) & 255;
    const c2 = (p[b1] + h3) & 255, e2 = (p[b1 + 1] + h3) & 255;
    const g0 = p[a2], g1 = p[a2 + 1], g2 = p[b2], g3 = p[b2 + 1];
    const g4 = p[c2], g5 = p[c2 + 1], g6 = p[e2], g7 = p[e2 + 1];

    const dx = d1, dy = d2, dz = d3;
    const b0 = (g0 & 15) * 3, b1g = (g1 & 15) * 3, b2g = (g2 & 15) * 3, b3g = (g3 & 15) * 3;
    const b4g = (g4 & 15) * 3, b5g = (g5 & 15) * 3, b6g = (g6 & 15) * 3, b7g = (g7 & 15) * 3;
    const l1 = GRAD[b0] * dx + GRAD[b0 + 1] * dy + GRAD[b0 + 2] * dz;
    const l5 = GRAD[b1g] * dx + GRAD[b1g + 1] * dy + GRAD[b1g + 2] * (dz - 1);
    const l2 = GRAD[b4g] * (dx - 1) + GRAD[b4g + 1] * dy + GRAD[b4g + 2] * dz;
    const l6 = GRAD[b5g] * (dx - 1) + GRAD[b5g + 1] * dy + GRAD[b5g + 2] * (dz - 1);
    const l3 = GRAD[b2g] * dx + GRAD[b2g + 1] * (dy - 1) + GRAD[b2g + 2] * dz;
    const l7 = GRAD[b3g] * dx + GRAD[b3g + 1] * (dy - 1) + GRAD[b3g + 2] * (dz - 1);
    const l4 = GRAD[b6g] * (dx - 1) + GRAD[b6g + 1] * (dy - 1) + GRAD[b6g + 2] * dz;
    const l8 = GRAD[b7g] * (dx - 1) + GRAD[b7g + 1] * (dy - 1) + GRAD[b7g + 2] * (dz - 1);

    const m1 = lerp(t1, l1, l2);
    const m2 = lerp(t1, l3, l4);
    const m3 = lerp(t1, l5, l6);
    const m4 = lerp(t1, l7, l8);
    return lerp(t3, lerp(t2, m1, m2), lerp(t2, m3, m4));
  }

  function sampleOctave(octs, x, y, z, maxFreq) {
    let v = 0;
    for (let i = 0; i < octs.length; i++) {
      const p = octs[i];
      if (p.lacunarity > maxFreq) continue;
      v += p.amplitude * samplePerlin(
        p, x * p.lacunarity, y * p.lacunarity, z * p.lacunarity);
    }
    return v;
  }

  function sampleDoublePerlin(dp, x, y, z, maxFreq) {
    const f = 337.0 / 331.0;
    const v = sampleOctave(dp.A, x, y, z, maxFreq) +
      sampleOctave(dp.B, x * f, y * f, z * f, maxFreq);
    return v * dp.amplitude;
  }

  // Climate coordinates are quart coordinates: one unit is four blocks.
  // This function is deliberately module-private; World only exposes block
  // coordinate results so a caller cannot accidentally feed blocks into noise.
  function sampleNoise(world, x, z, maxFreq = Infinity, y = 79, cache = null) {
    const cl = world.climate;
    const shiftX = sampleDoublePerlin(cl[NP_SHIFT], x, 0, z, maxFreq) * 4;
    const shiftZ = sampleDoublePerlin(cl[NP_SHIFT], z, x, 0, maxFreq) * 4;
    const px = x + shiftX, pz = z + shiftZ;
    const c = f32(sampleDoublePerlin(cl[NP_CONTINENTALNESS], px, 0, pz, maxFreq));
    const e = f32(sampleDoublePerlin(cl[NP_EROSION], px, 0, pz, maxFreq));
    const w = f32(sampleDoublePerlin(cl[NP_WEIRDNESS], px, 0, pz, maxFreq));
    const ridge = f32(-3 * (Math.abs(Math.abs(w) - 0.6666667) - 0.33333334));
    const off = getSpline(world.depthSpline, [c, e, ridge, w]) + 0.015;
    const d = 1 - (y * 4) / 128 - 83 / 160 + off;
    const t = f32(sampleDoublePerlin(cl[NP_TEMPERATURE], px, 0, pz, maxFreq));
    const h = f32(sampleDoublePerlin(cl[NP_HUMIDITY], px, 0, pz, maxFreq));
    const np = [
      Math.trunc(10000 * t), Math.trunc(10000 * h), Math.trunc(10000 * c),
      Math.trunc(10000 * e), Math.trunc(f32(10000 * f32(d))), Math.trunc(10000 * w),
    ];
    return { np, biome: TREE.lookup(np, cache) };
  }

  // -------------------------------------------------- octave initialization

  // md5("octave_<n>"), n = -12..0, as pairs of 64-bit constants.
  const OCTAVE_SALT = [
    [0xb198de63a8012672n, 0x7b84cad43ef7b5a8n],
    [0x0fd787bfbc403ec3n, 0x74a4a31ca21b48b8n],
    [0x36d326eed40efeb2n, 0x5be9ce18223c636an],
    [0x082fe255f8be6631n, 0x4e96119e22dedc81n],
    [0x0ef68ec68504005en, 0x48b6bf93a2789640n],
    [0xf11268128982754fn, 0x257a1d670430b0aan],
    [0xe51c98ce7d1de664n, 0x5f9478a733040c45n],
    [0x6d7b49e7e429850an, 0x2e3063c622a24777n],
    [0xbd90d5377ba1b762n, 0xc07317d419a7548dn],
    [0x53d39c6752dac858n, 0xbcd1c5a80ab65b3en],
    [0xb4a24d7a84e7677bn, 0x023ff9668e89b5c4n],
    [0xdffa22b534c5f608n, 0xb9b67517d3665ca9n],
    [0xd50708086cef4d7cn, 0x6e1651ecc7f43309n],
  ];

  const PERSIST = [0, 1, 2 / 3, 4 / 7, 8 / 15, 16 / 31, 32 / 63, 64 / 127, 128 / 255, 256 / 511];

  function octaveInit(xr, amps, omin) {
    const xlo = xr.nextLong();
    const xhi = xr.nextLong();
    let lacuna = Math.pow(2, omin);
    let persist = PERSIST[amps.length];
    const out = [];
    for (let i = 0; i < amps.length; i++) {
      if (amps[i] !== 0) {
        const salt = OCTAVE_SALT[12 + omin + i];
        const pxr = new Xoroshiro(xlo ^ salt[0], xhi ^ salt[1]);
        const p = new Perlin();
        perlinInit(p, pxr);
        p.amplitude = amps[i] * persist;
        p.lacunarity = lacuna;
        out.push(p);
      }
      lacuna *= 2;
      persist *= 0.5;
    }
    return out;
  }

  function doublePerlinInit(xr, amps, omin) {
    const A = octaveInit(xr, amps, omin);
    const B = octaveInit(xr, amps, omin);
    let len = amps.length;
    while (len > 0 && amps[len - 1] === 0) len--;
    for (let i = 0; i < len && amps[i] === 0; i++) len--;
    return {
      A, B,
      amplitude: (10 / 6) * len / (len + 1), // amp_ini[len] == (5/3)*len/(len+1)
    };
  }

  // ---------------------------------------------------------- climate router

  const NP_TEMPERATURE = 0, NP_HUMIDITY = 1, NP_CONTINENTALNESS = 2;
  const NP_EROSION = 3, NP_SHIFT = 4, NP_WEIRDNESS = 5;

  const CLIMATE_DEFS = [
    { saltLo: 0x5c7e6b29735f0d7fn, saltHi: 0xf7d86f1bbc734988n, amps: [1.5, 0, 1, 0, 0, 0], omin: -10 },
    { saltLo: 0x81bb4d22e8dc168en, saltHi: 0xf1c8b4bea16303cdn, amps: [1, 1, 0, 0, 0, 0], omin: -8 },
    { saltLo: 0x83886c9d0ae3a662n, saltHi: 0xafa638a61b42e8adn, amps: [1, 1, 2, 2, 2, 1, 1, 1, 1], omin: -9 },
    { saltLo: 0xd02491e6058f6fd8n, saltHi: 0x4792512c94c17a80n, amps: [1, 1, 0, 1, 1], omin: -9 },
    { saltLo: 0x080518cf6af25384n, saltHi: 0x3f3dfb40a54febd5n, amps: [1, 1, 1, 0], omin: -3 },
    { saltLo: 0xefc8ef4d36102b34n, saltHi: 0x1beeeb324a0f24ean, amps: [1, 2, 1, 0, 0, 0], omin: -7 },
  ];

  // ---------------------------------------------------------------- splines

  const SP_CONTINENTALNESS = 0, SP_EROSION = 1, SP_RIDGES = 2, SP_WEIRDNESS = 3;
  const f32 = Math.fround;

  function fixSpline(val) { return { fix: f32(val) }; }

  function addSplineVal(sp, loc, val, der) {
    sp.loc.push(f32(loc)); sp.val.push(val); sp.der.push(f32(der));
    return sp;
  }
  function newSpline(typ) { return { typ, loc: [], val: [], der: [] }; }

  function getOffsetValue(weirdness, continentalness) {
    const f0 = f32(1 - (1 - continentalness) * 0.5);
    const f1 = f32(0.5 * (1 - continentalness));
    const f2 = f32((weirdness + 1.17) * 0.46082947);
    const off = f32(f2 * f0 - f1);
    if (weirdness < -0.7) return Math.max(off, -0.2222);
    return Math.max(off, 0);
  }

  function spline38219(f, bl) {
    const sp = newSpline(SP_RIDGES);
    const i = getOffsetValue(-1, f);
    const k = getOffsetValue(1, f);
    let l = f32(1 - (1 - f) * 0.5);
    let u = f32(0.5 * (1 - f));
    l = f32(u / (0.46082947 * l) - 1.17);
    if (l > -0.65 && l < 1) {
      u = getOffsetValue(-0.65, f);
      const p = getOffsetValue(-0.75, f);
      const q = f32((p - i) * 4);
      const r = getOffsetValue(l, f);
      const s = f32((k - r) / (1 - l));
      addSplineVal(sp, -1, fixSpline(i), q);
      addSplineVal(sp, -0.75, fixSpline(p), 0);
      addSplineVal(sp, -0.65, fixSpline(u), 0);
      addSplineVal(sp, l - 0.01, fixSpline(r), 0);
      addSplineVal(sp, l, fixSpline(r), s);
      addSplineVal(sp, 1, fixSpline(k), s);
    } else {
      u = f32((k - i) * 0.5);
      if (bl) {
        addSplineVal(sp, -1, fixSpline(i > 0.2 ? i : 0.2), 0);
        addSplineVal(sp, 0, fixSpline(lerp(0.5, i, k)), u);
      } else {
        addSplineVal(sp, -1, fixSpline(i), u);
      }
      addSplineVal(sp, 1, fixSpline(k), u);
    }
    return sp;
  }

  function flatOffsetSpline(f, g, h, i, j, k) {
    const sp = newSpline(SP_RIDGES);
    let l = f32(0.5 * (g - f)); if (l < k) l = k;
    const m = f32(5 * (h - g));
    addSplineVal(sp, -1, fixSpline(f), l);
    addSplineVal(sp, -0.4, fixSpline(g), l < m ? l : m);
    addSplineVal(sp, 0, fixSpline(h), m);
    addSplineVal(sp, 0.4, fixSpline(i), f32(2 * (i - h)));
    addSplineVal(sp, 1, fixSpline(j), f32(0.7 * (j - i)));
    return sp;
  }

  function landSpline(f, g, h, i, j, k, bl) {
    const sp1 = spline38219(lerp(i, 0.6, 1.5), bl);
    const sp2 = spline38219(lerp(i, 0.6, 1.0), bl);
    const sp3 = spline38219(i, bl);
    const ih = f32(0.5 * i);
    const sp4 = flatOffsetSpline(f - 0.15, ih, ih, ih, i * 0.6, 0.5);
    const sp5 = flatOffsetSpline(f, j * i, g * i, ih, i * 0.6, 0.5);
    const sp6 = flatOffsetSpline(f, j, j, g, h, 0.5);
    const sp7 = flatOffsetSpline(f, j, j, g, h, 0.5);

    const sp8 = newSpline(SP_RIDGES);
    addSplineVal(sp8, -1, fixSpline(f), 0);
    addSplineVal(sp8, -0.4, sp6, 0);
    addSplineVal(sp8, 0, fixSpline(h + 0.07), 0);

    const sp9 = flatOffsetSpline(-0.02, k, k, g, h, 0);
    const sp = newSpline(SP_EROSION);
    addSplineVal(sp, -0.85, sp1, 0);
    addSplineVal(sp, -0.7, sp2, 0);
    addSplineVal(sp, -0.4, sp3, 0);
    addSplineVal(sp, -0.35, sp4, 0);
    addSplineVal(sp, -0.1, sp5, 0);
    addSplineVal(sp, 0.2, sp6, 0);
    if (bl) {
      addSplineVal(sp, 0.4, sp7, 0);
      addSplineVal(sp, 0.45, sp8, 0);
      addSplineVal(sp, 0.55, sp8, 0);
      addSplineVal(sp, 0.58, sp7, 0);
    }
    addSplineVal(sp, 0.7, sp9, 0);
    return sp;
  }

  function buildDepthSpline() {
    const root = newSpline(SP_CONTINENTALNESS);
    const sp1 = landSpline(-0.15, 0, 0, 0.1, 0, -0.03, 0);
    const sp2 = landSpline(-0.1, 0.03, 0.1, 0.1, 0.01, -0.03, 0);
    const sp3 = landSpline(-0.1, 0.03, 0.1, 0.7, 0.01, -0.03, 1);
    const sp4 = landSpline(-0.05, 0.03, 0.1, 1.0, 0.01, 0.01, 1);
    addSplineVal(root, -1.1, fixSpline(0.044), 0);
    addSplineVal(root, -1.02, fixSpline(-0.2222), 0);
    addSplineVal(root, -0.51, fixSpline(-0.2222), 0);
    addSplineVal(root, -0.44, fixSpline(-0.12), 0);
    addSplineVal(root, -0.18, fixSpline(-0.12), 0);
    addSplineVal(root, -0.16, sp1, 0);
    addSplineVal(root, -0.15, sp1, 0);
    addSplineVal(root, -0.1, sp2, 0);
    addSplineVal(root, 0.25, sp3, 0);
    addSplineVal(root, 1, sp4, 0);
    return root;
  }

  function getSpline(sp, vals) {
    if (sp.fix !== undefined) return sp.fix;
    const f = vals[sp.typ];
    const loc = sp.loc, len = loc.length;
    let i = 0;
    while (i < len && loc[i] < f) i++;
    if (i === 0 || i === len) {
      if (i) i--;
      return f32(getSpline(sp.val[i], vals) + sp.der[i] * (f - loc[i]));
    }
    const g = loc[i - 1], h = loc[i];
    const k = f32((f - g) / (h - g));
    const l = sp.der[i - 1], m = sp.der[i];
    const n = getSpline(sp.val[i - 1], vals);
    const o = getSpline(sp.val[i], vals);
    const p = f32(l * (h - g) - (o - n));
    const q = f32(-m * (h - g) + (o - n));
    const r = f32(lerp(k, n, o) + k * (1 - k) * lerp(k, p, q));
    return r;
  }

  // ------------------------------------------------------------- biome tree

  // Builds an exact port of cubiomes' packed biome-parameter tree. The search
  // is closed over flat typed arrays so the hot loop stays monomorphic.
  function buildTree(data) {
    const bin = typeof atob === "function"
      ? atob(data.nodes)
      : Buffer.from(data.nodes, "base64").toString("binary");
    const count = bin.length >> 3;
    const child = new Uint16Array(count);
    const biome = new Uint8Array(count);
    const lo = new Int32Array(count * 6);
    const hi = new Int32Array(count * 6);
    const params = data.params;
    for (let i = 0; i < count; i++) {
      const o = i * 8;
      for (let d = 0; d < 6; d++) {
        const pi = bin.charCodeAt(o + d) * 2;
        lo[i * 6 + d] = params[pi];
        hi[i * 6 + d] = params[pi + 1];
      }
      child[i] = bin.charCodeAt(o + 6) | (bin.charCodeAt(o + 7) << 8);
      if (bin.charCodeAt(o + 7) === 0xff) biome[i] = bin.charCodeAt(o + 6);
    }
    const steps = data.steps, order = data.order, IDX = 0;

    function dist(idx, a, b, c, d, e, f) {
      const o = idx * 6;
      let q0 = a < lo[o] ? lo[o] - a : a > hi[o] ? a - hi[o] : 0;
      let q1 = b < lo[o + 1] ? lo[o + 1] - b : b > hi[o + 1] ? b - hi[o + 1] : 0;
      let q2 = c < lo[o + 2] ? lo[o + 2] - c : c > hi[o + 2] ? c - hi[o + 2] : 0;
      let q3 = d < lo[o + 3] ? lo[o + 3] - d : d > hi[o + 3] ? d - hi[o + 3] : 0;
      let q4 = e < lo[o + 4] ? lo[o + 4] - e : e > hi[o + 4] ? e - hi[o + 4] : 0;
      let q5 = f < lo[o + 5] ? lo[o + 5] - f : f > hi[o + 5] ? f - hi[o + 5] : 0;
      return q0 * q0 + q1 * q1 + q2 * q2 + q3 * q3 + q4 * q4 + q5 * q5;
    }

    function node(a, b, c, d, e, f, idx, alt, best, depth) {
      if (steps[depth] === 0) return idx;
      let step;
      do {
        step = steps[depth];
        depth++;
      } while (idx + step >= count);
      let inner = child[idx];
      let res = alt;
      for (let i = 0; i < order; i++) {
        const di = dist(inner, a, b, c, d, e, f);
        if (di < best) {
          const leaf = node(a, b, c, d, e, f, inner, res, best, depth);
          const dl = inner === leaf ? di : dist(leaf, a, b, c, d, e, f);
          if (dl < best) { best = dl; res = leaf; }
        }
        inner += step;
        if (inner >= count) break;
      }
      return res;
    }

    return {
      // Passing a cache object reproduces cubiomes' order-dependent
      // climateToBiome() path (MC-241546): the previous leaf becomes the
      // starting alternative for the next search in the same scan.
      lookup(np, cache) {
        let alt = 0;
        let best = Infinity;
        if (cache) {
          alt = cache.node | 0;
          best = dist(alt, np[0], np[1], np[2], np[3], np[4], np[5]);
        }
        const idx = node(
          np[0], np[1], np[2], np[3], np[4], np[5], 0, alt, best, 0
        );
        if (cache) cache.node = idx;
        return biome[idx];
      },
    };
  }

  let TREE = null;

  // ------------------------------------------------------------ world class

  class World {
    constructor(seedText, seed) {
      this.seedText = seedText;
      this.seed = seed;
      this.depthSpline = buildDepthSpline();

      const root = new Xoroshiro().setSeed(seed);
      const xlo = root.nextLong();
      const xhi = root.nextLong();
      this.climate = CLIMATE_DEFS.map((def) => {
        const xr = new Xoroshiro(xlo ^ def.saltLo, xhi ^ def.saltHi);
        return doublePerlinInit(xr, def.amps, def.omin);
      });
      if (!TREE) TREE = buildTree(globalThis.BIOME_TREE);
    }

    /**
     * Biome id for a world block. This is the only biome entry point the UI
     * uses: the /4 conversion to quart coordinates happens inside.
     */
    biomeAtBlock(x, z) {
      return blockBiome(this, x, z);
    }

    /**
     * Approximate terrain surface for a block column, from the same density
     * sample used by the biome lookup. The density at y = 79 (block 316) is
     * extrapolated to its zero crossing: blockY = 316 + 128 * density.
     * Water is flattened to sea level by the UI. This is a heightfield hint
     * for the diorama, not a full terrain generator.
     */
    surfaceAtBlock(x, z) {
      const r = sampleNoise(
        this, Math.floor(x / 4), Math.floor(z / 4), Infinity, 79
      );
      const h = 316 + 128 * (r.np[4] / 10000);
      return { biome: r.biome, height: Math.max(4, Math.min(200, h)) };
    }

    /**
     * Structure center for a region attempt, or null if the attempt is not
     * viable. Viability follows cubiomes' isViableStructurePos for 1.21.4.
     */
    structureAt(typeKey, rx, rz) {
      const st = STRUCT_BY_KEY[typeKey];
      if (!st || st.key === "stronghold") return null;
      const raw = rawStructurePos(st, this.seed, rx, rz);
      if (!raw || !structureViable(this, st, raw.x, raw.z)) return null;
      const off = st.centerOffset === undefined ? 8 : st.centerOffset;
      return { x: raw.x + off, z: raw.z + off };
    }

    /**
     * Every treasure or mineshaft marker in a block rectangle. These types
     * are per-chunk, so the UI calls this for coarse cells instead of using
     * the sparse region enumeration.
     */
    denseStructures(typeKey, x0, z0, x1, z1) {
      const st = STRUCT_BY_KEY[typeKey];
      if (!st || !st.dense) return [];
      const out = [];
      const cx0 = Math.floor(x0 / 16), cx1 = Math.floor(x1 / 16);
      const cz0 = Math.floor(z0 / 16), cz1 = Math.floor(z1 / 16);
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const raw = rawStructurePos(st, this.seed, cx, cz);
          if (!raw || !structureViable(this, st, raw.x, raw.z)) continue;
          const off = st.centerOffset === undefined ? 8 : st.centerOffset;
          out.push({ x: raw.x + off, z: raw.z + off });
        }
      }
      return out;
    }

    strongholds(limit = 128) {
      return strongholdsFor(this, limit);
    }

    strongholdIterator(limit = 128) {
      return strongholdIterator(this, limit);
    }
  }

  // ------------------------------------------------------ structure placement

  const STRUCTURES = [
    { key: "village", name: "Village", salt: 10387312n, spacing: 34, range: 26, kind: "feature", always: false,
      validBiomes: [1, 2, 35, 5, 12, 177] },
    { key: "monument", name: "Ocean monument", salt: 10387313n, spacing: 32, range: 27, kind: "large", always: false,
      validBiomes: [24, 48, 49, 50] },
    { key: "mansion", name: "Woodland mansion", salt: 10387319n, spacing: 80, range: 60, kind: "large", always: false,
      validBiomes: [29] },
    { key: "outpost", name: "Pillager outpost", salt: 165745296n, spacing: 32, range: 24, kind: "feature", always: false,
      validBiomes: [1, 2, 35, 12, 5, 177, 178, 179, 180, 181, 182, 185] },
    { key: "pyramid", name: "Desert pyramid", salt: 14357617n, spacing: 32, range: 24, kind: "feature", always: false,
      validBiomes: [2] },
    { key: "temple", name: "Jungle temple", salt: 14357619n, spacing: 32, range: 24, kind: "feature", always: false,
      validBiomes: [21, 168] },
    { key: "hut", name: "Swamp hut", salt: 14357620n, spacing: 32, range: 24, kind: "feature", always: false,
      validBiomes: [6] },
    { key: "igloo", name: "Igloo", salt: 14357618n, spacing: 32, range: 24, kind: "feature", always: false,
      validBiomes: [12, 30, 179] },
    { key: "shipwreck", name: "Shipwreck", salt: 165745295n, spacing: 24, range: 20, kind: "feature", always: false,
      validBiomes: [0, 10, 24, 44, 45, 46, 47, 48, 49, 50, 16, 26] },
    { key: "ruin", name: "Ocean ruin", salt: 14357621n, spacing: 20, range: 12, kind: "feature", always: false,
      validBiomes: [0, 10, 24, 44, 45, 46, 48, 49, 50] },
    { key: "portal", name: "Ruined portal", salt: 34222645n, spacing: 40, range: 25, kind: "feature", always: true },
    { key: "ancient", name: "Ancient city", salt: 20083232n, spacing: 24, range: 16, kind: "feature", always: false,
      variant: "ancient", validBiomes: [183] },
    { key: "trail", name: "Trail ruins", salt: 83469867n, spacing: 34, range: 26, kind: "feature", always: false,
      validBiomes: [5, 30, 32, 160, 155, 21] },
    { key: "trial", name: "Trial chambers", salt: 94251327n, spacing: 34, range: 22, kind: "feature", always: false,
      variant: "trial", validBiomes: [] },
    { key: "treasure", name: "Buried treasure", salt: 10387320n, spacing: 1, range: 1, kind: "treasure", always: false,
      dense: true, centerOffset: 0, validBiomes: [16, 26] },
    { key: "mineshaft", name: "Mineshaft", salt: 0n, spacing: 1, range: 1, kind: "mineshaft", always: false,
      dense: true, validBiomes: [] },
    { key: "stronghold", name: "Stronghold", always: true },
  ];

  function featureStructurePos(st, seed, rx, rz) {
    const range = st.range;
    const salt = st.salt;
    let s = BigInt.asUintN(64,
      seed + BigInt(rx) * 341873128712n + BigInt(rz) * 132897987541n + salt);
    s = s ^ KLCG;
    s = BigInt.asUintN(48, s * KLCG + 0xbn);
    let cx, cz;
    if ((range & (range - 1)) !== 0) {
      cx = Number(BigInt.asIntN(32, s >> 17n) % BigInt(range));
      if (cx < 0) cx += range;
      s = BigInt.asUintN(48, s * KLCG + 0xbn);
      cz = Number(BigInt.asIntN(32, s >> 17n) % BigInt(range));
      if (cz < 0) cz += range;
    } else {
      cx = Number((BigInt(range) * (s >> 17n)) >> 31n);
      s = BigInt.asUintN(48, s * KLCG + 0xbn);
      cz = Number((BigInt(range) * (s >> 17n)) >> 31n);
    }
    return {
      x: (rx * st.spacing + cx) * 16,
      z: (rz * st.spacing + cz) * 16,
    };
  }

  function largeStructurePos(st, seed, rx, rz) {
    const range = st.range;
    let s = BigInt.asUintN(64,
      seed + BigInt(rx) * 341873128712n + BigInt(rz) * 132897987541n + st.salt) ^ KLCG;
    const step = () => { s = BigInt.asUintN(48, s * KLCG + 0xbn); };
    let cx, cz;
    step(); cx = Number(BigInt.asIntN(32, s >> 17n) % BigInt(range)); if (cx < 0) cx += range;
    step(); cx += Number(BigInt.asIntN(32, s >> 17n) % BigInt(range)); if (cx < 0) cx += range;
    step(); cz = Number(BigInt.asIntN(32, s >> 17n) % BigInt(range)); if (cz < 0) cz += range;
    step(); cz += Number(BigInt.asIntN(32, s >> 17n) % BigInt(range)); if (cz < 0) cz += range;
    return {
      x: (rx * st.spacing + (cx >> 1)) * 16,
      z: (rz * st.spacing + (cz >> 1)) * 16,
    };
  }

  // ------------------------------------------------------------ seed parsing

  const LONG_MIN = -(1n << 63n), LONG_MAX = (1n << 63n) - 1n;

  function javaStringHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return h;
  }

  function parseSeed(text) {
    const s = String(text).trim();
    if (s === "") return null;
    let seed;
    if (/^[+-]?\d+$/.test(s)) {
      try {
        const v = BigInt(s);
        if (v < LONG_MIN || v > LONG_MAX) throw new Error("range");
        seed = v;
      } catch (e) {
        seed = BigInt(javaStringHash(s));
      }
    } else {
      seed = BigInt(javaStringHash(s));
    }
    return { seed, text: s };
  }

  const STRUCT_BY_KEY = Object.fromEntries(STRUCTURES.map((s) => [s.key, s]));

  function treasureStructurePos(seed, rx, rz) {
    // Buried treasure is a per-chunk feature attempt: chunk coordinates are
    // passed as the region, and only 1% pass the salted float check.
    let s = BigInt.asUintN(64,
      BigInt(rx) * 341873128712n + BigInt(rz) * 132897987541n +
      seed + 10387320n);
    s = lcgFromSeed(s);
    if (lcgNextFloat(s).v >= 0.01) return null;
    return { x: rx * 16 + 9, z: rz * 16 + 9 };
  }

  function mineshaftStructurePos(seed, cx, cz) {
    const a = lcgNextLong(lcgFromSeed(seed));
    const b = lcgNextLong(a.s);
    const aix = BigInt.asUintN(64, BigInt(cx) * a.v ^ seed);
    const s = lcgFromSeed(BigInt.asUintN(64, aix ^ BigInt(cz) * b.v));
    if (lcgNextDouble(s).v >= 0.004) return null;
    return { x: cx * 16, z: cz * 16 };
  }

  function rawStructurePos(st, seed, rx, rz) {
    if (st.kind === "treasure") return treasureStructurePos(seed, rx, rz);
    if (st.kind === "mineshaft") return mineshaftStructurePos(seed, rx, rz);
    const p = st.kind === "large"
      ? largeStructurePos(st, seed, rx, rz)
      : featureStructurePos(st, seed, rx, rz);
    if (st.key === "outpost") {
      let s = BigInt.asUintN(64, seed ^ BigInt((p.x >> 8) & 0xffffffff) ^
        (BigInt((p.z >> 8) & 0xffffffff) << 4n));
      s = lcgFromSeed(s);
      const a = lcgNext(s, 31);
      if (lcgNextInt(a.s, 5).v !== 0) return null;
    }
    return p;
  }

  // ------------------------------------------------ structure viability (1.21.4)

  const DEEP_OCEANS = [24, 47, 48, 49, 50];
  const MONUMENT_BIOMES = [0, 7, 10, 11, 24, 44, 45, 46, 47, 48, 49, 50];
  const VILLAGE_TYPES = [1, 2, 35, 5, 12];

  function blockBiome(world, x, z) {
    return sampleNoise(
      world, Math.floor(x / 4), Math.floor(z / 4), Infinity, 79
    ).biome;
  }

  // cubiomes' isStrongholdBiome(MC_1_21_WD, id), dumped from the reference
  // build. This is the set searched by locateBiome, not every land biome.
  const STRONGHOLD_BIOMES = new Set([
    1, 2, 3, 4, 5, 12, 14, 21, 23, 27, 29, 30, 32, 34, 35, 36, 37, 38,
    129, 131, 132, 140, 155, 160, 163, 165, 168, 174, 175, 177, 178, 179,
    180, 181, 182, 185, 186,
  ]);

  function roundAway(v) {
    return v < 0 ? -Math.floor(-v + 0.5) : Math.floor(v + 0.5);
  }

  // Java/cubiomes stronghold iteration: the ring gives an approximate point,
  // then locateBiome() searches a 112-block square (28 noise cells) at block
  // y = 0 and reservoir-samples a valid stronghold biome. The result is moved
  // to the chunk's staircase corner at (4, 4), exactly as nextStronghold does.
  function strongholdIterator(world, limit) {
    const s48 = BigInt.asUintN(48, world.seed);
    let s = lcgFromSeed(s48);
    let a = lcgNextDouble(s);
    let angle = 2 * Math.PI * a.v;
    s = a.s;
    a = lcgNextDouble(s);
    let dist = 128 + (a.v - 0.5) * 80;
    s = a.s;

    let nextX = roundAway(Math.cos(angle) * dist) * 16 + 8;
    let nextZ = roundAway(Math.sin(angle) * dist) * 16 + 8;
    let count = 0;
    let ringnum = 0, ringidx = 0, ringmax = 3, index = 0;
    const radius = 112 >> 2;
    let scan = null;

    function startScan() {
      // For 1.19.3+ the locate RNG is seeded from one nextLong of the ring
      // RNG; the sampling itself does not advance the ring RNG.
      const nl = lcgNextLong(s);
      s = nl.s;
      scan = {
        nx: nextX >> 2, nz: nextZ >> 2,
        lbr: lcgFromSeed(nl.v),
        // locateBiome keeps one cache for the whole square scan.
        cache: { node: 0 },
        j: -radius, i: -radius,
        found: 0, px: nextX, pz: nextZ,
      };
    }

    function finishScan() {
      const pos = { x: (scan.px & ~15) + 4, z: (scan.pz & ~15) + 4 };
      scan = null;
      count++;
      if (count < limit) {
        ringidx++;
        angle += (2 * Math.PI) / ringmax;
        if (ringidx === ringmax) {
          ringnum++;
          ringidx = 0;
          ringmax = ringmax + Math.floor((2 * ringmax) / (ringnum + 1));
          if (ringmax > 128 - index) ringmax = 128 - index;
          const r = lcgNextDouble(s);
          s = r.s;
          angle += r.v * Math.PI * 2;
        }
        const r2 = lcgNextDouble(s);
        s = r2.s;
        dist = 128 + 6 * ringnum * 32 + (r2.v - 0.5) * 80;
        nextX = roundAway(Math.cos(angle) * dist) * 16 + 8;
        nextZ = roundAway(Math.sin(angle) * dist) * 16 + 8;
        index++;
      }
      return pos;
    }

    function advance(budgetMs) {
      if (count >= limit) return { done: true, pos: null };
      if (!scan) startScan();
      const deadline = performance.now() + budgetMs;
      do {
        for (; scan.i <= radius; scan.i++) {
          const id = sampleNoise(
            world, scan.nx + scan.i, scan.nz + scan.j, Infinity, 0, scan.cache
          ).biome;
          if (!STRONGHOLD_BIOMES.has(id)) continue;
          if (scan.found === 0) {
            scan.px = (scan.nx + scan.i) * 4;
            scan.pz = (scan.nz + scan.j) * 4;
          } else {
            const r = lcgNextInt(scan.lbr, scan.found + 1);
            scan.lbr = r.s;
            if (r.v === 0) {
              scan.px = (scan.nx + scan.i) * 4;
              scan.pz = (scan.nz + scan.j) * 4;
            }
          }
          scan.found++;
        }
        scan.j++;
        scan.i = -radius;
        if (scan.j > radius) return { done: true, pos: finishScan() };
      } while (performance.now() < deadline);
      return { done: false, pos: null };
    }

    return {
      get remaining() { return limit - count; },
      advance,
      next() {
        const r = advance(Infinity);
        return r.pos;
      },
    };
  }

  function strongholdsFor(world, limit) {
    const it = strongholdIterator(world, limit);
    const out = [];
    let p;
    while ((p = it.next())) out.push(p);
    return out;
  }

  function lcgNextLong(s) {
    const hi = lcgNext(s, 32);
    const lo = lcgNext(hi.s, 32);
    // Java's nextLong adds two signed 32-bit draws, so a negative low word
    // carries into the high word. Match that rather than OR-ing unsigned bits.
    const v = BigInt.asUintN(64,
      (BigInt.asIntN(32, BigInt(hi.v)) << 32n) + BigInt.asIntN(32, BigInt(lo.v)));
    return { s: lo.s, v };
  }

  // cubiomes' chunkGenerateRnd: Java LCG, two nextLong draws, then re-seed.
  function chunkGenerateRnd(seed, chunkX, chunkZ) {
    let s = lcgFromSeed(seed);
    const a = lcgNextLong(s); s = a.s;
    const b = lcgNextLong(s); s = b.s;
    const r = BigInt.asUintN(64,
      (a.v * BigInt(chunkX)) ^ (b.v * BigInt(chunkZ)) ^
      BigInt.asUintN(64, seed));
    return lcgFromSeed(r);
  }

  // Village start-piece dimensions after getVariant(Village, ...). Each entry
  // is [threshold, width, depth]; a threshold is the exclusive upper bound.
  const VILLAGE_SIZES = {
    1: [[50, 9, 9], [100, 10, 10], [150, 8, 15], [200, 11, 11],
        [201, 9, 9], [202, 10, 10], [203, 8, 15], [204, 11, 11]],
    2: [[98, 17, 9], [196, 12, 12], [245, 15, 15],
        [247, 17, 9], [249, 12, 12], [250, 15, 15]],
    35: [[100, 14, 12], [150, 11, 11], [300, 9, 11], [450, 9, 9],
         [452, 14, 12], [453, 11, 11], [456, 9, 11], [459, 9, 9]],
    5: [[49, 22, 18], [98, 9, 9], [99, 22, 18], [100, 9, 9]],
    12: [[100, 12, 8], [150, 11, 9], [300, 7, 7],
         [302, 12, 8], [303, 11, 9], [306, 7, 7]],
  };
  const VILLAGE_MODULUS = { 1: 204, 2: 250, 35: 459, 5: 100, 12: 306 };

  function villageVariant(seed, chunkX, chunkZ, biome) {
    let s = chunkGenerateRnd(seed, chunkX, chunkZ);
    const rotation = lcgNextInt(s, 4); s = rotation.s;
    const t = lcgNextInt(s, VILLAGE_MODULUS[biome]).v;
    let width = 0, depth = 0;
    for (const [limit, w, d] of VILLAGE_SIZES[biome]) {
      if (t < limit) { width = w; depth = d; break; }
    }
    if (!width) return null;
    switch (rotation.v) {
      case 0: return { x: 0, z: 0, sx: width, sz: depth };
      case 1: return { x: 1 - depth, z: 0, sx: depth, sz: width };
      case 2: return { x: 1 - width, z: 1 - depth, sx: width, sz: depth };
      case 3: return { x: 0, z: 1 - width, sx: depth, sz: width };
    }
    return null;
  }

  function villageViable(world, rawX, rawZ) {
    const chunkX = Math.floor(rawX / 16);
    const chunkZ = Math.floor(rawZ / 16);
    for (const biome of VILLAGE_TYPES) {
      const v = villageVariant(world.seed, chunkX, chunkZ, biome);
      if (!v) continue;
      const nx = (Math.trunc((chunkX * 32 + 2 * v.x + v.sx - 1) / 2)) >> 2;
      const nz = (Math.trunc((chunkZ * 32 + 2 * v.z + v.sz - 1) / 2)) >> 2;
      const id = sampleNoise(world, nx, nz, Infinity, 79).biome;
      if (id === biome || (id === 177 && biome === 1)) return true;
    }
    return false;
  }

  function outpostViable(world, rawX, rawZ) {
    const chunkX = Math.floor(rawX / 16);
    const chunkZ = Math.floor(rawZ / 16);
    // In 1.16.1+ an outpost is rejected when any village attempt lies within
    // ten chunks, regardless of that village's biome viability.
    const vil = STRUCT_BY_KEY.village;
    const cx0 = chunkX - 10, cx1 = chunkX + 10;
    const cz0 = chunkZ - 10, cz1 = chunkZ + 10;
    const rx0 = Math.floor(cx0 / vil.spacing);
    const rx1 = Math.floor(cx1 / vil.spacing);
    const rz0 = Math.floor(cz0 / vil.spacing);
    const rz1 = Math.floor(cz1 / vil.spacing);
    for (let rz = rz0; rz <= rz1; rz++) {
      for (let rx = rx0; rx <= rx1; rx++) {
        const p = featureStructurePos(vil, world.seed, rx, rz);
        const vx = Math.floor(p.x / 16), vz = Math.floor(p.z / 16);
        if (vx >= cx0 && vx <= cx1 && vz >= cz0 && vz <= cz1) return false;
      }
    }
    const r = lcgNextInt(
      chunkGenerateRnd(world.seed, chunkX, chunkZ), 4
    );
    let dx, dz;
    if (r.v === 0) { dx = 15; dz = 15; }
    else if (r.v === 1) { dx = -15; dz = 15; }
    else if (r.v === 2) { dx = -15; dz = -15; }
    else { dx = 15; dz = -15; }
    const nx = (Math.trunc((chunkX * 32 + dx) / 2)) >> 2;
    const nz = (Math.trunc((chunkZ * 32 + dz) / 2)) >> 2;
    const id = sampleNoise(world, nx, nz, Infinity, 79).biome;
    return STRUCT_BY_KEY.outpost.validBiomes.includes(id);
  }

  function monumentViable(world, rawX, rawZ) {
    const bx = rawX + 8, bz = rawZ + 8;
    const cx = Math.floor(bx / 4), cz = Math.floor(bz / 4);
    // Centre at the approximate ocean-floor height cubiomes uses.
    if (!DEEP_OCEANS.includes(sampleNoise(world, cx, cz, Infinity, 9).biome)) {
      return false;
    }
    // The 58x58-block area check at y = 63 - 29, sampled on the 1:4 grid.
    const x1 = Math.floor((bx - 29) / 4), x2 = Math.floor((bx + 29) / 4);
    const z1 = Math.floor((bz - 29) / 4), z2 = Math.floor((bz + 29) / 4);
    for (let i = x1; i <= x2; i++) {
      for (let j = z1; j <= z2; j++) {
        if (!MONUMENT_BIOMES.includes(sampleNoise(world, i, j, Infinity, 8).biome)) {
          return false;
        }
      }
    }
    return true;
  }

  function ancientViable(world, rawX, rawZ) {
    const rng = chunkGenerateRnd(world.seed, rawX >> 4, rawZ >> 4);
    const rot = lcgNextInt(rng, 4);
    const px = rawX > 0 ? 1 : 0;
    const nx = rawX < 0 ? 1 : 0;
    const pz = rawZ > 0 ? 1 : 0;
    const nz = rawZ < 0 ? 1 : 0;
    let x, z, sx, sz;
    switch (rot.v) {
      case 0: x = -px; z = -pz; sx = 18; sz = 41; break;
      case 1: x = nx - 41; z = -pz; sx = 41; sz = 18; break;
      case 2: x = nx - 18; z = nz - 41; sx = 18; sz = 41; break;
      default: x = -px; z = nz - 18; sx = 41; sz = 18; break;
    }
    let ox, oz;
    switch (rot.v) {
      case 0: ox = x - 13; oz = z - 20; break;
      case 1: ox = x + 20; oz = z - 13; break;
      case 2: ox = x + 13; oz = z + 20; break;
      default: ox = x - 20; oz = z + 13; break;
    }
    const chunkX = rawX >> 4, chunkZ = rawZ >> 4;
    const sampleX = Math.trunc((chunkX * 32 + 2 * ox + sx - 1) / 2) >> 2;
    const sampleZ = Math.trunc((chunkZ * 32 + 2 * oz + sz - 1) / 2) >> 2;
    return sampleNoise(world, sampleX, sampleZ, Infinity, -27 >> 2).biome === 183;
  }

  function trialViable(world, rawX, rawZ) {
    const rng = chunkGenerateRnd(world.seed, rawX >> 4, rawZ >> 4);
    const y = lcgNextInt(rng, 21);
    const rot = lcgNextInt(y.s, 4);
    const sx = 19, sz = 19;
    let ox = 0, oz = 0;
    switch (rot.v) {
      case 1: ox = 1 - sz; oz = 0; break;
      case 2: ox = 1 - sx; oz = 1 - sz; break;
      case 3: ox = 0; oz = 1 - sx; break;
    }
    const chunkX = rawX >> 4, chunkZ = rawZ >> 4;
    const sampleX = Math.trunc((chunkX * 32 + 2 * ox + sx - 1) / 2) >> 2;
    const sampleZ = Math.trunc((chunkZ * 32 + 2 * oz + sz - 1) / 2) >> 2;
    const id = sampleNoise(world, sampleX, sampleZ, Infinity, (y.v - 40) >> 2).biome;
    return id >= 0 && id !== 183;
  }

  function structureViable(world, st, rawX, rawZ) {
    switch (st.key) {
      case "portal": return true;
      case "mineshaft": return true;
      case "treasure": {
        const cx = rawX >> 4, cz = rawZ >> 4;
        return [16, 26].includes(blockBiome(world, cx * 16 + 8, cz * 16 + 8));
      }
      case "village": return villageViable(world, rawX, rawZ);
      case "outpost": return outpostViable(world, rawX, rawZ);
      case "monument": return monumentViable(world, rawX, rawZ);
      case "mansion": return blockBiome(world, rawX + 7, rawZ + 7) === 29;
      case "ancient": return ancientViable(world, rawX, rawZ);
      case "trial": return trialViable(world, rawX, rawZ);
      default: return st.validBiomes.includes(blockBiome(world, rawX + 8, rawZ + 8));
    }
  }

  globalThis.SeedMapEngine = {
    World, parseSeed, STRUCTURES,
    _debug: {
      samplePerlin, Xoroshiro, lcgFromSeed, lcgNext, lookup: (np) => TREE.lookup(np),
      rawStructurePos, STRUCTURES, chunkGenerateRnd, villageVariant, sampleNoise, blockBiome,
    },
  };
})();
