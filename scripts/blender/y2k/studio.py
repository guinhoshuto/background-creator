"""Studio shared by the Y2K sprites: scene, render settings, camera, world, light cards, materials.

Runs inside Blender 5.2, in the GUI through the MCP or headless (-b). Everything is code: no HDRI,
no downloaded asset and no .blend in git (AGENTS.md, Art). Chrome takes its colour from what it
reflects, so the light is a ring of emissive cards in the palette around the subject, and the
world is a gradient that only shows in reflections (the film is transparent).
"""
from __future__ import annotations

import bpy
from mathutils import Vector

# src/settings.ts: a background cycle is 8 s at 60 fps.
LOOP_FRAMES = 480
SEED = 0

# Measured on the references (vault: Visual Ref/Y2K Bubblegum).
PALETTE = {
    "bubblegum": "#FC6EAE",
    "blush": "#FC89B9",
    "lilac": "#B271D8",
    "orchid": "#CE8ADC",
    "candy": "#C14270",
    "magenta": "#B20664",
    "pearl_lilac": "#8862C1",
    "night": "#313763",
}

# Python names for the Principled BSDF sockets this library sets.
SOCKETS = {
    "base_color": "Base Color",
    "metallic": "Metallic",
    "roughness": "Roughness",
    "ior": "IOR",
    "alpha": "Alpha",
    "anisotropic": "Anisotropic",
    "anisotropic_rotation": "Anisotropic Rotation",
    "transmission": "Transmission Weight",
    "subsurface": "Subsurface Weight",
    "subsurface_radius": "Subsurface Radius",
    "subsurface_scale": "Subsurface Scale",
    "coat": "Coat Weight",
    "coat_roughness": "Coat Roughness",
    "coat_tint": "Coat Tint",
    "specular": "Specular IOR Level",
    "emission_color": "Emission Color",
    "emission_strength": "Emission Strength",
    "thin_film": "Thin Film Thickness",
    "thin_film_ior": "Thin Film IOR",
}


def linear(hex_color: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    """sRGB hex to the linear RGBA that Blender colour sockets take."""
    h = hex_color.lstrip("#")
    channels = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        channels.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (channels[0], channels[1], channels[2], alpha)


def reset_scene() -> bpy.types.Scene:
    """Empty the scene and drop the data nothing uses, so a module can be run again and again."""
    scene = bpy.context.scene
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights,
                       bpy.data.curves, bpy.data.node_groups, bpy.data.worlds):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)
    return scene


def _use_gpu() -> bool:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    # Headless runs start from factory settings, which have no compute device. The GUI keeps the
    # owner's preferences untouched (they are saved on quit).
    if bpy.app.background and prefs.compute_device_type == "NONE":
        try:
            prefs.compute_device_type = "METAL"
        except TypeError:
            return False
        prefs.get_devices()
        for device in prefs.devices:
            device.use = True
    return prefs.has_active_device()


def setup_render(scene: bpy.types.Scene, size: tuple[int, int] = (768, 768), samples: int = 128,
                 transparent_glass: bool = False) -> None:
    scene.render.engine = "CYCLES"
    cycles = scene.cycles
    cycles.device = "GPU" if _use_gpu() else "CPU"
    cycles.samples = samples
    # The same sample count everywhere and a fixed seed: the noise pattern does not crawl from one
    # frame to the next, and two runs give the same pixels.
    cycles.use_adaptive_sampling = False
    cycles.seed = SEED
    cycles.use_animated_seed = False
    cycles.use_denoising = True
    cycles.max_bounces = 16
    cycles.glossy_bounces = 8
    cycles.transmission_bounces = 16
    cycles.transparent_max_bounces = 16
    cycles.blur_glossy = 0.5
    scene.render.film_transparent = True
    # Transparent glass lets the plate show through clear plastic (the CD hub), but alpha is one
    # number: whatever a candy colours on the way through would come out clear. Candy stays off.
    cycles.film_transparent_glass = transparent_glass
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.fps = 60
    scene.frame_start = 0
    scene.frame_end = LOOP_FRAMES - 1
    # Standard keeps the palette as measured; the plate in Remotion is sRGB too.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    settings = scene.render.image_settings
    settings.file_format = "PNG"
    settings.color_mode = "RGBA"
    settings.color_depth = "8"


def look_at(obj: bpy.types.Object, target: tuple[float, float, float], forward: str = "-Z") -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat(forward, "Y").to_euler()


def add_camera(scene: bpy.types.Scene, lens: float = 85.0, distance: float = 7.0,
               height: float = 0.0) -> bpy.types.Object:
    """A long lens seen from -Y: little perspective, so the sprites sit flat in a 2D layout."""
    data = bpy.data.cameras.new("Camera")
    data.lens = lens
    camera = bpy.data.objects.new("Camera", data)
    scene.collection.objects.link(camera)
    camera.location = (0.0, -distance, height)
    look_at(camera, (0.0, 0.0, 0.0))
    scene.camera = camera
    return camera


def _ramp(nodes, stops: list[tuple[float, str]], interpolation: str = "B_SPLINE"):
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = interpolation
    elements = ramp.color_ramp.elements
    while len(elements) < len(stops):
        elements.new(0.5)
    for element, (position, color) in zip(elements, stops):
        element.position = position
        element.color = linear(color)
    return ramp


def add_world(scene: bpy.types.Scene, stops: list[tuple[float, str]], strength: float = 1.0) -> None:
    """A vertical gradient, from the floor (0) to the zenith (1); only reflections see it."""
    world = bpy.data.worlds.new("Y2K Studio")
    scene.world = world
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    coord = nodes.new("ShaderNodeTexCoord")
    separate = nodes.new("ShaderNodeSeparateXYZ")
    to_unit = nodes.new("ShaderNodeMapRange")
    to_unit.inputs["From Min"].default_value = -1.0
    to_unit.inputs["From Max"].default_value = 1.0
    ramp = _ramp(nodes, stops)
    background = nodes.new("ShaderNodeBackground")
    background.inputs["Strength"].default_value = strength
    output = nodes.new("ShaderNodeOutputWorld")
    links.new(coord.outputs["Generated"], separate.inputs[0])
    links.new(separate.outputs["Z"], to_unit.inputs["Value"])
    links.new(to_unit.outputs["Result"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], background.inputs["Color"])
    links.new(background.outputs["Background"], output.inputs["Surface"])


def add_card(scene: bpy.types.Scene, name: str, color: str, strength: float,
             size: tuple[float, float], location: tuple[float, float, float],
             target: tuple[float, float, float] = (0.0, 0.0, 0.0), softness: float = 0.6) -> bpy.types.Object:
    """An emissive softbox card: bright in the middle, fading to the edges, unseen by the camera."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(-0.5, -0.5, 0.0), (0.5, -0.5, 0.0), (0.5, 0.5, 0.0), (-0.5, 0.5, 0.0)], [], [(0, 1, 2, 3)])
    uv = mesh.uv_layers.new(name="UVMap")
    for loop, coords in zip(uv.data, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop.uv = coords
    card = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(card)
    card.location = location
    card.scale = (size[0], size[1], 1.0)
    look_at(card, target, forward="Z")
    card.visible_camera = False
    card.visible_shadow = False

    material = bpy.data.materials.new(name)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    coord = nodes.new("ShaderNodeTexCoord")
    centre = nodes.new("ShaderNodeVectorMath")
    centre.operation = "SUBTRACT"
    centre.inputs[1].default_value = (0.5, 0.5, 0.0)
    radius = nodes.new("ShaderNodeVectorMath")
    radius.operation = "LENGTH"
    falloff = nodes.new("ShaderNodeMapRange")
    falloff.interpolation_type = "SMOOTHSTEP"
    falloff.inputs["From Min"].default_value = 0.5 * (1.0 - softness)
    falloff.inputs["From Max"].default_value = 0.5
    falloff.inputs["To Min"].default_value = strength
    falloff.inputs["To Max"].default_value = 0.0
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = linear(color)
    output = nodes.new("ShaderNodeOutputMaterial")
    links.new(coord.outputs["UV"], centre.inputs[0])
    links.new(centre.outputs["Vector"], radius.inputs[0])
    links.new(radius.outputs["Value"], falloff.inputs["Value"])
    links.new(falloff.outputs["Result"], emission.inputs["Strength"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    mesh.materials.append(material)
    return card


def build_studio(size: tuple[int, int] = (768, 768), samples: int = 128,
                 distance: float = 7.0, transparent_glass: bool = False) -> bpy.types.Scene:
    """Bubblegum light: pink key, lilac fill, cold rim, white strip on top, hot pink floor."""
    scene = reset_scene()
    setup_render(scene, size, samples, transparent_glass)
    add_camera(scene, distance=distance)
    add_world(scene, [
        (0.00, "#E0479A"),  # floor
        (0.44, "#F27BBE"),
        (0.49, "#4A2A78"),  # dark horizon line: chrome reads as chrome
        (0.53, "#FFC2E2"),
        (0.75, "#E7C6FF"),
        (1.00, "#FFF4FB"),  # zenith
    ], strength=0.9)
    add_card(scene, "Key", "#FF8CC6", 9.0, (3.2, 3.2), (-3.6, -2.6, 2.4))
    add_card(scene, "Fill", "#B98CFF", 6.0, (3.0, 4.0), (3.8, -1.8, 0.4))
    add_card(scene, "Top strip", "#F2F7FF", 16.0, (6.0, 0.7), (0.0, -1.2, 4.2), softness=0.3)
    add_card(scene, "Rim", "#86C5FF", 7.0, (6.0, 3.0), (0.0, 4.2, 1.2))
    add_card(scene, "Floor", "#FF3EA5", 3.0, (7.0, 7.0), (0.0, -1.0, -3.8))
    add_card(scene, "Glint", "#FFFFFF", 24.0, (0.9, 0.9), (2.4, -5.0, 3.0), softness=0.2)
    return scene


def principled(name: str, **inputs) -> bpy.types.Material:
    """A Principled BSDF material; keys are the names in SOCKETS."""
    material = bpy.data.materials.new(name)
    bsdf = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    for key, value in inputs.items():
        bsdf.inputs[SOCKETS[key]].default_value = value
    return material


def principled_node(material: bpy.types.Material):
    return next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")


def chrome(name: str = "Chrome", tint: str = "#FFFFFF", roughness: float = 0.05) -> bpy.types.Material:
    return principled(name, base_color=linear(tint), metallic=1.0, roughness=roughness)


def pearl(name: str = "Pearl", base: str = "#FFF1F8", film: float = 520.0, film_ior: float = 1.45,
          metallic: float = 0.0, roughness: float = 0.12, film_spread: float = 220.0,
          film_scale: float = 1.6) -> bpy.types.Material:
    """Milky body under a thin film whose thickness drifts over the surface, so the colour comes in
    patches (pink, teal, lilac) as on the references, not as one flat tint."""
    material = principled(name, base_color=linear(base), metallic=metallic, roughness=roughness,
                          thin_film_ior=film_ior, coat=0.4, coat_roughness=0.05)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = principled_node(material)
    coord = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = film_scale
    noise.inputs["Detail"].default_value = 1.0
    thickness = nodes.new("ShaderNodeMapRange")
    thickness.inputs["To Min"].default_value = film - film_spread
    thickness.inputs["To Max"].default_value = film + film_spread
    links.new(coord.outputs["Object"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], thickness.inputs["Value"])
    links.new(thickness.outputs["Result"], bsdf.inputs[SOCKETS["thin_film"]])
    return material


def candy(name: str = "Candy", color: str = "#FC6EAE", density: float = 1.2,
          roughness: float = 0.04) -> bpy.types.Material:
    """Jelly plastic: clear surface, coloured body; deeper where it is thick, light at thin edges."""
    material = principled(name, base_color=linear("#FFFFFF"), transmission=1.0, ior=1.45,
                          roughness=roughness, coat=1.0, coat_roughness=0.02)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    # The absorption colour is the light the body lets through, so it is the candy's colour.
    absorption = nodes.new("ShaderNodeVolumeAbsorption")
    absorption.inputs["Color"].default_value = linear(color)
    absorption.inputs["Density"].default_value = density
    output = next(node for node in nodes if node.type == "OUTPUT_MATERIAL")
    links.new(absorption.outputs["Volume"], output.inputs["Volume"])
    return material


def assign(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(material)


def render_still(scene: bpy.types.Scene, path: str, frame: int = 0) -> str:
    scene.frame_set(frame)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path
