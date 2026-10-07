"""Inflated chrome heart: the foil balloon of the references (01), in rose chrome."""
from __future__ import annotations

import math

import bpy
import numpy as np

import pillow
import studio


def outline(count: int = 480) -> np.ndarray:
    """The classic heart curve, its tip and cleft softened a little, 2 units wide."""
    t = np.linspace(0.0, 2 * math.pi, 2400, endpoint=False)
    x = 16 * np.sin(t) ** 3
    y = 13 * np.cos(t) - 5 * np.cos(2 * t) - 2 * np.cos(3 * t) - np.cos(4 * t)
    points = pillow.resample(np.stack([x, y], axis=1), 240)
    points = pillow.chaikin(points, 2)
    return pillow.fit(pillow.resample(points, count), width=2.0)


def build(material: bpy.types.Material | None = None) -> bpy.types.Object:
    heart = pillow.inflate("Heart", outline(), depth=0.36, rings=56, centre=(0.0, 0.05),
                           ruffle=0.004, ruffle_waves=120, ruffle_band=0.06, ruffle_seed=1.7)
    studio.assign(heart, material or studio.chrome("Heart chrome", tint="#FFC9E6", roughness=0.07))
    return heart
