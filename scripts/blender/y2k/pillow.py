"""Inflate a closed 2D outline into a puffy, watertight mesh: the balloon heart, the sparkle, wings.

The height is a membrane under pressure (Poisson's equation, solved on the outline's own polar
mesh with cotangent weights), so the surface has no crease along the medial axis, which chrome
would show at once. A circular remap then makes the side vertical at the seam, as on a foil
balloon, and an optional ruffle runs along the seam. The front and back sheets share the seam
vertices, so the mesh is closed.

Outlines are (x, y) in the picture plane; the mesh faces the camera (-Y), x to the right, y up.
"""
from __future__ import annotations

import math

import bmesh
import bpy
import numpy as np


def resample(points, count: int) -> np.ndarray:
    """A closed polyline as `count` points evenly spaced along its length."""
    pts = np.asarray(points, dtype=float)
    closed = np.vstack([pts, pts[:1]])
    lengths = np.linalg.norm(np.diff(closed, axis=0), axis=1)
    along = np.concatenate([[0.0], np.cumsum(lengths)])
    targets = np.linspace(0.0, along[-1], count, endpoint=False)
    return np.stack([np.interp(targets, along, closed[:, 0]), np.interp(targets, along, closed[:, 1])], axis=1)


def chaikin(points, iterations: int) -> np.ndarray:
    """Corner cutting: rounds tips and notches a little at each pass."""
    pts = np.asarray(points, dtype=float)
    for _ in range(iterations):
        following = np.roll(pts, -1, axis=0)
        cut = np.empty((2 * len(pts), 2))
        cut[0::2] = 0.75 * pts + 0.25 * following
        cut[1::2] = 0.25 * pts + 0.75 * following
        pts = cut
    return pts


def signed_area(points) -> float:
    x, y = points[:, 0], points[:, 1]
    return 0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y))


def counter_clockwise(points) -> np.ndarray:
    pts = np.asarray(points, dtype=float)
    return pts if signed_area(pts) > 0 else pts[::-1].copy()


def fit(points, width: float | None = None, height: float | None = None) -> np.ndarray:
    """Centre the outline's box on the origin and scale it to the given width or height."""
    pts = np.asarray(points, dtype=float)
    low, high = pts.min(axis=0), pts.max(axis=0)
    pts = pts - (low + high) / 2
    size = high - low
    scale = width / size[0] if width is not None else height / size[1]
    return pts * scale


def _star_shaped(outline: np.ndarray, centre: np.ndarray) -> bool:
    """Every ray from the centre must cross the outline once, or the polar mesh folds."""
    angles = np.unwrap(np.arctan2(outline[:, 1] - centre[1], outline[:, 0] - centre[0]))
    steps = np.diff(np.append(angles, angles[0] + 2 * math.pi))
    return bool(np.all(steps > 0))


def _polar_mesh(outline: np.ndarray, centre: np.ndarray, rings: int):
    n = len(outline)
    # Rings tighten towards the seam, where the side turns vertical.
    k = np.arange(1, rings + 1) / rings
    spread = 1.0 - (1.0 - k) ** 1.6
    verts = np.vstack([centre[None, :]] + [centre + s * (outline - centre) for s in spread])

    def ring(r: int, i):
        return 1 + (r - 1) * n + (np.asarray(i) % n)

    i = np.arange(n)
    fan = np.stack([np.zeros(n, dtype=int), ring(1, i), ring(1, i + 1)], axis=1)
    quads = []
    for r in range(1, rings):
        quads.append(np.stack([ring(r, i), ring(r + 1, i), ring(r + 1, i + 1), ring(r, i + 1)], axis=1))
    quads = np.vstack(quads)
    return verts, fan, quads, spread


def _membrane(verts: np.ndarray, triangles: np.ndarray, boundary: np.ndarray) -> np.ndarray:
    """Solve L h = M 1 with h = 0 on the seam (cotangent Laplacian, conjugate gradients)."""
    count = len(verts)
    a, b, c = triangles[:, 0], triangles[:, 1], triangles[:, 2]

    def cot(p, q, corner):
        u = verts[p] - verts[corner]
        v = verts[q] - verts[corner]
        return (u * v).sum(axis=1) / np.abs(u[:, 0] * v[:, 1] - u[:, 1] * v[:, 0])

    rows = np.concatenate([a, b, c])
    cols = np.concatenate([b, c, a])
    weights = 0.5 * np.concatenate([cot(a, b, c), cot(b, c, a), cot(c, a, b)])
    e1 = verts[b] - verts[a]
    e2 = verts[c] - verts[a]
    areas = 0.5 * np.abs(e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0])
    mass = np.bincount(np.concatenate([a, b, c]), np.tile(areas / 3, 3), count)

    fixed = np.zeros(count, dtype=bool)
    fixed[boundary] = True

    def apply(x):
        d = weights * (x[rows] - x[cols])
        y = np.bincount(rows, d, count) - np.bincount(cols, d, count)
        y[fixed] = 0.0
        return y

    rhs = np.where(fixed, 0.0, mass)
    x = np.zeros(count)
    r = rhs.copy()
    p = r.copy()
    rs = r @ r
    limit = 1e-10 * (rhs @ rhs)
    for _ in range(4 * count):
        ap = apply(p)
        alpha = rs / (p @ ap)
        x += alpha * p
        r -= alpha * ap
        rs_next = r @ r
        if rs_next < limit:
            break
        p = r + (rs_next / rs) * p
        rs = rs_next
    return x


def inflate(name: str, outline, depth: float, rings: int = 48, profile: float = 2.0,
            centre=None, ruffle: float = 0.0, ruffle_waves: int = 0, ruffle_band: float = 0.12,
            ruffle_seed: float = 0.0) -> bpy.types.Object:
    """A closed puffy mesh from a counter-clockwise outline.

    depth: half thickness at the highest point. profile: 2 is a quarter circle from the seam to the
    top; higher is boxier. ruffle: height of the waves along the seam (0: a clean seam), fading
    inwards over ruffle_band (a share of the ring spread).
    """
    outline = counter_clockwise(outline)
    centre = np.asarray(centre if centre is not None else outline.mean(axis=0), dtype=float)
    if not _star_shaped(outline, centre):
        raise ValueError(f"{name}: the outline is not star-shaped from {centre.tolist()}; pass another centre")
    n = len(outline)
    verts, fan, quads, spread = _polar_mesh(outline, centre, rings)
    triangles = np.vstack([fan, quads[:, [0, 1, 2]], quads[:, [0, 2, 3]]])
    boundary = np.arange(1 + (rings - 1) * n, 1 + rings * n)

    h = _membrane(verts, triangles, boundary)
    u = np.clip(h / h.max(), 0.0, 1.0)
    height = depth * (1.0 - (1.0 - u) ** profile) ** (1.0 / profile)

    # The ruffle moves both sheets together, so the seam itself waves.
    lift = np.zeros(len(verts))
    if ruffle > 0 and ruffle_waves > 0:
        ring_of = np.concatenate([[0], np.repeat(np.arange(1, rings + 1), n)])
        index_of = np.concatenate([[0], np.tile(np.arange(n), rings)])
        s = np.concatenate([[0.0], spread])[ring_of]
        band = np.clip((s - (1.0 - ruffle_band)) / ruffle_band, 0.0, 1.0) ** 2
        phase = 2 * math.pi * index_of / n
        swell = 0.65 + 0.35 * np.sin(7 * phase + ruffle_seed)
        lift = ruffle * band * swell * np.sin(ruffle_waves * phase + 0.5 * np.sin(3 * phase + ruffle_seed))

    interior = np.ones(len(verts), dtype=bool)
    interior[boundary] = False
    back_index = np.full(len(verts), -1)
    back_index[interior] = len(verts) + np.arange(int(interior.sum()))
    back_index[boundary] = boundary

    front = np.stack([verts[:, 0], -(height + lift), verts[:, 1]], axis=1)
    back = np.stack([verts[interior, 0], height[interior] - lift[interior], verts[interior, 1]], axis=1)
    coords = np.vstack([front, back])

    faces = [tuple(f) for f in fan] + [tuple(q) for q in quads]
    faces += [tuple(back_index[f][::-1]) for f in fan] + [tuple(back_index[q][::-1]) for q in quads]

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(coords.tolist(), [], faces)
    mesh.validate()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    seam = set(int(v) for v in boundary)
    sharp = mesh.attributes.new("sharp_edge", "BOOLEAN", "EDGE")
    for edge in mesh.edges:
        sharp.data[edge.index].value = edge.vertices[0] in seam and edge.vertices[1] in seam
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj
