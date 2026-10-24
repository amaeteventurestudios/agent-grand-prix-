# AGP-04 Raptor: a broad, flat-topped nose split by an accent V, short carbon fenders hooked over the
# top and front of the front wheels with accent edges, a very wide front wing whose upper flap is lined
# in the accent colour and whose lowest element carries a light strip, tall angular endplates, sidepods
# with sharp accent shoulders, an accent-topped airbox, accent wheel rings and a tall rear wing with a
# light strip along its upper flap.
import math
from mathutils import Vector
from carkit import *
from openwheel import build_car, lerp_table, rel_height, CAMS

MONO = [  # x, half-width, bottom, top, top roundness
    (2.90, 0.060, 0.135, 0.160, 3.0),
    (2.74, 0.175, 0.118, 0.198, 6.0),
    (2.44, 0.225, 0.110, 0.250, 6.0),
    (2.04, 0.240, 0.104, 0.322, 5.2),
    (1.60, 0.245, 0.100, 0.405, 4.4),
    (1.14, 0.250, 0.098, 0.488, 3.8),
    (0.72, 0.295, 0.095, 0.545, 3.4),
    (0.30, 0.305, 0.092, 0.560, 3.3),
    (-0.20, 0.295, 0.092, 0.575, 3.1),
    (-0.70, 0.262, 0.096, 0.690, 2.9),
    (-1.18, 0.212, 0.106, 0.705, 2.7),
    (-1.60, 0.160, 0.122, 0.590, 2.5),
    (-1.98, 0.120, 0.155, 0.455, 2.2),
    (-2.26, 0.070, 0.200, 0.340, 2.0),
]
POD = [  # x, centre y, half-width, bottom, top
    (0.64, 0.51, 0.110, 0.240, 0.440),
    (0.52, 0.53, 0.190, 0.195, 0.480),
    (0.22, 0.54, 0.210, 0.160, 0.500),
    (-0.30, 0.52, 0.200, 0.140, 0.480),
    (-0.80, 0.45, 0.165, 0.130, 0.440),
    (-1.25, 0.36, 0.115, 0.135, 0.380),
    (-1.60, 0.27, 0.060, 0.150, 0.310),
    (-1.82, 0.22, 0.025, 0.165, 0.270),
]

def vee(p):
    # two accent bands running from the nose's outer corners back and in to meet ahead of the cockpit
    if not 1.05 < p.x < 2.82: return 9
    edge = 0.05 + (p.x - 1.05) * 0.092
    return abs(abs(p.y) - edge) / 0.026

def mono_rule(p, n):
    h = rel_height(MONO, p)
    if h < 0.32 or p.x < -1.9: return CF
    if n.z > 0.25 and vee(p) < 1: return P2
    if p.x < 0.9 and n.z > 0.4 and h > 0.9 and p.x > -0.45: return CF        # dark cockpit surround
    return P1 if p.x > -0.6 else CF

def pod_rule(s):
    def r(p, n):
        x = p.x
        if x > 0.58 and n.x > 0.55: return CF                       # the inlet
        if rel_height(POD, p, 3, 4) < 0.35: return CF               # undercut
        yc, hw = lerp_table(POD, x, 1), lerp_table(POD, x, 2)
        zt = lerp_table(POD, x, 4)
        # an accent flash on the shoulder, deep at the inlet and narrowing to a line along the pod
        if -1.3 < x < 0.6 and abs(p.y) > yc + 0.15 * hw:
            t = max(0.0, (0.6 - x) / 0.7)
            band = 0.022 + 0.04 * max(0.0, 1 - t)
            if abs(p.z - (zt - 0.075)) < band: return P2
        return CF if abs(p.y) > yc + 0.6 * hw else P1
    return r

def fender_paint(s, hub, p, nn):
    out = p - hub; out.y = 0
    # accent along the outer lip and the trailing edge of the hook
    if (p.y - hub.y) * s > 0.18: return P2
    if math.degrees(math.atan2(out.z, out.x)) > 108: return P2
    return CF

def airbox_paint(p, n):
    if n.x > 0.6 and p.z < 0.8: return CF
    return P2 if n.z > 0.35 else CF

SPEC = dict(
    MONO=MONO, POD=POD, mono_rule=mono_rule, pod_rule=pod_rule,
    fwing=((0.07, 0.46, 3.04, 2, 0.02), (0.13, 0.32, 2.78, 10, 0.016), (0.19, 0.24, 2.6, 18, 0.013), (0.25, 0.17, 2.46, 28, 0.011)),
    fwing_span=1.08, fwing_sweep=0.3, fwing_rise=0.08,
    fwing_paint=lambda k, p, n, u: GLOW if k == 0 and n.z > 0.3 and 0.55 < u < 0.8 and 0.4 < abs(p.y) < 0.95 else (P2 if k == 3 and u > 0.55 else CF),
    fplate=((3.02, 0.04, 0.14), (2.84, 0.04, 0.42), (2.52, 0.05, 0.44), (2.24, 0.08, 0.22)), fplate_y=1.06,
    fplate_paint=lambda s, p, n: P2 if (n.y * s > 0.5 and p.z > 0.26) or p.x > 2.94 else CF,
    fins=((0.72, P2),),
    fenders=(('FL', (-8, 118, 0.06, 0.1, 0.06)),), fender_paint=fender_paint,
    rwing=((0.98, 0.38, -1.95, 5, 0.022), (1.13, 0.22, -2.24, 24, 0.015)), rwing_span=0.72,
    rwing_paint=lambda k, p, n: GLOW if k == 1 and p.x < -2.37 and abs(p.y) < 0.68 else (P2 if k == 0 and p.x < -2.22 else CF),
    rplate=((-1.88, 0.86, 1.14), (-2.2, 0.72, 1.26), (-2.54, 0.68, 1.34)),
    rplate_paint=lambda p, n: P2 if p.x > -1.96 or p.z > 1.24 else CF,
    pylons=(0.0,),
    airbox=((-0.34, 0.12, 0.83), (-0.46, 0.14, 0.88), (-0.85, 0.11, 0.81), (-1.24, 0.04, 0.69)),
    airbox_paint=airbox_paint,
    fin=((-0.95, 0.68, 0.8), (-1.55, 0.6, 0.92), (-1.95, 0.5, 1.0)), fin_paint=lambda p, n: P2 if p.z > 0.88 else CF,
    helmet_x=0.18, wheel_ring=P2, barge=True,
)

def build(lod):
    return build_car(SPEC, lod)
