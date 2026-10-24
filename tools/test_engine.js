/* Compare the JS engine against block-space cubiomes reference dumps.
 *
 *   node tools/test_engine.js [biome-dump] [seed]
 *   node tools/test_engine.js --structures [structure-dump] [seed]
 *   node tools/test_engine.js --dense [dense-dump] [seed]
 *   node tools/test_engine.js --strongholds [stronghold-dump] [seed]
 *
 * Biome dumps are "blockX blockZ biomeID" lines produced with
 * getBiomeAt(&g, 4, x >> 2, 79, z >> 2) -- i.e. real block coordinates.
 * Structure dumps are "key regionX regionZ rawX rawZ viable" lines produced
 * with getStructurePos + isViableStructurePos. Noise-space probes are not
 * accepted as evidence for the map.
 */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const root = path.resolve(__dirname, "..");
vm.runInThisContext(fs.readFileSync(path.join(root, "src/data.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(root, "src/engine.js"), "utf8"));
const E = globalThis.SeedMapEngine;
const { World } = E;

const args = process.argv.slice(2);
const structureMode = args[0] === "--structures";
const denseMode = args[0] === "--dense";
const strongholdMode = args[0] === "--strongholds";
if (structureMode || denseMode || strongholdMode) args.shift();
const file = args[0] || path.join(
  root, "tools/reference",
  denseMode ? "dense0.txt" :
  strongholdMode ? "strong0.txt" :
  structureMode ? "struct0.txt" : "block0.txt"
);
const seedText = args[1] || "0";
const seed = BigInt(seedText);
const world = new World(seedText, seed);

if (strongholdMode) {
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  const got = world.strongholds(lines.length);
  let bad = 0, maxDist = 0;
  const examples = [];
  for (let i = 0; i < lines.length; i++) {
    const [index, x, z] = lines[i].trim().split(/\s+/).map(Number);
    const p = got[i];
    if (!p || p.x !== x || p.z !== z) {
      bad++;
      const d = p ? Math.hypot(p.x - x, p.z - z) : Infinity;
      maxDist = Math.max(maxDist, d);
      if (examples.length < 6) {
        examples.push([index, "ref", x, z, "js", p && p.x, p && p.z, "dist", d]);
      }
    }
  }
  console.log(`strongholds: ${got.length} positions, ${bad} mismatches, max distance ${maxDist}`);
  for (const e of examples) console.log("  MISMATCH", e.join(" "));
  process.exitCode = bad ? 1 : 0;
} else if (!structureMode && !denseMode) {
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  let bad = 0;
  const examples = [];
  for (const line of lines) {
    const [x, z, id] = line.trim().split(/\s+/).map(Number);
    const got = world.biomeAtBlock(x, z);
    if (got !== id) {
      bad++;
      if (examples.length < 6) examples.push([x, z, "ref", id, "js", got]);
    }
  }
  console.log(`biomes: ${lines.length} block points, ${bad} mismatches`);
  for (const e of examples) console.log("  MISMATCH", e.join(" "));
  process.exitCode = bad ? 1 : 0;
} else {
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  const stats = {};      let bad = 0, posErrors = 0;
  for (const line of lines) {
    const [key, rx, rz, rawX, rawZ, ok] = line.trim().split(/\s+/);
    const st = stats[key] || (stats[key] = {
      n: 0, agree: 0, falsePos: 0, falseNeg: 0, posBad: 0, rawBad: 0, examples: [],
    });
    st.n++;
    const rxN = Number(rx), rzN = Number(rz);
    const rawRefX = Number(rawX), rawRefZ = Number(rawZ);
    const refViable = ok === "1";
    const p = world.structureAt(key, rxN, rzN);
    const viable = !!p;

    const raw = E._debug.rawStructurePos(
      E._debug.STRUCTURES.find((s) => s.key === key), seed, rxN, rzN
    );
    if (rawRefX === -1) {
      if (raw !== null) st.rawBad++;
    } else if (!raw || raw.x !== rawRefX || raw.z !== rawRefZ) {
      st.rawBad++;
    }

    if (viable === refViable) st.agree++;
    else {
      bad++;
      if (viable) st.falsePos++;
      else st.falseNeg++;
      if (st.examples.length < 4) {
        st.examples.push([rx, rz, "ref", refViable, "js", viable]);
      }
    }
    if (rawRefX === -1) {
      if (raw !== null) posErrors++;
    } else if (!raw || raw.x !== rawRefX || raw.z !== rawRefZ) {
      posErrors++;
    }
    if (viable && refViable) {
      const meta = E._debug.STRUCTURES.find((s) => s.key === key);
      const off = meta.centerOffset === undefined ? 8 : meta.centerOffset;
      const ex = rawRefX + off, ez = rawRefZ + off;
      if (p.x !== ex || p.z !== ez) {
        st.posBad++;
        posErrors++;
        if (st.examples.length < 4) {
          st.examples.push([rx, rz, "refCenter", ex, ez, "jsCenter", p.x, p.z]);
        }
      }
    }
  }

  console.log(
    `structures: ${lines.length} attempts, ${bad} viability mismatches, ` +
    `${posErrors} raw/center position errors`
  );
  for (const [key, s] of Object.entries(stats).sort()) {
    const posBad = s.posBad + s.rawBad;
    console.log(
      `  ${key.padEnd(10)} ${s.agree}/${s.n}` +
      (posBad ? `  positionErrors=${posBad}` : "")
    );
    for (const e of s.examples) console.log("    ", e.join(" "));
    if (posBad) bad++;
  }

  if (!denseMode) {
    const sh = world.strongholds(128);
    const shSet = new Set(sh.map((p) => p.x + "," + p.z));
    console.log(`strongholds: ${sh.length} returned, ${shSet.size} unique`);
    if (sh.length !== 128 || shSet.size !== 128) bad++;
  }
  process.exitCode = bad ? 1 : 0;
}
