"""Pixel-art icons made solid: the arrow cursor and an 8-bit sparkle, one bevelled voxel per pixel.

The desktop look of the Get Up round (generic UI shapes, no character): a white cursor with a dark
outline and a butter sparkle, in glossy toy plastic.
"""
from __future__ import annotations

import bpy

import shapes
import studio

CURSOR = ["X.........",
          "XX........",
          "XWX.......",
          "XWWX......",
          "XWWWX.....",
          "XWWWWX....",
          "XWWWWWX...",
          "XWWWWWWX..",
          "XWWWWWWWX.",
          "XWWWWWWWWX",
          "XWWWWWXXXX",
          "XWWXWWX...",
          "XWX.XWWX..",
          "XX..XWWX..",
          "X....XWWX.",
          ".....XWWX.",
          "......XX.."]

SPARKLE = ["...X...",
           "...X...",
           "..XXX..",
           "XXXXXXX",
           "..XXX..",
           "...X...",
           "...X..."]


def voxels(name: str, bitmap, char: str, cell: float, parent, material, depth: float = 1.0) -> bpy.types.Object:
    """One cube per pixel equal to char, keeping only the faces that look out (so the bevel rounds
    the outline of the icon, not the seams between its pixels). Each face winds counter-clockwise
    seen from outside."""
    rows, cols = len(bitmap), len(bitmap[0])
    filled = {(r, c) for r, row in enumerate(bitmap) for c, value in enumerate(row) if value == char}
    index: dict[tuple, int] = {}
    faces = []

    def vertex(p):
        key = tuple(round(v, 6) for v in p)
        return index.setdefault(key, len(index))

    h, d = cell / 2, cell * depth / 2
    # (neighbour offset or None, corners as (sx, sy, sz) in counter-clockwise order from outside)
    sides = [(None, [(-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)]),   # front, -Y
             (None, [(1, 1, -1), (-1, 1, -1), (-1, 1, 1), (1, 1, 1)]),       # back, +Y
             ((0, 1), [(1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)]),     # right, +X
             ((0, -1), [(-1, 1, -1), (-1, -1, -1), (-1, -1, 1), (-1, 1, 1)]),  # left, -X
             ((-1, 0), [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]),    # top, +Z
             ((1, 0), [(1, -1, -1), (-1, -1, -1), (-1, 1, -1), (1, 1, -1)])]  # bottom, -Z
    for r, c in sorted(filled):
        x, z = (c - cols / 2 + 0.5) * cell, (rows / 2 - r - 0.5) * cell
        for neighbour, corners in sides:
            if neighbour and (r + neighbour[0], c + neighbour[1]) in filled:
                continue
            faces.append([vertex((x + sx * h, sy * d, z + sz * h)) for sx, sy, sz in corners])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([key for key, _ in sorted(index.items(), key=lambda item: item[1])], [], faces)
    mesh.validate()
    obj = shapes.link(bpy.data.objects.new(name, mesh), parent)
    bevel = obj.modifiers.new("Soft voxels", "BEVEL")
    bevel.width = cell * 0.12
    bevel.segments = 3
    bevel.harden_normals = True
    studio.assign(obj, material)
    return obj


def build_cursor() -> bpy.types.Object:
    root = shapes.link(bpy.data.objects.new("Cursor", None))
    voxels("Cursor fill", CURSOR, "W", 0.12, root, studio.vinyl("Cursor white", color="#FFFFFF", roughness=0.2))
    voxels("Cursor outline", CURSOR, "X", 0.12, root, studio.vinyl("Cursor ink", color="#3A2459", roughness=0.2),
           depth=1.15)
    return root


def build_sparkle(color: str = "#FFE38A") -> bpy.types.Object:
    root = shapes.link(bpy.data.objects.new("Pixel sparkle", None))
    voxels("Sparkle", SPARKLE, "X", 0.16, root, studio.vinyl("Sparkle butter", color=color, roughness=0.18))
    return root
