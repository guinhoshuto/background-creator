"""Iridescent butterfly: puffy pearl wings on a chrome body, like a Y2K butterfly clip.

The wings hinge on the body axis (world Z) and flap with drivers on the frame, so the flap loops
exactly: FLAPS whole beats in LOOP_FRAMES. Seen from the camera (-Y), a raised wing turns towards it.
"""
from __future__ import annotations

import math

import bpy
import numpy as np

import pillow
import studio

FLAPS = 6  # beats per loop: 480 / 6 = 80 frames each
REST = 18.0  # degrees, wings slightly raised at rest
SWING = 42.0  # degrees either side of REST

# Control polygons of the right wings (x > 0), smoothed by corner cutting; the hinge is x = 0.
FOREWING = [(0.05, 0.10), (0.20, 0.42), (0.42, 0.78), (0.72, 0.98), (0.98, 0.96), (1.10, 0.80),
            (1.06, 0.52), (0.88, 0.28), (0.60, 0.10), (0.30, 0.03)]
HINDWING = [(0.05, -0.02), (0.36, 0.0), (0.66, -0.10), (0.86, -0.32), (0.88, -0.60), (0.72, -0.86),
            (0.46, -0.92), (0.24, -0.76), (0.10, -0.46), (0.04, -0.20)]


def _wing(name: str, polygon, side: int, depth: float, material, behind: float) -> bpy.types.Object:
    points = pillow.resample(pillow.chaikin(np.array(polygon), 4), 320)
    points[:, 0] *= side
    centre = points.mean(axis=0)
    wing = pillow.inflate(name, points, depth=depth, rings=36, profile=2.6, centre=centre)
    studio.assign(wing, material)
    # Hindwings sit a hair behind the forewings, so they never cut through each other.
    for vertex in wing.data.vertices:
        vertex.co.y += behind
    return wing


def _flap(wing: bpy.types.Object, side: int) -> None:
    driver = wing.driver_add("rotation_euler", 2).driver
    driver.type = "SCRIPTED"
    sign = "-" if side > 0 else ""
    driver.expression = (f"{sign}radians({REST} + {SWING} * sin(2 * pi * frame * {FLAPS} / "
                         f"{studio.LOOP_FRAMES}))")


def build(wing_front=None, wing_back=None, body_material=None) -> bpy.types.Object:
    # Mostly metallic: on a plain dielectric the thin film only tints a 4% reflection.
    wing_front = wing_front or studio.pearl("Wing pearl", base="#FFE4F4", film=520.0, metallic=0.75,
                                            roughness=0.14)
    wing_back = wing_back or studio.pearl("Wing pearl lilac", base="#EBDDFF", film=600.0, metallic=0.75,
                                          roughness=0.14)
    body_material = body_material or studio.chrome("Body chrome", tint="#FFD3EC", roughness=0.06)

    root = bpy.data.objects.new("Butterfly", None)
    bpy.context.scene.collection.objects.link(root)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1.0)
    body = bpy.context.active_object
    body.name = "Butterfly body"
    body.scale = (0.1, 0.1, 0.5)
    body.location = (0.0, 0.0, -0.12)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.13, location=(0.0, 0.0, 0.46))
    head = bpy.context.active_object
    head.name = "Butterfly head"
    for part in (body, head):
        part.data.shade_smooth()
        studio.assign(part, body_material)
        part.parent = root

    for side in (1, -1):
        label = "right" if side > 0 else "left"
        fore = _wing(f"Forewing {label}", FOREWING, side, 0.055, wing_front, behind=0.0)
        hind = _wing(f"Hindwing {label}", HINDWING, side, 0.05, wing_back, behind=0.015)
        for wing in (fore, hind):
            wing.parent = root
            _flap(wing, side)

        curve = bpy.data.curves.new(f"Antenna {label}", "CURVE")
        curve.dimensions = "3D"
        curve.bevel_depth = 0.02
        curve.bevel_resolution = 4
        spline = curve.splines.new("BEZIER")
        spline.bezier_points.add(1)
        start, end = spline.bezier_points
        start.co = (0.03 * side, 0.0, 0.52)
        start.handle_left = (0.0, 0.0, 0.45)
        start.handle_right = (0.08 * side, 0.0, 0.72)
        end.co = (0.34 * side, -0.02, 0.98)
        end.handle_left = (0.2 * side, 0.0, 0.92)
        end.handle_right = (0.44 * side, -0.03, 1.02)
        antenna = bpy.data.objects.new(f"Antenna {label}", curve)
        bpy.context.scene.collection.objects.link(antenna)
        curve.materials.append(body_material)
        antenna.parent = root
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.06, location=end.co)
        tip = bpy.context.active_object
        tip.name = f"Antenna tip {label}"
        tip.data.shade_smooth()
        studio.assign(tip, body_material)
        tip.parent = root
    return root
