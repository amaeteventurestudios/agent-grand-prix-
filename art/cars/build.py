# Builds one car in three levels of detail and exports assets/vehicles/<name>/<name>.glb.
# blender -b --factory-startup -P art/cars/build.py -- falcon [--render out.png]
import sys, os, importlib, importlib.util, json
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from carkit import *

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['falcon']
name = args[0]
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
# load the car's file by path: a bare import can pick up a Blender module of the same name (manta)
_sp = importlib.util.spec_from_file_location('car_' + name, os.path.join(os.path.dirname(__file__), name + '.py'))
spec = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(spec)
reset()
mats = {}
def mat(key, rgba, rough, metal=0.0, alpha=1.0):
    m = bpy.data.materials.new(key); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = rgba; b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal; b.inputs['Alpha'].default_value = alpha
    if alpha < 1: m.blend_method = 'BLEND'
    mats[key] = m; return m
livery = mat('livery', (1, 1, 1, 1), 0.35)
glassm = mat('glass', (0.02, 0.03, 0.04, 1), 0.05, 0.0, 0.55)

report = {}
for lod in range(3):
    grp = bpy.data.objects.new(f'{name}_LOD{lod}', None); bpy.context.collection.objects.link(grp)
    car, glass, wheels = spec.build(lod)
    car.data.materials.append(livery); glass.data.materials.append(glassm)
    for w in wheels: w.data.materials.append(livery)
    for o in [car, glass] + wheels:
        o.parent = grp; o.name = f'{o.name}_L{lod}'
    report[f'LOD{lod}'] = {'tris': tris(car) + tris(glass) + sum(tris(w) for w in wheels), 'meshes': 2 + len(wheels)}
    if lod == 0:
        for k, v in spec.CAMS.items(): empty(k, v, grp)
    grp.location.y = 0
os.makedirs(f'{root}/assets/vehicles/{name}', exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=f'{root}/art/cars/{name}.blend')
out = f'{root}/assets/vehicles/{name}/{name}.glb'
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_yup=True,
    export_vertex_color='ACTIVE', export_normals=True, export_materials='EXPORT', export_extras=False)
report['bytes'] = os.path.getsize(out)
print('REPORT', json.dumps(report))
