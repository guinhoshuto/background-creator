"""Mock stills: each asset alone in the studio, posed three-quarter, on a transparent film.

    import stills; stills.render_all("<out dir>", size=(768, 768), samples=96)

Small and few on purpose (see the handoff): the GUI render is not seen by the machine check, so
anything heavier goes through the headless sprite script.
"""
from __future__ import annotations

import math
import os

import bow
import bubbles
import butterfly
import camcorder
import cassette
import cd
import heart
import phone
import pixel
import pouch
import sparkle
import studio

# name: (builder, rotation in degrees XYZ, location, frame, studio options)
POSES = {
    # Round 1 (2026-10-07, all turned down by the owner; kept until he answers round 2).
    "heart": (heart.build, (-6.0, 0.0, 24.0), (0, 0, 0), 0, {}),
    "heart-jelly": (lambda: heart.build(studio.candy("Heart candy", color="#FF5FAE", density=4.0)),
                    (-6.0, 0.0, -20.0), (0, 0, 0), 0, {}),
    "cd": (cd.build, (-28.0, 0.0, 32.0), (0, 0, 0), 0, {"transparent_glass": True}),
    "butterfly": (butterfly.build, (-18.0, 0.0, -14.0), (0, 0, 0), 30, {}),
    "sparkle": (sparkle.build, (8.0, 0.0, 18.0), (0, 0, 0), 0, {}),
    # Round 2: the NewJeans elements, in daylight.
    "camcorder": (camcorder.build, (-8.0, 0.0, 38.0), (0.1, 0.0, 0.2), 0, {"light": "daylight", "distance": 9.0}),
    "pouch": (pouch.build, (-12.0, 0.0, -32.0), (-0.1, 0.0, 0.25), 0, {"light": "daylight", "distance": 9.0}),
    "cassette": (cassette.build, (-14.0, 0.0, 26.0), (0, 0, 0), 0, {"light": "daylight", "distance": 8.5}),
    "gum": (bubbles.build_gum, (0.0, 0.0, 0.0), (0, 0, 0), 0, {"light": "daylight", "distance": 8.0}),
    "soap": (bubbles.build_soap, (0.0, 0.0, 0.0), (0, 0, 0), 0,
             {"light": "daylight", "distance": 8.0, "transparent_glass": True}),
    "cursor": (pixel.build_cursor, (-10.0, 0.0, 28.0), (0, 0, 0), 0, {"light": "daylight", "distance": 8.5}),
    "pixel-sparkle": (pixel.build_sparkle, (-8.0, 0.0, -22.0), (0, 0, 0), 0, {"light": "daylight", "distance": 6.0}),
    # Generic Y2K, no NewJeans source: shown apart.
    "phone": (phone.build, (-8.0, 0.0, 22.0), (0.3, 0.0, 0.85), 0, {"light": "daylight", "distance": 12.5}),
    "bow": (bow.build, (-6.0, 0.0, 16.0), (0.0, 0.0, 0.3), 0, {"light": "daylight"}),
}


def render_one(name: str, out_dir: str, size=(768, 768), samples: int = 96) -> str:
    builder, rotation, location, frame, options = POSES[name]
    options = dict(options)
    scene = studio.build_studio(size=size, samples=samples, distance=options.pop("distance", 7.0), **options)
    obj = builder()
    obj.rotation_euler = tuple(math.radians(a) for a in rotation)
    obj.location = location
    return studio.render_still(scene, os.path.join(out_dir, f"{name}.png"), frame=frame)


def render_all(out_dir: str, size=(768, 768), samples: int = 96, names=None) -> list[str]:
    os.makedirs(out_dir, exist_ok=True)
    return [render_one(name, out_dir, size, samples) for name in (names or POSES)]
