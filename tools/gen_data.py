#!/usr/bin/env python3
"""Extract cubiomes' 1.21 biome parameter search tree into a compact JS module.

Source: .ref/cubiomes/tables/btree21wd.h (Cubitect/cubiomes, MIT).
Nodes are stored as raw little-endian uint64 bytes so the JS side can decode
them into typed arrays at startup. Leaves carry 0xFF in the top byte and the
biome id in the next byte.
"""
import base64
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / ".ref" / "cubiomes"
OUT = ROOT / "src" / "data.js"

header = (SRC / "tables" / "btree21wd.h").read_text()

param_block = header.split("btree21wd_param[][2] =")[1].split("};")[0]
params = [
    (int(a), int(b))
    for a, b in re.findall(r"\{\s*(-?\d+),\s*(-?\d+)\s*\}", param_block)
]

node_hex = re.findall(
    r"0x[0-9a-fA-F]{16}", header.split("btree21wd_nodes[] =")[1]
)
raw = b"".join(int(h, 16).to_bytes(8, "little") for h in node_hex)

steps = [int(x) for x in re.search(r"btree21wd_steps\[\] = \{([^}]*)\}", header).group(1).split(",")]
order = int(re.search(r"btree21wd_order = (\d+)", header).group(1))

flat = []
for a, b in params:
    flat.extend([a, b])

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(
    "/* Generated from Cubitect/cubiomes tables/btree21wd.h (MIT). */\n"
    "globalThis.BIOME_TREE = {\n"
    f'  nodes: "{base64.b64encode(raw).decode()}",\n'
    f"  params: [{','.join(str(v) for v in flat)}],\n"
    f"  steps: [{','.join(str(v) for v in steps)}],\n"
    f"  order: {order}\n"
    "};\n"
)
print(f"nodes={len(node_hex)} params={len(params)} bytes={len(raw)} b64={len(base64.b64encode(raw))}")
