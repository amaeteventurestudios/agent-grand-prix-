# AGP-07 Kestrel: graphite, with big wing-like carbon fenders wrapped over the top and front of the
# front wheels and over the top and back of the rear ones, a row of light dots down each front
# fender's leading edge, a wide twin-keel nose, accent edges on the fenders and front wing, accent
# mirrors, an airbox with an accent crest and a rear wing hung from a swan-neck pylon.
from carkit import *
from hyper import *
from base import *

BODY = body('shovel', b1=0.03, b2=0.02)

def body_rule(q):
    if q.cap or q.x < -2.15 or q.u < 1.85: return CF
    if q.u > 3.55 and 1.4 < q.x < 2.72: return CF                   # the dark channel between the twin keels
    if 3.45 < q.u < 3.55 and 1.4 < q.x < 2.72: return P2
    if 2.86 < q.u < 3.0: return P2
    return P1

POD = pods(x0=0.86, w=1.0, h=1.0, under=1.2, rake=0.1, b=(-0.04, 0.08, 0.06))

def pod_rule(q):
    if q.inner is True or q.cap: return CF
    if q.inner == 'lip' or q.x > 0.82: return P2
    if q.u < 2.0 or q.u > 4.2: return CF
    if q.x < -0.7 and 2.4 < q.u < 2.6: return P2
    return P1

def front_fender(q):
    if q.inner: return CF
    if q.x < 62 and 0.15 < q.u < 0.6 and int(q.x / 7) % 2 == 0: return GLOW    # light dots down the leading edge
    if q.u < 0.4: return P2
    return P1

def rear_fender(q):
    if q.inner: return CF
    if q.u < 0.4 or q.x > 172: return P2
    return P1

SPEC = dict(
    BODY=BODY, body_segs=(2, 5, 12, 14), body_rule=body_rule,
    POD=POD, pod_segs=(3, 5, 12, 8, 3), pod_rule=pod_rule,
    FENDERS=[dict(key='FL', a0=-4, a1=135, rule=front_fender, sharp=(True, True, False, True), segs=(4, 9, 9), radius=0.05,
                  prof=[(0.39, -0.12, 0), (0.4, 0.0, 0.06), (0.17, 0.06, 0.03), (-0.03, 0.0, 0)],
                  stay=[((1.62, 0.66, 0.76), (1.45, 0.25, 0.46))]),
             dict(key='RL', a0=40, a1=182, rule=rear_fender, sharp=(True, True, False, True), segs=(4, 9, 9), radius=0.05,
                  prof=[(0.47, -0.1, 0), (0.48, 0.0, 0.06), (0.2, 0.06, 0.03), (-0.03, 0.0, 0)],
                  stay=[((-1.62, 0.66, 0.78), (-1.6, 0.2, 0.5))])],
    floor=FLOOR, floor_fences=((-0.88, -1.1, 0.82, 0.1),),
    fwing=fwing(lambda k, q: P2 if (k == 0 and q.u > 0.85 and q.x > 0.4) or (k == 2 and q.u > 0.7) else CF, x0=2.95, span=1.05, cascade=1.4,
                plate=[(2.93, 0.05), (2.93, 0.16), (2.84, 0.36), (2.6, 0.38), (2.4, 0.22), (2.3, 0.05)], plate_y=1.06,
                plate_paint=lambda q: P2 if q.p.x > 2.88 or q.p.z > 0.33 else CF),
    rwing=rwing(lambda k, q: P2 if k == 1 and q.u > 0.8 else CF, lambda q: P2 if q.p.x < -2.44 else CF, span=0.92, z=1.0, pylons='single'),
    AIRBOX=dict(rows=[(-0.5, [(0, 0.6, 0), (0.09, 0.6, 0), (0.1, 0.74, 0.05), (0.07, 0.86, 0.05), (0, 0.88, 0)]),
                      (-0.7, [(0, 0.62, 0), (0.12, 0.62, 0), (0.13, 0.76, 0.05), (0.1, 0.88, 0.05), (0, 0.91, 0)]),
                      (-1.15, [(0, 0.6, 0), (0.1, 0.6, 0), (0.11, 0.71, 0.05), (0.08, 0.81, 0.05), (0, 0.83, 0)]),
                      (-1.6, [(0, 0.55, 0), (0.05, 0.55, 0), (0.05, 0.62, 0.05), (0.04, 0.66, 0.05), (0, 0.67, 0)])],
                sharp=(False, True, True, True, True), segs=(2, 3, 5, 8), open=True,
                rule=lambda q: CF if q.cap else (P2 if q.u > 3.55 else P1)),
    canopy=dict(zb=0.46, round=2.4, bar=(0.95, -0.45, 0.02), rows=canopy_rows(1.22, -0.65, 0.26, 0.8)),
    mirror_at=(0.78, 0.47, 0.67), mirror_rule=lambda q: P2, helmet_x=0.14,
    wheels=dict(ring=P2, spokes=8, style='straight', tyre_ring=P2),
)

def build(lod):
    return build_car(SPEC, lod)
