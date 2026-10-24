# AGP-03 Spectre: graphite, with rounded front-wheel nacelles whose intake mouths are lined in the
# accent colour and edged with light strips, a broad nose with twin accent bands, a low bubble canopy
# with accent shoulders, sculpted sidepods with deep accent-lined cuts, hooded rear wheels and a wide
# rear wing with accent tips on a single swan neck.
import math
from mathutils import Vector
from carkit import *
from openwheel import build_car, lerp_table, rel_height, CAMS

MONO = [  # x, half-width, bottom, top, top roundness
    (2.82, 0.060, 0.128, 0.155, 2.4),
    (2.62, 0.170, 0.110, 0.212, 4.6),
    (2.30, 0.225, 0.102, 0.282, 4.6),
    (1.92, 0.245, 0.098, 0.360, 4.0),
    (1.50, 0.258, 0.096, 0.440, 3.5),
    (1.08, 0.275, 0.095, 0.515, 3.2),
    (0.64, 0.310, 0.093, 0.555, 3.0),
    (0.22, 0.322, 0.092, 0.566, 3.0),
    (-0.24, 0.310, 0.092, 0.580, 3.0),
    (-0.72, 0.276, 0.096, 0.650, 2.9),
    (-1.20, 0.224, 0.106, 0.672, 2.7),
    (-1.62, 0.170, 0.124, 0.585, 2.5),
    (-1.98, 0.124, 0.158, 0.455, 2.2),
    (-2.26, 0.074, 0.205, 0.342, 2.0),
]
POD = [  # x, centre y, half-width, bottom, top
    (1.00, 0.47, 0.080, 0.250, 0.390),
    (0.88, 0.51, 0.175, 0.200, 0.460),
    (0.50, 0.54, 0.220, 0.160, 0.500),
    (-0.10, 0.54, 0.220, 0.140, 0.505),
    (-0.70, 0.51, 0.200, 0.130, 0.490),
    (-1.15, 0.46, 0.165, 0.135, 0.455),
    (-1.50, 0.37, 0.105, 0.150, 0.380),
    (-1.76, 0.27, 0.038, 0.165, 0.295),
]

def mono_rule(p, n):
    h = rel_height(MONO, p)
    if h < 0.3 or p.x < -1.9: return CF
    w = lerp_table(MONO, p.x, 1)
    if 0.7 < p.x < 2.7 and n.z > 0.25 and abs(abs(p.y) - (0.28 + 0.3 * (2.7 - p.x) / 2.0) * w) < 0.032: return P2
    if -0.6 < p.x < 1.0 and n.z > 0.1 and h > 0.8 and abs(p.y) > 0.2: return P2      # accent shoulders by the canopy
    return P1

def pod_rule(s):
    def r(p, n):
        x = p.x
        if x > 0.92 and n.x > 0.5: return P2                       # accent-lined inlet
        if rel_height(POD, p, 3, 4) < 0.3: return CF
        yc, hw = lerp_table(POD, x, 1), lerp_table(POD, x, 2)
        if abs(p.y) > yc + 0.35 * hw and -1.3 < x < 0.7:
            # a deep cut low in the flank: carbon, with an accent edge along its top
            t = (0.7 - x) / 2.0
            top = 0.36 - 0.1 * t
            if p.z < top: return CF
            if p.z < top + 0.04: return P2
        return P1
    return r

def nacelle_paint(s, hub, p, n, u):
    inward = (p.y - hub.y) * s
    if n.z < -0.3 or (abs(inward) < 0.19 and p.z < hub.z + 0.32 and n.z < 0.5):
        return P2 if u < 0.28 else CF                               # accent lining inside the mouth
    if 0.02 < u < 0.06 and abs(inward) > 0.16 and abs(n.y) > 0.15 and p.z > 0.12: return GLOW
    return P1

def rfender_paint(s, hub, p, nn):
    out = p - hub; out.y = 0
    ang = math.degrees(math.atan2(out.z, out.x))
    if (p.y - hub.y) * s < -0.19: return P2
    if ang > 160 and (p.y - hub.y) * s > 0.19: return P2
    return P1

SPEC = dict(
    MONO=MONO, POD=POD, mono_rule=mono_rule, pod_rule=pod_rule,
    nacelle=dict(x=(2.4, 1.3), hw=((2.4, 0.215), (1.9, 0.235), (1.3, 0.24)), top=((2.4, 0.5), (1.95, 0.7), (1.3, 0.66)),
                 zb=((2.4, 0.06), (2.05, 0.07), (1.7, 0.32), (1.3, 0.48)), t=0.035),
    nacelle_paint=nacelle_paint,
    cheek=((0.24, 2.3, 0.26, 0.38, -2), (0.44, 2.26, 0.33, 0.36, -5), (0.62, 2.2, 0.42, 0.32, -10)), cheek_paint=lambda p, n: P2 if n.z < 0 else CF,
    fwing=((0.055, 0.46, 2.96, 3, 0.02), (0.125, 0.3, 2.7, 15, 0.015)),
    fwing_span=1.02, fwing_sweep=0.1, fwing_rise=0.01,
    fwing_paint=lambda k, p, n, u: P2 if (k == 1 and u > 0.6) or (k == 0 and abs(p.y) < 0.6 and u > 0.8) else CF,
    fplate=None, barge=False,
    fenders=(('RL', (20, 200, 0.06, 0.1, 0.11)),), fender_paint=rfender_paint, fender_smooth=0.01,
    rwing=((0.96, 0.4, -1.92, 4, 0.022), (1.1, 0.24, -2.24, 22, 0.015)), rwing_span=0.74,
    rwing_paint=lambda k, p, n: P2 if abs(p.y) > 0.6 else CF,
    rplate=((-1.86, 0.84, 1.08), (-2.2, 0.72, 1.2), (-2.52, 0.7, 1.26)),
    rplate_paint=lambda p, n: P2 if p.z > 1.15 else CF,
    pylons=(0.0,),
    airbox=((-0.48, 0.1, 0.78), (-0.6, 0.12, 0.81), (-0.95, 0.1, 0.76), (-1.25, 0.04, 0.68)),
    airbox_paint=lambda p, n: P2 if n.x > 0.6 else P1,
    fin=((-1.0, 0.66, 0.75), (-1.55, 0.6, 0.86), (-1.92, 0.52, 0.93)), fin_paint=lambda p, n: P2 if p.z > 0.83 else CF,
    glass=((1.1, 0.04, 0.5), (0.85, 0.22, 0.69), (0.45, 0.3, 0.82), (0.05, 0.31, 0.84), (-0.32, 0.24, 0.78), (-0.55, 0.11, 0.71), (-0.66, 0.02, 0.67)), glass_zb=0.44,
    helmet_x=0.16, wheel_ring=P2,
)

def build(lod):
    return build_car(SPEC, lod)
