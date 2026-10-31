# AGP-03 Spectre: graphite, with rounded front-wheel nacelles whose intake mouths are lined in the
# accent colour and edged with light strips, a broad nose with twin accent bands, a low bubble canopy
# with accent shoulders, sculpted sidepods with deep accent-lined cuts, hooded rear wheels and a wide
# rear wing with accent tips on a single swan neck.
from carkit import *
from hyper import *
from base import *

BODY = body('broad', b1=0.1, b2=0.06)

def body_rule(q):
    if q.cap or q.x < -2.15 or q.u < 1.85: return CF
    for c in (3.25, 3.55):                                          # twin accent bands down the nose
        if abs(q.u - c) < 0.08 and 1.1 < q.x < 2.7: return P2
    if 2.86 < q.u < 3.0 and q.x < 1.1: return P2                    # accent shoulders past the cockpit
    return P1

POD = pods(x0=0.95, w=1.04, h=1.0, under=1.3, rake=0.08, b=(-0.06, 0.16, 0.12))

def pod_rule(q):
    if q.inner is True: return P2                                   # the inlet duct is lined in the accent colour
    if q.cap: return CF
    if q.inner == 'lip': return CF
    if q.u < 1.95 or q.u > 4.2: return CF
    c = 2.3 + 0.7 * max(0.0, min(1.0, (0.5 - q.x) / 1.8))
    if q.x > -1.6 and q.u < c - 0.12: return CF                     # a deep cut...
    if q.x > -1.6 and q.u < c: return P2                            # ...edged in the accent colour
    return P1

def nac_rule(q):
    if q.inner: return P2 if q.x > 2.25 else CF                     # the mouth lined in the accent colour
    if q.cap: return GLOW if q.x > 2 else CF                        # its rim lit
    e = 1.0 + 0.55 * max(0.0, min(1.0, (2.3 - q.x) / 0.9))          # a carbon sweep rising towards the wheel
    if q.u < e: return CF
    if q.u < e + 0.16: return P2
    return P1

def hood_rule(q):
    if q.inner: return CF
    if q.u < 0.45: return P2
    return P1 if q.u < 2.6 else CF

SPEC = dict(
    BODY=BODY, body_segs=(2, 5, 12, 14), body_rule=body_rule,
    POD=POD, pod_segs=(3, 5, 12, 8, 3), pod_rule=pod_rule,
    NAC=dict(rows=nac_rows(front=2.6, mouth=0.5, top=0.78, bulge=0.12, crease=False), sharp=(False, True, False, True, False), segs=(6, 9, 9, 7),
             rule=nac_rule, mouth=(2.6, 2.0, 0.63, 1.02), vanes=(0.2,)),
    FENDERS=[rear_hood(hood_rule, a0=40, a1=172)],
    floor=FLOOR, floor_fences=(),
    fwing=fwing(lambda k, q: P2 if k == 0 and q.u < 0.1 else CF, x0=2.84, span=1.04, flaps=1),
    rwing=rwing(lambda k, q: P2 if q.x > 0.8 else CF, lambda q: P2 if q.p.z > 1.1 else CF, span=1.0, z=0.94, pylons='single'),
    fin=([(-0.86, 0.70), (-1.95, 0.74), (-2.04, 0.93), (-1.92, 0.95), (-1.3, 0.84)], lambda q: P1),
    canopy=dict(zb=0.46, round=2.2, bar=None, rows=canopy_rows(1.15, -0.75, 0.29, 0.79)),
    mirror_at=(0.78, 0.47, 0.66), helmet_x=0.14,
    wheels=dict(ring=P2, spokes=5, style='straight', tyre_ring=None),
)

def build(lod):
    return build_car(SPEC, lod)
