# Renders an app picture of a built car: a low front three-quarter view in a dark cobalt studio at night,
# with a glossy floor, a blue rim light and a thin lime kicker, for the phone app's cards.
# blender -b art/cars/<name>.blend -P art/cars/hero.py -- out.png c1 c2 glow [width height]
import sys, bpy, math, os
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
W, H = (int(a[4]), int(a[5])) if len(a) > 5 else (1200, 675)
sys.argv = ['blender', '--', a[0], '0', a[1], a[2], a[3], '34']
here = os.path.dirname(__file__)
# reuse render.py's livery material, then light our own studio
src = open(os.path.join(here, 'render.py')).read()
src = src.split("for k, p in [(k, views[k]) for k in only]:")[0]
exec(compile(src, 'render.py', 'exec'))
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.cycles.samples = 80
sc.view_settings.look = 'AgX - Punchy'
bg = sc.world.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.004, 0.008, 0.022, 1); bg.inputs[1].default_value = 1.0
for o in [o for o in bpy.data.objects if o.type == 'LIGHT']: bpy.data.objects.remove(o)
floor = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Plane')][0]
fb = floor.data.materials[0].node_tree.nodes['Principled BSDF']
fb.inputs['Base Color'].default_value = (0.006, 0.012, 0.03, 1); fb.inputs['Roughness'].default_value = 0.18
def area(name, loc, target, size, energy, color):
    L = bpy.data.lights.new(name, 'AREA'); L.size = size; L.energy = energy; L.color = color
    o = bpy.data.objects.new(name, L); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); return o
area('key', (4.5, 3.5, 4.5), (0, 0, 0.3), 4.0, 900, (0.9, 0.95, 1.0))
area('rim', (-5.0, -2.5, 2.2), (0, 0, 0.4), 5.0, 1600, (0.15, 0.38, 1.0))
area('top', (0, 0, 6.5), (0, 0, 0), 6.0, 300, (0.5, 0.65, 1.0))
area('kick', (2.0, -5.5, 0.6), (0, 0, 0.4), 1.5, 450, (0.78, 1.0, 0.24))
# a long glowing strip on the floor behind the car, like a pit-lane light
bpy.ops.mesh.primitive_plane_add(size=1, location=(-3.2, 0, 0.005)); strip = bpy.context.object
strip.scale = (0.12, 18, 1)
sm = bpy.data.materials.new('strip'); sm.use_nodes = True; e = sm.node_tree.nodes['Principled BSDF']
e.inputs['Emission Color'].default_value = (0.12, 0.35, 1.0, 1); e.inputs['Emission Strength'].default_value = 8
strip.data.materials.append(sm)
cam.data.lens = 32
p = (6.3, 3.7, 1.1)
cam.location = p
d = Vector((0.0, 0.25, 0.45)) - Vector(p); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
