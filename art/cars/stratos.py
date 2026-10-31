# AGP-08 Stratos: dark, with square-shouldered front-wheel nacelles whose mouths are framed in light
# (a bar under the roof and strips down both walls), bold accent bands from the nose tip back over the
# nacelle shoulders and along the pods, a tall bubble canopy, hooded rear wheels with an accent slash,
# and a wide rear wing on twin swan necks with accent upper faces.
from carkit import *
from hyper import *
from base import *

BODY = body('broad', b1=0.02, b2=0.02)

def body_rule(q):
    if q.cap or q.x < -2.15 or q.u < 1.85: return CF
    if 2.6 < q.u < 3.0 and q.x > 0.4: return P2                     # bold bands along the nose's shoulders
    if q.u < 2.6 and q.x > 1.0: return CF
    return P1

POD = pods(x0=0.95, w=1.0, h=1.0, under=1.1, rake=0.06, b=(-0.02, 0.03, 0.02))

def pod_rule(q):
    if q.inner is True or q.cap: return CF
    if q.inner == 'lip': return P2
    if q.u < 1.95 or q.u > 4.2: return CF
    if 2.75 < q.u < 3.1 and q.x > -1.7: return P2                   # the band carries on along the pods
    return P1

def nac_rule(q):
    if q.inner: return CF
    if q.cap: return GLOW if q.x > 2 else CF                        # the mouth framed in light
    if q.x > 2.5 and (0.1 < q.u < 0.9 or 3.3 < q.u < 3.9): return GLOW   # strips down both walls
    if 1.7 < q.u < 2.15: return P2                                  # the band over the shoulder
    if q.u < 1.0: return CF
    return P1

def hood_rule(q):
    if q.inner: return CF
    s = 1.2 + (q.x - 60) / 50                                       # an accent slash across the hood
    if abs(q.u - s) < 0.22 and 60 < q.x < 150: return P2
    return P1 if q.u < 2.6 else CF

SPEC = dict(
    BODY=BODY, body_segs=(2, 5, 12, 12), body_rule=body_rule,
    POD=POD, pod_segs=(3, 5, 12, 8, 3), pod_rule=pod_rule,
    NAC=dict(rows=nac_rows(front=2.64, mouth=0.6, top=0.8, bulge=0.0, crease=True, rake=0.0), sharp=(False, True, True, True, False), segs=(6, 9, 9, 7),
             rule=nac_rule, mouth=(2.64, 2.0, 0.63, 1.02), vanes=(0.2, 0.33)),
    FENDERS=[rear_hood(hood_rule, a0=38, a1=170)],
    floor=FLOOR, floor_fences=(),
    fwing=fwing(lambda k, q: P2 if k == 1 and q.u > 0.6 else CF, x0=2.86, span=1.04, flaps=2),
    rwing=rwing(lambda k, q: P2 if not q.inner and k == 0 else CF, lambda q: GLOW if q.p.x < -2.44 and q.p.z > 1.0 else CF, span=0.98, z=0.95, pylons='twin'),
    fin=([(-0.86, 0.70), (-1.95, 0.74), (-2.04, 0.95), (-1.92, 0.97), (-1.3, 0.85)], lambda q: P2 if q.p.z > 0.9 else P1),
    canopy=dict(zb=0.46, round=2.1, bar=(0.95, -0.55, 0.022), rows=canopy_rows(1.15, -0.72, 0.29, 0.86)),
    mirror_at=(0.78, 0.47, 0.67), helmet_x=0.14,
    wheels=dict(ring=P2, spokes=10, style='turbine', tyre_ring=None),
)

def build(lod):
    return build_car(SPEC, lod)
