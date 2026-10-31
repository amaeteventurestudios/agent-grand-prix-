# Renders a garage picture of a built car in its default livery: a three-quarter front view on a
# transparent background with a soft contact shadow, for the car tiles.
# blender -b art/cars/<name>.blend -P art/cars/thumb.py -- out.png c1 c2 glow [width height]
import sys, bpy, math, os
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
sys.argv = ['blender', '--', a[0], '0', a[1], a[2], a[3], '34']
here = os.path.dirname(__file__)
# reuse render.py's livery material and studio, then change the camera and background
src = open(os.path.join(here, 'render.py')).read()
src = src.split("for k, p in [(k, views[k]) for k in only]:")[0]
exec(compile(src, 'render.py', 'exec'))
sc = bpy.context.scene
sc.render.film_transparent = True
sc.render.resolution_x, sc.render.resolution_y = 720, 420
sc.cycles.samples = int(os.environ.get("SAMPLES", 96))
floor = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Plane')][0]
floor.is_shadow_catcher = True
cam.data.lens = 40
sc.view_settings.exposure = 0.45
p = (6.6, 4.4, 2.5)
cam.location = p
d = Vector((0.3, 0.2, 0.4)) - Vector(p); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
