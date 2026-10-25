# AGP-07 Kestrel: graphite, with big wing-like carbon fenders wrapped over the top and front of the
# front wheels and over the top and back of the rear ones, a row of light dots down each front
# fender's leading edge, a wide twin-keel nose, accent edges on the fenders and front wing, accent
# mirrors, an airbox with an accent crest and a rear wing hung from a swan-neck pylon.
import math
from mathutils import Vector
from carkit import *
from openwheel import build_car, lerp_table, rel_height, CAMS

MONO = [  # x, half-width, bottom, top, top roundness
    (2.90, 0.070, 0.150, 0.180, 2.6),
    (2.74, 0.190, 0.130, 0.225, 5.5),
    (2.44, 0.245, 0.118, 0.280, 5.5),
    (2.04, 0.255, 0.110, 0.345, 5.0),
    (1.60, 0.255, 0.104, 0.420, 4.4),
    (1.14, 0.258, 0.100, 0.495, 3.8),
    (0.72, 0.292, 0.096, 0.545, 3.4),
    (0.30, 0.302, 0.092, 0.560, 3.3),
    (-0.20, 0.294, 0.092, 0.575, 3.1),
    (-0.70, 0.262, 0.096, 0.680, 2.9),
    (-1.18, 0.214, 0.106, 0.700, 2.7),
    (-1.60, 0.162, 0.122, 0.590, 2.5),
    (-1.98, 0.120, 0.155, 0.455, 2.2),
    (-2.26, 0.070, 0.200, 0.340, 2.0),
]
POD = [  # x, centre y, half-width, bottom, top
    (0.66, 0.50, 0.110, 0.235, 0.430),
    (0.54, 0.52, 0.190, 0.190, 0.475),
    (0.24, 0.53, 0.210, 0.160, 0.495),
    (-0.28, 0.52, 0.200, 0.140, 0.480),
    (-0.78, 0.45, 0.168, 0.130, 0.445),
    (-1.22, 0.36, 0.120, 0.132, 0.385),
    (-1.58, 0.28, 0.065, 0.145, 0.315),
    (-1.80, 0.22, 0.025, 0.160, 0.270),
]

def mono_rule(p, n):
    h = rel_height(MONO, p)
    if h < 0.34 or p.x < -1.9: return CF
    w = lerp_table(MONO, p.x, 1)
    # accent edges where the flat nose deck meets its flanks, running back to the cockpit
    if 0.9 < p.x < 2.7 and n.z > 0.2 and abs(abs(p.y) - 0.8 * w) < 0.03: return P2
    return P1

def pod_rule(s):
    def r(p, n):
        x = p.x
        if x > 0.58 and n.x > 0.55: return CF
        if x > 0.5 and n.x > 0.3 and p.z > 0.38: return P2          # accent lip over the inlet
        if rel_height(POD, p, 3, 4) < 0.3: return CF
        yc, hw = lerp_table(POD, x, 1), lerp_table(POD, x, 2)
        # a carbon gill panel on the flank behind the inlet
        if abs(p.y) > yc + 0.5 * hw and -0.4 < x < 0.35 and 0.25 < p.z < 0.4: return CF
        return P1
    return r

def fender_paint(s, hub, p, nn):
    out = p - hub; out.y = 0
    ang = math.degrees(math.atan2(out.z, out.x))
    outer = (p.y - hub.y) * s
    front = hub.x > 0
    if front and outer > 0.17 and nn.y * s > 0.5 and ang < 62:
        # a column of short light dashes down the middle of the skirt's leading edge
        rad = out.length
        return GLOW if -38 < ang < 58 and 0.33 < rad < 0.37 and (ang + 40) % 12 < 5.5 else CF
    if outer < -0.17: return P2                                    # accent inner edge
    if not front and ang > 175: return P2                          # accent trailing edge at the rear
    return CF

SPEC = dict(
    MONO=MONO, POD=POD, mono_rule=mono_rule, pod_rule=pod_rule,
    fwing=((0.07, 0.44, 3.02, 2, 0.02), (0.13, 0.3, 2.78, 10, 0.015), (0.19, 0.22, 2.6, 18, 0.013)),
    fwing_span=1.06, fwing_sweep=0.28, fwing_rise=0.07,
    fwing_paint=lambda k, p, n, u: P2 if (k == 2 and u > 0.5) or (k == 0 and abs(p.y) > 0.9) else CF,
    fplate=((3.0, 0.04, 0.14), (2.82, 0.04, 0.34), (2.5, 0.05, 0.36), (2.24, 0.08, 0.2)), fplate_y=1.04,
    fplate_paint=lambda s, p, n: P2 if p.x > 2.92 or p.z > 0.32 else CF,
    fins=((0.32, CF),),
    fenders=(('FL', (-42, 152, 0.07, 0.13, 0.12)), ('RL', (28, 200, 0.07, 0.12, 0.09))), fender_paint=fender_paint, fender_smooth=0.008,
    rwing=((1.02, 0.36, -1.98, 5, 0.022), (1.16, 0.22, -2.26, 24, 0.015)), rwing_span=0.7,
    rwing_paint=lambda k, p, n: P2 if k == 1 and p.x < -2.4 else CF,
    rplate=((-1.92, 0.92, 1.16), (-2.22, 0.8, 1.28), (-2.56, 0.74, 1.36)),
    rplate_paint=lambda p, n: P2 if p.z > 1.26 else CF,
    pylons=(0.0,),
    airbox=((-0.34, 0.12, 0.82), (-0.46, 0.14, 0.87), (-0.86, 0.11, 0.8), (-1.22, 0.04, 0.69)),
    airbox_paint=lambda p, n: CF if n.x > 0.6 and p.z < 0.8 else (P2 if p.z > 0.85 and abs(p.y) < 0.04 else P1),
    fin=((-0.95, 0.68, 0.8), (-1.55, 0.6, 0.94), (-1.98, 0.5, 1.04)), fin_paint=lambda p, n: P2 if p.z > 0.9 else CF,
    helmet_x=0.2, wheel_ring=P2, barge=True,
)

def build(lod):
    return build_car(SPEC, lod)
