"""Shapes shared by the Y2K assets: rounded slabs (device shells, keys), cords and beads.

Outlines are (x, z) in the picture plane, as in pillow.py; depth runs along Y and the camera looks
from -Y. Everything is plain geometry plus modifiers, so a module can be run again and again.
"""
from __future__ import annotations

import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector


def rounded_rect(width: float, height: float, radius: float, per_corner: int = 12) -> np.ndarray:
    """A counter-clockwise rounded rectangle centred on the origin."""
    r = min(radius, width / 2, height / 2)
    cx, cz = width / 2 - r, height / 2 - r
    points = []
    for qx, qz, start in ((cx, cz, 0.0), (-cx, cz, 90.0), (-cx, -cz, 180.0), (cx, -cz, 270.0)):
        for i in range(per_corner + 1):
            angle = math.radians(start + 90.0 * i / per_corner)
            points.append((qx + r * math.cos(angle), qz + r * math.sin(angle)))
    return np.array(points)


def link(obj: bpy.types.Object, parent: bpy.types.Object | None = None) -> bpy.types.Object:
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def slab(name: str, outline, thickness: float, edge_radius: float, segments: int = 6,
         parent: bpy.types.Object | None = None) -> bpy.types.Object:
    """The outline extruded along Y, its two rims rounded by a bevel modifier that hardens the
    normals: the flat faces stay flat under glossy light while the sides stay smooth."""
    outline = np.asarray(outline, dtype=float)
    n = len(outline)
    front = [(x, -thickness / 2, z) for x, z in outline]
    back = [(x, thickness / 2, z) for x, z in outline]
    faces = [tuple(range(n))[::-1], tuple(range(n, 2 * n))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(front + back, [], faces)
    mesh.validate()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = link(bpy.data.objects.new(name, mesh), parent)
    bevel = obj.modifiers.new("Rounded rims", "BEVEL")
    bevel.width = edge_radius
    bevel.segments = segments
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(50.0)
    bevel.harden_normals = True
    return obj


def cord(name: str, points, radius: float, parent: bpy.types.Object | None = None,
         resolution: int = 4) -> bpy.types.Object:
    """A round tube through the points (a smooth NURBS path), capped at both ends."""
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = resolution
    curve.use_fill_caps = True
    spline = curve.splines.new("NURBS")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (co[0], co[1], co[2], 1.0)
    spline.order_u = min(4, len(points))
    spline.use_endpoint_u = True
    spline.resolution_u = 12
    return link(bpy.data.objects.new(name, curve), parent)


def path_points(points, count: int) -> np.ndarray:
    """count points evenly spaced along an open polyline (for beads on a cord)."""
    pts = np.asarray(points, dtype=float)
    lengths = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    along = np.concatenate([[0.0], np.cumsum(lengths)])
    targets = np.linspace(0.0, along[-1], count)
    return np.stack([np.interp(targets, along, pts[:, i]) for i in range(3)], axis=1)


def sphere(name: str, radius: float, location, parent: bpy.types.Object | None = None,
           squash: float = 1.0, segments: int = 32) -> bpy.types.Object:
    """A smooth sphere (a round bead, a pearl); squash < 1 flattens it along its own Z."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=segments // 2, radius=radius)
    for vertex in bm.verts:
        vertex.co.z *= squash
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = link(bpy.data.objects.new(name, mesh), parent)
    obj.location = Vector(location)
    return obj


def star_outline(points: int = 5, inner: float = 0.5, count: int = 400, round_passes: int = 3) -> np.ndarray:
    """A puffy star outline, 2 units wide: a star polygon with its tips and notches rounded."""
    polygon = []
    for i in range(2 * points):
        radius = 1.0 if i % 2 == 0 else inner
        angle = math.pi / 2 + math.pi * i / points
        polygon.append((radius * math.cos(angle), radius * math.sin(angle)))
    from pillow import chaikin, fit, resample
    smooth = chaikin(resample(np.array(polygon), 10 * points * 2), round_passes)
    return fit(resample(smooth, count), width=2.0)


def strip(name: str, centre, across, widths, columns: int = 9, offsets=None, thickness: float = 0.014,
          parent: bpy.types.Object | None = None, notch: float = 0.0, subdivide: int = 1) -> bpy.types.Object:
    """A ribbon: centre (N, 3) is its middle line, across (N, 3) unit vectors along its width and
    widths (N,) the width at each row. offsets(i, v) -> displacement along the ribbon's normal for
    row i and v in [-1, 1] across (pleats, a cupped section). notch cuts a V into the last row.
    The UV's U runs along the ribbon, the grain of the satin, and V across."""
    centre = np.asarray(centre, dtype=float)
    across = np.asarray(across, dtype=float)
    across /= np.linalg.norm(across, axis=1, keepdims=True)
    widths = np.asarray(widths, dtype=float)
    n = len(centre)
    tangent = np.gradient(centre, axis=0)
    tangent /= np.linalg.norm(tangent, axis=1, keepdims=True)
    normal = np.cross(tangent, across)
    normal /= np.linalg.norm(normal, axis=1, keepdims=True)
    v = np.linspace(-1.0, 1.0, columns)
    along = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(centre, axis=0), axis=1))])
    verts = []
    for i in range(n):
        for j, vj in enumerate(v):
            p = centre[i] + across[i] * widths[i] * 0.5 * vj
            if offsets is not None:
                p = p + normal[i] * offsets(i, vj)
            if notch and i == n - 1:
                p = p - tangent[i] * notch * (1.0 - abs(vj))
            verts.append(tuple(p))
    faces = [(i * columns + j, (i + 1) * columns + j, (i + 1) * columns + j + 1, i * columns + j + 1)
             for i in range(n - 1) for j in range(columns - 1)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    uv = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        for loop_index in polygon.loop_indices:
            index = mesh.loops[loop_index].vertex_index
            uv.data[loop_index].uv = (along[index // columns] / along[-1], (index % columns) / (columns - 1))
    obj = link(bpy.data.objects.new(name, mesh), parent)
    solidify = obj.modifiers.new("Thickness", "SOLIDIFY")
    solidify.thickness = thickness
    solidify.offset = 0.0
    if subdivide:
        smooth = obj.modifiers.new("Smooth", "SUBSURF")
        smooth.levels = subdivide
        smooth.render_levels = subdivide
    return obj


def pony_bead(name: str, radius: float, location, parent: bpy.types.Object | None = None) -> bpy.types.Object:
    """A pony bead: a squat barrel with a wide hole, as a torus stretched along its axis (local Z).
    radius is the outer radius; the hole is about 0.4 of it and the length about 1.4 of it."""
    hole = 0.42 * radius
    bpy.ops.mesh.primitive_torus_add(major_radius=(radius + hole) / 2, minor_radius=(radius - hole) / 2,
                                     major_segments=32, minor_segments=16)
    bead = bpy.context.active_object
    bead.name = name
    bead.data.name = name
    for vertex in bead.data.vertices:
        vertex.co.z *= 2.4
    bpy.ops.object.shade_smooth()
    if bead.users_collection and bead.users_collection[0] != bpy.context.scene.collection:
        for collection in list(bead.users_collection):
            collection.objects.unlink(bead)
        bpy.context.scene.collection.objects.link(bead)
    bead.parent = parent
    bead.location = Vector(location)
    return bead
