"""Sprite frames for the Y2K background: one asset of sprites.json, rendered headless to WEBP RGBA.

    <blender> --factory-startup -b --python-exit-code 1 --python scripts/blender/y2k/sprites.py -- \\
        --asset heart --out <dir> [--frames 0:4] [--size 128] [--samples 8]

`npm run blender:sprites -- y2k` (scripts/blender-sprites.ts) runs it, one Blender process per asset
inside the render slot, and checks every frame it writes. --frames, --size and --samples override
the registry for smoke tests only.

The pose and the motion become a driver on the frame with a simple expression, which Blender
evaluates without Python (a factory-startup Blender runs no Python drivers), linear in time, so
frame 480 equals frame 0 and the scene plays the same loop if it is opened in the GUI. Each frame is
checked against the registry before it renders: a driver that did not evaluate stops the run instead
of rendering a still sprite.
"""
from __future__ import annotations

import argparse
import importlib
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy  # noqa: E402

import studio  # noqa: E402

AXES = "XYZ"
# The runner shows the lines that start with this prefix and reads the result line
# (scripts/blender-sprites-plan.ts, PROGRESS_PREFIX and RESULT_PREFIX).
PREFIX = "sprites:"
WEBP_QUALITY = 90


def say(message: str) -> None:
    print(f"{PREFIX} {message}", flush=True)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="sprites.py", description="Render one asset of sprites.json.")
    parser.add_argument("--asset", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--frames", help="start:end, end not included (smoke tests only)")
    parser.add_argument("--size", type=int, help="square side in px (smoke tests only)")
    parser.add_argument("--samples", type=int, help="Cycles samples (smoke tests only)")
    return parser.parse_args(argv[argv.index("--") + 1:] if "--" in argv else [])


def load_entry(name: str) -> tuple[dict, dict]:
    with open(os.path.join(HERE, "sprites.json"), encoding="utf-8") as handle:
        registry = json.load(handle)
    if registry["loopFrames"] != studio.LOOP_FRAMES:
        raise RuntimeError(f"sprites.json loops {registry['loopFrames']} frames and studio.LOOP_FRAMES "
                           f"{studio.LOOP_FRAMES}: make them match.")
    if name not in registry["assets"]:
        raise RuntimeError(f"No asset {name!r} in sprites.json; it has {', '.join(sorted(registry['assets']))}.")
    return registry, registry["assets"][name]


def frame_range(text: str | None, period: int) -> range:
    if text is None:
        return range(0, period)
    start, end = (int(part) for part in text.split(":"))
    if not 0 <= start < end <= period:
        raise RuntimeError(f"--frames {text}: pick 0 <= start < end <= {period}, the period.")
    return range(start, end)


def rotation_at(entry: dict, frame: float, loop_frames: int) -> list[float]:
    """The root's rotation at `frame` (radians, XYZ Euler): the pose plus the motion."""
    rotation = [math.radians(angle) for angle in entry["pose"]]
    motion = entry["motion"]
    if motion["kind"] == "sway":
        rotation[AXES.index(motion["axis"])] += math.radians(motion["degrees"]) * math.sin(
            2 * math.pi * motion["cycles"] * frame / loop_frames)
    elif motion["kind"] == "spin":
        rotation[AXES.index(motion["axis"])] += 2 * math.pi * motion["turns"] * frame / loop_frames
    return rotation


def drive(root: bpy.types.Object, entry: dict, loop_frames: int) -> None:
    """Pose the root and drive its motion axis from the frame: sway or whole turns, no easing."""
    root.rotation_mode = "XYZ"
    root.rotation_euler = [math.radians(angle) for angle in entry["pose"]]
    motion = entry["motion"]
    if motion["kind"] == "none":
        return  # the module animates itself with drivers on the frame
    axis = AXES.index(motion["axis"])
    base = f"{math.radians(entry['pose'][axis]):.12f}"
    if motion["kind"] == "sway":
        amplitude = f"{math.radians(motion['degrees']):.12f}"
        expression = f"{base} + {amplitude} * sin(2 * pi * {motion['cycles']} * frame / {loop_frames})"
    else:
        expression = f"{base} + 2 * pi * {motion['turns']} * frame / {loop_frames}"
    driver = root.driver_add("rotation_euler", axis).driver
    driver.type = "SCRIPTED"
    driver.expression = expression
    if not driver.is_simple_expression:
        raise RuntimeError(f"The motion driver {expression!r} is not a simple expression: a factory-startup "
                           "Blender would not run it.")


def check_rotation(root: bpy.types.Object, entry: dict, frame: int, loop_frames: int, name: str) -> None:
    if entry["motion"]["kind"] == "none":
        return
    evaluated = root.evaluated_get(bpy.context.evaluated_depsgraph_get())
    got = list(evaluated.rotation_euler)
    want = rotation_at(entry, frame, loop_frames)
    if any(abs(a - b) > 1e-4 for a, b in zip(got, want)):
        def degrees(values: list[float]) -> str:
            return ", ".join(f"{math.degrees(value):.3f}" for value in values)
        raise RuntimeError(f"{name}: frame {frame} is posed at ({degrees(got)}) degrees and the registry wants "
                           f"({degrees(want)}): the motion driver did not evaluate.")


def use_webp(scene: bpy.types.Scene) -> None:
    """WEBP with alpha at quality 90, enum ids read from bl_rna before they are assigned."""
    settings = scene.render.image_settings
    formats = [item.identifier for item in settings.bl_rna.properties["file_format"].enum_items]
    if "WEBP" not in formats:
        raise RuntimeError(f"Blender {bpy.app.version_string} writes no WEBP ({', '.join(formats)}): "
                           "point BLENDER_BIN at Blender 5.2.")
    settings.file_format = "WEBP"
    modes = [item.identifier for item in settings.bl_rna.properties["color_mode"].enum_items]
    if "RGBA" not in modes:
        raise RuntimeError(f"WEBP offers no RGBA here ({', '.join(modes)}).")
    settings.color_mode = "RGBA"
    settings.quality = WEBP_QUALITY
    scene.render.use_file_extension = True


def main() -> None:
    args = parse_args(sys.argv)
    registry, entry = load_entry(args.asset)
    loop_frames = registry["loopFrames"]
    frames = frame_range(args.frames, entry["period"])
    size = entry["size"] if args.size is None else args.size
    samples = entry["samples"] if args.samples is None else args.samples
    os.makedirs(args.out, exist_ok=True)
    scene = studio.build_studio(size=(size, size), samples=samples, transparent_glass=entry["transparentGlass"])
    use_webp(scene)
    root = importlib.import_module(entry["module"]).build()
    drive(root, entry, loop_frames)
    say(f"{args.asset}: frames {frames.start}:{frames.stop} of {entry['period']}, {size} px, {samples} samples, "
        f"motion {entry['motion']['kind']}, Blender {bpy.app.version_string}, device {scene.cycles.device}")
    seconds = []
    for index, frame in enumerate(frames):
        started = time.monotonic()
        scene.frame_set(frame)
        check_rotation(root, entry, frame, loop_frames, args.asset)
        path = os.path.join(args.out, f"{frame:04d}.webp")
        studio.render_still(scene, path, frame=frame)
        if not os.path.isfile(path):
            raise RuntimeError(f"Blender wrote no {path}.")
        seconds.append(round(time.monotonic() - started, 3))
        say(f"{args.asset} frame {frame} ({index + 1}/{len(frames)}) {seconds[-1]:.1f} s")
    print(f"{PREFIX} result " + json.dumps({
        "asset": args.asset, "blender": bpy.app.version_string, "device": scene.cycles.device,
        "frames": [frames.start, frames.stop], "seconds": seconds,
    }), flush=True)


if __name__ == "__main__":
    main()
