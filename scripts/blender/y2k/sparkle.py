"""Chrome four-point sparkle, the Y2K star: concave sides, inflated like the heart.

It has four-fold symmetry in the picture plane, so a quarter turn there (LOOP_FRAMES / 4 frames)
already closes a loop.
"""
from __future__ import annotations

import math

import bpy
import numpy as np

import pillow
import studio


def outline(count: int = 480, pinch: float = 0.6) -> np.ndarray:
    """|x|^p + |y|^p = 1: p below 1 gives the concave sides; lower is sharper."""
    t = np.linspace(0.0, 2 * math.pi, 4000, endpoint=False)
    exponent = 2.0 / pinch
    x = np.sign(np.cos(t)) * np.abs(np.cos(t)) ** exponent
    y = np.sign(np.sin(t)) * np.abs(np.sin(t)) ** exponent
    return pillow.fit(pillow.resample(np.stack([x, y], axis=1), count), width=2.0)


def build(material: bpy.types.Material | None = None) -> bpy.types.Object:
    star = pillow.inflate("Sparkle", outline(), depth=0.2, rings=48, profile=1.6, centre=(0.0, 0.0))
    studio.assign(star, material or studio.chrome("Sparkle chrome", tint="#FFFFFF", roughness=0.04))
    return star
