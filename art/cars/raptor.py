# AGP-04 Raptor: a broad, flat-topped nose split by an accent V, short carbon fenders hooked over the
# top and front of the front wheels with accent edges, a very wide front wing whose upper flap is lined
# in the accent colour and whose lowest element carries a light strip, tall angular endplates, sidepods
# with sharp accent shoulders, an accent-topped airbox, accent wheel rings and a tall rear wing with a
# light strip along its upper flap.
from carkit import *
from hyper import *
from base import *

BODY = body([(2.74, [(0, 0.14, 0), (0.07, 0.135, 0), (0.11, 0.17, 0.06), (0.105, 0.22, 0.02), (0, 0.226, 0)]),
             (2.52, 0.128, 0.13, 0.180, 0.170, 0.170, 0.268, 0.278), (2.18, 0.118, 0.16, 0.208, 0.182, 0.198, 0.336, 0.346),
             (1.82, 0.110, 0.18, 0.230, 0.196, 0.216, 0.405, 0.416), (1.46, 0.102, 0.20, 0.252, 0.210, 0.232, 0.470, 0.484),
             (1.08, 0.096, 0.22, 0.282, 0.226, 0.250, 0.534, 0.552)], b2=0.02)

def body_rule(q):
    if q.cap or q.x < -2.15 or q.u < 1.85: return CF
    if q.u < 2.86 and q.x > 1.0: return CF                          # dark nose flanks
    v = 4.0 - (2.74 - q.x) / 1.4                                     # a V opening back from the tip
    if 1.25 < q.x < 2.72 and q.u > 3.0 and abs(q.u - v) < 0.2: return P2
    if 2.86 < q.u < 3.0: return P2
    return P1

POD = pods(x0=0.9, w=1.0, h=0.98, under=1.15, b=(-0.04, 0.03, 0.02))

def pod_rule(q):
    if q.inner is True or q.cap: return CF
    if q.inner == 'lip' or q.x > 0.86: return P2
    if q.u < 2.4 or q.u > 4.2: return CF
    if 2.86 < q.u < 3.08 and q.x > -1.6: return P2                 # a sharp accent shoulder
    return P1

def fender_rule(q):
    if q.inner: return CF
    if q.cap and q.x < 40: return P2
    if q.u < 0.55 or q.x < 18: return P2                            # accent edges: the outer lip and the leading edge
    if q.x < 40 and 0.15 < q.u < 0.55: return GLOW                    # a light at the fender's nose
    return CF

def fwing_paint(k, q):
    if k == 0 and not q.inner and 0.62 < q.u < 0.86 and 0.32 < q.x < 0.98: return GLOW
    if k == 2 and q.u > 0.55: return P2
    return CF

def airbox_rule(q):
    if q.cap: return CF
    if q.u > 3.2: return P2
    return P1

SPEC = dict(
    BODY=BODY, body_segs=(2, 5, 12, 16), body_rule=body_rule,
    POD=POD, pod_segs=(3, 5, 11, 8, 3), pod_rule=pod_rule,
    FENDERS=[dict(key='FL', a0=8, a1=150, rule=fender_rule, sharp=(True, True, False, True), segs=(4, 8, 8),
                  prof=[(0.375, -0.07, 0), (0.38, 0.0, 0.04), (0.17, 0.035, 0.03), (-0.03, 0.0, 0)],
                  stay=[((1.62, 0.66, 0.74), (1.45, 0.25, 0.46))])],
    floor=FLOOR, floor_fences=((-0.88, -1.1, 0.82, 0.1),),
    fwing=fwing(fwing_paint, x0=2.94, span=1.06, cascade=1.2,
                plate=[(2.92, 0.05), (2.92, 0.15), (2.84, 0.42), (2.62, 0.44), (2.46, 0.3), (2.3, 0.3), (2.24, 0.05)], plate_y=1.07,
                plate_paint=lambda q: P2 if q.p.z > 0.38 or q.p.x > 2.9 else CF),
    rwing=rwing(lambda k, q: GLOW if k == 1 and q.u > 0.82 and not q.inner else CF,
                lambda q: P2 if q.p.x > -1.9 and q.p.z > 1.0 else CF, span=0.9, z=1.0, pylons='twin'),
    AIRBOX=dict(rows=[(-0.56, [(0, 0.6, 0), (0.09, 0.6, 0), (0.1, 0.72, 0.05), (0.07, 0.82, 0.05), (0, 0.84, 0)]),
                      (-0.78, [(0, 0.62, 0), (0.12, 0.62, 0), (0.13, 0.74, 0.05), (0.1, 0.86, 0.05), (0, 0.88, 0)]),
                      (-1.15, [(0, 0.6, 0), (0.1, 0.6, 0), (0.11, 0.7, 0.05), (0.08, 0.8, 0.05), (0, 0.82, 0)]),
                      (-1.6, [(0, 0.55, 0), (0.05, 0.55, 0), (0.05, 0.62, 0.05), (0.04, 0.66, 0.05), (0, 0.67, 0)])],
                sharp=(False, True, True, True, True), segs=(2, 3, 5, 6), rule=airbox_rule, open=True),
    fin=([(-1.3, 0.70), (-1.95, 0.74), (-2.04, 1.0), (-1.92, 1.02), (-1.5, 0.82)], lambda q: P2 if q.p.z > 0.95 else CF),
    canopy=dict(zb=0.46, round=2.3, bar=(0.95, -0.4, 0.02), rows=canopy_rows(1.2, -0.62, 0.27, 0.8)),
    mirror_at=(0.78, 0.46, 0.66), helmet_x=0.14,
    wheels=dict(ring=P2, spokes=12, style='turbine', tyre_ring=P2),
)

def build(lod):
    return build_car(SPEC, lod)
