# AGP-09 Peregrine: a long, broad shovel nose with an accent chevron, a narrow monocoque and closed
# canopy, separate sculpted sidepods with a deep carbon scoop edged in the accent colour, carbon
# fenders over all four wheels with light strips down their leading edges, a multi-element front wing
# with accent fins, a tall airbox with an accent lip, and a carbon rear wing with an accent flap.
import math
from mathutils import Vector
from carkit import *
from openwheel import build_car, lerp_table, CAMS

MONO = [  # x, half-width, bottom, top, top roundness
    (2.88, 0.050, 0.140, 0.165, 2.4),
    (2.72, 0.160, 0.122, 0.205, 5.0),
    (2.42, 0.235, 0.112, 0.255, 5.0),
    (2.02, 0.265, 0.106, 0.320, 4.6),
    (1.58, 0.270, 0.100, 0.400, 4.2),
    (1.12, 0.262, 0.098, 0.478, 3.8),
    (0.72, 0.290, 0.095, 0.530, 3.4),
    (0.30, 0.300, 0.092, 0.545, 3.3),
    (-0.20, 0.292, 0.092, 0.560, 3.1),
    (-0.70, 0.262, 0.096, 0.655, 2.9),
    (-1.18, 0.215, 0.106, 0.680, 2.7),
    (-1.60, 0.165, 0.122, 0.580, 2.5),
    (-1.98, 0.125, 0.155, 0.455, 2.2),
    (-2.26, 0.075, 0.200, 0.340, 2.0),
]
POD = [  # x, centre y, half-width, bottom, top
    (0.66, 0.50, 0.120, 0.235, 0.425),
    (0.55, 0.52, 0.185, 0.190, 0.470),
    (0.25, 0.53, 0.205, 0.160, 0.495),
    (-0.25, 0.52, 0.200, 0.145, 0.490),
    (-0.75, 0.46, 0.170, 0.135, 0.455),
    (-1.20, 0.37, 0.125, 0.135, 0.400),
    (-1.55, 0.29, 0.075, 0.145, 0.335),
    (-1.80, 0.23, 0.030, 0.160, 0.280),
]

def chevron(p):
    # the accent chevron: two bands sweeping back from the nose tip and out along the cockpit
    if p.x < 0.35 or p.x > 2.78: return 1
    edge = 0.035 + (2.78 - p.x) * 0.105
    return abs(abs(p.y) - edge) / 0.032

def mono_rule(p, n):
    zb, zt = lerp_table(MONO, p.x, 2), lerp_table(MONO, p.x, 3)
    h = (p.z - zb) / max(zt - zb, 1e-3)
    if h < 0.3: return CF                                           # carbon lower half
    if p.x < -1.9: return CF
    if n.z > 0.2 and chevron(p) < 1: return P2
    return P1

def pod_rule(s):
    def r(p, n):
        y, x = abs(p.y), p.x
        if x > 0.6 and n.x > 0.55: return CF                       # the inlet
        zb, zt = lerp_table(POD, x, 3), lerp_table(POD, x, 4)
        if p.z < zb + 0.22 * (zt - zb): return CF                   # undercut
        # the scoop: a carbon cut on the outer flank, tall at the front and sweeping down and back to a
        # point, its upper edge lined in the accent colour
        yc, hw = lerp_table(POD, x, 1), lerp_table(POD, x, 2)
        if y > yc + 0.2 * hw and -1.25 < x < 0.52:
            t = (0.52 - x) / 1.77                                    # 0 at the front, 1 at the tip
            top = 0.44 - 0.17 * t ** 0.8
            bot = 0.25 + 0.05 * t
            if bot < p.z < top: return CF
            if top <= p.z < top + 0.032 and t < 0.92: return P2
        return P1
    return r

def fender_paint(s, hub, p, nn):
    out = p - hub; out.y = 0
    ang = math.degrees(math.atan2(out.z, out.x))
    # a light strip down the outer skirt's leading quarter
    if ang < 40 and (p.y - hub.y) * s > 0.17 and nn.y * s > 0.5: return GLOW
    return CF

SPEC = dict(
    MONO=MONO, POD=POD, mono_rule=mono_rule, pod_rule=pod_rule,
    fwing_paint=lambda k, p, n, u: P2 if k == 3 and abs(p.y) > 0.62 else CF,
    fplate_paint=lambda s, p, n: P2 if n.y * s < -0.5 else CF,          # accent inner faces
    fins=((0.82, P2), (0.62, CF)),
    fenders=(('FL', (-25, 158, 0.07, 0.12, 0.07)), ('RL', (12, 165, 0.07, 0.12, 0.07))), fender_paint=fender_paint,
)

def build(lod):
    return build_car(SPEC, lod)
