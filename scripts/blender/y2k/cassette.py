"""Clear candy cassette tape: a tinted see-through shell with the reels and the tape inside.

The Side A / Side B structure of the Ditto era (reference 24 for the structure only): the shell
is jelly plastic, so the white hubs and the brown tape show through it, and a pastel label with a
big A sits on top. Units: 2 wide, as a real cassette's 100 mm.
"""
from __future__ import annotations

import math

import bpy

import shapes
import studio

SIZE = (2.0, 1.26, 0.24)
REELS = (-0.44, 0.44)
REEL_Z = 0.02


def _disc(name: str, radius: float, depth: float, location, parent, material, bevel: float = 0.01):
    """A cylinder along Y (towards the camera)."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=radius, depth=depth)
    obj = bpy.context.active_object
    obj.name = name
    obj.parent = parent
    obj.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    obj.location = location
    if bevel:
        modifier = obj.modifiers.new("Soft rims", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        modifier.harden_normals = True
    bpy.ops.object.shade_smooth()
    studio.assign(obj, material)
    return obj


def _letter(text: str, size: float, location, parent, material) -> bpy.types.Object:
    curve = bpy.data.curves.new(f"Label {text}", "FONT")
    curve.body = text
    curve.size = size
    curve.extrude = 0.004
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    obj = shapes.link(bpy.data.objects.new(f"Label {text}", curve), parent)
    obj.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    obj.location = location
    studio.assign(obj, material)
    return obj


def build(shell: str = "#B48AFF", label: str = "#FFC7E0") -> bpy.types.Object:
    root = shapes.link(bpy.data.objects.new("Cassette", None))
    body = shapes.slab("Cassette shell", shapes.rounded_rect(SIZE[0], SIZE[1], 0.07), SIZE[2], 0.035,
                       segments=4, parent=root)
    studio.assign(body, studio.candy("Cassette jelly", color=shell, density=3.5))
    # The raised head area at the bottom, a trapezoid in the same plastic.
    head = shapes.slab("Head area", [(-0.62, -0.63), (0.62, -0.63), (0.5, -0.36), (-0.5, -0.36)],
                       0.04, 0.012, segments=2, parent=root)
    head.location = (0.0, -SIZE[2] / 2 - 0.012, 0.0)
    studio.assign(head, studio.candy("Cassette jelly head", color=shell, density=3.5))

    hub = studio.vinyl("Hub", color="#FFFFFF", roughness=0.3)
    tape = studio.principled("Tape", base_color=studio.linear("#4A2F33"), roughness=0.28, coat=0.3)
    for x, wound in zip(REELS, (0.36, 0.24)):
        _disc("Tape pack", wound, 0.12, (x, 0.0, REEL_Z), root, tape, bevel=0.0)
        _disc("Hub", 0.15, 0.17, (x, 0.0, REEL_Z), root, hub)
        _disc("Hub hole", 0.06, 0.18, (x, -0.002, REEL_Z), root,
              studio.principled("Hub hole", base_color=studio.linear("#E9DDF7"), roughness=0.5), bevel=0.0)

    paper = studio.principled("Label paper", base_color=studio.linear(label), roughness=0.6)
    sticker = shapes.slab("Label", shapes.rounded_rect(1.76, 0.34, 0.05), 0.008, 0.003, segments=2, parent=root)
    sticker.location = (0.0, -SIZE[2] / 2 - 0.004, 0.4)
    studio.assign(sticker, paper)
    ink = studio.vinyl("Label ink", color="#FF4F9A", roughness=0.4, coat=0.0)
    _letter("A", 0.3, (-0.7, -SIZE[2] / 2 - 0.01, 0.4), root, ink)
    line_ink = studio.principled("Label lines", base_color=studio.linear("#E58BB6"), roughness=0.6)
    for i, z in enumerate((0.47, 0.4, 0.33)):
        line = shapes.slab(f"Label line {i}", shapes.rounded_rect(1.2, 0.012, 0.006), 0.004, 0.0015,
                           segments=1, parent=root)
        line.location = (0.12, -SIZE[2] / 2 - 0.009, z)
        studio.assign(line, line_ink)
    screw = studio.chrome("Screw", tint="#F7F0FF", roughness=0.15)
    for x, z in ((-0.9, 0.53), (0.9, 0.53), (-0.9, -0.53), (0.9, -0.53), (0.0, -0.5)):
        _disc("Screw", 0.035, 0.03, (x, -SIZE[2] / 2 - 0.004, z), root, screw, bevel=0.008)
    return root
