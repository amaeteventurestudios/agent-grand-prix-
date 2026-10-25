# AGP-10 Tempest: dark and glossy, with a front wing whose inner tunnels are lined in the accent
# colour, short carbon hoods over the top and front of the front wheels, accent-lined sidepod intakes,
# an intake scoop over the canopy, a shrouded turbine fan standing on the engine cover behind the
# airbox, accent wheel rings, and a tall rear wing with accent edges.
import math
from mathutils import Vector
from carkit import *
from openwheel import build_car, lerp_table, rel_height, CAMS

MONO = [  # x, half-width, bottom, top, top roundness
    (2.90, 0.045, 0.142, 0.168, 2.2),
    (2.70, 0.140, 0.124, 0.215, 4.6),
    (2.36, 0.200, 0.114, 0.282, 4.6),
    (1.96, 0.222, 0.108, 0.360, 4.2),
    (1.52, 0.238, 0.102, 0.445, 3.8),
    (1.08, 0.258, 0.098, 0.520, 3.4),
    (0.66, 0.292, 0.095, 0.565, 3.2),
    (0.26, 0.302, 0.092, 0.575, 3.1),
    (-0.22, 0.294, 0.092, 0.590, 3.0),
    (-0.70, 0.262, 0.096, 0.665, 2.9),
    (-1.18, 0.214, 0.106, 0.680, 2.7),
    (-1.60, 0.162, 0.122, 0.585, 2.5),
    (-1.98, 0.120, 0.155, 0.455, 2.2),
    (-2.26, 0.070, 0.200, 0.340, 2.0),
]
POD = [  # x, centre y, half-width, bottom, top
    (0.68, 0.51, 0.120, 0.230, 0.440),
    (0.56, 0.53, 0.195, 0.185, 0.480),
    (0.24, 0.54, 0.212, 0.155, 0.495),
    (-0.28, 0.52, 0.200, 0.140, 0.475),
    (-0.80, 0.45, 0.165, 0.130, 0.435),
    (-1.24, 0.36, 0.115, 0.133, 0.375),
    (-1.60, 0.27, 0.060, 0.148, 0.305),
    (-1.82, 0.22, 0.024, 0.162, 0.265),
]

def mono_rule(p, n):
    h = rel_height(MONO, p)
    if h < 0.3 or p.x < -1.9: return CF
    w = lerp_table(MONO, p.x, 1)
    # thin accent lines sweeping from the nose up over the cockpit shoulders
    if 0.5 < p.x < 2.6 and n.z > 0.1 and abs(abs(p.y) - (0.62 * w + 0.02)) < 0.022: return P2
    return P1

def pod_rule(s):
    def r(p, n):
        x = p.x
        if x > 0.62 and n.x > 0.55: return CF                      # the intake mouth
        if x > 0.5 and n.x > 0.2: return P2                        # its accent lining
        if rel_height(POD, p, 3, 4) < 0.3: return CF
        yc, hw = lerp_table(POD, x, 1), lerp_table(POD, x, 2)
        # an accent blade low on the flank, pointing back
        if abs(p.y) > yc + 0.4 * hw and -1.1 < x < 0.3:
            t = (0.3 - x) / 1.4
            if abs(p.z - (0.25 + 0.03 * t)) < 0.03 * (1 - t) + 0.012: return P2
        return P1
    return r

def fender_paint(s, hub, p, nn):
    if (p.y - hub.y) * s < -0.17: return P2                         # accent inner edge
    out = p - hub; out.y = 0
    if math.degrees(math.atan2(out.z, out.x)) < -2: return P2      # accent tip at the front
    return CF

def turbine(lod, parts):
    if lod > 1: return
    xc, zc, R, depth = -1.1, 0.9, 0.25, 0.16
    n = (28, 16)[lod]
    def circ(x, r): return [Vector((x, r * math.cos(2 * math.pi * i / n), zc + r * math.sin(2 * math.pi * i / n))) for i in range(n)]
    x0, x1 = xc + depth / 2, xc - depth / 2
    # the shroud: a short tube with a rounded front lip
    rings = [circ(x0 - 0.01, R - 0.025), circ(x0, R - 0.01), circ(x0 - 0.005, R + 0.012), circ(x1, R + 0.012), circ(x1, R - 0.025)]
    tube = loft('shroud', rings, cap=False)
    parts.append(paint(finish(tube, 0), lambda p, nn: P2 if p.x > x0 - 0.02 else CF))
    hub = loft('fanhub', [superellipse(x, r, zc - r, zc + r, (12, 8)[lod], 2, 2) for (x, r) in ((x0 + 0.02, 0.01), (x0 - 0.01, 0.05), (x1 + 0.02, 0.055), (x1, 0.03))])
    parts.append(paint(finish(hub, 0), solid(MT)))
    for b in range((13, 9)[lod]):
        a = 2 * math.pi * b / (13, 9)[lod]
        ca, sa = math.cos(a), math.sin(a)
        blade = []
        for (r, tw) in ((0.05, 38), (R - 0.03, 22)):
            ring = []
            for (u, v) in ((-0.03, -0.004), (0.03, -0.004), (0.03, 0.004), (-0.03, 0.004)):
                # a flat blade twisted about its radial axis
                t = math.radians(tw)
                bx, bt = u * math.sin(t) + v * math.cos(t), u * math.cos(t) - v * math.sin(t)
                ring.append(Vector((xc + bx, r * ca - bt * sa, zc + r * sa + bt * ca)))
            blade.append(ring)
        parts.append(paint(finish(loft('blade', blade), 0, False), solid(MT)))
    # a pylon tying the shroud down to the engine cover
    py = loft('fanpylon', [[Vector((x, yy, z)) for (yy, z) in ((-0.015, 0.6), (0.015, 0.6), (0.015, zc - R + 0.01), (-0.015, zc - R + 0.01))] for x in (xc + 0.05, xc - 0.07)])
    parts.append(paint(finish(py, 0, False), solid(CF)))

def scoop(lod, parts):
    if lod > 1: return
    sc = loft('scoop', [superellipse(x, w, zb, zt, (12, 8)[lod], 3.2, 3.2) for (x, w, zb, zt) in
                        ((-0.22, 0.05, 0.79, 0.84), (-0.3, 0.085, 0.77, 0.9), (-0.5, 0.08, 0.77, 0.89), (-0.66, 0.04, 0.75, 0.82))])
    parts.append(paint(finish(sc, 1), lambda p, n: CF if n.x > 0.6 else (P2 if n.x > 0.15 else P1)))

def extras(lod, parts):
    turbine(lod, parts); scoop(lod, parts)

SPEC = dict(
    MONO=MONO, POD=POD, mono_rule=mono_rule, pod_rule=pod_rule,
    fwing=((0.07, 0.46, 3.04, 2, 0.02), (0.135, 0.32, 2.78, 12, 0.016), (0.205, 0.24, 2.6, 22, 0.013)),
    fwing_span=1.08, fwing_sweep=0.32, fwing_rise=0.1,
    # the inner tunnels: accent on the upper faces between the nose and the outer third
    fwing_paint=lambda k, p, n, u: P2 if (n.z > 0.2 and 0.26 < abs(p.y) < 0.76) or (k == 0 and u > 0.85) else CF,
    fplate=((3.04, 0.04, 0.18), (2.86, 0.04, 0.44), (2.5, 0.05, 0.42), (2.22, 0.08, 0.22)), fplate_y=1.06,
    fplate_paint=lambda s, p, n: P2 if n.y * s < -0.5 or p.x > 2.94 else CF,
    fins=((0.3, CF), (0.76, CF)),
    fenders=(('FL', (-14, 112, 0.06, 0.1, 0.06)),), fender_paint=fender_paint,
    rwing=((1.0, 0.36, -1.95, 5, 0.022), (1.14, 0.22, -2.23, 24, 0.015)), rwing_span=0.72,
    rwing_paint=lambda k, p, n: P2 if (k == 1 and p.x < -2.38) or (k == 0 and n.x > 0.5) else CF,
    rplate=((-1.86, 0.88, 1.16), (-2.18, 0.76, 1.3), (-2.54, 0.7, 1.38)),
    rplate_paint=lambda p, n: P2 if p.x > -1.94 or p.z > 1.28 or p.x < -2.46 else CF,
    pylons=(-0.18, 0.18),
    airbox=((-0.38, 0.11, 0.8), (-0.5, 0.12, 0.82), (-0.8, 0.1, 0.75), (-0.98, 0.05, 0.69)),
    airbox_paint=lambda p, n: CF if n.x > 0.6 else P1,
    fin=((-1.28, 0.62, 0.72), (-1.62, 0.58, 0.86), (-1.95, 0.5, 0.96)), fin_paint=lambda p, n: P2 if p.z > 0.86 else CF,
    helmet_x=0.2, wheel_ring=P2, barge=True, extras=extras,
)

def build(lod):
    return build_car(SPEC, lod)
