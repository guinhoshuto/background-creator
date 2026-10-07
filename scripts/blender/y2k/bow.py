"""Satin ribbon bow: two puffed loops, a wrapped knot and two tails cut in a V.

Each loop is one closed band: it leaves the knot on the front, turns at the tip and comes back
behind, so its face looks at the camera and the opening shows in profile. The ribbon is gathered
at the knot (narrow, pleated) and fans out towards the tip. Units: the bow is about 2.4 wide.
"""
from __future__ import annotations

import math

import bpy
import numpy as np

import shapes
import studio

LOOP_LENGTH = 0.95
LOOP_OPEN = 0.3  # half the gap between the front and the back of a loop
LOOP_WIDTH = (0.16, 0.76)  # at the knot, at the tip
LOOP_RISE = math.radians(16.0)


def _loop(name: str, side: int, material, parent) -> bpy.types.Object:
    theta = np.linspace(0.0, 2 * math.pi, 160)
    x = 0.5 * LOOP_LENGTH * (1.0 - np.cos(theta))
    y = -LOOP_OPEN * np.sin(theta) * (0.6 + 0.4 * np.sin(theta / 2))
    tip = np.sin(theta / 2) ** 2  # 0 at the knot, 1 at the tip
    # Narrower again right at the fold, so the loop's corners come out round.
    widths = LOOP_WIDTH[0] + (LOOP_WIDTH[1] - LOOP_WIDTH[0]) * tip ** 0.55 * (1.0 - 0.22 * tip ** 8)
    # Rise: the loop leans up from the knot.
    z = np.tan(LOOP_RISE) * x
    centre = np.stack([side * x, y, z], axis=1)
    across = np.tile([[-side * math.sin(LOOP_RISE), 0.0, math.cos(LOOP_RISE)]], (len(theta), 1))

    def offsets(i: int, v: float) -> float:
        gather = (1.0 - tip[i]) ** 3
        pleats = 0.035 * gather * math.sin(3.0 * math.pi * v)
        cup = 0.05 * tip[i] * (v * v - 0.35)
        return pleats + cup

    loop = shapes.strip(name, centre, across, widths, columns=11, offsets=offsets, parent=parent)
    studio.assign(loop, material)
    return loop


def _tail(name: str, side: int, material, parent) -> bpy.types.Object:
    t = np.linspace(0.0, 1.0, 90)
    x = side * (0.06 + 0.42 * t + 0.06 * np.sin(math.pi * t))
    z = -0.06 - 1.15 * t
    y = -0.04 + 0.08 * np.sin(1.6 * math.pi * t)
    centre = np.stack([x, y, z], axis=1)
    twist = math.radians(28.0) * np.sin(math.pi * t) * side
    across = np.stack([np.cos(twist), np.sin(twist), np.zeros_like(t)], axis=1)
    widths = 0.42 + 0.06 * t

    def offsets(i: int, v: float) -> float:
        gather = (1.0 - t[i]) ** 6
        return 0.03 * gather * math.sin(3.0 * math.pi * v) + 0.025 * (v * v - 0.35)

    tail = shapes.strip(name, centre, across, widths, columns=9, offsets=offsets, notch=0.16, parent=parent)
    studio.assign(tail, material)
    return tail


def _knot(material, parent) -> bpy.types.Object:
    """A short band wrapped round the gathered middle (around the X axis)."""
    phi = np.linspace(0.0, 2 * math.pi, 64)
    centre = np.stack([np.zeros_like(phi), -0.17 * np.cos(phi), 0.2 * np.sin(phi) + 0.01], axis=1)
    across = np.tile([[1.0, 0.0, 0.0]], (len(phi), 1))
    widths = np.full_like(phi, 0.32)

    def offsets(i: int, v: float) -> float:
        return 0.03 * (1.0 - v * v)

    knot = shapes.strip("Bow knot", centre, across, widths, columns=9, offsets=offsets, parent=parent)
    studio.assign(knot, material)
    return knot


def build(color: str = "#FF9CCB") -> bpy.types.Object:
    material = studio.satin("Bow satin", color=color)
    root = shapes.link(bpy.data.objects.new("Bow", None))
    for side in (-1, 1):
        _loop(f"Bow loop {side}", side, material, root)
        _tail(f"Bow tail {side}", side, material, root)
    _knot(material, root)
    return root
