# AGP-02 Vortex: a needle nose that climbs steeply to a long closed canopy, fully open front wheels
# on exposed wishbones, a wide front wing with light strips along its lowest element and down the
# endplates' leading edges, boxy sidepods with a deep undercut and an accent-framed inlet, accent
# lines along the nose and pods, glowing wheel rings, and a broad rear wing with lit endplate tips.
import math
from mathutils import Vector
from carkit import *
from hyper import *

def body_row(x, zb, wf, wc, zc, ws, zs, zt):
    return (x, [(0, zb, 0), (wf, zb, -0.02), (wc, zc, 0.05), (ws, zs, 0.05), (0, zt, 0)])

BODY = [
    (2.74, [(0, 0.165, 0), (0.025, 0.16, 0), (0.045, 0.18, 0.1), (0.035, 0.21, 0.05), (0, 0.218, 0)]),
    body_row(2.52, 0.150, 0.07, 0.100, 0.172, 0.082, 0.252, 0.266),
    body_row(2.18, 0.136, 0.10, 0.136, 0.186, 0.112, 0.322, 0.340),
    body_row(1.82, 0.124, 0.13, 0.168, 0.200, 0.140, 0.398, 0.418),
    body_row(1.46, 0.112, 0.17, 0.206, 0.214, 0.172, 0.470, 0.492),
    body_row(1.08, 0.100, 0.21, 0.252, 0.228, 0.214, 0.538, 0.560),
    body_row(0.62, 0.092, 0.25, 0.322, 0.245, 0.270, 0.568, 0.585),
    body_row(0.10, 0.090, 0.26, 0.336, 0.250, 0.282, 0.580, 0.605),
    body_row(-0.40, 0.092, 0.25, 0.318, 0.258, 0.250, 0.622, 0.668),
    body_row(-0.90, 0.096, 0.21, 0.268, 0.268, 0.190, 0.665, 0.745),
    body_row(-1.40, 0.106, 0.16, 0.208, 0.278, 0.140, 0.605, 0.665),
    body_row(-1.85, 0.130, 0.11, 0.150, 0.272, 0.100, 0.480, 0.520),
    body_row(-2.20, 0.160, 0.07, 0.100, 0.252, 0.070, 0.380, 0.400),
    body_row(-2.42, 0.200, 0.03, 0.050, 0.262, 0.040, 0.318, 0.330),
]

def body_rule(q):
    if q.cap or q.x < -2.15 or q.u < 1.85: return CF
    if 2.86 < q.u < 3.02 and q.x > 0.7: return P2                  # accent lines along the nose's top edges
    if q.u > 3.9 and 1.2 < q.x < 2.7: return P2                    # a centre stripe up the nose
    if 2.86 < q.u < 3.02 and q.x < -0.6: return P2                 # and along the engine cover
    return P1

def pod_row(x, yi, zb, yb, yc, zc, yt, zt, zti, rake=0.0):
    return (x, [(yi, zb, 0, -rake), (yb, zb - 0.01, -0.06, -rake), (yc, zc, 0.04, 0), (yt, zt, 0.03, rake), (yi + 0.02, zti, 0, rake)])

POD = [
    pod_row(0.78, 0.30, 0.15, 0.46, 0.68, 0.26, 0.665, 0.46, 0.50, rake=0.1),
    pod_row(0.50, 0.28, 0.12, 0.44, 0.71, 0.25, 0.70, 0.475, 0.52),
    pod_row(0.00, 0.28, 0.11, 0.42, 0.71, 0.24, 0.70, 0.48, 0.53),
    pod_row(-0.55, 0.26, 0.11, 0.38, 0.64, 0.235, 0.62, 0.46, 0.52),
    pod_row(-1.05, 0.22, 0.12, 0.32, 0.52, 0.23, 0.50, 0.42, 0.48),
    pod_row(-1.45, 0.17, 0.14, 0.24, 0.39, 0.225, 0.37, 0.36, 0.42),
    pod_row(-1.80, 0.13, 0.16, 0.17, 0.25, 0.22, 0.23, 0.29, 0.33),
    pod_row(-2.00, 0.10, 0.18, 0.12, 0.14, 0.22, 0.12, 0.25, 0.27),
]

def pod_rule(q):
    if q.inner is True or q.cap: return CF
    if q.inner == 'lip' or q.x > 0.74: return P2                   # the inlet's accent frame
    if q.u < 1.95 or q.u > 4.2: return CF                          # the undercut
    if 2.82 < q.u < 2.98 and -1.5 < q.x < 0.7: return P2           # a line just under the shoulder
    return P1

def fwing_paint(k, q):
    if k == 0 and not q.inner and 0.62 < q.u < 0.86 and 0.32 < q.x < 0.98: return GLOW
    if k == 2 and q.x > 0.7: return P2
    return CF

def fplate_paint(q):
    if q.p.x > 2.84 and q.n.x > 0.3: return GLOW
    if q.n.y * (1 if q.p.y > 0 else -1) < -0.5 and q.p.z > 0.3: return P2
    return CF

SPEC = dict(
    BODY=BODY, body_segs=(2, 5, 12, 10), body_rule=body_rule,
    POD=POD, pod_segs=(3, 5, 11, 8, 3), pod_rule=pod_rule,
    floor=[(1.42, 0.2), (1.12, 0.46), (0.9, 0.6), (0.8, 0.8), (-0.98, 0.86), (-1.1, 0.78), (-1.2, 0.64), (-1.9, 0.6), (-2.2, 0.54)],
    floor_fences=((-0.88, -1.1, 0.82, 0.1),),
    fwing=dict(
        elements=[
            ([-1.02, -0.9, -0.78, -0.62, -0.45, -0.25, -0.1, 0, 0.1, 0.25, 0.45, 0.62, 0.78, 0.9, 1.02],
             lambda y: (y, 2.93 - 0.14 * abs(y) + 0.16 * max(0, abs(y) - 0.7), 0.068 + 0.012 * (1 - min(1, abs(y) / 0.3)) + 0.05 * max(0, abs(y) - 0.72) / 0.3,
                        0.42 - 0.1 * abs(y), 0.02, 3)),
            ([0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 1.0], lambda y: (y, 2.66 - 0.1 * y + 0.08 * max(0, y - 0.7), 0.13 + 0.07 * y * y, 0.22 + 0.06 * y, 0.016, 12 + 10 * y)),
            ([0.16, 0.3, 0.45, 0.6, 0.75, 0.88, 1.0], lambda y: (y, 2.47 - 0.08 * y + 0.08 * max(0, y - 0.7), 0.2 + 0.11 * y * y, 0.16 + 0.06 * y, 0.013, 22 + 12 * y)),
        ],
        paint=fwing_paint,
        plate=[(2.9, 0.05), (2.9, 0.17), (2.78, 0.37), (2.45, 0.37), (2.24, 0.2), (2.22, 0.05)], plate_y=1.04, plate_paint=fplate_paint,
    ),
    rwing=dict(
        span=0.86,
        elements=[lambda y: (y, -1.92 - 0.06 * abs(y), 0.93 + 0.03 * y * y, 0.4, 0.022, 6),
                  lambda y: (y, -2.2 - 0.06 * abs(y), 1.06 + 0.03 * y * y, 0.24, 0.016, 26)],
        paint=lambda k, q: P2 if k == 1 and q.u > 0.72 and not q.inner else CF,
        plate=[(-1.82, 1.08), (-2.18, 1.2), (-2.46, 1.24), (-2.5, 1.18), (-2.46, 0.82), (-2.24, 0.66), (-1.96, 0.74), (-1.88, 0.9)],
        plate_paint=lambda q: GLOW if q.p.z > 1.14 and q.p.x < -2.1 else CF,
        pylons=[(0.0, [(-1.4, 0.64), (-1.7, 0.6), (-2.08, 0.92), (-2.16, 0.98), (-1.98, 0.98), (-1.62, 0.76)], 0.04)],
    ),
    fin=([(-0.86, 0.72), (-1.95, 0.75), (-2.04, 0.95), (-1.92, 0.97), (-1.3, 0.86)], lambda q: GLOW if q.p.z > 0.9 else CF),
    canopy=dict(zb=0.46, round=2.3, bar=(0.95, -0.55, 0.02),
                rows=[(1.2, 0.02, 0.56), (1.0, 0.13, 0.65), (0.7, 0.23, 0.76), (0.3, 0.27, 0.82), (-0.08, 0.26, 0.82),
                      (-0.38, 0.2, 0.78), (-0.6, 0.1, 0.72), (-0.72, 0.02, 0.68)]),
    mirror_at=(0.78, 0.45, 0.66), helmet_x=0.12,
    wheels=dict(ring=GLOW, spokes=7, style='straight', tyre_ring=P2),
)

def build(lod):
    return build_car(SPEC, lod)
