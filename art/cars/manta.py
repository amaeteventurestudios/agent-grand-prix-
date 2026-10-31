# AGP-06 Manta: dark, with big front-wheel nacelles whose wide mouths carry a light bar along their
# floor, accent stripes along the nacelle tops and down the nose, a bubble canopy, long pods with an
# accent sweep, hooded rear wheels with accent flashes, and an arched wing that springs from the rear
# haunches and curves up over the engine like a manta's back.
import math
from carkit import *
from hyper import *
from base import *

BODY = body('broad', b1=0.08, b2=0.06)

def body_rule(q):
    if q.cap or q.x < -2.15 or q.u < 1.85: return CF
    if q.u > 3.88 and 0.9 < q.x < 2.72: return P2                   # a stripe down the middle of the nose
    if q.u < 2.86 and q.x > 1.0: return CF
    return P1

POD = pods(x0=0.95, w=1.02, h=1.0, under=1.2, rake=0.08, b=(-0.04, 0.12, 0.1))

def pod_rule(q):
    if q.inner is True or q.cap: return CF
    if q.inner == 'lip': return P2
    if q.u < 1.95 or q.u > 4.2: return CF
    c = 2.2 + 0.9 * max(0.0, min(1.0, (0.6 - q.x) / 1.9))
    if abs(q.u - c) < 0.14 and -1.7 < q.x < 0.9: return P2
    if q.u < c: return CF
    return P1

def nac_rule(q):
    if q.inner: return CF
    if q.cap: return P2 if q.x > 2 else CF
    if 2.1 < q.u < 2.4: return P2                                   # a stripe along the top
    if q.u < 1.0: return CF
    if 1.6 < q.x < 2.45 and abs(q.u - (1.0 + 1.1 * abs(q.x - 2.02) / 0.43)) < 0.14: return P2   # a chevron on the wall
    return P1

def hood_rule(q):
    if q.inner: return CF
    if q.u < 0.4 and 80 < q.x < 160: return P2
    return P1 if q.u < 2.6 else CF

def arch(lod, parts):
    # the wing: a blade rising from each rear haunch and arching over the engine cover
    n = (24, 12, 6)[lod]
    path = []
    for i in range(n + 1):
        t = -1 + 2 * i / n
        a = t * math.pi / 2
        path.append((-2.05 - 0.12 * (1 - abs(t)), 0.9 * math.sin(a), 0.5 + 0.55 * math.cos(a) ** 0.7))
    parts.append(sweep_blade('arch', path, 0.36, 0.03, lambda q: P2 if q.u > 0.6 and not q.inner else CF, lod, pitch=4))
    # the light bars along each wide mouth's floor
    for s in (1, -1):
        parts.append(plate('mouthlight', [(2.6, s * 0.7), (2.6, s * 0.98), (2.56, s * 0.98), (2.56, s * 0.7)], 0.02,
                           lambda q: GLOW if q.n.z > 0.5 or q.n.x > 0.5 else CF, frame='xy', at=0.09))

SPEC = dict(
    BODY=BODY, body_segs=(2, 5, 12, 14), body_rule=body_rule,
    POD=POD, pod_segs=(3, 5, 12, 8, 3), pod_rule=pod_rule,
    NAC=dict(rows=nac_rows(front=2.62, mouth=0.46, top=0.79, bulge=0.1, crease=False), sharp=(False, True, False, True, False), segs=(6, 9, 9, 7),
             rule=nac_rule, mouth=(2.62, 2.0, 0.63, 1.02), vanes=()),
    FENDERS=[rear_hood(hood_rule, a0=40, a1=175)],
    floor=FLOOR, floor_fences=(),
    fwing=fwing(lambda k, q: P2 if k == 1 and q.u > 0.6 else CF, x0=2.84, span=1.04, flaps=1),
    rwing=dict(span=0.9, elements=[], paint=lambda k, q: CF, plate=None, plate_paint=solid(CF), pylons=[]),
    canopy=dict(zb=0.46, round=2.2, bar=(0.95, -0.5, 0.02), rows=canopy_rows(1.18, -0.75, 0.29, 0.83)),
    mirror_at=(0.78, 0.47, 0.66), helmet_x=0.14, extras=arch,
    wheels=dict(ring=P2, spokes=6, style='turbine', tyre_ring=P2),
)

def build(lod):
    return build_car(SPEC, lod)
