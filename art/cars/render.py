# Renders a four-view check sheet of a built car (LOD0, or the LOD given) with a team livery.
# blender -b art/cars/<name>.blend -P art/cars/render.py -- out_prefix [lod] [c1] [c2]
import sys, bpy, math
from mathutils import Vector
args = sys.argv[sys.argv.index('--') + 1:]
out, lod = args[0], int(args[1]) if len(args) > 1 else 0
hexc = lambda h: tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)) + (1,)
lin = lambda c: tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c[:3]) + (1,)
c1 = lin(hexc(args[2] if len(args) > 2 else '#c6f53a')); c2 = lin(hexc(args[3] if len(args) > 3 else '#1b1d22'))
for o in bpy.data.objects:
    if o.type == 'EMPTY' and '_LOD' in o.name:
        keep = o.name.endswith(f'LOD{lod}')
        for ch in o.children: ch.hide_render = not keep
m = bpy.data.materials['livery']; nt = m.node_tree; N = nt.nodes; L = nt.links
b = N['Principled BSDF']
a = N.new('ShaderNodeVertexColor'); a.layer_name = 'Col'
sep = N.new('ShaderNodeSeparateColor'); L.new(a.outputs['Color'], sep.inputs[0])
def mix(c_a, c_b, fac):
    n = N.new('ShaderNodeMix'); n.data_type = 'RGBA'
    if isinstance(c_a, tuple): n.inputs[6].default_value = c_a
    else: L.new(c_a, n.inputs[6])
    n.inputs[7].default_value = c_b; L.new(fac, n.inputs[0]); return n.outputs[2]
carbon = (0.012, 0.013, 0.016, 1)
glow = tuple(min(1, x * 1.0) for x in c1[:3]) + (1,)
col = mix(mix(mix(carbon, c1, sep.outputs[0]), c2, sep.outputs[1]), (1, 1, 1, 1), sep.outputs[2])
L.new(col, b.inputs['Base Color'])
r = N.new('ShaderNodeMath'); r.operation = 'MULTIPLY_ADD'; r.inputs[1].default_value = -0.6; r.inputs[2].default_value = 0.85
L.new(a.outputs['Alpha'], r.inputs[0]); L.new(r.outputs[0], b.inputs['Roughness'])
b.inputs['Coat Weight'].default_value = 0.6
em = N.new('ShaderNodeMath'); em.operation = 'MULTIPLY'; em.inputs[1].default_value = 6
L.new(sep.outputs[2], em.inputs[0]); L.new(em.outputs[0], b.inputs['Emission Strength'])
b.inputs['Emission Color'].default_value = (0.85, 0.95, 1, 1)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 48; sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 960, 540
sc.view_settings.view_transform = 'AgX'
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.75, 0.78, 0.82, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.9
bpy.ops.mesh.primitive_plane_add(size=60)
fl = bpy.data.materials.new('floor'); fl.use_nodes = True
fl.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.5, 0.5, 0.52, 1); fl.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.25
bpy.context.object.data.materials.append(fl)
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 3.5; sun.rotation_euler = (math.radians(40), math.radians(15), math.radians(-30))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 50
views = {'34': (6.5, 4.8, 3.0), 'side': (0.0, 9.0, 0.9), 'rear': (-6.5, -4.2, 2.4), 'top': (0.01, 0.0, 11)}
for k, p in views.items():
    cam.location = p
    d = Vector((0, 0, 0.35)) - Vector(p); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{out}_{k}.png'; bpy.ops.render.render(write_still=True)
