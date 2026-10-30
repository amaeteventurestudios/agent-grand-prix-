# Pit crew figures for Agent Grand Prix, built headless in Blender:
#   blender -b --factory-startup -P art/people/people.py
# Each figure is a skeleton of joints wrapped by a Skin modifier (an organic low-poly body), a helmet
# with a dark visor, six poses (standing, kneeling at a wheel with the gun, and four for watching the race on the garage
# screen: arms up, a fist pump, hands on hips, hands on the helmet) and two levels of detail.
# Vertex colours carry the look: RGB is the colour, A = 1 marks overalls the game tints with the team
# colour. The figure faces +X, feet on the ground at the origin, about 1.8 m tall.
import bpy, bmesh, math, os, json
from mathutils import Vector

root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

# arms for the standing poses that watch the race on the garage screen: (elbow, wrist, hand) per side
ARMS = {
    'cheer': {1: ((0.0, 0.33, 1.72), (0.02, 0.4, 1.95), (0.03, 0.42, 2.04)), -1: ((0.0, -0.33, 1.72), (0.02, -0.4, 1.95), (0.03, -0.42, 2.04))},
    'pump': {1: ((0.03, 0.28, 1.74), (0.05, 0.3, 1.98), (0.06, 0.3, 2.06)), -1: ((0.06, -0.31, 1.2), (0.22, -0.2, 1.33), (0.28, -0.16, 1.37))},
    'watch': {1: ((-0.08, 0.37, 1.2), (0.0, 0.23, 1.0), (0.02, 0.18, 0.96)), -1: ((-0.08, -0.37, 1.2), (0.0, -0.23, 1.0), (0.02, -0.18, 0.96))},
    'despair': {1: ((0.02, 0.36, 1.6), (0.05, 0.2, 1.8), (0.06, 0.12, 1.83)), -1: ((0.02, -0.36, 1.6), (0.05, -0.2, 1.8), (0.06, -0.12, 1.83))},
}
# whole-body poses: any joints moved from the standing pose (art/people/driver.py adds the drivers' ones)
BODY = {}

def skel(pose):
    J = {}
    if pose in ARMS or pose in BODY:
        J, E, R = skel('stand')
        for s, (e, w, h) in ARMS.get(pose, {}).items():
            k = 'L' if s > 0 else 'R'
            J[f'elb{k}'], J[f'wri{k}'], J[f'han{k}'] = e, w, h
        J.update(BODY.get(pose, {}))
        if pose == 'cheer': J['head'] = (0.0, 0, 1.69); J['neck'] = (0.0, 0, 1.56)   # head back a touch
        if pose == 'despair': J['head'] = (0.05, 0, 1.66)                          # head forward, hands on the helmet
        return J, E, R
    if pose == 'stand':
        J.update(pelvis=(0, 0, 0.95), spine=(0, 0, 1.18), chest=(0.01, 0, 1.38), neck=(0.01, 0, 1.56), head=(0.02, 0, 1.68))
        for s in (1, -1):
            k = 'L' if s > 0 else 'R'
            J.update({f'sho{k}': (0.0, s * 0.2, 1.45), f'elb{k}': (0.02, s * 0.25, 1.17), f'wri{k}': (0.07, s * 0.26, 0.95), f'han{k}': (0.1, s * 0.26, 0.87),
                      f'hip{k}': (0, s * 0.1, 0.9), f'kne{k}': (0.04, s * 0.11, 0.5), f'ank{k}': (0, s * 0.11, 0.09), f'toe{k}': (0.15, s * 0.11, 0.04)})
    else:  # kneeling at the wheel, gun held out in front
        J.update(pelvis=(-0.12, 0, 0.6), spine=(-0.04, 0, 0.82), chest=(0.05, 0, 1.0), neck=(0.1, 0, 1.15), head=(0.14, 0, 1.27))
        J.update(shoL=(0.04, 0.2, 1.04), elbL=(0.28, 0.24, 0.86), wriL=(0.48, 0.14, 0.74), hanL=(0.56, 0.1, 0.71),
                 shoR=(0.04, -0.2, 1.04), elbR=(0.27, -0.24, 0.84), wriR=(0.47, -0.13, 0.73), hanR=(0.55, -0.09, 0.7))
        J.update(hipL=(-0.1, 0.1, 0.57), kneL=(0.3, 0.13, 0.52), ankL=(0.3, 0.13, 0.09), toeL=(0.45, 0.13, 0.04),
                 hipR=(-0.1, -0.1, 0.57), kneR=(-0.08, -0.12, 0.08), ankR=(-0.5, -0.12, 0.1), toeR=(-0.6, -0.12, 0.03))
    E = [('pelvis', 'spine'), ('spine', 'chest'), ('chest', 'neck'), ('neck', 'head')]
    for k in 'LR':
        E += [('chest', f'sho{k}'), (f'sho{k}', f'elb{k}'), (f'elb{k}', f'wri{k}'), (f'wri{k}', f'han{k}'),
              ('pelvis', f'hip{k}'), (f'hip{k}', f'kne{k}'), (f'kne{k}', f'ank{k}'), (f'ank{k}', f'toe{k}')]
    R = dict(pelvis=(0.15, 0.17), spine=(0.13, 0.15), chest=(0.14, 0.19), neck=(0.055, 0.055), head=(0.1, 0.09))
    for k in 'LR':
        R.update({f'sho{k}': (0.065, 0.065), f'elb{k}': (0.05, 0.05), f'wri{k}': (0.04, 0.042), f'han{k}': (0.048, 0.04),
                  f'hip{k}': (0.09, 0.09), f'kne{k}': (0.064, 0.064), f'ank{k}': (0.048, 0.048), f'toe{k}': (0.045, 0.05)})
    return J, E, R

# which part of the body a joint pair is: overalls (tinted), gloves, boots, balaclava
DARK, GLOVE, BOOT = (0.12, 0.12, 0.13, 0.0), (0.09, 0.09, 0.1, 0.0), (0.07, 0.07, 0.08, 0.0)
def part_colour(a, b, z):
    if a.startswith('wri') or b.startswith('han'): return GLOVE
    if a.startswith('ank') or b.startswith('toe'): return BOOT
    if a == 'neck' or b == 'head': return DARK
    # overalls, a little darker on the legs, with a light band round the chest
    if a.startswith('hip') or a.startswith('kne'): return (0.8, 0.8, 0.8, 1.0)
    return (1.0, 1.0, 1.0, 1.0)

def figure(pose, lod):
    J, E, R = skel(pose)
    names = list(J)
    me = bpy.data.meshes.new(f'{pose}{lod}')
    me.from_pydata([J[n] for n in names], [(names.index(a), names.index(b)) for a, b in E], [])
    ob = bpy.data.objects.new(f'crew_{pose}_L{lod}', me); bpy.context.collection.objects.link(ob)
    sk = ob.modifiers.new('skin', 'SKIN'); sk.use_smooth_shade = True; sk.branch_smoothing = 0.6
    for i, n in enumerate(names):
        me.skin_vertices[0].data[i].radius = R[n]
        me.skin_vertices[0].data[i].use_root = (n == 'pelvis')
    if lod == 0:
        sd = ob.modifiers.new('sub', 'SUBSURF'); sd.levels = 1; sd.render_levels = 1
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    for m in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    dec = ob.modifiers.new('dec', 'DECIMATE'); dec.ratio = 0.5 if lod == 0 else 0.45
    bpy.ops.object.modifier_apply(modifier='dec')
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.quads_convert_to_tris(); bpy.ops.object.mode_set(mode='OBJECT')
    # colour each face by the bone it is nearest to
    seg = [(a, b, Vector(J[a]), Vector(J[b])) for a, b in E]
    def nearest(p):
        # distance to the skin surface, not the bone, so a hand resting on the body doesn't colour it
        best, bc = 1e9, None
        for a, b, A, B in seg:
            ab = B - A; t = max(0, min(1, (p - A).dot(ab) / max(ab.dot(ab), 1e-9)))
            d = (A + ab * t - p).length - (R[a][0] * (1 - t) + R[b][0] * t)
            if d < best: best, bc = d, (a, b, t)
        return bc
    for poly in me.polygons: poly.use_smooth = True
    for an in ('sharp_edge', 'sharp_face'):
        if an in me.attributes: me.attributes.remove(me.attributes[an])
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); me.color_attributes.active_color = attr
    for poly in me.polygons:
        c = poly.center; a, b, t = nearest(c)
        col = part_colour(a, b, c.z)
        for li in poly.loop_indices: attr.data[li].color = col
    # the helmet: white shell, dark visor across the front
    hx, hy, hz = J['head']
    bm = bmesh.new()
    seg_u, seg_v = (14, 10) if lod == 0 else (8, 6)
    bmesh.ops.create_uvsphere(bm, u_segments=seg_u, v_segments=seg_v, radius=0.145)
    for v in bm.verts:
        v.co.x *= 1.06; v.co.z *= 1.0
        v.co += Vector((hx + 0.005, hy, hz + 0.02))
    hm = bpy.data.meshes.new('helmet'); bm.to_mesh(hm); bm.free()
    hob = bpy.data.objects.new('helmet', hm); bpy.context.collection.objects.link(hob)
    hattr = hm.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); hm.color_attributes.active_color = hattr
    for poly in hm.polygons:
        n = poly.normal; c = poly.center
        visor = n.x > 0.45 and hz - 0.04 < c.z < hz + 0.07
        col = (0.03, 0.035, 0.05, 0.0) if visor else (0.96, 0.96, 0.97, 0.0)
        for li in poly.loop_indices: hattr.data[li].color = col
    for p in hm.polygons: p.use_smooth = True
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True); hob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.join()
    return ob

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    report = {}
    mat = bpy.data.materials.new('crew'); mat.use_nodes = True
    for pose in ('stand', 'kneel', 'cheer', 'pump', 'watch', 'despair'):
        for lod in (0, 1):
            ob = figure(pose, lod)
            ob.data.materials.append(mat)
            report[ob.name] = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    os.makedirs(f'{root}/assets/people', exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=f'{root}/art/people/crew.blend')
    out = f'{root}/assets/people/crew.glb'
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_yup=True,
        export_vertex_color='ACTIVE', export_normals=True, export_materials='EXPORT')
    report['bytes'] = os.path.getsize(out)
    print('REPORT', json.dumps(report))

if __name__ == '__main__':
    main()
