"""Holographic CD: data side in a bubblegum holo spectrum, clear hub, mirror band (references 04, 05).

A real disc splits light into a spectrum along its radius, so the colour at a point follows the
angle between the view (and the key light) and the radial direction there: sectors of colour turn
around the disc as it tilts. The grooves are circles, so the metal is anisotropic along them and
the highlights stretch into radial streaks.
"""
from __future__ import annotations

import math

import bmesh
import bpy

import studio

# Radii as a share of the 60 mm radius of a real disc.
HOLE = 0.125
HUB = 0.28
STACKING_RING = (0.30, 0.32)
DATA = 0.38
EDGE = 0.985
THICKNESS = 0.024

# Bubblegum holo: pink, lilac, ice, mint, butter, and back to pink.
HOLO_STOPS = ["#FF7CCB", "#C49BFF", "#8FE9FF", "#AAFFD8", "#FFF2A8", "#FF9EC9", "#FF7CCB"]


def holo(name: str = "Holo", key_light=(-0.71, -0.51, 0.48), gain: float = 0.9,
         radial_drift: float = 0.35, roughness: float = 0.16) -> bpy.types.Material:
    material = studio.principled(name, metallic=1.0, roughness=roughness, anisotropic=0.85)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = studio.principled_node(material)

    geometry = nodes.new("ShaderNodeNewGeometry")
    coord = nodes.new("ShaderNodeTexCoord")
    # Radial direction in object space; the disc lies in its XZ plane.
    flatten = nodes.new("ShaderNodeVectorMath")
    flatten.operation = "MULTIPLY"
    flatten.inputs[1].default_value = (1.0, 0.0, 1.0)
    radial = nodes.new("ShaderNodeVectorMath")
    radial.operation = "NORMALIZE"
    radius = nodes.new("ShaderNodeVectorMath")
    radius.operation = "LENGTH"
    view = nodes.new("ShaderNodeVectorTransform")
    view.vector_type = "VECTOR"
    view.convert_from = "WORLD"
    view.convert_to = "OBJECT"
    light = nodes.new("ShaderNodeVectorTransform")
    light.vector_type = "VECTOR"
    light.convert_from = "WORLD"
    light.convert_to = "OBJECT"
    light.inputs["Vector"].default_value = key_light
    both = nodes.new("ShaderNodeVectorMath")
    both.operation = "ADD"
    along = nodes.new("ShaderNodeVectorMath")
    along.operation = "DOT_PRODUCT"
    phase = nodes.new("ShaderNodeMath")
    phase.operation = "MULTIPLY_ADD"
    phase.inputs[1].default_value = gain
    drift = nodes.new("ShaderNodeMath")
    drift.operation = "MULTIPLY_ADD"
    drift.inputs[1].default_value = radial_drift
    wrap = nodes.new("ShaderNodeMath")
    wrap.operation = "FRACT"
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "B_SPLINE"
    elements = ramp.color_ramp.elements
    while len(elements) < len(HOLO_STOPS):
        elements.new(0.5)
    for i, (element, color) in enumerate(zip(elements, HOLO_STOPS)):
        element.position = i / (len(HOLO_STOPS) - 1)
        element.color = studio.linear(color)
    tangent = nodes.new("ShaderNodeTangent")
    tangent.direction_type = "RADIAL"
    tangent.axis = "Y"

    links.new(coord.outputs["Object"], flatten.inputs[0])
    links.new(flatten.outputs["Vector"], radial.inputs[0])
    links.new(flatten.outputs["Vector"], radius.inputs[0])
    links.new(geometry.outputs["Incoming"], view.inputs["Vector"])
    links.new(view.outputs["Vector"], both.inputs[0])
    links.new(light.outputs["Vector"], both.inputs[1])
    links.new(both.outputs["Vector"], along.inputs[0])
    links.new(radial.outputs["Vector"], along.inputs[1])
    # phase = along * gain + (radius * drift + 0)
    links.new(radius.outputs["Value"], drift.inputs[0])
    drift.inputs[2].default_value = 0.0
    links.new(along.outputs["Value"], phase.inputs[0])
    links.new(drift.outputs["Value"], phase.inputs[2])
    links.new(phase.outputs["Value"], wrap.inputs[0])
    links.new(wrap.outputs["Value"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(tangent.outputs["Tangent"], bsdf.inputs["Tangent"])
    return material


def build() -> bpy.types.Object:
    """The disc in the XZ plane, data side towards the camera (-Y)."""
    radii = [HOLE, 0.16, 0.22, HUB, STACKING_RING[0], STACKING_RING[1], 0.35, DATA,
             0.5, 0.62, 0.74, 0.86, EDGE, 1.0]
    zones = {  # material slot of the band that starts at each radius
        HOLE: 0, 0.16: 0, 0.22: 0, HUB: 1, STACKING_RING[0]: 3, STACKING_RING[1]: 1, 0.35: 1,
        DATA: 2, 0.5: 2, 0.62: 2, 0.74: 2, 0.86: 2, EDGE: 0,
    }
    segments = 256
    half = THICKNESS / 2
    bm = bmesh.new()
    rings = {}
    for side, y in (("front", -half), ("back", half)):
        rings[side] = []
        for r in radii:
            ring = []
            for i in range(segments):
                a = 2 * math.pi * i / segments
                ring.append(bm.verts.new((r * math.cos(a), y, r * math.sin(a))))
            rings[side].append(ring)

    # Flat shading: the disc is flat, and smooth normals would bend where it meets the rim.
    def band(inner, outer, slot, flip):
        for i in range(segments):
            j = (i + 1) % segments
            quad = (inner[i], outer[i], outer[j], inner[j])
            face = bm.faces.new(quad[::-1] if flip else quad)
            face.material_index = slot

    for k in range(len(radii) - 1):
        slot = zones[radii[k]]
        band(rings["front"][k], rings["front"][k + 1], slot, flip=True)
        back_slot = 4 if slot == 2 else slot
        band(rings["back"][k], rings["back"][k + 1], back_slot, flip=False)
    # Rims: the outer edge and the wall of the hole, clear plastic.
    band(rings["front"][-1], rings["back"][-1], 0, flip=False)
    band(rings["front"][0], rings["back"][0], 0, flip=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new("CD")
    bm.to_mesh(mesh)
    bm.free()
    cd = bpy.data.objects.new("CD", mesh)
    bpy.context.scene.collection.objects.link(cd)

    clear = studio.principled("CD clear", base_color=studio.linear("#FFFFFF"), transmission=1.0,
                              ior=1.58, roughness=0.04)
    mirror = studio.chrome("CD mirror", tint="#F4F1FF", roughness=0.04)
    frosted = studio.principled("CD stacking ring", base_color=studio.linear("#FFFFFF"),
                                transmission=1.0, ior=1.58, roughness=0.45)
    label = studio.pearl("CD label", base="#FFE3F4", film=560.0, metallic=0.6, roughness=0.2)
    for material in (clear, mirror, holo(), frosted, label):
        mesh.materials.append(material)
    return cd
