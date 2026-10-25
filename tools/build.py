#!/usr/bin/env python3
"""Inline all sources into one offline-capable SVG file."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

template = (SRC / "template.svg").read_text()
css = (SRC / "style.css").read_text()
js = "\n".join(
    (SRC / name).read_text()
    for name in (
        "util.js",
        "biomes.js",
        "data.js",
        "engine.js",
        "enchant.js",
        "icons.js",
        "terrain.js",
        "grid.js",
        "measure.js",
        "map.js",
        "calc.js",
        "app.js",
    )
)

for name, text in (("CSS", css), ("JS", js)):
    if "]]>" in text:
        raise SystemExit(f"{name} contains a CDATA terminator")

out = template.replace("/*__CSS__*/", css).replace("/*__APP__*/", js)
dest = ROOT / "seedmap.svg"
dest.write_text(out)
print(f"wrote {dest.relative_to(ROOT)} ({dest.stat().st_size:,} bytes)")
