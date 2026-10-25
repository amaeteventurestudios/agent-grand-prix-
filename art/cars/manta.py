# AGP-06 Manta: dark, with big front-wheel nacelles whose wide mouths carry a light bar along their
# floor, accent stripes along the nacelle tops and down the nose, a bubble canopy, long pods with an
# accent sweep, hooded rear wheels with accent flashes, and an arched wing that springs from the rear
# haunches and curves up over the engine like a manta's back.
import math
from mathutils import Vector
from carkit import *
from openwheel import build_car, lerp_table, rel_height, CAMS

MONO = [  # x, half-width, bottom, top, top roundness
    (2.84, 0.050, 0.126, 0.152, 2.2),
    (2.64, 0.150, 0.108, 0.205, 4.2),
    (2.32, 0.205, 0.100, 0.275, 4.2),
    (1.94, 0.228, 0.096, 0.352, 3.8),
    (1.52, 0.244, 0.095, 0.432, 3.4),
    (1.10, 0.265, 0.094, 0.510, 3.1),
    (0.66, 0.302, 0.093, 0.555, 3.0),
    (0.24, 0.314, 0.092, 0.566, 3.0),
    (-0.24, 0.302, 0.092, 0.580, 3.0),
    (-0.72, 0.270, 0.096, 0.640, 2.9),
    (-1.20, 0.220, 0.106, 0.660, 2.7),
    (-1.62, 0.168, 0.124, 0.580, 2.5),
    (-1.98, 0.122, 0.158, 0.452, 2.2),
    (-2.26, 0.072, 0.205, 0.340, 2.0),
]
POD = [  # x, centre y, half-width, bottom, top
    (1.02, 0.47, 0.080, 0.250, 0.390),
    (0.90, 0.51, 0.170, 0.200, 0.455),
    (0.50, 0.55, 0.220, 0.160, 0.495),
    (-0.10, 0.56, 0.225, 0.140, 0.505),
    (-0.70, 0.54, 0.210, 0.130, 0.500),
    (-1.15, 0.49, 0.175, 0.135, 0.470),
    (-1.50, 0.39, 0.110, 0.150, 0.390),
    (-1.76, 0.28, 0.040, 0.165, 0.300),
]

def mono_rule(p, n):
    h = rel_height(MONO, p)
    if h < 0.3 or p.x < -1.9: return CF
    # a single accent line down each side of the nose deck, and a short centre dash at the tip
    w = lerp_table(MONO, p.x, 1)
    if 0.8 < p.x < 2.6 and n.z > 0.3 and abs(abs(p.y) - 0.55 * w) < 0.022: return P2
    if 0.5 < p.x < 1.2 and n.z > 0.3 and abs(p.y) < 0.022: return P2
    return P1

def pod_rule(s):
    def r(p, n):
        x = p.x
        if x > 0.94 and n.x > 0.5: return CF
        if rel_height(POD, p, 3, 4) < 0.3: return CF
        yc, hw = lerp_table(POD, x, 1), lerp_table(POD, x, 2)
        if abs(p.y) > yc + 0.25 * hw and -1.4 < x < 0.8:
            t = (0.8 - x) / 2.2
            zc = 0.43 - 0.08 * t
            if abs(p.z - zc) < 0.028: return P2                     # a long accent line along the shoulder
        if abs(p.y) > yc + 0.5 * hw and -0.7 < x < 0.5 and p.z < 0.33: return CF   # a carbon vent panel
        return P1
    return r

def nacelle_paint(s, hub, p, n, u):
    inward = (p.y - hub.y) * s
    if n.z < -0.3 and 0.04 < u < 0.12 and abs(inward) < 0.15: return GLOW         # a light bar under the mouth's roof
    if n.z < -0.3 or (abs(inward) < 0.19 and p.z < hub.z + 0.32 and n.z < 0.5): return CF
    if n.z > 0.2 and abs(inward - 0.12) < 0.035 and u < 0.85: return P2    # accent stripe along the outer top
    if u < 0.05 and abs(n.y) > 0.3: return P2                          # accent rim round the mouth
    return P1

def rfender_paint(s, hub, p, nn):
    out = p - hub; out.y = 0
    ang = math.degrees(math.atan2(out.z, out.x))
    if (p.y - hub.y) * s > 0.19 and 60 < ang < 110: return P2          # accent flash on the haunch
    return P1 if (p.y - hub.y) * s > -0.19 else CF

def hoops(lod, parts):
    # the rear wing hangs between two curved hoops that spring from the rear haunches, sweep up and
    # back and turn in to meet the wing tips
    k = (10, 6, 3)[lod]
    for s in (1, -1):
        rings = []
        for i in range(k + 1):
            t = i / k
            # a quadratic curve from the haunch up to the wing tip
            p0, p1, p2 = Vector((-1.25, 0.84, 0.6)), Vector((-1.7, 0.9, 1.0)), Vector((-2.08, 0.74, 1.1))
            c = p0 * (1 - t) ** 2 + p1 * 2 * t * (1 - t) + p2 * t * t
            rings.append(superellipse(0, 0.026, -0.075, 0.075, (10, 6, 4)[lod], 2.4, 2.4))
            # superellipse gives a ring in the y-z plane at x=0; lay it flat (x, y) at height c.z
            rings[-1] = [Vector((c.x + q.z, s * c.y + q.y, c.z)) for q in rings[-1]]
        parts.append(paint(finish(loft('hoop', rings), (1, 0, 0)[lod]), lambda p, nn: P2 if nn.x > 0.5 else CF))

SPEC = dict(
    MONO=MONO, POD=POD, mono_rule=mono_rule, pod_rule=pod_rule,
    nacelle=dict(x=(2.44, 1.28), hw=((2.44, 0.225), (1.9, 0.245), (1.28, 0.24)), top=((2.44, 0.58), (1.95, 0.72), (1.28, 0.64)),
                 zb=((2.44, 0.08), (2.1, 0.08), (1.75, 0.28), (1.28, 0.46)), t=0.035),
    nacelle_paint=nacelle_paint,
    cheek=((0.22, 2.3, 0.25, 0.4, -2), (0.44, 2.28, 0.31, 0.38, -4), (0.62, 2.24, 0.38, 0.34, -8)), cheek_paint=lambda p, n: CF,
    fwing=((0.07, 0.44, 2.98, 2, 0.02), (0.13, 0.26, 2.72, 14, 0.015)),
    fwing_span=1.04, fwing_sweep=0.08, fwing_rise=0.0,
    # a light bar along the mouth's floor: the lower element where it passes under each nacelle
    fwing_paint=lambda k, p, n, u: P2 if k == 0 and abs(p.y) > 0.98 else CF,
    mouth_paint=lambda p, n, u: GLOW if u < 0.2 and (n.z > 0.5 or n.x > 0.5) and abs(abs(p.y) - 0.83) < 0.13 else (P2 if u < 0.05 else CF),
    fplate=None, barge=False,
    fenders=(('RL', (14, 196, 0.07, 0.11, 0.12)),), fender_paint=rfender_paint, fender_smooth=0.01,
    rwing=((1.08, 0.38, -1.94, 5, 0.022), (1.2, 0.2, -2.24, 24, 0.015)), rwing_span=0.76, rplate=None, pylons=(), extras=hoops,
    rwing_paint=lambda k, p, n: P2 if (k == 1 and n.z > 0.2) or abs(p.y) > 0.66 else CF,
    airbox=((-0.46, 0.1, 0.78), (-0.58, 0.12, 0.82), (-0.92, 0.1, 0.76), (-1.22, 0.04, 0.66)),
    airbox_paint=lambda p, n: CF if n.x > 0.6 else (P2 if n.z > 0.5 and abs(p.y) < 0.03 else P1),
    fin=((-0.98, 0.64, 0.74), (-1.4, 0.6, 0.86), (-1.7, 0.56, 0.9)), fin_paint=lambda p, n: CF,
    glass=((1.12, 0.04, 0.5), (0.86, 0.22, 0.7), (0.45, 0.3, 0.84), (0.05, 0.31, 0.86), (-0.32, 0.24, 0.79), (-0.55, 0.11, 0.71), (-0.66, 0.02, 0.67)), glass_zb=0.44,
    helmet_x=0.16, wheel_ring=P2, diffuser_light=True,
)

def build(lod):
    return build_car(SPEC, lod)
