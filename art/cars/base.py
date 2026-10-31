# Shape tables the cars share, so each car file only says what makes it different: a broad nose and a
# needle nose for the tub, a sidepod, a front wing and a rear wing, each with a few knobs.
from hyper import *

def body_row(x, zb, wf, wc, zc, ws, zs, zt, b1=0.06, b2=0.04):
    """Keel, floor corner, chine, shoulder, crown (the crown is a ridge along the top)."""
    return (x, [(0, zb, 0), (wf, zb, -0.02), (wc, zc, b1), (ws, zs, b2), (0, zt, 0)])

# the cockpit and engine cover, the same on every car (the cutaway's parts sit inside it)
REAR = [
    (0.62, 0.090, 0.25, 0.330, 0.245, 0.272, 0.568, 0.585),
    (0.10, 0.090, 0.26, 0.340, 0.250, 0.282, 0.580, 0.605),
    (-0.40, 0.092, 0.25, 0.320, 0.258, 0.250, 0.622, 0.668),
    (-0.90, 0.096, 0.21, 0.270, 0.268, 0.190, 0.662, 0.740),
    (-1.40, 0.106, 0.16, 0.210, 0.278, 0.140, 0.602, 0.662),
    (-1.85, 0.130, 0.11, 0.150, 0.272, 0.100, 0.480, 0.520),
    (-2.20, 0.160, 0.07, 0.100, 0.252, 0.070, 0.380, 0.400),
    (-2.42, 0.200, 0.03, 0.050, 0.262, 0.040, 0.318, 0.330),
]

def body(nose, tip=2.74, b1=0.06, b2=0.04):
    """nose: 'broad' (a flat arrow nose sitting low, for wheel-pod cars), 'needle' (raised and narrow),
    'shovel' (long, wide and flat), or a list of body_row arguments from the tip back to x ~ 1.08."""
    k = tip - 2.74
    if nose == 'broad':
        front = [(2.74, [(0, 0.105, 0), (0.06, 0.100, 0), (0.10, 0.15, 0.1), (0.09, 0.212, 0.05), (0, 0.222, 0)]),
                 (2.54, 0.096, 0.13, 0.180, 0.158, 0.162, 0.262, 0.278), (2.20, 0.092, 0.16, 0.212, 0.170, 0.192, 0.322, 0.338),
                 (1.85, 0.090, 0.19, 0.238, 0.190, 0.214, 0.398, 0.416), (1.48, 0.090, 0.21, 0.262, 0.208, 0.232, 0.468, 0.488),
                 (1.08, 0.090, 0.23, 0.292, 0.228, 0.250, 0.530, 0.552)]
    elif nose == 'needle':
        front = [(2.74, [(0, 0.165, 0), (0.025, 0.16, 0), (0.045, 0.18, 0.1), (0.035, 0.21, 0.05), (0, 0.218, 0)]),
                 (2.52, 0.150, 0.07, 0.100, 0.172, 0.082, 0.252, 0.266), (2.18, 0.136, 0.10, 0.136, 0.186, 0.112, 0.322, 0.340),
                 (1.82, 0.124, 0.13, 0.168, 0.200, 0.140, 0.398, 0.418), (1.46, 0.112, 0.17, 0.206, 0.214, 0.172, 0.470, 0.492),
                 (1.08, 0.100, 0.21, 0.252, 0.228, 0.214, 0.538, 0.560)]
    elif nose == 'shovel':
        front = [(2.74, [(0, 0.13, 0), (0.1, 0.125, 0), (0.14, 0.15, 0.06), (0.13, 0.19, 0.03), (0, 0.198, 0)]),
                 (2.50, 0.120, 0.16, 0.200, 0.150, 0.186, 0.240, 0.252), (2.16, 0.112, 0.18, 0.222, 0.165, 0.205, 0.312, 0.326),
                 (1.82, 0.106, 0.19, 0.236, 0.182, 0.214, 0.390, 0.406), (1.46, 0.100, 0.20, 0.250, 0.200, 0.222, 0.465, 0.482),
                 (1.08, 0.094, 0.22, 0.282, 0.222, 0.244, 0.530, 0.550)]
    else:
        front = nose
    rows = []
    for r in front:
        if isinstance(r[1], list): rows.append((r[0] + k, r[1]))
        else: rows.append(body_row(r[0] + k * max(0.0, (r[0] - 1.08) / 1.66), *r[1:], b1=b1, b2=b2))
    return rows + [body_row(*r, b1=b1, b2=b2) for r in REAR]

def pod_row(x, yi, zb, yb, yc, zc, yt, zt, zti, rake=0.0, b=(-0.04, 0.1, 0.08)):
    """Inner bottom, outer bottom, chine, top outer, top inner (all the way round)."""
    return (x, [(yi, zb, 0, -rake), (yb, zb - 0.01, b[0], -rake), (yc, zc, b[1], 0), (yt, zt, b[2], rake), (yi + 0.02, zti, 0, rake)])

def pods(x0=0.95, w=1.0, h=1.0, under=1.0, rake=0.08, b=(-0.04, 0.1, 0.08), tail=-2.02):
    """A sidepod with its inlet at x0: w scales how far out it reaches, h its height, under how deep
    the undercut goes (1 normal, more is deeper)."""
    T = [  # x share from inlet (0) to tail (1), inner y, bottom, outer bottom, chine y, chine z, top outer y, top z, top inner z
        (0.00, 0.30, 0.16, 0.50, 0.70, 0.29, 0.66, 0.47, 0.50),
        (0.10, 0.28, 0.13, 0.50, 0.745, 0.275, 0.70, 0.49, 0.53),
        (0.29, 0.28, 0.12, 0.50, 0.74, 0.262, 0.69, 0.49, 0.54),
        (0.49, 0.26, 0.12, 0.46, 0.68, 0.25, 0.63, 0.47, 0.53),
        (0.66, 0.22, 0.13, 0.40, 0.58, 0.245, 0.53, 0.44, 0.50),
        (0.81, 0.17, 0.15, 0.30, 0.44, 0.24, 0.40, 0.38, 0.44),
        (0.93, 0.13, 0.17, 0.20, 0.29, 0.23, 0.26, 0.31, 0.35),
        (1.00, 0.10, 0.19, 0.12, 0.15, 0.23, 0.13, 0.26, 0.28),
    ]
    rows = []
    for (f, yi, zb, yb, yc, zc, yt, zt, zti) in T:
        x = x0 + (tail - x0) * f
        yo = lambda y: yi + (y - yi) * w
        ybu = yi + (yb - yi) * w / under
        hz = lambda z: zb + (z - zb) * h
        rows.append(pod_row(x, yi, zb, ybu, yo(yc), hz(zc), yo(yt), hz(zt), hz(zti), rake if f == 0 else 0.0, b))
    return rows

def fwing(paint, x0=2.93, span=1.02, plate=None, plate_y=1.04, plate_paint=None, flaps=2, cascade=1.0, sweep=1.0):
    """A three-element front wing: a main plane dipping beside the nose and rising to its tips, and
    flaps that climb and steepen toward the endplates."""
    main = ([-span, -0.9, -0.78, -0.62, -0.45, -0.25, -0.1, 0, 0.1, 0.25, 0.45, 0.62, 0.78, 0.9, span],
            lambda y: (y, x0 - 0.14 * sweep * abs(y) + 0.16 * max(0, abs(y) - 0.7), 0.068 + 0.012 * (1 - min(1, abs(y) / 0.3)) + 0.05 * max(0, abs(y) - 0.72) / 0.3,
                       0.42 - 0.1 * abs(y), 0.02, 3))
    els = [main,
           ([0.12, 0.25, 0.4, 0.55, 0.7, 0.85, span - 0.02], lambda y: (y, x0 - 0.27 - 0.1 * y + 0.08 * max(0, y - 0.7), 0.13 + 0.07 * cascade * y * y, 0.22 + 0.06 * y, 0.016, 12 + 10 * y))]
    if flaps > 1:
        els.append(([0.16, 0.3, 0.45, 0.6, 0.75, 0.88, span - 0.02], lambda y: (y, x0 - 0.46 - 0.08 * y + 0.08 * max(0, y - 0.7), 0.2 + 0.11 * cascade * y * y, 0.16 + 0.06 * y, 0.013, 22 + 12 * y)))
    F = dict(elements=els, paint=paint)
    if plate:
        F.update(plate=plate, plate_y=plate_y, plate_paint=plate_paint or solid(CF))
    return F

def rwing(paint, plate_paint, span=0.9, z=0.93, x=-1.92, plate=None, pylons='twin', chord=0.4):
    pl = plate or [(x + 0.1, z + 0.15), (x - 0.26, z + 0.27), (x - 0.54, z + 0.31), (x - 0.58, z + 0.25), (x - 0.54, z - 0.11), (x - 0.32, z - 0.27), (x - 0.04, z - 0.19), (x + 0.04, z - 0.03)]
    py = []
    if pylons == 'twin':
        py = [(s, [(-1.42, 0.62), (-1.7, 0.6), (x - 0.18, z - 0.03), (x - 0.26, z + 0.04), (x - 0.06, z + 0.03), (-1.62, 0.74)], 0.03) for s in (0.17, -0.17)]
    elif pylons == 'single':
        py = [(0.0, [(-1.4, 0.64), (-1.7, 0.6), (x - 0.16, z - 0.01), (x - 0.24, z + 0.05), (x - 0.06, z + 0.05), (-1.62, 0.76)], 0.045)]
    return dict(span=span, paint=paint, plate=pl, plate_paint=plate_paint, pylons=py,
                elements=[lambda y: (y, x - 0.06 * abs(y), z + 0.03 * y * y, chord, 0.022, 6),
                          lambda y: (y, x - 0.28 - 0.06 * abs(y), z + 0.13 + 0.03 * y * y, chord * 0.6, 0.016, 26)])

FLOOR = [(1.42, 0.2), (1.12, 0.46), (0.9, 0.6), (0.8, 0.8), (-0.98, 0.86), (-1.1, 0.78), (-1.2, 0.64), (-1.9, 0.6), (-2.2, 0.54)]

def canopy_rows(x0=1.2, x1=-0.72, w=0.27, top=0.82):
    L = x0 - x1
    prof = [(0.0, 0.07, 0.56), (0.105, 0.48, 0.65), (0.26, 0.85, 0.76), (0.47, 1.0, 0.82), (0.67, 0.96, 0.82), (0.82, 0.74, 0.78), (0.93, 0.37, 0.72), (1.0, 0.07, 0.68)]
    return [(x0 - f * L, w * ww, 0.56 + (zz - 0.56) * (top - 0.56) / 0.26) for (f, ww, zz) in prof]

def nac_rows(front=2.62, mouth=0.56, top=0.81, bulge=0.06, crease=True, rake=0.03):
    """A front wheel pod, open forward like an intake: outer wall bottom, a crease along the outer
    wall, outer shoulder, inner shoulder, inner wall bottom. mouth is the height of its front opening,
    top its height over the wheel, bulge how rounded its walls are."""
    T = [  # x, outer y, outer bottom, crease z, outer shoulder z, inner shoulder y, inner shoulder z, inner bottom
        (2.62, 1.02, 0.065, 0.30, 0.56, 0.70, 0.60, 0.075),
        (2.38, 1.04, 0.065, 0.34, 0.65, 0.70, 0.69, 0.075),
        (2.14, 1.05, 0.20, 0.40, 0.72, 0.69, 0.76, 0.12),
        (1.93, 1.06, 0.38, 0.48, 0.765, 0.68, 0.795, 0.26),
        (1.60, 1.06, 0.50, 0.555, 0.785, 0.68, 0.81, 0.34),
        (1.22, 1.01, 0.56, 0.60, 0.74, 0.67, 0.755, 0.44),
        (0.86, 0.86, 0.52, 0.54, 0.60, 0.66, 0.61, 0.50),
    ]
    rows = []
    for i, (x, yo, zbo, zcr, zso, yi2, zti, zbi) in enumerate(T):
        if x > 1.9: x = 1.9 + (x - 1.9) * (front - 1.9) / 0.72
        f = max(0.0, min(1.0, (2.62 - T[i][0]) / 0.69))            # 0 at the mouth, 1 over the wheel
        sc = lambda z: z * (mouth / 0.56 * (1 - f) + top / 0.81 * f) if z > 0.2 else z
        rk = rake if i == 0 else 0.0
        rows.append((x, [(yo, zbo, -0.02, 0), (yo + (0.016 if crease else 0.0), sc(zcr) if zcr > 0.25 else zcr, bulge, -rk * 0.5),
                         (yo - 0.012, sc(zso), bulge, -rk), (yi2, sc(zti), -0.02, -rk), (0.62, zbi, 0, 0)]))
    return rows

def rear_hood(rule, a0=35, a1=178, over=0.05, lip=0.08):
    """A fender hooded over the top and back of a rear wheel."""
    return dict(key='RL', a0=a0, a1=a1, rule=rule, sharp=(True, True, False, True), segs=(4, 9, 9), radius=0.035,
                prof=[(0.42 + over, -lip, 0), (0.42 + over, 0.0, 0.04), (0.2, 0.04, 0.04), (-0.02, 0.0, 0)])

def sweep_blade(name, path, chord, thick, rule, lod, pitch=6.0):
    """A wing swept along a path of (x, y, z) points (an arch over the engine): its section stays
    lined up with the car, tilted so it lies across the path. rule gets Q.x = place along the path."""
    n = (12, 6, 3)[lod]
    rings, meta = [], []
    L = len(path)
    for i, p in enumerate(path):
        p = Vector(p)
        a = Vector(path[max(0, i - 1)]); b = Vector(path[min(L - 1, i + 1)])
        t = (b - a); t.x = 0; t.normalize()
        up = Vector((0, -t.z, t.y))
        if up.z < 0: up = -up
        pa = math.radians(pitch)
        ring, mm = [], []
        for (u, v) in naca(chord, thick, n, 0.05):
            px, pz = -u * math.cos(pa) - v * math.sin(pa), -u * math.sin(pa) + v * math.cos(pa)
            ring.append(p + Vector((px, 0, 0)) + up * pz)
            mm.append((i / (L - 1), u / chord, 1 if p.y >= 0 else -1, v < 0))
        rings.append(ring); meta.append(mm)
    return hyper_mesh(name, rings, meta, {n}, rule)

def hyper_mesh(name, rings, meta, sharp, rule):
    import hyper
    return hyper._mesh(name, rings, meta, sharp, rule, ('fan', 'fan'), True)
