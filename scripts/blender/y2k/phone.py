"""Candy flip phone, open, with a beaded strap: the Y2K clamshell (references 02, 03), generic.

No brand shape: a pebble-soft shell in pastel vinyl, a barrel hinge, pearl keys without numbers,
a screen with a pixel heart, and a strap of pearls and candy beads ending in a puffy heart charm,
hung from the bottom corner. Units: the base is 1 wide (about 50 mm on a real phone).
"""
from __future__ import annotations

import math

import bpy
import numpy as np

import heart
import pillow
import shapes
import studio

BASE = (1.0, 1.85, 0.2)  # width, height, thickness
LID = (1.0, 1.72, 0.15)
HINGE_RADIUS = 0.115
OPEN = 14.0  # degrees the lid leans towards the camera from flat

PIXEL_HEART = ["01100110",
               "11111111",
               "11111111",
               "01111110",
               "00111100",
               "00011000"]


def _pixel_heart(name: str, cell: float, parent, location, material) -> bpy.types.Object:
    verts, faces = [], []
    rows = len(PIXEL_HEART)
    cols = len(PIXEL_HEART[0])
    for r, row in enumerate(PIXEL_HEART):
        for c, bit in enumerate(row):
            if bit != "1":
                continue
            x0 = (c - cols / 2) * cell
            z0 = (rows / 2 - r - 1) * cell
            base = len(verts)
            inset = 0.08 * cell
            verts += [(x0 + inset, 0.0, z0 + inset), (x0 + cell - inset, 0.0, z0 + inset),
                      (x0 + cell - inset, 0.0, z0 + cell - inset), (x0 + inset, 0.0, z0 + cell - inset)]
            faces.append((base, base + 1, base + 2, base + 3))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    if mesh.polygons[0].normal.y > 0:
        mesh.flip_normals()
    obj = shapes.link(bpy.data.objects.new(name, mesh), parent)
    obj.location = location
    studio.assign(obj, material)
    return obj


def _screen_material() -> bpy.types.Material:
    """Dark glass over a glowing sky-to-pink wallpaper, brighter at the top like an old LCD."""
    material = studio.principled("Screen", base_color=studio.linear("#1B1630"), roughness=0.05,
                                 coat=1.0, coat_roughness=0.0)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = studio.principled_node(material)
    coord = nodes.new("ShaderNodeTexCoord")
    separate = nodes.new("ShaderNodeSeparateXYZ")
    span = nodes.new("ShaderNodeMapRange")
    span.inputs["From Min"].default_value = -0.5
    span.inputs["From Max"].default_value = 0.5
    ramp = studio._ramp(nodes, [(0.0, "#FFB6DC"), (0.55, "#D7C2FF"), (1.0, "#A9DCFF")])
    links.new(coord.outputs["Object"], separate.inputs[0])
    links.new(separate.outputs["Z"], span.inputs["Value"])
    links.new(span.outputs["Result"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs[studio.SOCKETS["emission_color"]])
    bsdf.inputs[studio.SOCKETS["emission_strength"]].default_value = 1.1
    return material


def _keys(base, key_material, accent_material) -> None:
    face = -BASE[2] / 2
    key = shapes.rounded_rect(0.26, 0.135, 0.06)
    for row, z in enumerate((0.06, -0.15, -0.36, -0.57)):
        for col, x in enumerate((-0.3, 0.0, 0.3)):
            obj = shapes.slab(f"Key {row}{col}", key, 0.05, 0.018, segments=4, parent=base)
            obj.location = (x, face - 0.012, z)
            studio.assign(obj, key_material)
    # Navigation: a round pad with a centre button, soft keys above, call keys beside.
    pad = shapes.slab("Nav pad", shapes.rounded_rect(0.36, 0.36, 0.18, per_corner=16), 0.05, 0.02,
                      segments=4, parent=base)
    pad.location = (0.0, face - 0.012, 0.42)
    studio.assign(pad, key_material)
    centre = shapes.slab("Nav centre", shapes.rounded_rect(0.14, 0.14, 0.07, per_corner=12), 0.06, 0.02,
                         segments=4, parent=base)
    centre.location = (0.0, face - 0.03, 0.42)
    studio.assign(centre, accent_material)
    small = shapes.rounded_rect(0.2, 0.09, 0.045)
    for name, x, z in (("Soft left", -0.33, 0.6), ("Soft right", 0.33, 0.6),
                       ("Call", -0.33, 0.3), ("End", 0.33, 0.3)):
        obj = shapes.slab(name, small, 0.045, 0.016, segments=4, parent=base)
        obj.location = (x, face - 0.012, z)
        studio.assign(obj, key_material if name.startswith("Soft") else accent_material)


def _strap(base, cord_material, bead_materials, charm_material) -> None:
    """Pearls and candy beads on a white cord from the bottom-left corner, ending in a heart."""
    hole = np.array([-0.4, 0.0, -BASE[1] / 2 + 0.08])
    path = np.array([hole, hole + (-0.1, -0.03, -0.16), hole + (-0.28, -0.06, -0.4),
                     hole + (-0.42, -0.08, -0.68), hole + (-0.45, -0.08, -0.98), hole + (-0.38, -0.08, -1.22)])
    studio.assign(shapes.cord("Strap cord", path, 0.014, parent=base), cord_material)
    beads = shapes.path_points(path[1:], 7)[:-1]
    sizes = [0.085, 0.1, 0.09, 0.12, 0.1, 0.085]
    for i, (point, size) in enumerate(zip(beads, sizes)):
        if i == 3:
            star = pillow.inflate("Star bead", shapes.star_outline() * size, depth=size * 0.5,
                                  rings=20, centre=(0.0, 0.0))
            star.parent = base
            star.location = point
            studio.assign(star, bead_materials[i % len(bead_materials)])
            continue
        bead = shapes.sphere(f"Bead {i}", size, point, parent=base, squash=0.85 if i % 2 else 1.0)
        studio.assign(bead, bead_materials[i % len(bead_materials)])
    charm = pillow.inflate("Heart charm", heart.outline(240) * 0.24, depth=0.1, rings=28,
                           centre=(0.0, 0.01))
    charm.parent = base
    charm.location = path[-1] + (0.0, 0.0, -0.18)
    charm.rotation_euler = (0.0, 0.0, math.radians(-12.0))
    studio.assign(charm, charm_material)


def build(shell: str = "#A9D6FF", accent: str = "#FF8FC4") -> bpy.types.Object:
    shell_material = studio.vinyl("Phone shell", color=shell, roughness=0.26)
    key_material = studio.pearl("Phone keys", base="#FFF6FB", film=480.0, roughness=0.18, film_spread=160.0)
    accent_material = studio.vinyl("Phone accent", color=accent, roughness=0.2)
    hinge_material = studio.chrome("Phone hinge", tint="#F4E9FF", roughness=0.08)
    root = shapes.link(bpy.data.objects.new("Phone", None))

    base = shapes.slab("Phone base", shapes.rounded_rect(BASE[0], BASE[1], 0.22), BASE[2], 0.07, parent=root)
    base.location = (0.0, 0.0, -BASE[1] / 2 - HINGE_RADIUS * 0.6)
    studio.assign(base, shell_material)
    _keys(base, key_material, accent_material)

    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=HINGE_RADIUS, depth=BASE[0] * 0.92)
    hinge = bpy.context.active_object
    hinge.name = "Phone hinge"
    hinge.parent = root
    hinge.rotation_euler = (0.0, math.radians(90.0), 0.0)
    bevel = hinge.modifiers.new("Soft ends", "BEVEL")
    bevel.width = 0.03
    bevel.segments = 4
    bevel.harden_normals = True
    bpy.ops.object.shade_smooth()
    studio.assign(hinge, shell_material)
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=HINGE_RADIUS * 0.72, depth=0.035)
        ring = bpy.context.active_object
        ring.name = f"Hinge ring {side}"
        ring.parent = root
        ring.rotation_euler = (0.0, math.radians(90.0), 0.0)
        ring.location = (side * BASE[0] * 0.47, 0.0, 0.0)
        bpy.ops.object.shade_smooth()
        studio.assign(ring, hinge_material)

    pivot = shapes.link(bpy.data.objects.new("Lid pivot", None), root)
    pivot.rotation_euler = (math.radians(OPEN), 0.0, 0.0)
    lid = shapes.slab("Phone lid", shapes.rounded_rect(LID[0], LID[1], 0.22), LID[2], 0.06, parent=pivot)
    lid.location = (0.0, 0.0, LID[1] / 2 + HINGE_RADIUS * 0.6)
    studio.assign(lid, shell_material)
    face = -LID[2] / 2
    screen = shapes.slab("Screen", shapes.rounded_rect(0.8, 1.02, 0.08), 0.012, 0.004, segments=2, parent=lid)
    screen.location = (0.0, face - 0.002, 0.02)
    studio.assign(screen, _screen_material())
    glow = studio.principled("Pixel glow", base_color=studio.linear("#FFFFFF"),
                             emission_color=studio.linear("#FFFFFF"), emission_strength=2.2)
    _pixel_heart("Pixel heart", 0.06, lid, (0.0, face - 0.0095, 0.02), glow)
    slot = shapes.slab("Speaker", shapes.rounded_rect(0.3, 0.045, 0.022), 0.01, 0.003, segments=2, parent=lid)
    slot.location = (0.0, face - 0.002, 0.68)
    studio.assign(slot, studio.principled("Speaker dark", base_color=studio.linear("#3A2A55"), roughness=0.4))

    _strap(base, studio.vinyl("Cord", color="#FFFFFF", roughness=0.4, coat=0.0),
           [studio.pearl("Bead pearl", base="#FFF4FA", film=520.0, roughness=0.1),
            studio.vinyl("Bead pink", color="#FF9CCB", roughness=0.15),
            studio.vinyl("Bead blue", color="#9FD2FF", roughness=0.15),
            studio.vinyl("Bead butter", color="#FFE9A3", roughness=0.15)],
           studio.vinyl("Charm pink", color="#FF7DBA", roughness=0.12))
    return root
