"""Build an original Tokyo-inspired city from deterministic code-only geometry.

Run through Blender: blender --background --python scripts/create-tokyo-city.py
-- --output-dir public/tokyo

All authoring coordinates are Three.js coordinates (Y up, negative Z down street).
The conversion (x, -z, y) gives Blender coordinates, and glTF restores Y up.
The avenue surface belongs to the consuming renderer, not this asset.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import random
import sys

import bpy
from mathutils import Vector


# Geometry is batched by material so the browser receives a small draw-call count.
SEED = 1847
RNG = random.Random(SEED)
TAU = math.tau
BATCHES = {}
SIGNS = []
PROP_SURFACES = []


def add(a, b):
    return tuple(a[i] + b[i] for i in range(3))


def scale(a, n):
    return tuple(v * n for v in a)


def sub(a, b):
    return add(a, scale(b, -1))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def unit(a):
    length = math.sqrt(sum(v * v for v in a))
    if length < 1e-9:
        raise ValueError("A geometry direction must have positive length")
    return scale(a, 1 / length)


def blender_point(p):
    return (p[0], -p[2], p[1])


def geometry(material, vertices, faces, smooth=False):
    batch = BATCHES.setdefault(material, {"vertices": [], "faces": [], "smooth": []})
    offset = len(batch["vertices"])
    batch["vertices"].extend(blender_point(p) for p in vertices)
    batch["faces"].extend(tuple(offset + i for i in face) for face in faces)
    batch["smooth"].extend([smooth] * len(faces))


def box(material, center, size):
    x, y, z = center
    w, h, d = (v / 2 for v in size)
    vertices = [(x - w, y - h, z - d), (x + w, y - h, z - d),
                (x + w, y + h, z - d), (x - w, y + h, z - d),
                (x - w, y - h, z + d), (x + w, y - h, z + d),
                (x + w, y + h, z + d), (x - w, y + h, z + d)]
    geometry(material, vertices, [(3, 2, 1, 0), (4, 5, 6, 7), (0, 4, 7, 3),
                                  (1, 2, 6, 5), (0, 1, 5, 4), (7, 6, 2, 3)])


def panel(material, center, width, height, axis="z", normal=1):
    """One exterior pane; solid frames around it supply the visible thickness."""
    x, y, z = center
    w, h = width / 2, height / 2
    vertices = ([(x - w, y - h, z), (x + w, y - h, z), (x + w, y + h, z), (x - w, y + h, z)]
                if axis == "z" else
                [(x, y - h, z + w), (x, y - h, z - w), (x, y + h, z - w), (x, y + h, z + w)])
    geometry(material, vertices, [(0, 1, 2, 3) if normal > 0 else (3, 2, 1, 0)])


def beam(material, start, end, width, depth=None):
    """A solid rectangular strut, with explicit endpoints for structural joins."""
    direction = unit(sub(end, start))
    reference = (0, 1, 0) if abs(direction[1]) < 0.95 else (1, 0, 0)
    u = scale(unit(cross(direction, reference)), width / 2)
    v = scale(unit(cross(direction, u)), (depth or width) / 2)
    vertices = [add(p, add(scale(u, su), scale(v, sv)))
                for p in (start, end) for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    geometry(material, vertices, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                                  (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])


def cylinder(material, start, end, radius, segments=10, cap=True, end_radius=None):
    direction = unit(sub(end, start))
    reference = (0, 1, 0) if abs(direction[1]) < 0.95 else (1, 0, 0)
    u = unit(cross(direction, reference))
    v = unit(cross(direction, u))
    vertices = []
    for p, r in ((start, radius), (end, radius if end_radius is None else end_radius)):
        for i in range(segments):
            theta = TAU * i / segments
            vertices.append(add(p, add(scale(u, r * math.cos(theta)), scale(v, r * math.sin(theta)))))
    faces = [(i, (i + 1) % segments, (i + 1) % segments + segments, i + segments) for i in range(segments)]
    if cap:
        faces.extend([tuple(reversed(range(segments))), tuple(range(segments, 2 * segments))])
    geometry(material, vertices, faces, smooth=True)
    if cap:
        BATCHES[material]["smooth"][-2:] = [False, False]


def ring(material, center, radius, thickness, segments=40, radial_segments=6, axis="y"):
    vertices, faces = [], []
    for i in range(segments):
        theta = TAU * i / segments
        for j in range(radial_segments):
            phi = TAU * j / radial_segments
            r = radius + thickness * math.cos(phi)
            local = (r * math.cos(theta), thickness * math.sin(phi), r * math.sin(theta))
            if axis == "x":
                local = (local[1], -local[0], local[2])
            if axis == "z":
                local = (local[0], -local[2], local[1])
            vertices.append(add(center, local))
    for i in range(segments):
        for j in range(radial_segments):
            faces.append((i * radial_segments + j, i * radial_segments + (j + 1) % radial_segments,
                          ((i + 1) % segments) * radial_segments + (j + 1) % radial_segments,
                          ((i + 1) % segments) * radial_segments + j))
    geometry(material, vertices, faces, smooth=True)


def cable(points, radius=0.025, material="metal"):
    for a, b in zip(points, points[1:]):
        cylinder(material, a, b, radius, segments=6, cap=False)


def sagging_cable(x1, x2, y, z, sag, depth=0):
    cable([(x1 + (x2 - x1) * i / 20, y - sag * math.sin(math.pi * i / 20),
            z + depth * math.sin(math.pi * i / 20)) for i in range(21)])


PALETTE = {
    "concrete": ("#263642", 0.88, 0.06, 0),
    "concrete_light": ("#3e4b52", 0.84, 0.06, 0),
    "concrete_dark": ("#19242f", 0.92, 0.02, 0),
    "metal": ("#30424a", 0.48, 0.72, 0),
    "trim": ("#63737a", 0.42, 0.78, 0),
    "glass": ("#081a25", 0.20, 0.42, 0),
    "glass_lit": ("#45626b", 0.38, 0.1, 0.22),
    "glass_warm": ("#ffc274", 0.42, 0.05, 0.9),
    "window_blind": ("#7c796e", 0.95, 0, 0),
    "window_board": ("#625548", 0.94, 0, 0),
    "shutter": ("#4b4f54", 0.70, 0.52, 0),
    "street_detail": ("#15232a", 0.64, 0.35, 0),
    "paint": ("#a4a9a2", 0.93, 0, 0),
    "tactile": ("#9d8549", 0.9, 0.08, 0),
    "emit_cyan": ("#46d9eb", 0.36, 0.12, 1.35),
    "emit_coral": ("#ff6956", 0.38, 0.08, 1.1),
    "emit_amber": ("#ffc274", 0.42, 0.05, 0.9),
    "enamel_cream": ("#b7b195", 0.60, 0.22, 0),
    "enamel_red": ("#804137", 0.63, 0.25, 0),
    "enamel_green": ("#2c5148", 0.59, 0.28, 0),
    "enamel_ochre": ("#967947", 0.66, 0.24, 0),
    "wood": ("#68513a", 0.94, 0, 0),
    "cloth": ("#496058", 0.98, 0, 0),
    "cloth_red": ("#794b40", 0.98, 0, 0),
    "foliage": ("#284639", 0.86, 0, 0),
}
NEON = ("emit_cyan", "emit_coral", "emit_amber")
WORDS = ("東京", "電子", "夜市", "食堂", "未来", "喫茶", "地下鉄", "ホテル", "光", "電波", "珈琲", "音楽")


def framed_panel(x, y, z, width, height, text, material, vertical):
    """The lettering plane is 0.018 m in front of its solid backing."""
    box("concrete_dark", (x, y, z), (width, height, 0.24))
    frame = "trim" if text in ("東京", "食堂", "喫茶", "珈琲", "地下鉄") else material
    for edge in (-1, 1):
        box(frame, (x + edge * (width / 2 - 0.045), y, z + 0.135), (0.07, height, 0.055))
        box(frame, (x, y + edge * (height / 2 - 0.045), z + 0.135), (width, 0.07, 0.055))
    SIGNS.append({"position": [x, y, z + 0.148], "width": width - 0.2, "height": height - 0.2,
                  "text": text, "color": PALETTE[material][0], "vertical": vertical})


def prop_surface(kind, position, width, height, variant, rotation_y=0):
    PROP_SURFACES.append({"kind": kind, "position": list(position), "width": width,
                          "height": height, "variant": variant, "rotationY": rotation_y})


def air_conditioner(side, y, z):
    x = side * 9.64
    box("concrete_light", (x, y, z), (0.7, 0.65, 0.94))
    box("metal", (side * 9.268, y, z), (0.055, 0.52, 0.8))
    ring("trim", (side * 9.23, y, z + 0.14), 0.205, 0.027, 14, 4, axis="x")
    for offset in (-0.15, 0, 0.15):
        box("trim", (side * 9.20, y + offset, z + 0.14), (0.025, 0.022, 0.38))
    for offset in (-0.26, 0.26):
        beam("metal", (side * 9.32, y - 0.38, z + offset), (side * 10.07, y - 0.38, z + offset), 0.08)


def balcony(side, y, z, width):
    box("concrete_light", (side * 9.45, y, z), (1.15, 0.2, width))
    for dz in (-width / 2 + 0.07, width / 2 - 0.07):
        beam("metal", (side * 8.93, y + 0.1, z + dz), (side * 8.93, y + 1.02, z + dz), 0.065)
    beam("metal", (side * 8.93, y + 1.02, z - width / 2), (side * 8.93, y + 1.02, z + width / 2), 0.09)
    for dz in range(max(2, int(width / 0.38))):
        pz = z - width / 2 + 0.13 + dz * 0.38
        box("metal", (side * 8.93, y + 0.57, pz), (0.045, 0.87, 0.045))


def rooftop(x, height, z, width, depth, index):
    box("concrete_dark", (x, height + 1.35, z - 0.8), (width * 0.58, 2.7, depth * 0.53))
    box("metal", (x - width * 0.16, height + 3.0, z - 0.8), (width * 0.31, 0.45, depth * 0.36))
    for i in range(9):
        box("trim", (x - width * 0.16, height + 3.24, z - depth * 0.15 + i * 0.29), (width * 0.26, 0.06, 0.085))
    tx, tz = x + width * 0.24, z + depth * 0.17
    # The tank's four legs terminate in the roof slab, with visible cross bracing.
    for sx in (-1, 1):
        for sz in (-1, 1):
            beam("metal", (tx + sx * 0.65, height, tz + sz * 0.65), (tx + sx * 0.65, height + 1.25, tz + sz * 0.65), 0.12)
    cylinder("metal", (tx, height + 1.15, tz), (tx, height + 3.6, tz), 1.08, 16)
    ring("trim", (tx, height + 1.38, tz), 1.1, 0.045, 20, 4)
    ring("trim", (tx, height + 3.37, tz), 1.1, 0.045, 20, 4)
    ax, az = x - width * 0.24, z - depth * 0.25
    antenna_height = 4.5 + index % 3
    for dx, dz in ((-0.55, -0.4), (0.55, -0.4), (0, 0.55)):
        beam("metal", (ax + dx, height, az + dz), (ax, height + antenna_height, az), 0.11)
    for h in (1.6, 2.7, 3.9):
        beam("trim", (ax - 0.8, height + h, az), (ax + 0.8, height + h, az), 0.07)
    cylinder("emit_coral", (ax, height + antenna_height, az), (ax, height + antenna_height + 0.18, az), 0.08, 8)


def cloth_awning(side, z, width, variant):
    """Sloping fabric, a scalloped valance and struts embedded in the wall."""
    material = "cloth_red" if variant % 2 else "cloth"
    rows, columns = 5, 24
    vertices, faces = [], []
    for row in range(rows + 1):
        t = row / rows
        for col in range(columns + 1):
            u = col / columns
            fold = math.sin(u * math.pi * 12) * 0.022 * t
            vertices.append((side * (9.98 - 1.48 * t), 3.78 - 0.44 * t - 0.09 * math.sin(t * math.pi) + fold,
                             z + (u - 0.5) * width))
    for row in range(rows):
        for col in range(columns):
            a = row * (columns + 1) + col
            faces.append((a, a + 1, a + columns + 2, a + columns + 1))
    geometry(material, vertices, faces)
    for col in range(columns):
        za, zb = z + (col / columns - 0.5) * width, z + ((col + 1) / columns - 0.5) * width
        drop_a = 0.17 + 0.045 * math.cos(col * math.pi / 2)
        drop_b = 0.17 + 0.045 * math.cos((col + 1) * math.pi / 2)
        geometry(material, [(side * 8.5, 3.34, za), (side * 8.5, 3.34, zb),
                            (side * 8.5, 3.34 - drop_b, zb), (side * 8.5, 3.34 - drop_a, za)], [(0, 1, 2, 3)])
    for dz in (-width * 0.43, width * 0.43):
        beam("metal", (side * 9.98, 3.76, z + dz), (side * 8.5, 3.32, z + dz), 0.045)
        beam("metal", (side * 9.98, 2.96, z + dz), (side * 8.5, 3.32, z + dz), 0.045)
    beam("metal", (side * 8.5, 3.33, z - width / 2), (side * 8.5, 3.33, z + width / 2), 0.045)


def shopfront(side, front, depth, index):
    x = side * 9.97
    for i in range(3):
        z = front - 1.6 - i * (depth - 2.5) / 3
        width = (depth - 3.2) / 3
        box("metal", (x, 1.9, z), (0.15, 3.3, width))
        box("glass" if (index + i) % 3 else "shutter", (x - side * 0.1, 1.8, z), (0.10, 2.9, width - 0.2))
        for offset in (-0.35, 0.35):
            box("trim", (x - side * 0.17, 1.8, z + offset * width), (0.06, 2.95, 0.06))
        if (index + i) % 3 == 0:
            for row in range(14):
                box("metal", (x - side * 0.17, 0.45 + row * 0.19, z), (0.04, 0.027, width - 0.22))
        else:
            box("emit_amber", (x + side * 0.02, 2.65, z), (0.04, 0.13, width - 0.35))
            for offset in (-0.25, 0.25):
                box("concrete_dark", (x - side * 0.2, 0.75, z + offset * width), (0.10, 0.8, width * 0.43))
        style = (index + i + (side == 1)) % 4
        if style in (1, 3):
            cloth_awning(side, z, width + 0.18, index + i)
        else:
            box("metal", (side * 9.25, 3.56, z), (1.6, 0.17, width + 0.18))
            box(NEON[(index + i) % 3] if style == 0 else "trim", (side * 8.47, 3.47, z), (0.07, 0.09, width + 0.18))
            for dz in (-width * 0.36, width * 0.36):
                beam("metal", (side * 10, 4.15, z + dz), (side * 8.65, 3.62, z + dz), 0.07)
        if index < 5:
            # Printed notices sit on the shop's solid lower panel, not in the air.
            pz = z + width * 0.22
            box("wood", (side * 9.69, 1.66, pz), (0.045, 0.94, 0.65))
            prop_surface("poster", (side * 9.655, 1.66, pz), 0.60, 0.88, index * 7 + i + (side == 1) * 3, -side * math.pi / 2)
            if (index + i) % 3 == 1:
                # Short divided door curtains add irregular edges beneath the canopy.
                for strip in range(5):
                    cz = z - width * 0.42 + strip * width * 0.17
                    box("cloth_red" if index % 2 else "cloth", (side * 9.65, 2.52, cz), (0.025, 0.58 + (strip % 2) * 0.08, width * 0.16))
                cylinder("wood", (side * 9.65, 2.88, z - width * 0.5), (side * 9.65, 2.88, z + width * 0.5), 0.025, 6)


def layered_shop_signs(side, index, front):
    """Secondary tenants add different scales and heights, each with its own wall brackets."""
    if index >= 6:
        return
    words = ("ラーメン", "修理", "茶房", "レコード", "雑貨", "カラオケ")
    choice = (index * 2 + (side == 1)) % len(words)
    x, y, z = side * 9.43, 10.0 + (index % 3) * 0.72, front - 2.75
    w, h = (0.76, 3.0) if choice % 2 else (0.94, 2.55)
    framed_panel(x, y, z, w, h, words[choice], NEON[(index + 2) % 3], True)
    for dy in (-h * 0.34, h * 0.34):
        beam("metal", (side * 10.12, y + dy, z - 0.16), (x, y + dy, z - 0.12), 0.065)
    # Short warm shop plaques sit under larger tenant blades, rather than repeating one fin.
    if index < 4:
        x, y, z = side * 9.30, 4.5 + (index % 2) * 0.32, front - 4.5
        text = ("食堂", "珈琲", "雑貨", "茶房")[(index + (side == 1)) % 4]
        framed_panel(x, y, z, 1.64, 0.74, text, "emit_amber", False)
        for dx in (-0.55, 0.55):
            beam("metal", (x + dx, y, z - 0.12), (side * 10.12, y + 0.24, z - 0.38), 0.055)


def window_details(side, index, row, col, center, width, height, axis):
    """Near windows carry attached fittings without changing the city's RNG stream."""
    if index >= 4 or row >= 8:
        return
    rng = random.Random(f"{SEED}:window:{side}:{index}:{row}:{col}:{axis}")
    normal = -side if axis == "x" else 1

    def fitting(material, u, v, outward, w, h, depth):
        x, y, z = center
        if axis == "x":
            box(material, (x + normal * outward, y + v, z + u), (depth, h, w))
        else:
            box(material, (x + u, y + v, z + outward), (w, h, depth))

    # Casings overlap the backing by 0.025 m; no hood or mullion hangs off a pane.
    # Keep the original side sills, and give the camera-facing windows matching sills.
    if axis == "z":
        fitting("trim", 0, -height / 2 - 0.07, 0.015, width + 0.24, 0.11, 0.22)
    fitting("metal", 0, height / 2 + 0.025, 0.015, width + 0.15, 0.09, 0.18)
    for edge in (-1, 1):
        fitting("metal", edge * (width / 2 + 0.035), 0, 0.015, 0.07, height + 0.10, 0.18)
    if rng.random() < 0.27:
        fitting("trim", 0, height / 2 + 0.09, 0.06, width + 0.23, 0.065, 0.31)

    appearance = rng.random()
    top = height / 2 - 0.035
    if appearance < 0.035 and row < 4:
        # An occasional lower pane has a timber repair spanning both metal jambs.
        fitting("window_board", 0, -height * 0.22, 0.037, width + 0.12, height * 0.31, 0.045)
        for edge in (-1, 1):
            fitting("metal", edge * (width / 2 + 0.015), -height * 0.22, 0.065, 0.035, 0.035, 0.018)
    elif appearance < 0.53:
        drop = height * rng.uniform(0.22, 0.78)
        fitting("window_blind", 0, top - drop / 2, 0.018, width - 0.065, drop, 0.035)
        fitting("metal", 0, top + 0.015, 0.015, width + 0.03, 0.10, 0.18)
        fitting("metal", 0, top - drop, 0.043, width - 0.045, 0.045, 0.045)
        # Two broad seams suggest rolled/slatted shades without a fine moire grid.
        for fraction in (0.35, 0.70):
            fitting("window_board", 0, top - drop * fraction, 0.038, width - 0.075, 0.019, 0.012)
    elif appearance < 0.81:
        fitting("metal", 0, top + 0.02, 0.015, width + 0.04, 0.055, 0.18)
        for edge in (-1, 1):
            curtain_width = width * rng.uniform(0.17, 0.34)
            curtain_height = height * rng.uniform(0.84, 0.97)
            u = edge * (width / 2 - 0.025 - curtain_width / 2)
            fitting("window_blind", u, top - curtain_height / 2, 0.015,
                    curtain_width, curtain_height, 0.035)
            # A single raised fold stays embedded in its curtain, with an uneven hem.
            fitting("window_blind", u + edge * curtain_width * 0.18, top - curtain_height / 2,
                    0.035, curtain_width * 0.19, curtain_height, 0.035)

    # Large divisions read as old sash windows; some panes retain an open expanse.
    existing_mullion = axis == "x" and (col + row + index) % 5 == 0
    if not existing_mullion and rng.random() < 0.62:
        fitting("metal", width * rng.uniform(-0.13, 0.13), 0, 0.065, 0.045, height + 0.06, 0.18)
    if rng.random() < 0.67:
        fitting("metal", 0, height * rng.uniform(-0.17, 0.12), 0.065, width + 0.09, 0.045, 0.18)


def building(side, index, front, depth, width, height):
    x, z = side * (10 + width / 2), front - depth / 2
    shell = ("concrete", "concrete_light", "concrete_dark")[(index + (side == 1)) % 3]
    box(shell, (x, height / 2, z), (width, height, depth))
    # Broad shallow bands and piers break up the silhouette without a flat grid.
    for level in range(4, int(height), 4):
        box("metal", (x, level, z), (width + 0.18, 0.16, depth + 0.18))
    for dz in (-depth / 2 + 0.3, depth / 2 - 0.3):
        box("concrete_light", (side * 9.87, height / 2, z + dz), (0.25, height, 0.37))
    for dx in (-width / 2, width / 2):
        box("concrete_dark", (x + dx, height + 0.28, z), (0.27, 0.56, depth))
    for dz in (-depth / 2, depth / 2):
        box("concrete_dark", (x, height + 0.28, z + dz), (width, 0.56, 0.27))
    floors, bays = int((height - 5) / 2.55), max(3, int((depth - 1) / 1.75))
    for row in range(floors):
        y = 5.25 + row * 2.55
        for col in range(bays):
            pz = front - 1 - col * (depth - 2) / max(1, bays - 1)
            lit = RNG.random()
            material = "glass_warm" if lit < 0.13 else ("glass_lit" if lit < 0.52 else "glass")
            box("metal", (side * 9.95, y, pz), (0.10, 1.63, 1.13))
            panel(material, (side * 9.85, y, pz), 0.91, 1.39, axis="x", normal=-side)
            box("trim", (side * 9.82, y - 0.76, pz), (0.17, 0.10, 1.18))
            if (col + row + index) % 5 == 0:
                box("metal", (side * 9.83, y, pz), (0.07, 1.43, 0.045))
            window_details(side, index, row, col, (side * 9.85, y, pz), 0.91, 1.39, "x")
        # Front facades catch the camera and make the street read as real volume.
        for col in range(max(3, int(width / 1.9))):
            px = x - width / 2 + 1.0 + col * 1.8
            material = "glass_lit" if RNG.random() < 0.43 else "glass"
            box("metal", (px, y, front + 0.035), (1.23, 1.63, 0.08))
            panel(material, (px, y, front + 0.11), 1.04, 1.4)
            window_details(side, index, row, col, (px, y, front + 0.11), 1.04, 1.4, "z")
    for row in range(1, min(floors, 6), 2):
        air_conditioner(side, 4.9 + row * 2.55, front - 1.1 - (index % 3) * 2.4)
    if index % 3 != 1:
        for level in (8.65, 13.75):
            if level < height - 2:
                balcony(side, level, z - depth * 0.21, 2.65)
    # Rainwater stacks run down to the sidewalk, with straps and a drain elbow.
    pipez = front - depth + 0.66
    cylinder("metal", (side * 9.71, 0.4, pipez), (side * 9.71, height - 0.2, pipez), 0.105, 8)
    for y in range(2, int(height), 4):
        box("trim", (side * 9.71, y, pipez), (0.28, 0.08, 0.29))
    cylinder("metal", (side * 9.71, 0.4, pipez), (side * 9.25, 0.22, pipez), 0.105, 8)
    shopfront(side, front, depth, index)
    # Projecting fins have two visible brackets embedded in the facade edge.
    variant = (index + (side == 1) * 3) % 6
    sign_h = (3.9, 4.65, 4.9, 3.45, 2.8, 4.2)[variant]
    sign_w = (1.44, 1.12, 1.05, 1.30, 1.02, 1.38)[variant]
    sign_x, sign_y, sign_z = side * (9.08 + (index % 3) * 0.055), 6.5 + (index % 3) * 0.47, front + 0.5
    color = NEON[(index + (side == 1)) % 3]
    framed_panel(sign_x, sign_y, sign_z, sign_w, sign_h, WORDS[(index * 2 + (side == 1)) % len(WORDS)], color, True)
    for dy in (-sign_h * 0.33, sign_h * 0.33):
        beam("metal", (side * 10.35, sign_y + dy, front - 0.02), (sign_x, sign_y + dy, sign_z - 0.12), 0.11)
    if index < 4:
        framed_panel(x - side * width * 0.12, 3.35, front + 0.22, width * 0.64, 1.05,
                     WORDS[(index + 5 + (side == 1)) % len(WORDS)], NEON[(index + 1) % 3], False)
    layered_shop_signs(side, index, front)
    rooftop(x, height, z, width, depth, index)


def vending_machine(side, z, index):
    variant = index + (side == 1)
    kind = ("drinks", "coffee", "locker")[variant % 3]
    x = side * (8.88 + (index % 2) * 0.10)
    z += (0.45 if side == 1 else 0) + (index % 2) * 0.7
    width, height, depth = {"drinks": (1.32, 2.38, 0.88), "coffee": (1.20, 2.18, 1.0), "locker": (1.68, 1.98, 0.68)}[kind]
    finish = {"drinks": "enamel_cream", "coffee": "enamel_green", "locker": "enamel_ochre"}[kind]
    bottom = 0.32
    face = z + depth / 2
    # Each enclosure has a grounded plinth, feet, door seam and an overhanging rain cap.
    box("metal", (x, 0.20, z), (width + 0.06, 0.08, depth + 0.08))
    for dx in (-width * 0.37, width * 0.37):
        for dz in (-depth * 0.35, depth * 0.35):
            box("metal", (x + dx, 0.28, z + dz), (0.12, 0.16, 0.12))
    box(finish, (x, bottom + height / 2, z), (width, height, depth))
    box("metal", (x, bottom + height, z + 0.035), (width + 0.10, 0.075, depth + 0.15))
    for dx in (-width * 0.47, width * 0.47):
        box("trim", (x + dx, bottom + height / 2, face + 0.015), (0.018, height - 0.08, 0.016))
    if kind == "locker":
        prop_surface(kind, (x, 1.31, face + 0.026), 1.52, 1.73, variant)
        for row in range(3):
            for col in range(2):
                px, py = x - 0.38 + col * 0.76, 0.85 + row * 0.42
                box("metal", (px + 0.23, py, face + 0.05), (0.055, 0.13, 0.045))
                box("trim", (px + 0.23, py + 0.02, face + 0.082), (0.026, 0.07, 0.022))
        box("street_detail", (x, 2.19, face + 0.045), (0.38, 0.13, 0.04))
        box("emit_cyan", (x - 0.10, 2.19, face + 0.07), (0.10, 0.035, 0.012))
    else:
        dw, dh = (1.02, 1.58) if kind == "drinks" else (0.94, 1.37)
        dx, dy = x - 0.075, 1.77 if kind == "drinks" else 1.73
        box("metal", (dx, dy, face + 0.025), (dw + 0.055, dh + 0.055, 0.035))
        prop_surface(kind, (dx, dy, face + 0.048), dw, dh, variant)
        # The pickup cavity is recessed between solid lips; the coffee unit has a cup bay.
        box("street_detail", (x - 0.10, 0.73, face + 0.012), (width * 0.62, 0.29, 0.025))
        for dy2 in (-0.16, 0.16):
            box("trim", (x - 0.10, 0.73 + dy2, face + 0.052), (width * 0.66, 0.035, 0.09))
        if kind == "coffee":
            cylinder("enamel_cream", (x - 0.10, 0.60, face + 0.09), (x - 0.10, 0.77, face + 0.09), 0.07, 12, end_radius=0.085)
            for slat in range(7):
                box("wood", (x - width / 2 - 0.012, 1.47, z - 0.38 + slat * 0.12), (0.04, 1.95, 0.055))
        for j in range(4):
            py = 1.04 + j * 0.25
            cylinder("metal", (x + width * 0.41, py, face + 0.025), (x + width * 0.41, py, face + 0.071), 0.039, 10)
            cylinder("enamel_red" if j == 3 else "enamel_cream", (x + width * 0.41, py, face + 0.071), (x + width * 0.41, py, face + 0.079), 0.026, 10)
        box("metal", (x + width * 0.41, 2.13, face + 0.04), (0.14, 0.25, 0.04))
        box("street_detail", (x + width * 0.41, 2.17, face + 0.064), (0.075, 0.014, 0.01))
        for j in range(5):
            box("street_detail", (x - 0.16, 0.40 + j * 0.024, face + 0.012), (0.54, 0.009, 0.014))
        if kind == "drinks":
            box("enamel_red", (x, 0.60 + height * 0.5, z - depth * 0.5 - 0.008), (width * 0.82, height * 0.65, 0.025))
    # Power comes from the wall: a slack cable lies behind the machine, clear of the walkway.
    cable([(x + side * width * 0.4, 0.42, z - depth * 0.3), (side * 9.52, 0.23, z - depth * 0.55),
           (side * 9.70, 0.22, z - depth * 0.65), (side * 9.70, 0.85, z - depth * 0.65)], 0.024)


def crate(x, y, z, variant):
    material = "wood" if variant % 2 else "enamel_red"
    width, height, depth = 0.58, 0.36, 0.46
    box(material, (x, y + 0.035, z), (width, 0.07, depth))
    for dx in (-width / 2 + 0.035, width / 2 - 0.035):
        for dz in (-depth / 2 + 0.035, depth / 2 - 0.035):
            box(material, (x + dx, y + height / 2, z + dz), (0.07, height, 0.07))
    for row in range(3):
        for dz in (-depth / 2, depth / 2):
            box(material, (x, y + 0.10 + row * 0.10, z + dz), (width, 0.065, 0.045))
        for dx in (-width / 2, width / 2):
            box(material, (x + dx, y + 0.10 + row * 0.10, z), (0.045, 0.065, depth))


def planter(x, z, variant):
    rng = random.Random(SEED + variant * 97)
    cylinder("enamel_red" if variant % 2 else "concrete_light", (x, 0.16, z), (x, 0.55, z), 0.19, 12, end_radius=0.27)
    cylinder("street_detail", (x, 0.545, z), (x, 0.56, z), 0.245, 12)
    for i in range(13):
        angle = TAU * i / 13 + rng.uniform(-0.18, 0.18)
        reach, rise = rng.uniform(0.25, 0.56), rng.uniform(0.30, 0.84)
        stem = (x, 0.56, z)
        tip = (x + math.cos(angle) * reach, 0.56 + rise * 0.7, z + math.sin(angle) * reach)
        peak = (x + math.cos(angle) * reach * 0.48, 0.56 + rise, z + math.sin(angle) * reach * 0.48)
        wing = (-math.sin(angle) * 0.075, 0, math.cos(angle) * 0.075)
        geometry("foliage", [stem, add(peak, wing), tip, sub(peak, wing)], [(0, 1, 2), (0, 2, 3)])
        beam("foliage", stem, peak, 0.014)


def lived_in_shop(side, front, index):
    """Objects form small shop-specific groups, with room left on the tactile route."""
    x, z = side * 9.15, front - 6.4
    if index % 3 != 2:
        crate(x, 0.16, z, index)
        crate(x + side * 0.07, 0.52, z - 0.055, index + 1)
    if index % 2 == 0:
        planter(side * 9.1, z - 1.05, index + (side == 1) * 11)
    else:
        # A freestanding menu is carried by a real A-frame with four feet.
        mx, mz = side * 8.72, z - 0.8
        box("wood", (mx, 1.06, mz), (0.69, 0.95, 0.07))
        prop_surface("menu", (mx, 1.06, mz + 0.044), 0.62, 0.87, index + (side == 1) * 4)
        for dx in (-0.30, 0.30):
            for dz in (-0.23, 0.23):
                beam("wood", (mx + dx, 0.16, mz + dz), (mx + dx, 1.52, mz), 0.045)
    # Meter boxes, conduit clamps and a service notice are attached to the facade.
    mz = front - 0.8
    box("metal", (side * 9.88, 1.71, mz), (0.30, 0.57, 0.39))
    cylinder("metal", (side * 9.72, 0.18, mz), (side * 9.72, 1.43, mz), 0.025, 6)
    for y in (0.42, 0.98, 1.37):
        box("trim", (side * 9.85, y, mz), (0.30, 0.045, 0.085))


def lantern(x, y, z):
    cylinder("metal", (x, y + 0.35, z), (x, y + 0.72, z), 0.025, 6)
    cylinder("emit_coral", (x, y - 0.30, z), (x, y + 0.30, z), 0.25, 14)
    for dy in (-0.32, -0.2, 0.2, 0.32):
        ring("metal", (x, y + dy, z), 0.252 if abs(dy) < 0.3 else 0.18, 0.018, 14, 4)
    cylinder("metal", (x, y - 0.39, z), (x, y - 0.3, z), 0.16, 12)


def streets():
    for side in (-1, 1):
        box("concrete_dark", (side * 8.55, 0.08, -58), (3.1, 0.16, 144))
        for i in range(72):
            z = 13 - i * 2
            box("concrete_light", (side * 7.04, 0.13, z), (0.21, 0.26, 1.92))
            box("street_detail", (side * 8.5, 0.166, z), (2.8, 0.012, 0.027))
        for i in range(110):
            z = 13 - i * 1.3
            for offset in (-0.12, 0, 0.12):
                box("tactile", (side * 7.73 + offset, 0.18, z), (0.055, 0.025, 1.15))
        for i in range(12):
            z = 9 - i * 11.4
            cylinder("metal", (side * 7.5, 0.16, z), (side * 7.5, 0.91, z), 0.09, 8)
            cylinder("emit_amber", (side * 7.5, 0.70, z), (side * 7.5, 0.77, z), 0.095, 8)
            box("street_detail", (side * 6.73, 0.012, z + 1.3), (0.36, 0.025, 1.1))
            for bar in range(9):
                box("metal", (side * 6.73, 0.031, z + 0.83 + bar * 0.115), (0.33, 0.018, 0.024))
        for index, z in enumerate((1.1, -19, -51, -82)):
            vending_machine(side, z, index)
        front = 4.0
        for index, depth in enumerate((13, 12, 15, 13, 14)):
            lived_in_shop(side, front, index)
            front -= depth + 1.15
        # Paper lanterns are authored in Three.js with ribbed envelopes and printed paper.
        # Light arms are carried by full-height poles and triangular braces.
        for z in (-5, -28, -56, -82, -107):
            x = side * 7.65
            cylinder("metal", (x, 0.16, z), (x, 7.6, z), 0.115, 10)
            beam("metal", (x, 7.42, z), (side * 5.8, 7.42, z), 0.12)
            beam("metal", (x, 6.6, z), (side * 6.05, 7.42, z), 0.08)
            box("metal", (side * 5.75, 7.37, z), (1.05, 0.20, 0.45))
            box("emit_amber", (side * 5.75, 7.255, z), (0.86, 0.035, 0.3))
    for i in range(10):
        box("paint", (-5.85 + i * 1.3, 0.018, 6), (0.72, 0.018, 3.3))
    for z in range(-6, -124, -9):
        box("paint", (0, 0.014, z), (0.13, 0.016, 3.2))
    for z in (0, -21, -58):
        cylinder("street_detail", (2.8, 0.004, z), (2.8, 0.025, z), 0.52, 28)
        ring("metal", (2.8, 0.028, z), 0.48, 0.025, 28, 4)
        for offset in (-0.18, 0, 0.18):
            box("metal", (2.8, 0.032, z + offset), (0.66, 0.012, 0.026))
    # Utility crossbars and bundles of sagging wires form the foreground canopy.
    for z, height in ((-12, 10.2), (-33, 13.2)):
        for side in (-1, 1):
            x = side * 8.22
            cylinder("metal", (x, 0.16, z), (x, height + 0.45, z), 0.15, 10)
            beam("metal", (x - 0.8, height, z), (x + 0.8, height, z), 0.12)
            for offset in (-0.6, 0, 0.6):
                cylinder("trim", (x + offset, height, z), (x + offset, height + 0.3, z), 0.08, 8)
        for index in range(5):
            sagging_cable(-8.22, 8.22, height + 0.28 - index * 0.16, z + index * 0.14, 1.25 + index * 0.12, 0.15)
    for side in (-1, 1):
        cable([(side * 8.22, 10.45 + 3.0 * i / 20 - 0.7 * math.sin(math.pi * i / 20), -12 - 21 * i / 20)
               for i in range(21)], 0.04)


def hero_tower():
    x, z = -2, -110
    box("concrete_dark", (x, 27.5, z), (5.2, 55, 5.4))
    box("glass", (x, 53.0, z), (3.8, 27, 4.1))
    for sx in (-1, 1):
        for sz in (-1, 1):
            beam("trim", (x + sx * 2.62, 0, z + sz * 2.72), (x + sx * 1.5, 67, z + sz * 1.6), 0.22)
    for y in range(7, 65, 3):
        facade_depth = 2.7 if y < 53 else 2.05
        box("metal", (x, y, z + facade_depth + 0.04), (5.2 if y < 53 else 3.8, 0.13, 0.18))
        for dx in (-1.4, 0, 1.4):
            panel("glass_lit", (x + dx, y + 0.8, z + facade_depth + 0.02), 0.47, 1.4)
    for y, radius in ((55.8, 4.0), (63.2, 2.75)):
        ring("metal", (x, y, z), radius, 0.20, 48, 8)
        ring("emit_cyan", (x, y + 0.05, z), radius + 0.18, 0.085, 48, 6)
        for i in range(8):
            angle = TAU * i / 8
            beam("metal", (x, y, z), (x + radius * math.cos(angle), y, z + radius * math.sin(angle)), 0.12)
    cylinder("metal", (x, 64, z), (x, 74.9, z), 0.31, 12, end_radius=0.06)
    cylinder("emit_coral", (x, 74.9, z), (x, 75.15, z), 0.09, 8)


def skyline():
    for row in range(3):
        for col in range(13):
            x = (col - 6) * 12.2 + RNG.uniform(-2.4, 2.4)
            z = -151 - row * 25 + RNG.uniform(-5, 5)
            width, depth = RNG.uniform(6, 11), RNG.uniform(8, 14)
            height = RNG.uniform(22, 64) + row * 7
            material = "concrete_dark" if (col + row) % 3 else "concrete"
            box(material, (x, height / 2, z), (width, height, depth))
            box("metal", (x + width * 0.12, height + 1.4, z), (width * 0.65, 2.8, depth * 0.7))
            for y in range(5, int(height - 1), 4):
                for px in (-width * 0.3, 0, width * 0.3):
                    if RNG.random() > 0.28:
                        panel("glass_lit" if RNG.random() > 0.2 else "emit_amber", (x + px, y, z + depth / 2 + 0.07), 0.55, 1.25)
            if col % 3 == 0:
                box("emit_cyan", (x - width / 2 - 0.02, height * 0.65, z + depth / 2 + 0.07), (0.085, height * 0.6, 0.08))
                cylinder("metal", (x, height, z), (x, height + 5, z), 0.11, 8)


def srgb_channel(value):
    value /= 255
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def make_material(name):
    color, roughness, metallic, emission = PALETTE[name]
    rgb = tuple(srgb_channel(int(color[i:i + 2], 16)) for i in (1, 3, 5))
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (*rgb, 1)
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*rgb, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if emission:
        shader.inputs["Emission Color"].default_value = (*rgb, 1)
        shader.inputs["Emission Strength"].default_value = emission
    return material


def save_scene(output_dir):
    materials = {name: make_material(name) for name in BATCHES}
    triangles = 0
    for name, batch in BATCHES.items():
        mesh = bpy.data.meshes.new("Tokyo_" + name)
        mesh.from_pydata(batch["vertices"], [], batch["faces"])
        mesh.materials.append(materials[name])
        for polygon, smooth in zip(mesh.polygons, batch["smooth"]):
            polygon.use_smooth = smooth
        mesh.update()
        obj = bpy.data.objects.new("Tokyo_" + name, mesh)
        bpy.context.collection.objects.link(obj)
        triangles += sum(len(face) - 2 for face in batch["faces"])
    camera_data = bpy.data.cameras.new("Tokyo_Camera")
    camera = bpy.data.objects.new("Tokyo_Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = blender_point((1.3, 5.0, 19))
    camera.rotation_euler = (Vector(blender_point((0, 10, -40))) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera_data.sensor_fit = "VERTICAL"
    camera_data.sensor_height = 24
    camera_data.lens = 12 / math.tan(math.radians(52) / 2)
    camera_data.clip_end = 500
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    if scene.world is None:
        scene.world = bpy.data.worlds.new("Tokyo_Night")
    scene.world.color = (0.025, 0.038, 0.06)
    scene["authoring_coordinates"] = "Three.js: x right, y up, negative z down avenue"
    scene["seed"] = SEED
    scene["triangles"] = triangles
    scene["source"] = "Original procedural geometry, no external or generated image assets"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(output_dir / "tokyo-city.blend"))
    bpy.ops.export_scene.gltf(filepath=str(output_dir / "tokyo-city.glb"), export_format="GLB",
                              export_yup=True, export_cameras=False, export_lights=False,
                              export_materials="EXPORT", export_apply=False)
    (output_dir / "tokyo-signs.json").write_text(json.dumps(SIGNS, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output_dir / "tokyo-props.json").write_text(json.dumps(PROP_SURFACES, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"meshes": len(BATCHES), "triangles": triangles, "signs": len(SIGNS), "prop_surfaces": len(PROP_SURFACES),
                      "output_dir": str(output_dir)}, indent=2))


def build_city(output_dir):
    RNG.seed(SEED)
    BATCHES.clear()
    SIGNS.clear()
    PROP_SURFACES.clear()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    depths = (13, 12, 15, 13, 14, 12, 15, 13, 14)
    heights = ((23, 32, 27, 39, 31, 43, 36, 46, 34), (29, 25, 36, 30, 42, 34, 45, 38, 48))
    for side in (-1, 1):
        front = 4.0
        for index, depth in enumerate(depths):
            width = 8.2 + ((index * 3 + (side == 1) * 2) % 6)
            building(side, index, front, depth, width, heights[side == 1][index])
            front -= depth + 1.15
    streets()
    hero_tower()
    skyline()
    save_scene(output_dir)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    args.output_dir.mkdir(parents=True, exist_ok=True)
    build_city(args.output_dir)


if __name__ == "__main__":
    main()
