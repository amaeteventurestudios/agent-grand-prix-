# AGP-01 Falcon: a long arrow nose between two tall, sharp-edged wheel pods that open forward like
# intakes (light bars down their inner edges), a big fighter canopy, deep-cut sidepods with an accent
# sweep rising to the engine cover, a spine and shark fin, open rear wheels, and a broad rear wing on
# twin swan necks.
import math
from mathutils import Vector
from carkit import *
from hyper import *
from base import pod_row, rear_hood

SH5 = (False, True, True, True, True)

# the tub, nose and engine cover: keel, floor corner, chine, shoulder, crown (a ridge along the top)
def body_row(x, zb, wf, wc, zc, ws, zs, zt):
    return (x, [(0, zb, 0), (wf, zb, -0.02), (wc, zc, 0.09), (ws, zs, 0.07), (0, zt, 0)])

BODY = [
    (2.62, [(0, 0.150, 0), (0.17, 0.145, 0), (0.25, 0.225, 0.05), (0.21, 0.330, 0.04), (0, 0.352, 0)]),
    body_row(2.36, 0.135, 0.20, 0.275, 0.248, 0.245, 0.405, 0.425),
    body_row(2.00, 0.118, 0.22, 0.305, 0.268, 0.272, 0.475, 0.500),
    body_row(1.60, 0.100, 0.24, 0.332, 0.285, 0.300, 0.548, 0.572),
    body_row(1.20, 0.092, 0.26, 0.358, 0.298, 0.325, 0.610, 0.618),
    body_row(0.70, 0.090, 0.28, 0.378, 0.302, 0.345, 0.640, 0.585),
    body_row(0.10, 0.090, 0.28, 0.382, 0.304, 0.350, 0.650, 0.590),
    body_row(-0.40, 0.092, 0.27, 0.362, 0.302, 0.330, 0.680, 0.700),
    body_row(-0.90, 0.096, 0.24, 0.322, 0.300, 0.272, 0.700, 0.775),
    body_row(-1.40, 0.106, 0.19, 0.262, 0.292, 0.205, 0.640, 0.700),
    body_row(-1.85, 0.130, 0.13, 0.180, 0.280, 0.135, 0.520, 0.560),
    body_row(-2.20, 0.160, 0.08, 0.112, 0.262, 0.082, 0.420, 0.440),
    body_row(-2.42, 0.200, 0.04, 0.060, 0.268, 0.045, 0.340, 0.350),
]

def body_rule(q):
    if q.cap: return CF
    if q.x < -2.15: return CF
    if q.u < 1.85: return CF                                      # lower flanks and undertray
    c = 2.6 + 1.0 * max(0.0, min(1.0, (2.55 - q.x) / 1.5))       # from the nose's front corners back and in
    if q.x > 0.9 and abs(q.u - c) < 0.13: return P2
    if q.x > 0.9 and q.u < c: return CF                           # dark flanks below the line
    if 2.86 < q.u < 3.0 and q.x < 0.9: return P2                  # carried on along the shoulders
    return P1

# sidepods: inner bottom, outer bottom, chine, top outer, top inner (all the way round)
B = (-0.04, -0.02, 0.1)
POD = [  # full height all the way to the rear wheel, then tucked in behind it
    pod_row(0.86, 0.30, 0.16, 0.55, 0.80, 0.30, 0.74, 0.60, 0.64, 0.08, B),
    pod_row(0.60, 0.29, 0.13, 0.58, 0.88, 0.29, 0.82, 0.66, 0.68, 0.0, B),
    pod_row(0.00, 0.29, 0.12, 0.58, 0.90, 0.28, 0.84, 0.67, 0.70, 0.0, B),
    pod_row(-0.60, 0.28, 0.12, 0.55, 0.86, 0.27, 0.80, 0.64, 0.70, 0.0, B),
    pod_row(-0.95, 0.26, 0.13, 0.48, 0.72, 0.26, 0.66, 0.58, 0.66, 0.0, B),
    pod_row(-1.25, 0.22, 0.15, 0.34, 0.50, 0.25, 0.45, 0.48, 0.56, 0.0, B),
    pod_row(-1.60, 0.17, 0.16, 0.22, 0.32, 0.24, 0.29, 0.38, 0.44, 0.0, B),
    pod_row(-2.00, 0.10, 0.19, 0.12, 0.15, 0.23, 0.13, 0.26, 0.28, 0.0, B),
]

def pod_rule(q):
    if q.inner is True or q.cap: return CF
    if q.inner == 'lip': return P2
    if q.x > 0.845: return P2                                     # the mouth's frame
    if q.u < 1.9 or q.u > 4.2: return CF
    # a bold accent sweep falling from the top at the front to the floor ahead of the rear wheel, dark below it
    t = max(0.0, min(1.0, (0.6 - q.x) / 1.8))
    c = 3.05 - 1.1 * t * t
    if abs(q.u - c) < 0.2 and -1.3 < q.x < 0.84: return P2
    if q.u < c: return CF
    return P1

# the front wheel pods: outer wall bottom, a crease along the outer wall, outer shoulder, inner
# shoulder, inner wall bottom
def nac_row(x, yo, zbo, zcr, zso, yi2, zti, zbi, rake=0.0):
    return (x, [(yo, zbo, -0.02, 0), (yo + 0.016, zcr, 0.06, -rake * 0.5), (yo - 0.012, zso, 0.06, -rake), (yi2, zti, -0.02, -rake), (0.62, zbi, 0, 0)])

def nac_row(x, yo, zbo, zcr, zso, yi2, zti, zbi):
    return (x, [(yo, zbo, -0.02, 0), (yo + 0.01, zcr, 0.05, 0), (yo - 0.07, zso, 0.05, 0), (yi2, zti, 0.03, 0), (yi2 - 0.05, zbi, 0, 0)])

NAC = [
    nac_row(2.48, 0.97, 0.070, 0.30, 0.50, 0.81, 0.52, 0.070),
    nac_row(2.26, 0.99, 0.070, 0.36, 0.65, 0.80, 0.67, 0.080),
    nac_row(2.02, 1.00, 0.210, 0.45, 0.76, 0.79, 0.775, 0.180),
    nac_row(1.76, 1.00, 0.400, 0.52, 0.825, 0.785, 0.835, 0.300),
    nac_row(1.48, 0.99, 0.500, 0.58, 0.845, 0.78, 0.85, 0.400),
    nac_row(1.20, 0.96, 0.540, 0.60, 0.80, 0.765, 0.805, 0.470),
    nac_row(0.96, 0.90, 0.540, 0.58, 0.70, 0.745, 0.705, 0.520),
    nac_row(0.80, 0.84, 0.540, 0.56, 0.62, 0.725, 0.625, 0.540),
]

def nac_rule(q):
    if q.inner: return CF
    if q.cap: return P2 if q.x > 2 else CF
    if q.x > 2.2 and 1.12 < q.u < 1.34: return GLOW                 # a light down the blade's outer front
    if 1.78 < q.u < 2.12: return P2                                # lime along the outer top edge
    if q.u < 1.9 and q.x > 1.6 and abs(q.u - (0.35 + (2.48 - q.x) * 1.9)) < 0.17: return P2   # a band rising up the outer face
    if q.u < 1.0: return CF                                       # dark lower wall
    if q.u > 3.2: return CF                                       # the inner wall beside the tyre
    return P1

def wing_paint(k, q):
    if k == 2 and q.u > 0.55: return P2
    if k == 0 and q.u < 0.08 and q.x > 0.62: return P2
    return CF

def rwing_paint(k, q):
    if k == 1 and q.u > 0.7 and not q.inner: return P2
    return CF

def rplate_paint(q):
    if q.p.x < -2.42: return GLOW
    if q.p.z > 1.28: return P2
    return CF

SPEC = dict(
    BODY=BODY, body_segs=(2, 5, 12, 10), body_rule=body_rule,
    POD=POD, pod_segs=(3, 5, 11, 8, 3), pod_rule=pod_rule,
    NAC=dict(rows=NAC, sharp=(True, False, False, False, True), segs=(6, 9, 6, 6), rule=nac_rule, mouth=(2.48, 2.0, 0.76, 0.98), vanes=(0.19, 0.31)),
    body_sharp=(False, True, False, False, True),
    FENDERS=[rear_hood(lambda q: CF)],
    fin=([(-0.9, 0.76), (-1.95, 0.8), (-2.04, 1.05), (-1.92, 1.07), (-1.3, 0.92)], lambda q: P2 if q.p.z > 0.98 else P1),
    helmet_x=0.16, wheels=dict(ring=P2, spokes=10),
    floor=[(1.42, 0.2), (1.12, 0.5), (0.9, 0.62), (0.82, 0.8), (-0.98, 0.86), (-1.1, 0.78), (-1.2, 0.64), (-1.9, 0.6), (-2.2, 0.54)],
    floor_fences=((-0.88, -1.1, 0.82, 0.1),),
    diffuser=(-1.85, -2.42, 0.56), barge=True,
    fwing=dict(
        elements=[
            ([-1.06, -0.9, -0.7, -0.5, -0.3, -0.12, 0, 0.12, 0.3, 0.5, 0.7, 0.9, 1.06],
             lambda y: (y, 2.7 - 0.06 * abs(y), 0.062 + 0.02 * max(0, abs(y) - 0.5), 0.42 - 0.04 * abs(y), 0.022, 3)),
            ([0.13, 0.26, 0.4, 0.52, 0.63], lambda y: (y, 2.42 + 0.02 * y, 0.132 + 0.03 * y, 0.27, 0.016, 15)),
            ([0.15, 0.28, 0.4, 0.52, 0.63], lambda y: (y, 2.26 + 0.03 * y, 0.205 + 0.05 * y, 0.2, 0.014, 30)),
        ],
        paint=wing_paint,
    ),
    rwing=dict(
        span=0.98,
        elements=[lambda y: (y, -1.92 - 0.05 * abs(y), 1.08 + 0.03 * y * y, 0.44, 0.022, 7),
                  lambda y: (y, -2.22 - 0.05 * abs(y), 1.22 + 0.03 * y * y, 0.27, 0.016, 28)],
        paint=rwing_paint,
        plate=[(-1.84, 1.25), (-2.44, 1.36), (-2.5, 1.3), (-2.47, 1.05), (-2.3, 0.96), (-1.98, 1.0), (-1.9, 1.08)],
        plate_paint=rplate_paint,
        pylons=[(s, [(-1.3, 0.72), (-1.62, 0.68), (-2.08, 1.06), (-2.18, 1.13), (-1.96, 1.12), (-1.52, 0.84)], 0.03) for s in (0.17, -0.17)],
    ),
    canopy=dict(zb=0.5, round=2.1, bar=None,
                rows=[(1.28, 0.03, 0.62), (1.08, 0.2, 0.74), (0.78, 0.31, 0.87), (0.38, 0.355, 0.95), (-0.02, 0.355, 0.97),
                      (-0.38, 0.3, 0.93), (-0.66, 0.2, 0.86), (-0.86, 0.04, 0.79)]),
    mirror_at=None, helmet_z=0.66,
)

def build(lod):
    return build_car(SPEC, lod)
