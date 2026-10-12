"""Alien goo decals (js/combat.js drawGoo, js/organic.js slimeBurst).

Sprites (assets/sprites/organic/):
  goo_<i>        i = 0..3: a puddle of glowing green slime where an intruder died, with a few drops
                 around it. Origin = the puddle centre = the decal's (d.x, d.y). Sized for d.r = 0.6
                 (the only size the game uses): scale by d.r / 0.6 for others. Pick i from the decal's
                 seed (the game uses Math.floor(d.x * 13)). Flat (height < 0.05): draw on the floor.
  slime_drop_<i> i = 0..2: single glossy slime blobs (~0.12 across) for the slimeBurst particles,
                 scaled by the particle size / 0.1; the game can keep its own colours/fade on top.

    blender -b --factory-startup --python tools/blender/models/organic/goo.py
"""
import sys, os, math, random, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..')); sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Vector
import mn
import orglib as O

def slime(name):
    """Thick wet slime: green, glowing a little from inside (deeper = brighter), slightly see-through."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    b = N['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.06; b.inputs['Coat Weight'].default_value = 1.0; b.inputs['Coat Roughness'].default_value = 0.03
    b.inputs['Subsurface Weight'].default_value = 0.2; b.inputs['Subsurface Scale'].default_value = 0.04
    b.inputs['Emission Color'].default_value = (*mn.hex_rgb('#7cff3a'), 1)
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); Lk(tc.outputs['Object'], sep.inputs[0])
    g = N.new('ShaderNodeGeometry') if False else N.new('ShaderNodeNewGeometry')
    sz = N.new('ShaderNodeSeparateXYZ'); Lk(g.outputs['Position'], sz.inputs[0])
    dep = N.new('ShaderNodeMapRange'); dep.inputs['From Min'].default_value = 0.0; dep.inputs['From Max'].default_value = 0.06
    Lk(sz.outputs['Z'], dep.inputs['Value'])
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 9; nz.inputs['Detail'].default_value = 4; Lk(tc.outputs['Object'], nz.inputs['Vector'])
    col = N.new('ShaderNodeMix'); col.data_type = 'RGBA'; Lk(dep.outputs[0], col.inputs['Factor'])
    col.inputs[6].default_value = (*mn.hex_rgb('#2f6a10'), 1); col.inputs[7].default_value = (*mn.hex_rgb('#7ae03a'), 1)
    col2 = N.new('ShaderNodeMix'); col2.data_type = 'RGBA'; col2.blend_type = 'MULTIPLY'; Lk(nz.outputs['Fac'], col2.inputs['Factor'])
    Lk(col.outputs[2], col2.inputs[6]); col2.inputs[7].default_value = (0.75, 0.95, 0.6, 1)
    Lk(col2.outputs[2], b.inputs['Base Color']); Lk(col2.outputs[2], b.inputs['Subsurface Radius'])
    em = N.new('ShaderNodeMath'); em.operation = 'MULTIPLY'; em.inputs[1].default_value = 0.55; Lk(dep.outputs[0], em.inputs[0])
    Lk(em.outputs[0], b.inputs['Emission Strength'])
    al = N.new('ShaderNodeMapRange'); al.inputs['From Min'].default_value = 0.0; al.inputs['From Max'].default_value = 0.012
    al.inputs['To Min'].default_value = 0.55; al.inputs['To Max'].default_value = 0.92; Lk(sz.outputs['Z'], al.inputs['Value'])
    Lk(al.outputs[0], b.inputs['Alpha'])
    return m

def puddle(name, seed, m):
    rnd = random.Random(seed)
    parts = [((0, 0, 0.0), 0.3, (1.2, 1.0, 0.2))]
    # main pool: lobes of different reach (the game's stain: radius 0.42..0.72, y squashed 0.8)
    n = 11
    for i in range(n):
        a = i / n * math.tau + rnd.uniform(-0.25, 0.25); reach = rnd.uniform(0.18, 0.42)
        sz = rnd.uniform(0.13, 0.22)
        parts.append(((math.cos(a) * reach, math.sin(a) * reach * 0.8, 0.0), sz, (1.3, 0.9, 0.22), (0, 0, a)))
        if rnd.random() < 0.55:                      # a splash finger reaching out
            r2 = reach + rnd.uniform(0.15, 0.25)
            parts.append(((math.cos(a) * r2, math.sin(a) * r2 * 0.8, 0.0), 0.07, (2.2, 0.8, 0.45), (0, 0, a)))
    # thick globs on top, and the splatter drops (the game: 3 within +-1.5 r in x, +-1.2 r in y)
    for i in range(rnd.randint(2, 4)):
        parts.append(((rnd.uniform(-0.2, 0.2), rnd.uniform(-0.15, 0.15), 0.025), rnd.uniform(0.06, 0.1), (1.2, 1, 0.6)))
    for i in range(rnd.randint(4, 6)):
        a = rnd.uniform(0, math.tau); d = rnd.uniform(0.6, 0.9)
        parts.append(((math.cos(a) * d, math.sin(a) * d * 0.8, 0.0), rnd.uniform(0.05, 0.085), (1, 1, 0.7)))
    o = O.blob(name, parts, m=m, res=0.01, threshold=0.6)
    O.cut_below(o, 0.0)
    out = [o]
    for i in range(rnd.randint(3, 5)):               # bubbles in the goo
        a = rnd.uniform(0, math.tau); d = rnd.uniform(0.0, 0.3); r = rnd.uniform(0.018, 0.04)
        b_ = mn.sphere('bubble', r, loc=(math.cos(a) * d, math.sin(a) * d * 0.8, 0.035), m=m, segs=16); out.append(b_)
    return out

def drop(name, seed, m):
    rnd = random.Random(seed)
    parts = [((0, 0, 0), 0.06, (1.2, 1, 0.9))]
    for i in range(rnd.randint(1, 3)):
        a = rnd.uniform(0, math.tau); parts.append(((math.cos(a) * 0.04, math.sin(a) * 0.04, 0), rnd.uniform(0.025, 0.04), (1, 1, 0.8)))
    o = O.blob(name, parts, m=m, res=0.006)
    return o

if __name__ == '__main__':
    T = time.time()
    for i in range(4):
        mn.reset(); m = slime('slime')
        objs = puddle(f'goo{i}', 11 + i * 7, m)
        mn.outline(objs[:1], thickness=0.006, color='#1e3a10')
        mn.render(f'organic/goo_{i}', objs=objs)
    for i in range(3):
        mn.reset(); m = slime('slime')
        o = drop(f'drop{i}', 5 + i, m)
        mn.outline([o], thickness=0.006)
        mn.render(f'organic/slime_drop_{i}', objs=[o])
    print(f'[goo] total {time.time() - T:.1f}s')
