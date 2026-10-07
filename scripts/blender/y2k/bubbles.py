"""Bubbles of the Bubble Gum round: a pink gum bubble and a soap bubble.

The gum bubble is milky, soft-sheened and a little lumpy, with shallow creases, so it reads as
gum and not as a balloon (glossy) or a ball (round). The soap bubble is only its film: it needs
transparent glass in the studio (setup_render), or it shows the studio instead of the plate.
"""
from __future__ import annotations

import bpy

import shapes
import studio


def gum(name: str = "Gum material", color: str = "#FF7DBE") -> bpy.types.Material:
    material = studio.principled(name, base_color=studio.linear(color), roughness=0.42, subsurface=0.55,
                                 sheen=0.35, sheen_roughness=0.4, coat=0.15, coat_roughness=0.2)
    bsdf = studio.principled_node(material)
    bsdf.inputs[studio.SOCKETS["subsurface_radius"]].default_value = (1.0, 0.35, 0.55)
    bsdf.inputs[studio.SOCKETS["subsurface_scale"]].default_value = 0.25
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    # A blown shell: the eye looks through more gum at the rim (deeper pink) than in the middle.
    facing = nodes.new("ShaderNodeLayerWeight")
    facing.inputs["Blend"].default_value = 0.45
    shell = nodes.new("ShaderNodeMix")
    shell.data_type = "RGBA"
    shell.inputs["A"].default_value = studio.linear("#FFB3D9")
    shell.inputs["B"].default_value = studio.linear("#F2449A")
    links.new(facing.outputs["Facing"], shell.inputs["Factor"])
    links.new(shell.outputs["Result"], bsdf.inputs[studio.SOCKETS["base_color"]])
    coord = nodes.new("ShaderNodeTexCoord")
    stretch = nodes.new("ShaderNodeMapping")
    stretch.inputs["Scale"].default_value = (7.0, 7.0, 1.0)
    creases = nodes.new("ShaderNodeTexWave")
    creases.wave_type = "BANDS"
    creases.bands_direction = "Z"
    creases.inputs["Scale"].default_value = 0.6
    creases.inputs["Distortion"].default_value = 9.0
    creases.inputs["Detail"].default_value = 3.0
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    bump.inputs["Distance"].default_value = 0.03
    links.new(coord.outputs["Object"], stretch.inputs["Vector"])
    links.new(stretch.outputs["Vector"], creases.inputs["Vector"])
    links.new(creases.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def build_gum(color: str = "#FF7DBE") -> bpy.types.Object:
    bubble = shapes.sphere("Gum bubble", 1.0, (0.0, 0.0, 0.0), segments=96)
    # Lumpy, not round: a low displacement, fixed by the texture (no seed from the clock).
    texture = bpy.data.textures.new("Gum lumps", "CLOUDS")
    texture.noise_scale = 0.9
    lumps = bubble.modifiers.new("Lumps", "DISPLACE")
    lumps.texture = texture
    lumps.strength = 0.07
    lumps.mid_level = 0.5
    bubble.scale = (1.0, 0.96, 0.93)
    studio.assign(bubble, gum(color=color))
    return bubble


def build_soap(seed: float = 0.0) -> bpy.types.Object:
    studio.dim_cards(0.2)
    # No dark horizon line here: a bubble mirrors it as a band round its middle.
    studio.add_world(bpy.context.scene, [(0.0, "#F3C9E4"), (0.5, "#EADFFF"), (1.0, "#FFFFFF")],
                     strength=0.45)
    bubble = shapes.sphere("Soap bubble", 1.0, (0.0, 0.0, 0.0), segments=96)
    studio.assign(bubble, studio.soap(seed=seed))
    return bubble
