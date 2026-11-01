"""Wildfire smoke: a looping, procedural volume rendered by Blender 5.2 (EEVEE) as a frame sequence.

The background `wildfire-smoke` (direction D-06, picked by the owner on 2026-11-01) is two slabs of volume seen by an
orthographic camera: a thin ember haze behind, fading upward into a near-black red sky, and a dense wall of smoke in
front, lit from below by the fire (out of shot) and from behind by a wide red area light between the two slabs.
WildfireSmokeLoop.tsx shows the frames; nothing is drawn in code beyond that.

Run (through the render slot, with the Sandisk connected):
  npm run build:wildfire                       480 frames, 1920x1080, to public/wildfire-smoke/
  npm run preview:wildfire                     9 frames at 25% (0, 60, ..., 420 and 480) plus the loop check
Direct: Blender --background --factory-startup --python scripts/create-wildfire-smoke.py -- --output-dir <dir>
        [--frames A-B] [--samples N] [--percent N] [--preview] [--manifest-only]

Loop: the vertical axis of every noise is bent onto a circle in the two spare dimensions of a 4D noise, so rising one
slab height per cycle is one turn of the circle and frame 480 equals frame 0 (README, Known pitfalls: slide on a
periodic axis, one period per cycle). The lights flicker by sums of sines with whole numbers of turns per cycle. Every
animated value is a function of the frame: no random, no clock, no drivers (the frame loop sets the values itself).

Calibration (2026-11-01, docs/themes/wildfire-smoke.md): lights at 1/6 of the first try, then 0.35 of that rig for the
two-slab mix; a 1080p frame costs ~8 s with 16 TAA samples and 4 px volume tiles, visually equal (max 3/255) to 2 px
tiles at 44 s. The 25% preview is for motion and the loop seam, never for sharpness: its froxels are 4x coarser.
"""
import argparse
import hashlib
import json
import math
import os
import sys
import time

import bmesh
import bpy
from mathutils import Matrix

NAME = 'wildfire-smoke'
VERSION = 1
DIRECTION = 'D-06'
WIDTH, HEIGHT, FPS, LOOP_FRAMES = 1920, 1080, 60, 480
SAMPLES = 16                 # TAA samples per frame
VOLUME_STEPS = 128           # froxel slices between VOLUME_START and VOLUME_END
SHADOW_STEPS = 16
TILE_SIZE = '4'              # froxel width in px at render resolution; '2' costs 6x for a max 3/255 difference
VOLUME_START, VOLUME_END = 12.0, 30.0
WEBP_QUALITY = 95
FRONT_SLAB = (18.0, 6.0, 10.5)   # width, depth, height; the orthographic frame is 16 x 9
BACK_SLAB = (18.0, 5.0, 10.5)
BACK_OFFSET = (0.0, 6.0, 0.0)
RISE_L = 10.5                    # height units per cycle along the circle: >= slab height, no repeat on screen
TWO_PI = 2.0 * math.pi
PREVIEW_FRAMES = (0, 60, 120, 180, 240, 300, 360, 420, 480)

LIGHTS = dict(
    floor_power=3150, floor_color='#ff2a08',
    fire_power=(1155, 1575, 1050), fire_colors=('#ff3008', '#ff6a12', '#ff2206'),
    fill_power=150, fill_color='#5a0803',
    rim_power=2800, rim_y=3.2,
    world='#260401', look='AgX - Medium High Contrast', exposure=-0.8,
)
# (turns per cycle, amplitude, phase): the fire breathes with three incommensurate but whole-numbered rhythms
FLICKER = ((7, 0.07, 0.0), (11, 0.04, 1.3), (17, 0.02, 2.6))
BACK = dict(density=0.75, lo=0.38, hi=0.78, gamma=1.2, pv=1.6, detailA=8.0, emis=0.5,
            albedo='#8a6a62', absorb='#e0c4bc', anis=0.2, yshift=23.0)
FRONT = dict(density=2.8, lo=0.47, hi=0.71, gamma=2.2, pv=1.3, detailA=8.0, emis=4.0,
             albedo='#6a5550', absorb='#d0a89e', anis=0.5, yshift=0.0)


def srgb_to_linear(c):
    return tuple((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def hex_lin(h):
    h = h.lstrip('#')
    return srgb_to_linear(tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)))


class NB:
    """Tiny node builder: sockets or floats in, output sockets out."""

    def __init__(self, nt):
        self.nt, self.x, self.y = nt, 0, 0

    def node(self, type_, **props):
        n = self.nt.nodes.new(type_)
        for k, v in props.items():
            setattr(n, k, v)
        n.location = (self.x, self.y)
        self.x += 180
        if self.x > 3600:
            self.x, self.y = 0, self.y - 300
        return n

    def plug(self, sock, val):
        if isinstance(val, bpy.types.NodeSocket):
            self.nt.links.new(val, sock)
        else:
            sock.default_value = val

    def math(self, op, a, b=0.0, c=0.0, clamp=False):
        n = self.node('ShaderNodeMath', operation=op, use_clamp=clamp)
        self.plug(n.inputs[0], a)
        self.plug(n.inputs[1], b)
        self.plug(n.inputs[2], c)
        return n.outputs[0]

    def combine(self, x, y, z):
        n = self.node('ShaderNodeCombineXYZ')
        self.plug(n.inputs[0], x)
        self.plug(n.inputs[1], y)
        self.plug(n.inputs[2], z)
        return n.outputs[0]

    def noise4d(self, vec, w, scale, detail=6.0, rough=0.55, distortion=0.0, lacunarity=2.0):
        n = self.node('ShaderNodeTexNoise', noise_dimensions='4D')
        self.plug(n.inputs['Vector'], vec)
        self.plug(n.inputs['W'], w)
        n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail
        n.inputs['Roughness'].default_value = rough
        n.inputs['Lacunarity'].default_value = lacunarity
        n.inputs['Distortion'].default_value = distortion
        return n.outputs['Factor']

    def maprange(self, v, fmin, fmax, tmin=0.0, tmax=1.0, interp='LINEAR', clamp=True):
        n = self.node('ShaderNodeMapRange', interpolation_type=interp)
        n.clamp = clamp
        self.plug(n.inputs[0], v)
        for i, val in ((1, fmin), (2, fmax), (3, tmin), (4, tmax)):
            n.inputs[i].default_value = val
        return n.outputs[0]

    def ramp(self, fac, stops):
        """stops: [(position, '#rrggbb'), ...] in sRGB."""
        n = self.node('ShaderNodeValToRGB')
        self.plug(n.inputs[0], fac)
        els = n.color_ramp.elements
        while len(els) > 1:
            els.remove(els[-1])
        els[0].position = stops[0][0]
        els[0].color = (*hex_lin(stops[0][1]), 1.0)
        for pos, col in stops[1:]:
            e = els.new(pos)
            e.color = (*hex_lin(col), 1.0)
        return n.outputs['Color']


def rising_circle(nb, Z, t, speed, L):
    """The vertical axis bent onto a circle: scrolling along it is a rise that loops exactly."""
    R = L / TWO_PI
    phase = nb.math('SUBTRACT', nb.math('DIVIDE', Z, L), nb.math('MULTIPLY', t, speed))
    theta = nb.math('MULTIPLY', phase, TWO_PI)
    cu = nb.math('MULTIPLY', nb.math('COSINE', theta), R)
    cv = nb.math('MULTIPLY', nb.math('SINE', theta), R)
    return cu, cv


def reset_scene():
    sc = bpy.context.scene
    for ob in list(sc.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.images):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)
    return sc


def add_light(sc, name, type_, loc, rot, color, power, **props):
    ld = bpy.data.lights.new(name, type_)
    ld.energy, ld.color = power, hex_lin(color)
    for k, v in props.items():
        setattr(ld, k, v)
    ob = bpy.data.objects.new(name, ld)
    ob.location, ob.rotation_euler = loc, rot
    sc.collection.objects.link(ob)
    return ob


def setup_scene(samples, percent):
    p = LIGHTS
    sc = reset_scene()
    sc.frame_start, sc.frame_end, sc.frame_current = 0, LOOP_FRAMES - 1, 0
    sc.render.fps = FPS
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = WIDTH, HEIGHT, percent
    sc.render.film_transparent = False
    sc.render.dither_intensity = 1.0
    sc.render.image_settings.file_format = 'WEBP'
    sc.render.image_settings.color_mode = 'RGB'
    sc.render.image_settings.quality = WEBP_QUALITY
    ee = sc.eevee
    ee.taa_render_samples = samples
    ee.volumetric_tile_size = TILE_SIZE
    ee.volumetric_samples = VOLUME_STEPS
    ee.volumetric_ray_depth = 16
    ee.use_volumetric_shadows = True
    ee.volumetric_shadow_samples = SHADOW_STEPS
    ee.use_volume_custom_range = True
    ee.volumetric_start, ee.volumetric_end = VOLUME_START, VOLUME_END
    ee.use_raytracing = False
    ee.use_shadows = True
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = p['look']
    sc.view_settings.exposure = p['exposure']
    cam = bpy.data.cameras.new('Camera')
    cam.type, cam.ortho_scale, cam.clip_start, cam.clip_end = 'ORTHO', 16.0, 0.1, 100.0
    cam_ob = bpy.data.objects.new('Camera', cam)
    cam_ob.location, cam_ob.rotation_euler = (0, -20, 0), (math.pi / 2, 0, 0)
    sc.collection.objects.link(cam_ob)
    sc.camera = cam_ob
    w = sc.world
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (*hex_lin(p['world']), 1.0)
    bg.inputs['Strength'].default_value = 1.0
    # a wide floor glow under the frame (the fire is out of shot), three hot spots, a deep-red fill from above and the
    # backlight between the two slabs, facing the camera so only the front smoke is lit from behind
    lights = {}
    lights['Floor'] = add_light(sc, 'Floor', 'AREA', (0, 0, -6.2), (math.pi, 0, 0), p['floor_color'], p['floor_power'],
                                shape='RECTANGLE', size=24.0, size_y=5.0)
    for i, (x, pw, col) in enumerate(zip((-5.5, 0.5, 5.5), p['fire_power'], p['fire_colors'])):
        lights[f'Fire{i}'] = add_light(sc, f'Fire{i}', 'POINT', (x, -0.5, -5.8), (0, 0, 0), col, pw, shadow_soft_size=1.8)
    lights['Fill'] = add_light(sc, 'Fill', 'AREA', (0, 0, 7.5), (0, 0, 0), p['fill_color'], p['fill_power'],
                               shape='RECTANGLE', size=24.0, size_y=8.0)
    lights['Rim'] = add_light(sc, 'Rim', 'AREA', (0, p['rim_y'], -1.0), (-math.pi / 2, 0, 0), '#ff1404', p['rim_power'],
                              shape='RECTANGLE', size=16.0, size_y=12.0)
    return sc, lights


def build_smoke(sc, p, name, slab, offset):
    """One slab of volume. Returns the Value node that carries t = frame / LOOP_FRAMES."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.to_mesh(mesh)
    bm.free()
    mesh.transform(Matrix.Diagonal((*slab, 1.0)))
    ob = bpy.data.objects.new(name, mesh)
    ob.location = offset
    sc.collection.objects.link(ob)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    nb = NB(nt)
    out = nb.node('ShaderNodeOutputMaterial')
    tn = nb.node('ShaderNodeValue', name='t', label='t')
    tn.outputs[0].default_value = 0.0
    t = tn.outputs[0]
    tc = nb.node('ShaderNodeTexCoord')
    sep = nb.node('ShaderNodeSeparateXYZ')
    nb.plug(sep.inputs[0], tc.outputs['Object'])
    X, Y, Z = sep.outputs[0], sep.outputs[1], sep.outputs[2]
    if p['yshift']:
        Y = nb.math('ADD', Y, p['yshift'])            # decorrelates the two slabs' noise
    zn = nb.maprange(Z, -slab[2] / 2, slab[2] / 2)    # 0 at the bottom, 1 at the top
    # slow evolving warp: a circle in the two spare noise dimensions, no spatial z
    wu = nb.math('MULTIPLY', nb.math('COSINE', nb.math('MULTIPLY', t, TWO_PI)), 0.8)
    wv = nb.math('MULTIPLY', nb.math('SINE', nb.math('MULTIPLY', t, TWO_PI)), 0.8)
    warp = nb.noise4d(nb.combine(nb.math('MULTIPLY', X, 0.35), nb.math('MULTIPLY', Z, 0.35), wu), wv, 1.0, 3.0, 0.5)
    warp_c = nb.math('MULTIPLY', nb.math('SUBTRACT', warp, 0.5), 2.2)
    Xw = nb.math('ADD', X, warp_c)
    Zw = nb.math('ADD', Z, nb.math('MULTIPLY', warp_c, 0.6))
    # layer A: big billows rising one height per cycle
    cuA, cvA = rising_circle(nb, Zw, t, 1.0, RISE_L)
    nA = nb.noise4d(nb.combine(Xw, Y, cuA), cvA, 0.32, p['detailA'], 0.55, 0.45)
    # layer B: finer turbulence rising twice as fast (the relative motion is the boiling)
    cuB, cvB = rising_circle(nb, Z, t, 2.0, RISE_L)
    nB = nb.noise4d(nb.combine(nb.math('ADD', Xw, 11.0), nb.math('ADD', Y, 7.0), cuB), cvB, 0.75, 6.0, 0.6, 0.2)
    n = nb.math('MULTIPLY_ADD', nA, 0.7, nb.math('MULTIPLY', nB, 0.3))
    shaped = nb.math('POWER', nb.maprange(n, p['lo'], p['hi']), p['gamma'])
    vprof = nb.math('POWER', nb.math('SUBTRACT', 1.0, zn), p['pv'])
    density = nb.math('MULTIPLY', nb.math('MULTIPLY', shaped, vprof), p['density'])
    # fire glow inside the lower smoke
    bottom = nb.maprange(zn, 0.0, 0.45, 1.0, 0.0, 'SMOOTHSTEP')
    heat = nb.math('MULTIPLY', nb.math('POWER', shaped, 1.5), bottom)
    fire_col = nb.ramp(nb.math('MULTIPLY', heat, 1.4, clamp=True),
                       [(0.0, '#000000'), (0.18, '#5a0000'), (0.45, '#ff1e00'), (0.78, '#ff7a1a'), (1.0, '#ffd27a')])
    vol = nb.node('ShaderNodeVolumePrincipled')
    vol.inputs['Color'].default_value = (*hex_lin(p['albedo']), 1.0)
    vol.inputs['Absorption Color'].default_value = (*hex_lin(p['absorb']), 1.0)
    vol.inputs['Anisotropy'].default_value = p['anis']
    vol.inputs['Blackbody Intensity'].default_value = 0.0
    nb.plug(vol.inputs['Density'], density)
    nb.plug(vol.inputs['Emission Strength'], nb.math('MULTIPLY', heat, p['emis']))
    nb.plug(vol.inputs['Emission Color'], fire_col)
    nt.links.new(vol.outputs['Volume'], out.inputs['Volume'])
    ob.data.materials.append(mat)
    return tn


def flicker(frame):
    """1 +- a few percent, a sum of sines with whole turns per cycle: equal at frame 0 and LOOP_FRAMES."""
    t = frame / LOOP_FRAMES
    return 1.0 + sum(a * math.sin(TWO_PI * k * t + ph) for k, a, ph in FLICKER)


def set_frame(sc, lights, time_nodes, frame):
    sc.frame_set(frame)
    for tn in time_nodes:
        tn.outputs[0].default_value = frame / LOOP_FRAMES
    f = flicker(frame)
    lights['Floor'].data.energy = LIGHTS['floor_power'] * f
    for i, pw in enumerate(LIGHTS['fire_power']):
        lights[f'Fire{i}'].data.energy = pw * f
    lights['Rim'].data.energy = LIGHTS['rim_power'] * (1.0 + (f - 1.0) * 0.5)


def script_sha256():
    with open(os.path.abspath(__file__), 'rb') as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def frame_file(frame):
    return f'{frame:04d}.webp'


def merge_ranges(ranges):
    out = []
    for a, b in sorted(tuple(r) for r in ranges):
        if out and a <= out[-1][1] + 1:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


def write_manifest(out_dir, samples, percent, rendered_now):
    path = os.path.join(out_dir, 'manifest.json')
    old = {}
    if os.path.exists(path):
        with open(path, encoding='utf8') as fh:
            old = json.load(fh)
    same = old.get('script_sha256') == script_sha256() and old.get('samples') == samples and old.get('percent') == percent
    rendered = merge_ranges((old.get('rendered', []) if same else []) + rendered_now)
    on_disk = [[a, b] for a, b in rendered if all(os.path.exists(os.path.join(out_dir, frame_file(f))) for f in range(a, b + 1))]
    manifest = dict(name=NAME, version=VERSION, width=WIDTH * percent // 100, height=HEIGHT * percent // 100, fps=FPS,
                    frames=LOOP_FRAMES, loop=True, direction=DIRECTION, blender=bpy.app.version_string,
                    script_sha256=script_sha256(), samples=samples, percent=percent,
                    complete=on_disk == [[0, LOOP_FRAMES - 1]], rendered=on_disk)
    with open(path, 'w', encoding='utf8') as fh:
        json.dump(manifest, fh, indent=2)
        fh.write('\n')
    return manifest


def loop_check(out_dir):
    """Frame LOOP_FRAMES against frame 0, in 8-bit steps; both must exist."""
    import numpy as np
    a = os.path.join(out_dir, frame_file(0))
    b = os.path.join(out_dir, frame_file(LOOP_FRAMES))
    if not (os.path.exists(a) and os.path.exists(b)):
        return None
    pixels = []
    for path in (a, b):
        img = bpy.data.images.load(path, check_existing=False)
        pixels.append(np.array(img.pixels[:], dtype=np.float32))
        bpy.data.images.remove(img)
    d = np.abs(pixels[0] - pixels[1]) * 255
    result = dict(max_diff_8bit=float(d.max()), mean_diff_8bit=float(d.mean()))
    with open(os.path.join(out_dir, 'loop-check.json'), 'w', encoding='utf8') as fh:
        json.dump(result, fh, indent=2)
    return result


def parse_args(argv):
    parser = argparse.ArgumentParser(prog='create-wildfire-smoke.py', description=__doc__.split('\n', 1)[0])
    parser.add_argument('--output-dir', help='where the frames and manifest.json go (required unless --preview)')
    parser.add_argument('--frames', default=None, help='A-B, inclusive (default 0-%d)' % (LOOP_FRAMES - 1))
    parser.add_argument('--samples', type=int, default=SAMPLES)
    parser.add_argument('--percent', type=int, default=100, help='resolution percentage (even sizes only)')
    parser.add_argument('--preview', action='store_true',
                        help='25%%, 8 samples, frames %s and the loop check, into out/.scratch/wildfire-smoke/preview/' % ','.join(map(str, PREVIEW_FRAMES)))
    parser.add_argument('--manifest-only', action='store_true', help='rewrite manifest.json from the frames on disk')
    return parser.parse_args(argv)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    args = parse_args(argv)
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if args.preview:
        out_dir = args.output_dir or os.path.join(repo, 'out', '.scratch', 'wildfire-smoke', 'preview')
        samples, percent, frames = 8, 25, list(PREVIEW_FRAMES)
    else:
        if not args.output_dir:
            raise SystemExit('--output-dir is required (public/wildfire-smoke for the product).')
        out_dir = args.output_dir
        samples, percent = args.samples, args.percent
        a, b = (0, LOOP_FRAMES - 1) if args.frames is None else (int(x) for x in args.frames.split('-'))
        if not (0 <= a <= b <= LOOP_FRAMES):
            raise SystemExit(f'--frames must stay inside 0-{LOOP_FRAMES}.')
        frames = list(range(a, b + 1))
    if (WIDTH * percent) % 200 or (HEIGHT * percent) % 200:
        raise SystemExit('--percent must give even width and height (25, 50 or 100).')
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    if args.manifest_only:
        manifest = write_manifest(out_dir, samples, percent, [])
        print(json.dumps(dict(manifest=manifest), indent=2))
        return
    sc, lights = setup_scene(samples, percent)
    time_nodes = [
        build_smoke(sc, BACK, 'Haze', BACK_SLAB, BACK_OFFSET),
        build_smoke(sc, FRONT, 'Smoke', FRONT_SLAB, (0.0, 0.0, 0.0)),
    ]
    t0 = time.time()
    for i, frame in enumerate(frames):
        set_frame(sc, lights, time_nodes, frame)
        sc.render.filepath = os.path.join(out_dir, frame_file(frame))
        bpy.ops.render.render(write_still=True)
        done = time.time() - t0
        print(f'frame {frame:04d} ({i + 1}/{len(frames)}) {done / (i + 1):.1f} s/frame, {done / (i + 1) * (len(frames) - i - 1) / 60:.1f} min left', flush=True)
    rendered_now = [[frames[0], frames[-1]]] if not args.preview else []
    manifest = write_manifest(out_dir, samples, percent, rendered_now) if not args.preview else None
    check = loop_check(out_dir) if args.preview else None
    sizes = sorted(os.path.getsize(os.path.join(out_dir, frame_file(f))) for f in frames)
    print(json.dumps(dict(out_dir=out_dir, frames=len(frames), seconds=round(time.time() - t0, 1),
                          bytes_per_frame=dict(min=sizes[0], median=sizes[len(sizes) // 2], max=sizes[-1]),
                          loop_check=check, manifest=manifest), indent=2))


if __name__ == '__main__':
    main()
