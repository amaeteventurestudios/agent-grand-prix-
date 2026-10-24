# AGP-05 Arrowhead: sharp and angular, a long flat-sided nose with a bold accent stripe from its tip
# back along each flank and onto the sidepods, a fighter-jet intake scoop over the canopy, long low
# slab-sided pods, a wide multi-element front wing with accent trailing edges and tall endplates,
# open wheels with accent rims, and a rear wing with accent endplate edges.
import math
from mathutils import Vector
from carkit import *
from openwheel import build_car, lerp_table, rel_height, CAMS

MONO = [  # x, half-width, bottom, top, top roundness (high = boxy, angular)
    (2.92, 0.040, 0.140, 0.165, 2.0),
    (2.70, 0.130, 0.124, 0.215, 6.5),
    (2.36, 0.180, 0.114, 0.280, 7.0),
    (1.96, 0.205, 0.108, 0.355, 7.0),
    (1.52, 0.225, 0.102, 0.440, 6.5),
    (1.08, 0.250, 0.098, 0.515, 6.0),
    (0.66, 0.290, 0.095, 0.560, 5.0),
    (0.26, 0.300, 0.092, 0.570, 4.5),
    (-0.22, 0.290, 0.092, 0.585, 4.0),
    (-0.70, 0.258, 0.096, 0.665, 3.6),
    (-1.18, 0.205, 0.106, 0.680, 3.2),
    (-1.60, 0.155, 0.122, 0.575, 2.8),
    (-1.98, 0.115, 0.155, 0.450, 2.4),
    (-2.26, 0.068, 0.200, 0.335, 2.0),
]
POD = [  # x, centre y, half-width, bottom, top
    (0.70, 0.50, 0.100, 0.240, 0.400),
    (0.58, 0.53, 0.185, 0.190, 0.440),
    (0.26, 0.55, 0.215, 0.150, 0.450),
    (-0.30, 0.54, 0.210, 0.130, 0.435),
    (-0.85, 0.47, 0.175, 0.120, 0.400),
    (-1.30, 0.38, 0.120, 0.125, 0.350),
    (-1.65, 0.28, 0.060, 0.140, 0.290),
    (-1.86, 0.22, 0.022, 0.160, 0.250),
]

def stripe(p):
    # the stripe's centre line: from the nose tip it fans out along the upper flank of the nose
    if not 0.75 < p.x < 2.86: return 9
    c = 0.03 + (2.86 - p.x) * 0.105
    return abs(abs(p.y) - c) / 0.034

def mono_rule(p, n):
    h = rel_height(MONO, p)
    if h < 0.3 or p.x < -1.9: return CF
    if stripe(p) < 1 and n.z > 0.3: return P2
    return P1

def pod_rule(s):
    def r(p, n):
        x = p.x
        if x > 0.62 and n.x > 0.5: return CF                       # the inlet
        if x > 0.6 and n.x > 0.25: return P2                       # its accent lip
        h = rel_height(POD, p, 3, 4)
        if h < 0.32: return CF                                     # undercut
        # the nose stripe carries on along the top of the pod and tapers out near the rear
        yc, hw = lerp_table(POD, x, 1), lerp_table(POD, x, 2)
        if -1.5 < x < 0.6 and n.z > 0.2:
            t = (0.6 - x) / 2.1
            if abs(abs(p.y) - (yc + 0.2 * hw)) < 0.045 * (1 - t) + 0.016: return P2
        return P1
    return r

def airbox_paint(p, n):
    if n.x > 0.5: return CF
    if p.z > 0.86 and n.z > 0.3: return P2
    return P1

def scoop(lod, parts):
    # the fighter-jet intake perched over the canopy's leading edge, ahead of the airbox
    if lod > 1: return
    sc = loft('scoop', [superellipse(x, w, zb, zt, (12, 8)[lod], 3.5, 3.5) for (x, w, zb, zt) in
                        ((-0.2, 0.05, 0.8, 0.86), (-0.3, 0.08, 0.78, 0.92), (-0.55, 0.075, 0.78, 0.9), (-0.7, 0.04, 0.76, 0.84))])
    parts.append(paint(finish(sc, 1), lambda p, n: CF if n.x > 0.6 else (P2 if p.z > 0.915 else P1)))

SPEC = dict(
    MONO=MONO, POD=POD, mono_rule=mono_rule, pod_rule=pod_rule, pod_ntop=7.0, pod_nbot=4.0,
    fwing=((0.07, 0.45, 3.04, 2, 0.02), (0.125, 0.31, 2.8, 9, 0.015), (0.18, 0.23, 2.62, 17, 0.013), (0.235, 0.17, 2.48, 25, 0.011), (0.285, 0.12, 2.38, 33, 0.01)),
    fwing_span=1.1, fwing_sweep=0.34, fwing_rise=0.09,
    fwing_paint=lambda k, p, n, u: P2 if (u > 0.78 and k in (1, 3)) or (abs(p.y) > 0.86 and k == 0) else CF,
    fplate=((3.04, 0.04, 0.16), (2.86, 0.04, 0.46), (2.5, 0.05, 0.47), (2.22, 0.08, 0.22)), fplate_y=1.08,
    fplate_paint=lambda s, p, n: P2 if p.x > 2.9 or p.z > 0.43 else CF,
    fins=((0.8, CF), (0.6, P2)),
    rwing=((0.97, 0.36, -1.94, 5, 0.022), (1.11, 0.22, -2.22, 24, 0.015)), rwing_span=0.7,
    rwing_paint=lambda k, p, n: P2 if k == 1 and p.x < -2.36 else CF,
    rplate=((-1.86, 0.8, 1.1), (-2.18, 0.7, 1.24), (-2.52, 0.66, 1.32)),
    rplate_paint=lambda p, n: P2 if p.x > -1.95 or p.z > 1.22 else CF,
    pylons=(-0.16, 0.16),
    airbox=((-0.42, 0.1, 0.8), (-0.55, 0.12, 0.84), (-0.9, 0.1, 0.78), (-1.22, 0.04, 0.68)), airbox_paint=airbox_paint,
    fin=((-0.95, 0.66, 0.76), (-1.55, 0.6, 0.88), (-1.95, 0.5, 0.96)), fin_paint=lambda p, n: P2 if p.z > 0.85 and p.x < -1.45 else CF,
    glass=((1.16, 0.04, 0.5), (0.9, 0.19, 0.66), (0.5, 0.27, 0.79), (0.12, 0.28, 0.82), (-0.25, 0.21, 0.78), (-0.45, 0.1, 0.72), (-0.55, 0.02, 0.68)),
    helmet_x=0.22, wheel_ring=P2, barge=True, diffuser_light=False, extras=scoop,
)

def build(lod):
    return build_car(SPEC, lod)
