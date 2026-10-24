# Reference dumps

These files are block-space comparisons generated with
[Cubitect/cubiomes](https://github.com/Cubitect/cubiomes) (MIT) for seed `0`.

- `block0.txt` — `blockX blockZ biomeID` from `getBiomeAt(&g, 4, x >> 2, 79, z >> 2)`
  (2,007 points).
- `struct0.txt` — every non-stronghold structure attempt and its viability/position
  (4,624 attempts).
- `dense0.txt` — per-chunk treasure and mineshaft attempts around the origin
  (80,802 attempts).
- `strong0.txt` — all 128 relocated stronghold positions.

`node tools/test_engine.js` runs them by default. The engine targets cubiomes'
`MC_1_21_WD` generator.
