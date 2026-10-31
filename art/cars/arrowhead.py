# AGP-05 Arrowhead: sharp and angular, a long flat-sided nose with a bold accent stripe from its tip
# back along each flank and onto the sidepods, a fighter-jet intake scoop over the canopy, long low
# slab-sided pods, a wide multi-element front wing with accent trailing edges and tall endplates,
# open wheels with accent rims, and a rear wing with accent endplate edges.
from carkit import *
from hyper import *
from base import *

BODY = body('needle', b1=0.01, b2=0.02)

def body_rule(q):
    if q.cap or q.x < -2.15 or q.u < 1.85: return CF
    if 2.2 < q.u < 2.72 and q.x > 0.55: return P2                  # the bold stripe down each flank
    if q.u > 3.88 and 1.3 < q.x < 2.7: return P2
    return P1

POD = pods(x0=0.8, w=1.02, h=0.86, under=1.1, rake=0.12, b=(-0.02, 0.02, 0.02))

def pod_rule(q):
    if q.inner is True or q.cap: return CF
    if q.inner == 'lip': return P2
    if q.u < 1.95 or q.u > 4.2: return CF
    top = 2.25 + 0.5 * max(0.0, min(1.0, (0.2 - q.x) / 1.6))       # the flank stripe carries on, rising
    if top < q.u < top + 0.5 and q.x > -1.6: return P2
    return P1

def fwing_paint(k, q):
    if k > 0 and q.u > 0.7 and not q.inner: return P2
    return CF

SPEC = dict(
    BODY=BODY, body_segs=(2, 8, 12, 10), body_rule=body_rule,
    POD=POD, pod_segs=(3, 5, 12, 8, 3), pod_rule=pod_rule,
    floor=FLOOR, floor_fences=((-0.88, -1.1, 0.82, 0.1),),
    fwing=fwing(fwing_paint, x0=2.94, span=1.05, cascade=1.3, sweep=1.3,
                plate=[(2.93, 0.05), (2.93, 0.2), (2.8, 0.46), (2.62, 0.46), (2.4, 0.22), (2.26, 0.05)], plate_y=1.06,
                plate_paint=lambda q: P2 if q.p.x > 2.88 or q.p.z > 0.42 else CF),
    rwing=rwing(lambda k, q: P2 if k == 1 and q.u > 0.75 and not q.inner else CF,
                lambda q: P2 if q.p.x < -2.42 or q.p.z > 1.17 else CF, span=0.9, z=0.95, pylons='twin'),
    AIRBOX=dict(rows=[(0.06, [(0, 0.72, 0), (0.06, 0.72, 0), (0.08, 0.80, 0.03), (0.06, 0.88, 0.03), (0, 0.9, 0)]),
                      (-0.25, [(0, 0.72, 0), (0.1, 0.72, 0), (0.11, 0.82, 0.03), (0.08, 0.91, 0.03), (0, 0.93, 0)]),
                      (-0.8, [(0, 0.62, 0), (0.1, 0.62, 0), (0.11, 0.74, 0.03), (0.08, 0.84, 0.03), (0, 0.86, 0)]),
                      (-1.5, [(0, 0.55, 0), (0.05, 0.55, 0), (0.05, 0.62, 0.03), (0.04, 0.68, 0.03), (0, 0.69, 0)])],
                sharp=(False, True, True, True, True), segs=(2, 3, 5, 6), open=True,
                rule=lambda q: CF if q.cap else (P2 if q.x > -0.05 else P1)),
    fin=([(-1.3, 0.70), (-1.95, 0.74), (-2.04, 0.97), (-1.92, 0.99), (-1.5, 0.8)], lambda q: P2 if q.p.z > 0.92 else CF),
    canopy=dict(zb=0.46, round=2.6, bar=(0.95, 0.2, 0.02), rows=canopy_rows(1.25, -0.6, 0.26, 0.8)),
    mirror_at=(0.8, 0.45, 0.66), helmet_x=0.14,
    wheels=dict(ring=P2, spokes=6, style='straight', tyre_ring=None),
)

def build(lod):
    return build_car(SPEC, lod)
