# Drivers for the podium celebration in Agent Grand Prix, built headless in Blender:
#   blender -b --factory-startup -P art/people/driver.py
#   npx gltfpack@0.22.0 -i assets/people/driver.glb -o assets/people/driver.glb -cc -kn -km -vp 14 -vn 8 -vc 8
# The same skinned figure as the pit crew (art/people/people.py), in the poses a driver needs after
# the flag: waving, one- and two-handed fist pumps, running to the crew, leaping on them, a trophy
# held over the head, and champagne sprayed or poured. One level of detail: there are only three.
# Vertex alpha 1 marks the race suit the game tints with the team colour.
import bpy, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import people
from people import ARMS, BODY, figure, root

# arms: (elbow, wrist, hand) per side, +1 the figure's left
ARMS.update({
    # a hand raised high and open, out to the side
    'wave': {1: ((0.0, 0.42, 1.62), (0.0, 0.52, 1.86), (0.0, 0.55, 1.96)), -1: ARMS['pump'][-1]},
    # one fist pump, on the way down: the fist at the shoulder, the elbow tucked in
    'pumpd': {1: ((0.08, 0.34, 1.3), (0.13, 0.31, 1.54), (0.14, 0.29, 1.62)), -1: ARMS['pump'][-1]},
    # both fists pumped down to the shoulders, elbows out (the other half is 'cheer', both arms up)
    'fists': {1: ((0.06, 0.38, 1.3), (0.1, 0.34, 1.55), (0.11, 0.31, 1.63)), -1: ((0.06, -0.38, 1.3), (0.1, -0.34, 1.55), (0.11, -0.31, 1.63))},
    # both hands together over the head, holding the trophy
    'hold': {1: ((0.02, 0.32, 1.76), (0.04, 0.16, 2.0), (0.05, 0.08, 2.08)), -1: ((0.02, -0.32, 1.76), (0.04, -0.16, 2.0), (0.05, -0.08, 2.08))},
    # the bottle out in front at chest height, both hands on it, aimed a little up
    'spray': {1: ((0.2, 0.24, 1.28), (0.42, 0.11, 1.4), (0.5, 0.05, 1.45)), -1: ((0.2, -0.24, 1.28), (0.42, -0.11, 1.4), (0.5, -0.05, 1.45))},
    # one arm high and forward, tipping the bottle over someone's head
    'pour': {1: ARMS['pump'][-1], -1: ((0.16, -0.25, 1.76), (0.32, -0.16, 1.98), (0.4, -0.11, 2.05))},
})
# the hand on the hip in 'pump' sits on the right; on the left for the arms copied across above
ARMS['pour'][1] = tuple((x, -y, z) for x, y, z in ARMS['pump'][-1])

def stride(s):
    # running, mid-stride: the s-side leg forward, the other pushing off behind, arms swinging the other way
    a, b = ('L', 'R') if s > 0 else ('R', 'L')
    ya, yb = (0.11, -0.11) if s > 0 else (-0.11, 0.11)
    return {
        'pelvis': (0.03, 0, 0.97), 'spine': (0.06, 0, 1.19), 'chest': (0.1, 0, 1.38), 'neck': (0.13, 0, 1.55), 'head': (0.16, 0, 1.66),
        f'sho{a}': (0.09, ya * 1.8, 1.45), f'sho{b}': (0.09, yb * 1.8, 1.45),
        f'kne{a}': (0.3, ya, 0.66), f'ank{a}': (0.26, ya, 0.27), f'toe{a}': (0.4, ya, 0.24),
        f'kne{b}': (-0.06, yb, 0.52), f'ank{b}': (-0.36, yb, 0.4), f'toe{b}': (-0.44, yb, 0.3),
        # the arm on the forward leg's side swings back, the other forward and bent
        f'elb{a}': (-0.14, ya * 2.3, 1.2), f'wri{a}': (-0.2, ya * 2.4, 1.0), f'han{a}': (-0.19, ya * 2.4, 0.92),
        f'elb{b}': (0.2, yb * 2.2, 1.22), f'wri{b}': (0.36, yb * 2.0, 1.4), f'han{b}': (0.4, yb * 1.9, 1.46),
    }
BODY.update({
    'run1': stride(1), 'run2': stride(-1),
    # leaping onto the crew: knees up, arms flung wide and high
    'leap': {
        'pelvis': (0.02, 0, 0.98), 'spine': (0.07, 0, 1.2), 'chest': (0.12, 0, 1.39), 'neck': (0.15, 0, 1.56), 'head': (0.17, 0, 1.68),
        'kneL': (0.3, 0.14, 0.78), 'ankL': (0.08, 0.14, 0.5), 'toeL': (0.2, 0.14, 0.44),
        'kneR': (0.26, -0.14, 0.72), 'ankR': (0.02, -0.14, 0.46), 'toeR': (0.14, -0.14, 0.4),
        'elbL': (0.12, 0.38, 1.62), 'wriL': (0.24, 0.5, 1.84), 'hanL': (0.28, 0.53, 1.92),
        'elbR': (0.12, -0.38, 1.62), 'wriR': (0.24, -0.5, 1.84), 'hanR': (0.28, -0.53, 1.92),
    },
})
POSES = ('stand', 'wave', 'pump', 'pumpd', 'cheer', 'fists', 'run1', 'run2', 'leap', 'hold', 'spray', 'pour')

bpy.ops.wm.read_factory_settings(use_empty=True)
report = {}
mat = bpy.data.materials.new('driver'); mat.use_nodes = True
for pose in POSES:
    ob = figure(pose, 0)
    ob.name = f'driver_{pose}'
    ob.data.materials.append(mat)
    report[ob.name] = sum(len(p.vertices) - 2 for p in ob.data.polygons)
bpy.ops.wm.save_as_mainfile(filepath=f'{root}/art/people/driver.blend')
out = f'{root}/assets/people/driver.glb'
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_yup=True,
    export_vertex_color='ACTIVE', export_normals=True, export_materials='EXPORT')
report['bytes'] = os.path.getsize(out)
print('REPORT', json.dumps(report))
