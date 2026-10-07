"""Pastel compact camcorder with the screen flipped to face forward, and a beaded wrist strap.

The Ditto-era camcorder as a toy-like object (reference 22 for the structure only, no brand): a
pebble body, a big lens with a coated glass that throws violet and green, the side screen swung
out and turned round to face the subject, and a strap of pony beads at the back. The lens looks
along -X; the screen opens from the left side (-Y). Units: the body is 1.5 long.
"""
from __future__ import annotations

import math

import bpy
import numpy as np

import phone
import shapes
import studio

BODY = (1.4, 0.8, 0.62)  # length (X), height (Z), width (Y)
LENS_RADIUS = 0.3
SCREEN = (0.78, 0.5, 0.07)


def _cylinder(name: str, radius: float, depth: float, location, parent, vertices: int = 64,
              bevel: float = 0.0) -> bpy.types.Object:
    """A cylinder along X."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth)
    obj = bpy.context.active_object
    obj.name = name
    obj.parent = parent
    obj.rotation_euler = (0.0, math.radians(90.0), 0.0)
    obj.location = location
    if bevel:
        modifier = obj.modifiers.new("Soft rims", "BEVEL")
        modifier.width = bevel
        modifier.segments = 4
        modifier.harden_normals = True
    bpy.ops.object.shade_smooth()
    return obj


def _lens_glass() -> bpy.types.Material:
    """Dark glass under an anti-reflection coat: the thin film tints the reflections violet-green."""
    return studio.principled("Lens glass", base_color=studio.linear("#14102A"), roughness=0.02,
                             coat=1.0, coat_roughness=0.0, thin_film=380.0, thin_film_ior=1.38,
                             specular=1.0)


def _strap(body, materials) -> None:
    """Pony beads on a cord, looped from the bottom back corner."""
    anchor = np.array([BODY[0] / 2 - 0.12, -BODY[2] / 2 + 0.1, -BODY[1] / 2 + 0.06])
    path = np.array([anchor, anchor + (0.12, -0.04, -0.14), anchor + (0.2, -0.1, -0.4),
                     anchor + (0.12, -0.16, -0.66), anchor + (-0.06, -0.18, -0.8),
                     anchor + (-0.22, -0.16, -0.7), anchor + (-0.26, -0.1, -0.46), anchor + (-0.18, -0.04, -0.2),
                     anchor])
    studio.assign(shapes.cord("Wrist cord", path, 0.012, parent=body), materials[0])
    beads = shapes.path_points(path[1:-1], 11)
    for i, point in enumerate(beads):
        bead = shapes.pony_bead(f"Pony bead {i}", 0.07, point, parent=body)
        bead.rotation_euler = (math.radians(70.0 + 23.0 * i), math.radians(31.0 * i), 0.0)
        studio.assign(bead, materials[1 + i % (len(materials) - 1)])


def build(shell: str = "#BFE2FF", trim: str = "#FF9ACB") -> bpy.types.Object:
    shell_material = studio.vinyl("Camcorder shell", color=shell, roughness=0.28)
    trim_material = studio.vinyl("Camcorder trim", color=trim, roughness=0.2)
    metal = studio.chrome("Camcorder chrome", tint="#F3EEFF", roughness=0.1)
    root = shapes.link(bpy.data.objects.new("Camcorder", None))

    body = shapes.slab("Camcorder body", shapes.rounded_rect(BODY[0], BODY[1], 0.22), BODY[2], 0.15,
                       segments=8, parent=root)
    studio.assign(body, shell_material)

    front = -BODY[0] / 2
    barrel = _cylinder("Lens barrel", LENS_RADIUS, 0.22, (front - 0.05, 0.0, 0.03), root, bevel=0.03)
    studio.assign(barrel, shell_material)
    ring = _cylinder("Lens ring", LENS_RADIUS + 0.025, 0.07, (front - 0.17, 0.0, 0.03), root, bevel=0.02)
    studio.assign(ring, metal)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=LENS_RADIUS * 0.86)
    glass = bpy.context.active_object
    glass.name = "Lens glass"
    glass.parent = root
    glass.scale = (0.32, 1.0, 1.0)
    glass.location = (front - 0.18, 0.0, 0.03)
    bpy.ops.object.shade_smooth()
    studio.assign(glass, _lens_glass())

    # Microphone bump on top of the front and a zoom rocker at the back.
    mic = shapes.slab("Mic", shapes.rounded_rect(0.34, 0.12, 0.06), 0.3, 0.05, segments=4, parent=root)
    mic.location = (front + 0.3, 0.0, BODY[1] / 2 + 0.03)
    studio.assign(mic, trim_material)
    rocker = shapes.slab("Zoom rocker", shapes.rounded_rect(0.24, 0.07, 0.035), 0.12, 0.03, segments=4,
                         parent=root)
    rocker.location = (BODY[0] / 2 - 0.36, 0.08, BODY[1] / 2 + 0.02)
    studio.assign(rocker, metal)
    record = _cylinder("Record button", 0.075, 0.06, (BODY[0] / 2 + 0.01, 0.06, 0.14), root, bevel=0.015)
    studio.assign(record, trim_material)

    # The screen swings out of the left side and is turned round to face the subject.
    hinge = shapes.link(bpy.data.objects.new("Screen hinge", None), root)
    hinge.location = (front + 0.08, -BODY[2] / 2 - 0.02, 0.02)
    hinge.rotation_euler = (0.0, 0.0, math.radians(-96.0))
    panel = shapes.slab("Screen panel", shapes.rounded_rect(SCREEN[0], SCREEN[1], 0.08), SCREEN[2], 0.03,
                        segments=4, parent=hinge)
    panel.location = (SCREEN[0] / 2 + 0.04, -SCREEN[2] / 2, 0.0)
    studio.assign(panel, shell_material)
    screen = shapes.slab("Screen", shapes.rounded_rect(SCREEN[0] - 0.12, SCREEN[1] - 0.1, 0.05), 0.01,
                         0.003, segments=2, parent=panel)
    screen.location = (0.0, -SCREEN[2] / 2 - 0.002, 0.0)
    studio.assign(screen, phone._screen_material())
    glow = studio.principled("Camcorder pixel glow", base_color=studio.linear("#FFFFFF"),
                             emission_color=studio.linear("#FFFFFF"), emission_strength=2.2)
    phone._pixel_heart("Screen heart", 0.032, panel, (0.03, -SCREEN[2] / 2 - 0.0095, -0.01), glow)
    rec = studio.principled("REC", base_color=studio.linear("#FF2E63"),
                            emission_color=studio.linear("#FF2E63"), emission_strength=3.0)
    dot = shapes.sphere("REC dot", 0.022, (-SCREEN[0] / 2 + 0.13, -SCREEN[2] / 2 - 0.01, SCREEN[1] / 2 - 0.11),
                        parent=panel, squash=0.4, segments=16)
    dot.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    studio.assign(dot, rec)

    _strap(body, [studio.vinyl("Wrist cord", color="#FFFFFF", roughness=0.4, coat=0.0),
                  studio.candy("Pony clear pink", color="#FF7AB8", density=2.5),
                  studio.vinyl("Pony milky blue", color="#A9D8FF", roughness=0.3),
                  studio.candy("Pony clear lilac", color="#B48CFF", density=2.5),
                  studio.vinyl("Pony milky butter", color="#FFE9A6", roughness=0.3),
                  studio.vinyl("Pony milky white", color="#FFFFFF", roughness=0.3)])
    return root
