# AGP-08 Stratos: dark, with square-shouldered front-wheel nacelles whose mouths are framed in light
# (a bar under the roof and strips down both walls), bold accent bands from the nose tip back over the
# nacelle shoulders and along the pods, a tall bubble canopy, hooded rear wheels with an accent slash,
# and a wide rear wing on twin swan necks with accent upper faces.
import math
from mathutils import Vector
from carkit import *
from openwheel import build_car, lerp_table, rel_height, CAMS

MONO = [  # x, half-width, bottom, top, top roundness
    (2.86, 0.050, 0.128, 0.155, 2.2),
    (2.66, 0.160, 0.110, 0.212, 5.0),
    (2.34, 0.215, 0.102, 0.282, 5.0),
    (1.96, 0.235, 0.098, 0.360, 4.4),
    (1.54, 0.250, 0.096, 0.440, 3.8),
    (1.10, 0.270, 0.095, 0.515, 3.3),
    (0.66, 0.305, 0.093, 0.560, 3.0),
    (0.24, 0.316, 0.092, 0.572, 3.0),
    (-0.24, 0.304, 0.092, 0.586, 3.0),
    (-0.72, 0.272, 0.096, 0.660, 2.9),
    (-1.20, 0.222, 0.106, 0.680, 2.7),
    (-1.62, 0.168, 0.124, 0.588, 2.5),
    (-1.98, 0.122, 0.158, 0.456, 2.2),
    (-2.26, 0.072, 0.205, 0.342, 2.0),
]
POD = [  # x, centre y, half-width, bottom, top
    (1.00, 0.47, 0.080, 0.250, 0.400),
    (0.88, 0.51, 0.175, 0.200, 0.470),
    (0.50, 0.54, 0.220, 0.160, 0.510),
    (-0.10, 0.55, 0.222, 0.140, 0.510),
    (-0.70, 0.52, 0.200, 0.130, 0.490),
    (-1.15, 0.46, 0.165, 0.135, 0.450),
    (-1.50, 0.37, 0.105, 0.150, 0.375),
    (-1.76, 0.27, 0.038, 0.165, 0.292),
]

def mono_rule(p, n):
    h = rel_height(MONO, p)
    if h < 0.3 or p.x < -1.9: return CF
    # two bold bands fanning back from the nose tip to the cockpit sides
    if 0.6 < p.x < 2.76 and n.z > 0.2:
        c = 0.035 + (2.76 - p.x) * 0.105
        if abs(abs(p.y) - c) < 0.04: return P2
    return P1

def pod_rule(s):
    def r(p, n):
        x = p.x
        if x > 0.92 and n.x > 0.5: return CF
        if rel_height(POD, p, 3, 4) < 0.3: return CF
        yc, hw = lerp_table(POD, x, 1), lerp_table(POD, x, 2)
        # the nose bands carry on along the pod tops, then turn down the flank near the back
        if -1.3 < x < 0.9 and n.z > 0.1 and abs(abs(p.y) - (yc - 0.1 * hw)) < 0.04: return P2
        if -1.45 < x < -1.25 and abs(p.y) > yc + 0.2 * hw: return P2
        if abs(p.y) > yc + 0.45 * hw and -1.0 < x < 0.7 and p.z < 0.34: return CF
        return P1
    return r

def nacelle_paint(s, hub, p, n, u):
    inward = (p.y - hub.y) * s
    if n.z < -0.3 and 0.03 < u < 0.09 and abs(inward) < 0.17: return GLOW   # light bar under the roof
    if 0.02 < u < 0.08 and abs(abs(inward) - 0.19) < 0.02 and abs(n.y) > 0.3 and p.z < hub.z + 0.25: return GLOW   # strips down the inner walls
    if n.z < -0.3 or (abs(inward) < 0.19 and p.z < hub.z + 0.32 and n.z < 0.5): return CF
    if n.z > 0.15 and abs(inward + 0.1) < 0.045: return P2               # accent band over the inner shoulder
    if u < 0.03: return P2                                               # accent rim round the mouth
    return P1

def rfender_paint(s, hub, p, nn):
    out = p - hub; out.y = 0
    ang = math.degrees(math.atan2(out.z, out.x))
    if (p.y - hub.y) * s > 0.19 and 100 < ang < 120: return P2          # an accent slash on the hood
    if ang > 186: return GLOW                                           # tail light at the hood's trailing edge
    return P1 if (p.y - hub.y) * s > -0.19 else CF

SPEC = dict(
    MONO=MONO, POD=POD, mono_rule=mono_rule, pod_rule=pod_rule,
    nacelle=dict(x=(2.46, 1.3), hw=((2.46, 0.235), (1.9, 0.245), (1.3, 0.24)), top=((2.46, 0.62), (1.95, 0.72), (1.3, 0.66)),
                 zb=((2.46, 0.07), (2.05, 0.07), (1.72, 0.3), (1.3, 0.47)), t=0.035),
    nacelle_paint=nacelle_paint,
    mouth_paint=lambda p, n, u: GLOW if u < 0.12 and (n.z > 0.5 or n.x > 0.5) else CF,
    cheek=((0.22, 2.32, 0.25, 0.4, -2), (0.42, 2.3, 0.32, 0.38, -5), (0.6, 2.26, 0.4, 0.34, -9)), cheek_paint=lambda p, n: CF,
    fwing=((0.06, 0.42, 2.96, 3, 0.02), (0.125, 0.26, 2.72, 15, 0.015)),
    fwing_span=1.04, fwing_sweep=0.08, fwing_rise=0.0,
    fwing_paint=lambda k, p, n, u: P2 if k == 1 and u > 0.7 else CF,
    fplate=None, barge=False,
    fenders=(('RL', (16, 198, 0.07, 0.11, 0.12)),), fender_paint=rfender_paint, fender_smooth=0.01,
    rwing=((1.0, 0.38, -1.94, 5, 0.022), (1.13, 0.22, -2.24, 24, 0.015)), rwing_span=0.76,
    rwing_paint=lambda k, p, n: P2 if n.z > 0.3 and k == 0 else CF,
    rplate=((-1.88, 0.86, 1.1), (-2.2, 0.76, 1.22), (-2.54, 0.72, 1.28)),
    rplate_paint=lambda p, n: GLOW if p.x < -2.48 and p.z > 1.0 else (P2 if p.z > 1.18 else CF),
    pylons=(-0.2, 0.2),
    airbox=((-0.48, 0.1, 0.8), (-0.6, 0.12, 0.84), (-0.94, 0.1, 0.77), (-1.24, 0.04, 0.67)),
    airbox_paint=lambda p, n: CF if n.x > 0.6 else (P2 if p.z > 0.82 else P1),
    fin=((-1.0, 0.66, 0.76), (-1.55, 0.6, 0.87), (-1.92, 0.52, 0.94)), fin_paint=lambda p, n: CF,
    glass=((1.12, 0.04, 0.5), (0.86, 0.22, 0.71), (0.45, 0.3, 0.86), (0.05, 0.31, 0.88), (-0.32, 0.24, 0.8), (-0.55, 0.11, 0.72), (-0.66, 0.02, 0.68)), glass_zb=0.44,
    helmet_x=0.16, wheel_ring=P2,
)

def build(lod):
    return build_car(SPEC, lod)
