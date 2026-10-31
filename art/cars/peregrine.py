# AGP-09 Peregrine: a long, broad shovel nose with an accent chevron, a narrow monocoque and closed
# canopy, separate sculpted sidepods with a deep carbon scoop edged in the accent colour, carbon
# fenders over all four wheels with light strips down their leading edges, a multi-element front wing
# with accent fins, a tall airbox with an accent lip, and a carbon rear wing with an accent flap.
from carkit import *
from hyper import *
from base import *

BODY = body('shovel', b1=0.05, b2=0.03)

def body_rule(q):
    if q.cap or q.x < -2.15 or q.u < 1.85: return CF
    v = 4.0 - (2.45 - q.x) / 0.75                                   # a chevron pointing forward
    if 1.5 < q.x < 2.5 and q.u > 2.9 and abs(q.u - v) < 0.2: return P2
    if 2.9 < q.u < 3.04 and q.x < 1.3: return P2
    return P1

POD = pods(x0=0.82, w=1.04, h=0.95, under=1.4, rake=0.12, b=(-0.08, 0.14, 0.1))

def pod_rule(q):
    if q.inner is True or q.cap: return CF
    if q.inner == 'lip': return P2
    if q.u < 1.95 or q.u > 4.2: return CF
    # a deep carbon scoop cut into the side, edged in the accent colour
    c = 2.45 + 0.4 * max(0.0, min(1.0, (0.3 - q.x) / 1.6))
    if q.x > -1.5 and q.u < c - 0.12: return CF
    if q.x > -1.5 and q.u < c: return P2
    return P1

def front_fender(q):
    if q.inner: return CF
    if q.x < 50 and 0.12 < q.u < 0.55: return GLOW                   # a light strip down the leading edge
    if q.u < 0.45: return P2
    return CF

def rear_fender(q):
    if q.inner: return CF
    if q.x > 150 and 0.12 < q.u < 0.55: return GLOW
    if q.u < 0.45: return P2
    return CF

SPEC = dict(
    BODY=BODY, body_segs=(2, 5, 12, 14), body_rule=body_rule,
    POD=POD, pod_segs=(3, 5, 12, 8, 3), pod_rule=pod_rule,
    FENDERS=[dict(key='FL', a0=6, a1=128, rule=front_fender, sharp=(True, True, False, True), segs=(4, 8, 8),
                  prof=[(0.375, -0.08, 0), (0.38, 0.0, 0.05), (0.17, 0.04, 0.03), (-0.02, 0.0, 0)],
                  stay=[((1.6, 0.66, 0.74), (1.45, 0.25, 0.46))]),
             dict(key='RL', a0=55, a1=172, rule=rear_fender, sharp=(True, True, False, True), segs=(4, 8, 8),
                  prof=[(0.455, -0.07, 0), (0.46, 0.0, 0.05), (0.2, 0.045, 0.03), (-0.02, 0.0, 0)],
                  stay=[((-1.62, 0.66, 0.76), (-1.6, 0.2, 0.5))])],
    floor=FLOOR, floor_fences=((-0.88, -1.1, 0.82, 0.1),),
    fwing=fwing(lambda k, q: P2 if k == 2 and q.x > 0.75 else CF, x0=2.95, span=1.05, cascade=1.2,
                plate=[(2.93, 0.05), (2.93, 0.18), (2.8, 0.4), (2.55, 0.4), (2.36, 0.2), (2.28, 0.05)], plate_y=1.06,
                plate_paint=lambda q: P2 if q.p.z > 0.34 else CF),
    rwing=rwing(lambda k, q: P2 if k == 1 and not q.inner else CF,
                lambda q: P2 if q.p.x < -2.44 else CF, span=0.9, z=0.98, pylons='single'),
    AIRBOX=dict(rows=[(-0.4, [(0, 0.6, 0), (0.1, 0.6, 0), (0.12, 0.76, 0.04), (0.09, 0.9, 0.04), (0, 0.93, 0)]),
                      (-0.62, [(0, 0.62, 0), (0.13, 0.62, 0), (0.14, 0.78, 0.04), (0.11, 0.92, 0.04), (0, 0.95, 0)]),
                      (-1.1, [(0, 0.6, 0), (0.1, 0.6, 0), (0.11, 0.72, 0.04), (0.08, 0.82, 0.04), (0, 0.84, 0)]),
                      (-1.6, [(0, 0.55, 0), (0.05, 0.55, 0), (0.05, 0.62, 0.04), (0.04, 0.66, 0.04), (0, 0.67, 0)])],
                sharp=(False, True, True, True, True), segs=(2, 3, 5, 6), open=True,
                rule=lambda q: CF if q.cap else (P2 if q.x > -0.47 else P1)),
    canopy=dict(zb=0.46, round=2.3, bar=(0.95, -0.4, 0.02), rows=canopy_rows(1.22, -0.62, 0.26, 0.8)),
    mirror_at=(0.78, 0.46, 0.66), helmet_x=0.14,
    wheels=dict(ring=CF, spokes=10, style='turbine', tyre_ring=None),
)

def build(lod):
    return build_car(SPEC, lod)
