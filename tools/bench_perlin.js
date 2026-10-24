// Micro-benchmark: current Perlin sampler vs a flat-table variant.
const fs = require("fs");
const vm = require("vm");
const ctx = { globalThis: {}, Math, BigInt, Number, Buffer, Uint8Array, Uint16Array, Int32Array, Float64Array, console, performance, atob: undefined };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + "/../src/data.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync(__dirname + "/../src/engine.js", "utf8"), ctx);
const E = ctx.SeedMapEngine;
const w = new E.World("0", 0n);
const p0 = w.climate[2].A[0];

const GRAD = new Float64Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
  1, 1, 0, 0, -1, 1, -1, 1, 0, 0, -1, -1,
]);
const fade = (d) => d * d * d * (d * (d * 6 - 15) + 10);
const lerp = (t, a, b) => a + t * (b - a);

const perm = new Uint8Array(512);
for (let i = 0; i < 512; i++) perm[i] = p0.p[i & 255];
const F = { p: perm, a: p0.a, b: p0.b, c: p0.c, h2: p0.h2, d2: p0.d2, t2: p0.t2 };

function fastPerlin(f, x, z) {
  const p = f.p;
  let d1 = x + f.a;
  let d3 = z + f.c;
  const i1 = Math.floor(d1); const i3 = Math.floor(d3);
  d1 -= i1; d3 -= i3;
  const h1 = i1 & 255, h3 = i3 & 255;
  const t1 = fade(d1), t3 = fade(d3);
  const h2 = f.h2, dy = f.d2, t2 = f.t2;

  const a1 = (p[h1] + h2) & 255, b1 = (p[h1 + 1] + h2) & 255;
  const a2 = (p[a1] + h3) & 255, b2 = (p[a1 + 1] + h3) & 255;
  const c2 = (p[b1] + h3) & 255, e2 = (p[b1 + 1] + h3) & 255;
  const g0 = p[a2], g1 = p[a2 + 1], g2 = p[b2], g3 = p[b2 + 1];
  const g4 = p[c2], g5 = p[c2 + 1], g6 = p[e2], g7 = p[e2 + 1];

  const b0 = (g0 & 15) * 3, b1g = (g1 & 15) * 3, b2g = (g2 & 15) * 3, b3g = (g3 & 15) * 3;
  const b4g = (g4 & 15) * 3, b5g = (g5 & 15) * 3, b6g = (g6 & 15) * 3, b7g = (g7 & 15) * 3;
  const l1 = GRAD[b0] * d1 + GRAD[b0 + 1] * dy + GRAD[b0 + 2] * d3;
  const l5 = GRAD[b1g] * d1 + GRAD[b1g + 1] * dy + GRAD[b1g + 2] * (d3 - 1);
  const l2 = GRAD[b4g] * (d1 - 1) + GRAD[b4g + 1] * dy + GRAD[b4g + 2] * d3;
  const l6 = GRAD[b5g] * (d1 - 1) + GRAD[b5g + 1] * dy + GRAD[b5g + 2] * (d3 - 1);
  const l3 = GRAD[b2g] * d1 + GRAD[b2g + 1] * (dy - 1) + GRAD[b2g + 2] * d3;
  const l7 = GRAD[b3g] * d1 + GRAD[b3g + 1] * (dy - 1) + GRAD[b3g + 2] * (d3 - 1);
  const l4 = GRAD[b6g] * (d1 - 1) + GRAD[b6g + 1] * (dy - 1) + GRAD[b6g + 2] * d3;
  const l8 = GRAD[b7g] * (d1 - 1) + GRAD[b7g + 1] * (dy - 1) + GRAD[b7g + 2] * (d3 - 1);

  const m1 = l1 + t1 * (l2 - l1), m2 = l3 + t1 * (l4 - l3);
  const m3 = l5 + t1 * (l6 - l5), m4 = l7 + t1 * (l8 - l7);
  const n1 = m1 + t2 * (m2 - m1), n2 = m3 + t2 * (m4 - m3);
  return n1 + t3 * (n2 - n1);
}

function time(fn, n) {
  const t = performance.now();
  let s = 0;
  for (let i = 0; i < n; i++) s += fn(i);
  return { us: ((performance.now() - t) * 1000) / n, s };
}

const N = 300000;
const a = time((i) => E._debug.samplePerlin(p0, i * 0.013, 0, i * 0.021), N);
const b = time((i) => fastPerlin(F, i * 0.013, i * 0.021), N);
console.log("current  ", a.us.toFixed(3), "us", a.s.toFixed(4));
console.log("optimized", b.us.toFixed(3), "us", b.s.toFixed(4));

// accuracy: compare on the actual climate sampling inputs (lacunarity scaled)
let maxErr = 0;
for (let i = 0; i < 2000; i++) {
  const x = i * 0.7 + 3, z = i * 1.3 - 5, lac = 0.03125;
  const v1 = E._debug.samplePerlin(p0, x * lac, 0, z * lac);
  const v2 = fastPerlin(F, x * lac, z * lac);
  maxErr = Math.max(maxErr, Math.abs(v1 - v2));
}
console.log("max error", maxErr);
