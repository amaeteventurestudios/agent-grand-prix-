# AGP-01 Falcon: a long arrow nose between two tall, sharp-edged wheel pods that open forward like
# intakes (light bars down their inner edges), a big fighter canopy, deep-cut sidepods with an accent
# sweep rising to the engine cover, a spine and shark fin, open rear wheels, and a broad rear wing on
# twin swan necks.
import math
from mathutils import Vector
from carkit import *
from hyper import *

SH5 = (False, True, True, True, True)

# the tub, nose and engine cover: keel, floor corner, chine, shoulder, crown (a ridge along the top)
def body_row(x, zb, wf, wc, zc, ws, zs, zt):
    return (x, [(0, zb, 0), (wf, zb, -0.02), (wc, zc, 0.06), (ws, zs, 0.04), (0, zt, 0)])

BODY = [
    (2.74, [(0, 0.105, 0), (0.06, 0.100, 0), (0.10, 0.15, 0.1), (0.09, 0.212, 0.05), (0, 0.222, 0)]),
    body_row(2.54, 0.096, 0.13, 0.180, 0.158, 0.162, 0.262, 0.278),
    body_row(2.20, 0.092, 0.16, 0.212, 0.170, 0.192, 0.322, 0.338),
    body_row(1.85, 0.090, 0.19, 0.238, 0.190, 0.214, 0.398, 0.416),
    body_row(1.48, 0.090, 0.21, 0.262, 0.208, 0.232, 0.468, 0.488),
    body_row(1.08, 0.090, 0.23, 0.292, 0.228, 0.250, 0.530, 0.552),
    body_row(0.62, 0.090, 0.25, 0.330, 0.245, 0.272, 0.568, 0.585),
    body_row(0.10, 0.090, 0.26, 0.340, 0.250, 0.282, 0.580, 0.605),
    body_row(-0.40, 0.092, 0.25, 0.320, 0.258, 0.250, 0.622, 0.668),
    body_row(-0.90, 0.096, 0.21, 0.270, 0.268, 0.190, 0.660, 0.738),
    body_row(-1.40, 0.106, 0.16, 0.210, 0.278, 0.140, 0.600, 0.660),
    body_row(-1.85, 0.130, 0.11, 0.150, 0.272, 0.100, 0.480, 0.520),
    body_row(-2.20, 0.160, 0.07, 0.100, 0.252, 0.070, 0.380, 0.400),
    body_row(-2.42, 0.200, 0.03, 0.050, 0.262, 0.040, 0.318, 0.330),
]

def body_rule(q):
    if q.cap: return CF
    if q.x < -2.15: return CF
    if q.u < 1.85: return CF                                      # lower flanks and undertray
    if 2.84 < q.u < 3.0 and q.x > -2.1: return P2                 # accent lines along both shoulders
    if q.u < 2.84 and q.x > 0.95: return CF                       # dark nose flanks under the lines
    if q.u > 3.72 and 1.45 < q.x < 2.62: return CF                 # a dark spine panel down the nose
    return P1

# sidepods: inner bottom, outer bottom, chine, top outer, top inner (all the way round)
def pod_row(x, yi, zb, yb, yc, zc, yt, zt, zti, rake=0.0):
    return (x, [(yi, zb, 0, -rake), (yb, zb - 0.01, -0.04, -rake), (yc, zc, 0.1, 0), (yt, zt, 0.08, rake), (yi + 0.02, zti, 0, rake)])

POD = [
    pod_row(1.02, 0.30, 0.16, 0.50, 0.70, 0.29, 0.66, 0.47, 0.50, rake=0.07),
    pod_row(0.72, 0.28, 0.13, 0.50, 0.745, 0.275, 0.70, 0.49, 0.53),
    pod_row(0.10, 0.28, 0.12, 0.50, 0.74, 0.262, 0.69, 0.49, 0.54),
    pod_row(-0.50, 0.26, 0.12, 0.46, 0.68, 0.25, 0.63, 0.47, 0.53),
    pod_row(-1.00, 0.22, 0.13, 0.40, 0.58, 0.245, 0.53, 0.44, 0.50),
    pod_row(-1.45, 0.17, 0.15, 0.30, 0.44, 0.24, 0.40, 0.38, 0.44),
    pod_row(-1.80, 0.13, 0.17, 0.20, 0.29, 0.23, 0.26, 0.31, 0.35),
    pod_row(-2.02, 0.10, 0.19, 0.12, 0.15, 0.23, 0.13, 0.26, 0.28),
]

def pod_rule(q):
    if q.inner is True or q.cap: return CF
    if q.inner == 'lip': return P2
    if q.x > 0.985: return P2                                     # the mouth's frame
    if q.u < 1.9 or q.u > 4.2: return CF
    # a bold accent sweep rising from the chine at the front to the top crease at the back, dark below it
    c = 2.15 + 0.85 * max(0.0, min(1.0, (0.55 - q.x) / 1.7))
    if abs(q.u - c) < 0.11 and -1.6 < q.x < 0.95: return P2
    if q.u < c: return CF
    return P1

# the front wheel pods: outer wall bottom, a crease along the outer wall, outer shoulder, inner
# shoulder, inner wall bottom
def nac_row(x, yo, zbo, zcr, zso, yi2, zti, zbi, rake=0.0):
    return (x, [(yo, zbo, -0.02, 0), (yo + 0.016, zcr, 0.06, -rake * 0.5), (yo - 0.012, zso, 0.06, -rake), (yi2, zti, -0.02, -rake), (0.62, zbi, 0, 0)])

NAC = [
    nac_row(2.62, 1.02, 0.065, 0.30, 0.56, 0.70, 0.60, 0.075, rake=0.03),
    nac_row(2.38, 1.04, 0.065, 0.34, 0.65, 0.70, 0.69, 0.075),
    nac_row(2.14, 1.05, 0.20, 0.40, 0.72, 0.69, 0.76, 0.12),
    nac_row(1.93, 1.06, 0.38, 0.48, 0.765, 0.68, 0.795, 0.26),
    nac_row(1.60, 1.06, 0.50, 0.555, 0.785, 0.68, 0.81, 0.34),
    nac_row(1.22, 1.01, 0.56, 0.60, 0.74, 0.67, 0.755, 0.44),
    nac_row(0.86, 0.86, 0.52, 0.54, 0.60, 0.66, 0.61, 0.50),
]

def nac_rule(q):
    if q.inner: return CF
    if q.cap: return P2 if q.x > 2 else CF
    if q.x > 2.595 and 3.25 < q.u < 3.85: return GLOW              # a light bar down the inner front edge
    if 0.9 < q.u < 1.1: return P2                                 # accent along the crease
    # a slash rising back across the upper wall, as on the reference
    c = 1.15 + (2.45 - q.x) * 1.6
    if q.u < 2.0 and abs(q.u - c) < 0.16 and q.x > 1.9: return P2
    if 2.0 < q.u < 2.16: return P2                                # and along the top's outer edge
    if q.u < 1.0: return CF                                       # dark lower wall
    if q.u > 3.4 and q.x < 2.0: return CF                         # the inner wall beside the tyre
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
    if q.p.z > 1.12: return P2
    return CF

SPEC = dict(
    BODY=BODY, body_segs=(2, 5, 12, 10), body_rule=body_rule,
    POD=POD, pod_segs=(3, 5, 11, 8, 3), pod_rule=pod_rule,
    NAC=dict(rows=NAC, sharp=(False, True, True, True, False), segs=(6, 9, 9, 7), rule=nac_rule, mouth=(2.62, 2.0, 0.63, 1.02), vanes=(0.19, 0.31)),
    fin=([(-0.82, 0.70), (-1.95, 0.74), (-2.04, 0.93), (-1.92, 0.95), (-1.3, 0.84)], lambda q: P2 if q.p.z > 0.88 else P1),
    helmet_x=0.16, wheels=dict(ring=P2, spokes=10),
    floor=[(1.42, 0.2), (1.12, 0.5), (0.9, 0.62), (0.82, 0.8), (-0.98, 0.86), (-1.1, 0.78), (-1.2, 0.64), (-1.9, 0.6), (-2.2, 0.54)],
    floor_fences=((-0.88, -1.1, 0.82, 0.1),),
    diffuser=(-1.85, -2.42, 0.56),
    fwing=dict(
        elements=[
            ([-1.06, -0.9, -0.7, -0.5, -0.3, -0.12, 0, 0.12, 0.3, 0.5, 0.7, 0.9, 1.06],
             lambda y: (y, 2.84 - 0.06 * abs(y), 0.062 + 0.02 * max(0, abs(y) - 0.5), 0.42 - 0.04 * abs(y), 0.022, 3)),
            ([0.13, 0.26, 0.4, 0.52, 0.63], lambda y: (y, 2.54 + 0.02 * y, 0.132 + 0.03 * y, 0.27, 0.016, 15)),
            ([0.15, 0.28, 0.4, 0.52, 0.63], lambda y: (y, 2.37 + 0.03 * y, 0.205 + 0.05 * y, 0.2, 0.014, 30)),
        ],
        paint=wing_paint,
    ),
    rwing=dict(
        span=0.98,
        elements=[lambda y: (y, -1.92 - 0.05 * abs(y), 0.93 + 0.03 * y * y, 0.42, 0.022, 7),
                  lambda y: (y, -2.22 - 0.05 * abs(y), 1.06 + 0.03 * y * y, 0.25, 0.016, 28)],
        paint=rwing_paint,
        plate=[(-1.84, 1.09), (-2.44, 1.19), (-2.5, 1.14), (-2.47, 0.95), (-2.3, 0.86), (-1.98, 0.88), (-1.9, 0.94)],
        plate_paint=rplate_paint,
        pylons=[(s, [(-1.42, 0.62), (-1.7, 0.6), (-2.1, 0.9), (-2.18, 0.97), (-1.98, 0.96), (-1.62, 0.74)], 0.03) for s in (0.17, -0.17)],
    ),
    canopy=dict(zb=0.46, round=2.3, bar=(0.95, -0.62, 0.022),
                rows=[(1.22, 0.02, 0.56), (1.02, 0.14, 0.66), (0.72, 0.25, 0.78), (0.32, 0.30, 0.85), (-0.08, 0.30, 0.86),
                      (-0.42, 0.25, 0.815), (-0.66, 0.15, 0.75), (-0.82, 0.03, 0.69)]),
    mirror_at=(0.78, 0.47, 0.67),
)

def build(lod):
    return build_car(SPEC, lod)
