# AGP-01 Falcon: front wheels inside tall nacelles with open intake mouths and light strips down
# their leading edges, a long low nose between them with accent bands sweeping back to the cockpit,
# a big bubble canopy, sidepods with a deep cut and a bold accent sweep up to the rear haunch,
# hooded rear wheels, and a broad rear wing on twin swan necks with accent edges.
import math
from mathutils import Vector
from carkit import *
from openwheel import build_car, lerp_table, rel_height, CAMS

MONO = [  # x, half-width, bottom, top, top roundness
    (2.80, 0.050, 0.130, 0.160, 2.2),
    (2.60, 0.150, 0.112, 0.215, 4.0),
    (2.28, 0.205, 0.104, 0.285, 4.0),
    (1.90, 0.225, 0.100, 0.365, 3.6),
    (1.48, 0.240, 0.098, 0.445, 3.2),
    (1.06, 0.262, 0.096, 0.525, 3.0),
    (0.62, 0.300, 0.094, 0.570, 3.0),
    (0.20, 0.312, 0.092, 0.582, 3.0),
    (-0.25, 0.300, 0.092, 0.598, 3.0),
    (-0.72, 0.268, 0.096, 0.670, 2.9),
    (-1.20, 0.218, 0.106, 0.690, 2.7),
    (-1.62, 0.166, 0.124, 0.595, 2.5),
    (-1.98, 0.122, 0.158, 0.460, 2.2),
    (-2.26, 0.072, 0.205, 0.345, 2.0),
]
POD = [  # x, centre y, half-width, bottom, top
    (0.98, 0.46, 0.080, 0.250, 0.400),
    (0.86, 0.50, 0.170, 0.200, 0.470),
    (0.50, 0.53, 0.215, 0.160, 0.505),
    (-0.10, 0.53, 0.215, 0.140, 0.500),
    (-0.70, 0.50, 0.195, 0.130, 0.480),
    (-1.15, 0.45, 0.160, 0.135, 0.440),
    (-1.50, 0.36, 0.100, 0.150, 0.370),
    (-1.76, 0.26, 0.035, 0.165, 0.290),
]

def band(p):
    # the accent bands: from the nose tip back along the nose shoulders to the cockpit sides
    if not 0.55 < p.x < 2.72: return 9
    c = 0.04 + (2.72 - p.x) * 0.1
    return abs(abs(p.y) - c) / 0.04

def mono_rule(p, n):
    h = rel_height(MONO, p)
    if h < 0.3 or p.x < -1.9: return CF
    if n.z > 0.2 and band(p) < 1: return P2
    return P1

def pod_rule(s):
    def r(p, n):
        x = p.x
        if x > 0.9 and n.x > 0.5: return CF                        # the inlet
        if rel_height(POD, p, 3, 4) < 0.3: return CF
        yc, hw = lerp_table(POD, x, 1), lerp_table(POD, x, 2)
        if abs(p.y) > yc + 0.3 * hw:
            # a bold accent sweep rising from low at the front to the top of the pod at the back
            zc = 0.26 + 0.17 * max(0.0, min(1.0, (0.7 - x) / 2.1))
            if abs(p.z - zc) < 0.045 and -1.55 < x < 0.85: return P2
            if p.z < zc - 0.045 and x > -1.2: return CF            # a carbon cut below it
        return P1
    return r

def nacelle_paint(s, hub, p, n, u):
    inward = (p.y - hub.y) * s                                      # + outboard of the wheel's centre
    if n.x > 0.7 and u < 0.03: return CF                            # the mouth's rim
    if n.z < -0.3 or (abs(inward) < 0.2 and n.z < 0.3 and p.z < hub.z + 0.3): return CF   # inside the shell
    if 0.025 < u < 0.065 and inward > 0.16 and n.y * s > 0.15 and p.z > 0.12: return GLOW   # light strip down the leading edge
    if n.z > 0.3 and abs(inward + 0.08) < 0.05: return P2           # an accent stripe over the top
    return P1

def rfender_paint(s, hub, p, nn):
    out = p - hub; out.y = 0
    ang = math.degrees(math.atan2(out.z, out.x))
    if (p.y - hub.y) * s > 0.19 and ang > 150: return GLOW         # light at the back of the haunch
    if (p.y - hub.y) * s < -0.19: return P2
    return P1

SPEC = dict(
    MONO=MONO, POD=POD, mono_rule=mono_rule, pod_rule=pod_rule,
    nacelle=dict(x=(2.34, 1.32), hw=((2.34, 0.22), (1.32, 0.235)), top=((2.34, 0.56), (1.9, 0.7), (1.32, 0.66)),
                 zb=((2.34, 0.07), (2.0, 0.08), (1.7, 0.3), (1.32, 0.46)), t=0.035),
    nacelle_paint=nacelle_paint,
    cheek=((0.2, 2.22, 0.27, 0.36, -3), (0.42, 2.18, 0.36, 0.34, -6), (0.62, 2.1, 0.47, 0.3, -12)), cheek_paint=lambda p, n: P2 if n.z > 0.3 else CF,
    fwing=((0.06, 0.44, 2.9, 3, 0.02), (0.13, 0.28, 2.66, 14, 0.015)),
    fwing_span=1.0, fwing_sweep=0.12, fwing_rise=0.01,
    fwing_paint=lambda k, p, n, u: P2 if k == 1 and u > 0.6 else CF,
    fplate=None, mirrors=True, barge=False,
    fenders=(('RL', (24, 205, 0.06, 0.1, 0.1)),), fender_paint=rfender_paint, fender_smooth=0.01,
    rwing=((0.98, 0.36, -1.96, 5, 0.022), (1.11, 0.21, -2.24, 24, 0.015)), rwing_span=0.68,
    rwing_paint=lambda k, p, n: P2 if k == 1 and n.z > 0.2 else CF,
    rplate=((-1.9, 0.86, 1.1), (-2.2, 0.74, 1.2), (-2.5, 0.7, 1.26)),
    rplate_paint=lambda p, n: GLOW if p.x < -2.46 else (P2 if p.z > 1.17 else CF),
    pylons=(-0.22, 0.22),
    airbox=((-0.5, 0.1, 0.8), (-0.62, 0.12, 0.83), (-0.95, 0.1, 0.77), (-1.25, 0.04, 0.68)),
    airbox_paint=lambda p, n: CF if n.x > 0.6 else P2,
    fin=((-1.0, 0.66, 0.77), (-1.55, 0.6, 0.87), (-1.92, 0.52, 0.94)), fin_paint=lambda p, n: P2 if p.z > 0.82 else CF,
    glass=((1.12, 0.04, 0.5), (0.86, 0.21, 0.71), (0.45, 0.29, 0.86), (0.05, 0.3, 0.88), (-0.32, 0.23, 0.8), (-0.55, 0.11, 0.72), (-0.66, 0.02, 0.68)), glass_zb=0.44,
    helmet_x=0.18, wheel_ring=P2,
)

def build(lod):
    return build_car(SPEC, lod)
