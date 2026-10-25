# AGP-02 Vortex: a needle nose that climbs steeply to a long closed canopy, fully open front wheels
# on exposed wishbones, a wide front wing with light strips along its lowest element and down the
# endplates' leading edges, boxy sidepods with a deep undercut and an accent-framed inlet, accent
# lines along the nose and pods, glowing wheel rings, and a broad rear wing with lit endplate tips.
import math
from mathutils import Vector
from carkit import *
from openwheel import build_car, lerp_table, rel_height, CAMS

MONO = [  # x, half-width, bottom, top, top roundness
    (2.86, 0.045, 0.150, 0.178, 2.2),
    (2.66, 0.120, 0.132, 0.222, 3.4),
    (2.32, 0.170, 0.122, 0.285, 3.6),
    (1.92, 0.195, 0.116, 0.360, 3.4),
    (1.48, 0.215, 0.110, 0.450, 3.0),
    (1.06, 0.245, 0.104, 0.535, 2.8),
    (0.62, 0.290, 0.098, 0.585, 2.8),
    (0.22, 0.305, 0.094, 0.590, 3.0),
    (-0.25, 0.300, 0.094, 0.600, 3.0),
    (-0.72, 0.270, 0.096, 0.680, 2.9),
    (-1.20, 0.220, 0.106, 0.700, 2.7),
    (-1.62, 0.170, 0.124, 0.600, 2.5),
    (-1.98, 0.125, 0.160, 0.470, 2.2),
    (-2.24, 0.075, 0.210, 0.360, 2.0),
]
POD = [  # x, centre y, half-width, bottom, top
    (0.62, 0.50, 0.150, 0.215, 0.455),
    (0.50, 0.52, 0.200, 0.180, 0.480),
    (0.20, 0.53, 0.215, 0.150, 0.490),
    (-0.30, 0.51, 0.205, 0.125, 0.470),
    (-0.85, 0.43, 0.160, 0.115, 0.420),
    (-1.32, 0.33, 0.100, 0.120, 0.350),
    (-1.70, 0.24, 0.035, 0.140, 0.280),
]

def mono_rule(p, n):
    h = rel_height(MONO, p)
    if h < 0.3 or p.x < -1.9: return CF
    w = lerp_table(MONO, p.x, 1)
    # accent lines along the top edges of the nose, closing in to a point at the tip
    if 0.45 < p.x < 2.8 and n.z > 0.15 and abs(abs(p.y) - 0.55 * w) < 0.022: return P2
    # a centre stripe up the nose
    if 1.2 < p.x < 2.84 and abs(p.y) < 0.018 and n.z > 0.5: return P2
    return P1

def pod_rule(s):
    def r(p, n):
        x = p.x
        if x > 0.55 and n.x > 0.6: return CF                       # the inlet
        if x > 0.5 and n.x > 0.3: return P2                        # its accent frame
        if rel_height(POD, p, 3, 4) < 0.3: return CF               # undercut
        zt = lerp_table(POD, x, 4)
        if -1.45 < x < 0.45 and abs(p.z - (zt - 0.07)) < 0.016 and abs(p.y) > lerp_table(POD, x, 1): return P2   # a line along the shoulder
        return P1
    return r

SPEC = dict(
    MONO=MONO, POD=POD, mono_rule=mono_rule, pod_rule=pod_rule,
    fwing=((0.08, 0.42, 2.98, 3, 0.02), (0.15, 0.27, 2.7, 12, 0.015), (0.215, 0.19, 2.5, 22, 0.013)),
    fwing_span=1.04, fwing_sweep=0.16, fwing_rise=0.03,
    # a light strip along the trailing edge of the lowest element, outboard of the nose
    fwing_paint=lambda k, p, n, u: GLOW if k == 0 and n.z > 0.3 and 0.62 < u < 0.86 and 0.32 < abs(p.y) < 0.98 else (P2 if k == 2 and abs(p.y) > 0.7 else CF),
    fplate=((2.94, 0.05, 0.16), (2.78, 0.05, 0.37), (2.45, 0.06, 0.37), (2.2, 0.08, 0.2)), fplate_y=1.02,
    fplate_paint=lambda s, p, n: GLOW if p.x > 2.74 and n.x > 0.4 else (P2 if n.y * s < -0.5 and p.z > 0.3 else CF),
    rwing=((0.96, 0.36, -1.92, 5, 0.022), (1.1, 0.22, -2.2, 24, 0.015)), rwing_span=0.7,
    rwing_paint=lambda k, p, n: P2 if k == 1 and n.z > 0.2 else CF,
    rplate=((-1.86, 0.92, 1.12), (-2.15, 0.7, 1.22), (-2.46, 0.66, 1.3)),
    rplate_paint=lambda p, n: GLOW if p.z > 1.17 and p.x < -2.0 else CF,
    pylons=(0.0,),
    airbox=((-0.42, 0.11, 0.76), (-0.62, 0.13, 0.8), (-0.95, 0.1, 0.76), (-1.2, 0.04, 0.7)),
    airbox_paint=lambda p, n: CF if n.x > 0.6 else P1,
    fin=((-1.0, 0.68, 0.78), (-1.6, 0.58, 0.9), (-1.92, 0.5, 0.96)), fin_paint=lambda p, n: GLOW if p.z > 0.87 else CF,
    glass=((1.2, 0.03, 0.5), (0.95, 0.15, 0.64), (0.55, 0.25, 0.78), (0.15, 0.27, 0.82), (-0.2, 0.22, 0.79), (-0.45, 0.1, 0.72), (-0.55, 0.02, 0.68)), glass_zb=0.46,
    helmet_x=0.12, wheel_ring=GLOW, barge=False,
)

def build(lod):
    return build_car(SPEC, lod)
