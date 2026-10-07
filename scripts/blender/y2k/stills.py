"""Mock stills: each asset alone in the studio, posed three-quarter, on a transparent film.

    import stills; stills.render_all("<out dir>", size=(768, 768), samples=96)

Small and few on purpose (see the handoff): the GUI render is not seen by the machine check, so
anything heavier goes through the headless sprite script.
"""
from __future__ import annotations

import math
import os

import butterfly
import cd
import heart
import sparkle
import studio

# (builder, rotation in degrees XYZ, frame, studio options): a pose that shows the volume.
POSES = {
    "heart": (heart.build, (-6.0, 0.0, 24.0), 0, {}),
    "heart-jelly": (lambda: heart.build(studio.candy("Heart candy", color="#FF5FAE", density=4.0)),
                    (-6.0, 0.0, -20.0), 0, {}),
    "cd": (cd.build, (-28.0, 0.0, 32.0), 0, {"transparent_glass": True}),
    "butterfly": (butterfly.build, (-18.0, 0.0, -14.0), 30, {}),
    "sparkle": (sparkle.build, (8.0, 0.0, 18.0), 0, {}),
}


def render_one(name: str, out_dir: str, size=(768, 768), samples: int = 96) -> str:
    builder, rotation, frame, options = POSES[name]
    scene = studio.build_studio(size=size, samples=samples, **options)
    obj = builder()
    obj.rotation_euler = tuple(math.radians(a) for a in rotation)
    return studio.render_still(scene, os.path.join(out_dir, f"{name}.png"), frame=frame)


def render_all(out_dir: str, size=(768, 768), samples: int = 96, names=None) -> list[str]:
    os.makedirs(out_dir, exist_ok=True)
    return [render_one(name, out_dir, size, samples) for name in (names or POSES)]
