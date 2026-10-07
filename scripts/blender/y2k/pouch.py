"""Round denim coin pouch: mustard top-stitching, a zip along the top and charms on the pull.

Denim for the group's name (reference 18: twill, contrast stitching, rivet), the round pouch with a
bunch of charms from the debut bag version (the bunny charm stays out). The pouch is a puffed
disc (pillow.py); the stitches are dashes laid on its front face by ray casting. Units: 2 wide.
"""
from __future__ import annotations

import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

import heart
import pillow
import shapes
import studio

RADIUS = 1.0
DEPTH = 0.27
ZIP_ARC = (25.0, 155.0)  # degrees along the rim, measured from +X, counter-clockwise


def circle(count: int = 360) -> np.ndarray:
    t = np.linspace(0.0, 2 * math.pi, count, endpoint=False)
    return np.stack([RADIUS * np.cos(t), RADIUS * np.sin(t)], axis=1)


def stitches(target: bpy.types.Object, path, name: str, material, dash: float = 0.075, gap: float = 0.045,
             radius: float = 0.013, sink: float = 0.004) -> bpy.types.Object:
    """Dashes of thread laid on the target's front face (-Y) along a closed (x, z) path."""
    pts = pillow.resample(path, max(8, int(_length(path) / (dash + gap))))
    bm = bmesh.new()
    for i, (x, z) in enumerate(pts):
        hit, location, normal, _ = target.ray_cast(Vector((x, -5.0, z)), Vector((0.0, 1.0, 0.0)))
        if not hit:
            continue
        nx, nz = pts[(i + 1) % len(pts)]
        ahead, ahead_loc, _, _ = target.ray_cast(Vector((nx, -5.0, nz)), Vector((0.0, 1.0, 0.0)))
        if not ahead:
            continue
        direction = (ahead_loc - location).normalized()
        side = normal.cross(direction).normalized()
        frame = Matrix((direction, side, normal)).transposed().to_4x4()
        frame.translation = location + normal * (radius - sink)
        geom = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1.0)
        verts = geom["verts"]
        bmesh.ops.scale(bm, vec=(dash / 2, radius, radius), verts=verts)
        bmesh.ops.transform(bm, matrix=frame, verts=verts)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    # The dashes are in the target's own space, so they ride on it as its child.
    obj = shapes.link(bpy.data.objects.new(name, mesh), target)
    studio.assign(obj, material)
    return obj


def _length(path) -> float:
    pts = np.asarray(path)
    return float(np.linalg.norm(np.diff(np.vstack([pts, pts[:1]]), axis=0), axis=1).sum())


def _zip(root, metal, tape) -> Vector:
    """Teeth along the rim between the two ends of ZIP_ARC; returns where the pull hangs."""
    low, high = (math.radians(a) for a in ZIP_ARC)
    angles = np.linspace(low, high, 46)
    bm = bmesh.new()
    for i, angle in enumerate(angles):
        x, z = RADIUS * 1.01 * math.cos(angle), RADIUS * 1.01 * math.sin(angle)
        geom = bmesh.ops.create_cube(bm, size=1.0)
        verts = geom["verts"]
        bmesh.ops.scale(bm, vec=(0.035, 0.05, 0.045), verts=verts)
        offset = 0.022 if i % 2 else -0.022
        frame = Matrix.Rotation(-angle, 4, "Y")
        frame.translation = Vector((x, offset, z))
        bmesh.ops.transform(bm, matrix=frame, verts=verts)
    mesh = bpy.data.meshes.new("Zip teeth")
    bm.to_mesh(mesh)
    bm.free()
    teeth = shapes.link(bpy.data.objects.new("Zip teeth", mesh), root)
    bevel = teeth.modifiers.new("Soft", "BEVEL")
    bevel.width = 0.008
    bevel.segments = 2
    studio.assign(teeth, metal)
    # The cloth tape the teeth sit on, as a thin band round the rim.
    arc = np.stack([np.cos(angles) * RADIUS, np.zeros_like(angles), np.sin(angles) * RADIUS], axis=1)
    band = shapes.strip("Zip tape", arc, np.tile([[0.0, 1.0, 0.0]], (len(arc), 1)), np.full(len(arc), 0.14),
                        columns=3, thickness=0.02, parent=root, subdivide=0)
    studio.assign(band, tape)
    # Slider and pull tab at the right end.
    end = angles[0]
    slider = shapes.slab("Zip slider", shapes.rounded_rect(0.16, 0.1, 0.04), 0.13, 0.025, segments=3, parent=root)
    slider.location = (RADIUS * 1.03 * math.cos(end), -0.01, RADIUS * 1.03 * math.sin(end))
    slider.rotation_euler = (0.0, -(end + math.pi / 2), 0.0)
    studio.assign(slider, metal)
    tab = shapes.slab("Zip pull", shapes.rounded_rect(0.1, 0.26, 0.05), 0.03, 0.012, segments=3, parent=root)
    hang = Vector((RADIUS * 1.14 * math.cos(end) + 0.04, -0.06, RADIUS * 1.14 * math.sin(end) - 0.12))
    tab.location = hang
    tab.rotation_euler = (0.0, math.radians(-18.0), 0.0)
    studio.assign(tab, metal)
    return hang + Vector((0.03, 0.0, -0.14))


def _charms(root, start: Vector, materials) -> None:
    """A ring off the pull, a short chain of pony beads and a puffy star and heart."""
    bpy.ops.mesh.primitive_torus_add(major_radius=0.07, minor_radius=0.012, major_segments=32, minor_segments=8)
    ring = bpy.context.active_object
    ring.name = "Charm ring"
    ring.parent = root
    ring.location = start
    ring.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    bpy.ops.object.shade_smooth()
    studio.assign(ring, materials["metal"])
    path = np.array([start + Vector((0.0, 0.0, -0.06)), start + Vector((0.05, -0.02, -0.3)),
                     start + Vector((0.12, -0.04, -0.56))])
    studio.assign(shapes.cord("Charm cord", path, 0.01, parent=root), materials["cord"])
    for i, point in enumerate(shapes.path_points(path, 5)[1:-1]):
        bead = shapes.pony_bead(f"Charm bead {i}", 0.07, point, parent=root)
        bead.rotation_euler = (math.radians(80.0 + 30 * i), math.radians(20.0 * i), 0.0)
        studio.assign(bead, materials["beads"][i % len(materials["beads"])])
    star = pillow.inflate("Charm star", shapes.star_outline() * 0.2, depth=0.08, rings=24, centre=(0.0, 0.0))
    star.parent = root
    star.location = Vector(path[-1]) + Vector((0.02, -0.02, -0.18))
    star.rotation_euler = (0.0, math.radians(14.0), 0.0)
    studio.assign(star, materials["star"])
    small = pillow.inflate("Charm heart", heart.outline(240) * 0.13, depth=0.06, rings=24, centre=(0.0, 0.01))
    small.parent = root
    small.location = Vector(path[1]) + Vector((-0.17, -0.03, -0.12))
    small.rotation_euler = (0.0, math.radians(-20.0), 0.0)
    studio.assign(small, materials["heart"])


def build(wash: tuple[str, str] = ("#9DBEE8", "#3D5C9E")) -> bpy.types.Object:
    root = shapes.link(bpy.data.objects.new("Pouch", None))
    body = pillow.inflate("Pouch body", circle(), depth=DEPTH, rings=56, profile=2.6, centre=(0.0, 0.0))
    body.parent = root
    studio.assign(body, studio.denim("Pouch denim", light=wash[0], dark=wash[1], ribs=46.0))
    thread = studio.vinyl("Mustard thread", color="#E3A93B", roughness=0.55, coat=0.0)
    inset = circle(720) * (1.0 - 0.09 / RADIUS)
    stitches(body, inset, "Stitches", thread)
    stitches(body, circle(720) * (1.0 - 0.15 / RADIUS), "Stitches inner", thread)
    metal = studio.chrome("Pouch metal", tint="#FFF1D6", roughness=0.12)
    # A copper rivet low on the front, as on a jeans pocket.
    hit, location, normal, _ = body.ray_cast(Vector((0.42, -5.0, -0.52)), Vector((0.0, 1.0, 0.0)))
    if hit:
        rivet = shapes.sphere("Rivet", 0.055, location, parent=root, squash=0.45)
        rivet.rotation_euler = Vector((0.0, 0.0, 1.0)).rotation_difference(-normal).to_euler()
        studio.assign(rivet, studio.chrome("Copper", tint="#E8A56B", roughness=0.18))
    pull = _zip(root, metal, studio.vinyl("Zip tape", color="#2E3F6E", roughness=0.7, coat=0.0))
    _charms(root, pull, {
        "metal": metal,
        "cord": studio.vinyl("Charm cord", color="#FFFFFF", roughness=0.4, coat=0.0),
        "beads": [studio.candy("Charm bead pink", color="#FF7AB8", density=2.5),
                  studio.vinyl("Charm bead butter", color="#FFE9A6", roughness=0.3),
                  studio.candy("Charm bead blue", color="#7FC4FF", density=2.5)],
        "star": studio.vinyl("Charm star", color="#FFE08A", roughness=0.16),
        "heart": studio.candy("Charm heart", color="#FF5FA8", density=3.0),
    })
    return root
