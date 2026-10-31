# AGP-10 Tempest: dark and glossy, with a front wing whose inner tunnels are lined in the accent
# colour, short carbon hoods over the top and front of the front wheels, accent-lined sidepod intakes,
# an intake scoop over the canopy, a shrouded turbine fan standing on the engine cover behind the
# airbox, accent wheel rings, and a tall rear wing with accent edges.
import math
from mathutils import Vector, Matrix
from carkit import *
from hyper import *
from base import *

BODY = body('needle', b1=0.08, b2=0.05)

def body_rule(q):
    if q.cap or q.x < -2.15 or q.u < 1.85: return CF
    if 2.88 < q.u < 3.02 and q.x > 0.6: return P2
    if q.u < 2.88 and q.x > 1.0: return CF
    return P1

POD = pods(x0=0.85, w=1.0, h=0.95, under=1.25, rake=0.1)

def pod_rule(q):
    if q.inner is True or q.cap: return CF
    if q.inner == 'lip' or q.x > 0.8: return P2
    if q.u < 2.2 or q.u > 4.2: return CF
    c = 2.4 + 0.6 * max(0.0, min(1.0, (0.4 - q.x) / 1.8))
    if abs(q.u - c) < 0.13 and q.x > -1.6: return P2
    if q.u < c: return CF
    return P1

def hood_rule(q):
    if q.inner: return CF
    if q.u < 0.5 or q.x < 14: return P2
    return CF

def fwing_paint(k, q):
    if k == 0 and q.x < 0.62 and not q.inner and q.u > 0.3: return P2   # the tunnels under the nose
    if k == 2 and q.u > 0.75: return P2
    return CF

def turbine(lod, parts):
    """The shrouded fan on the engine cover: a ring facing back, blades inside, a hub."""
    if lod == 2: return
    cx, cz, R = -1.62, 0.9, 0.2
    def place(ob):
        # lathe parts spin round Y; turn them to face back along X and move them up behind the airbox
        ob.data.transform(Matrix.Rotation(math.radians(90), 4, 'Z'))
        ob.data.transform(Matrix.Translation((cx, 0, cz)))
        return ob
    shroud = lathe('shroud', [(R + 0.035, -0.08), (R + 0.045, 0.0), (R + 0.03, 0.09), (R, 0.09), (R - 0.005, 0.0), (R, -0.08)], (40, 20, 8)[lod])
    paint(shroud, lambda p, n: P2 if abs(p.x - cx) > 0.075 else CF)
    parts.append(place(shroud))
    hub = lathe('hub', [(0.0, -0.06), (0.05, -0.04), (0.05, 0.05), (0.0, 0.06)], 16)
    paint(hub, solid(MT)); parts.append(place(hub))
    nb = 16 if lod == 0 else 8
    for k in range(nb):
        a = 2 * math.pi * k / nb
        ring = []
        for (r0, tw) in ((0.05, 0.4), (R - 0.004, 0.75)):
            c, s = math.cos(a), math.sin(a)
            pts = []
            for (dw, dd) in ((-0.03, -0.01), (0.03, 0.01), (0.03, 0.016), (-0.03, -0.004)):
                ang = a + dw / r0 * 0.6
                pts.append(Vector((cx + dd * 2 + dw * math.sin(tw), r0 * math.cos(ang), cz + r0 * math.sin(ang))))
            ring.append(pts)
        bl = loft('blade', ring); paint(bl, solid(MT)); parts.append(bl)
    # the pylon it stands on
    parts.append(plate('fanpost', [(-1.45, 0.6), (-1.78, 0.6), (-1.72, 0.74), (-1.52, 0.74)], 0.06, solid(CF), at=0.0))

SPEC = dict(
    BODY=BODY, body_segs=(2, 5, 12, 10), body_rule=body_rule,
    POD=POD, pod_segs=(3, 5, 12, 8, 3), pod_rule=pod_rule,
    FENDERS=[dict(key='FL', a0=12, a1=118, rule=hood_rule, sharp=(True, True, False, True), segs=(3, 7, 7),
                  prof=[(0.37, -0.05, 0), (0.37, 0.0, 0.04), (0.18, 0.03, 0.03), (0.0, 0.0, 0)],
                  stay=[((1.66, 0.66, 0.72), (1.45, 0.25, 0.46))])],
    floor=FLOOR, floor_fences=((-0.88, -1.1, 0.82, 0.1),),
    fwing=fwing(fwing_paint, x0=2.92, span=1.04, cascade=1.1,
                plate=[(2.9, 0.05), (2.9, 0.16), (2.76, 0.4), (2.5, 0.4), (2.3, 0.2), (2.26, 0.05)], plate_y=1.05,
                plate_paint=lambda q: P2 if q.n.y * (1 if q.p.y > 0 else -1) < -0.5 else CF),
    rwing=rwing(lambda k, q: P2 if q.u > 0.85 and not q.inner else CF,
                lambda q: P2 if q.p.x < -2.42 or q.p.z > 1.22 else CF, span=0.92, z=1.02, pylons='twin'),
    AIRBOX=dict(rows=[(0.05, [(0, 0.72, 0), (0.06, 0.72, 0), (0.08, 0.79, 0.03), (0.06, 0.86, 0.03), (0, 0.88, 0)]),
                      (-0.25, [(0, 0.72, 0), (0.09, 0.72, 0), (0.1, 0.8, 0.03), (0.07, 0.88, 0.03), (0, 0.9, 0)]),
                      (-0.8, [(0, 0.62, 0), (0.09, 0.62, 0), (0.1, 0.72, 0.03), (0.07, 0.8, 0.03), (0, 0.82, 0)]),
                      (-1.3, [(0, 0.58, 0), (0.05, 0.58, 0), (0.05, 0.63, 0.03), (0.04, 0.67, 0.03), (0, 0.68, 0)])],
                sharp=(False, True, True, True, True), segs=(2, 3, 5, 6), open=True,
                rule=lambda q: CF if q.cap else (P2 if q.x > -0.02 else P1)),
    canopy=dict(zb=0.46, round=2.3, bar=(0.95, 0.15, 0.02), rows=canopy_rows(1.22, -0.6, 0.27, 0.8)),
    mirror_at=(0.8, 0.45, 0.66), helmet_x=0.14, extras=turbine,
    wheels=dict(ring=P2, spokes=12, style='turbine', tyre_ring=P2),
)

def build(lod):
    return build_car(SPEC, lod)
