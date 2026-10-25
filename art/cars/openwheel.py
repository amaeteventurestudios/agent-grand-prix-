# Shared builder for the open-wheel cars (Vortex, Raptor, Arrowhead, Kestrel, Peregrine, Tempest).
# A car file gives its shape tables and paint rules; this assembles the monocoque, sidepods, floor,
# wings, suspension, fenders, airbox and wheels the same way for each, at three levels of detail.
import math
from mathutils import Vector
from carkit import *

def lerp_table(T, x, i):
    if x >= T[0][0]: return T[0][i]
    for a, b in zip(T, T[1:]):
        if b[0] <= x <= a[0]:
            t = (a[0] - x) / (a[0] - b[0]); return a[i] + (b[i] - a[i]) * t
    return T[-1][i]

def rel_height(T, p, zb_i=2, zt_i=3):
    zb, zt = lerp_table(T, p.x, zb_i), lerp_table(T, p.x, zt_i)
    return (p.z - zb) / max(zt - zb, 1e-3)

DEFAULTS = dict(
    nose_ntop=None, pod_ntop=4.5, pod_nbot=2.4,
    fwing=((0.075, 0.44, 3.02, 2, 0.02), (0.135, 0.3, 2.76, 10, 0.015), (0.19, 0.22, 2.58, 18, 0.013), (0.24, 0.16, 2.45, 26, 0.011)),
    fwing_span=1.04, fwing_sweep=0.24, fwing_rise=0.06,
    fwing_paint=lambda k, p, n, u: CF,     # u: 0 at an element's leading edge, 1 at its trailing edge
    fplate=((2.98, 0.035, 0.12), (2.8, 0.035, 0.3), (2.5, 0.05, 0.33), (2.28, 0.08, 0.2)), fplate_y=1.02,
    fplate_paint=lambda s, p, n: CF,
    fins=(), nacelle=None, nacelle_paint=None, mouth_paint=lambda p, n, u: CF, cheek=None, cheek_paint=solid(P1), fenders=None, fender_paint=None, fender_smooth=False,
    rwing=((0.98, 0.36, -1.95, 5, 0.022), (1.11, 0.22, -2.22, 24, 0.015)), rwing_span=0.68,
    rwing_paint=lambda k, p, n: P2 if k == 1 else CF,
    rplate=((-1.9, 0.88, 1.1), (-2.2, 0.74, 1.2), (-2.52, 0.7, 1.27)),
    rplate_paint=lambda p, n: P2 if p.z > 1.16 else CF,
    pylons=(-0.2, 0.2),
    airbox=((-0.36, 0.11, 0.81), (-0.48, 0.13, 0.85), (-0.85, 0.11, 0.79), (-1.22, 0.04, 0.68)),
    airbox_paint=lambda p, n: CF if n.x > 0.6 and p.z < 0.79 else (P2 if n.x > 0.25 else P1),
    fin=((-0.95, 0.66, 0.77), (-1.55, 0.6, 0.88), (-1.95, 0.5, 0.95)), fin_paint=lambda p, n: P2 if p.z > 0.84 and p.x < -1.5 else CF,
    glass=((1.18, 0.04, 0.5), (0.92, 0.2, 0.67), (0.5, 0.28, 0.8), (0.1, 0.29, 0.83), (-0.25, 0.22, 0.78), (-0.45, 0.1, 0.72), (-0.55, 0.02, 0.68)), glass_zb=0.44,
    helmet_x=0.22, mirrors=True, barge=True, wheel_ring=P2, diffuser_light=True,
    extras=None,
)

def nacelle(S, s, lod, parts):
    """A front-wheel nacelle: a thick arched shell over the front wheel, open at the front (an intake
    mouth) and underneath, its side wall reaching the ground at the mouth and rising toward the back
    so the rear half of the tyre shows. N: x (front, back), hw [(x, half-width)], top [(x, z)],
    zb [(x, z)], t (wall thickness)."""
    N = S['nacelle']
    x, y, r, w = WHEELS['FL']
    xf, xb = N['x']
    nr = (12, 7, 4)[lod]
    rings = []
    for k in range(nr + 1):
        xx = xf + (xb - xf) * k / nr
        tyre = r + math.sqrt(max(0.0, (r + 0.03) ** 2 - (xx - x) ** 2))
        top = max(lerp_table(N['top'], xx, 1), tyre + N['t'] + 0.03)
        rings.append(arch(xx, s * y, lerp_table(N['hw'], xx, 1), lerp_table(N['zb'], xx, 1), top, N['t'], (12, 7, 4)[lod]))
    sh = finish(loft('nacelle', rings, cap='ngon'), (1, 0, 0)[lod])
    hub = Vector((x, s * y, r))
    parts.append(paint(sh, (lambda p, nn: S['nacelle_paint'](s, hub, p, nn, (xf - p.x) / (xf - xb))), smooth=0.012 if lod == 0 else False))
    # the mouth's floor: a thin plate between the walls, so the intake reads as a closed opening
    z0 = lerp_table(N['zb'], xf, 1); hw0 = lerp_table(N['hw'], xf, 1) - N['t']
    fl = loft('mouthfloor', [[Vector((xx, s * y + yy, zz)) for (yy, zz) in ((-hw0, z0), (hw0, z0), (hw0, z0 + 0.025), (-hw0, z0 + 0.025))] for xx in (xf, xf - 0.38)])
    parts.append(paint(finish(fl, 0, False), (lambda p, nn: S['mouth_paint'](p, nn, (xf - p.x) / 0.38))))

def build_car(spec, lod):
    S = dict(DEFAULTS); S.update(spec)
    n = (22, 12, 6)[lod]
    parts = []
    MONO, POD = S['MONO'], S['POD']
    parts.append(paint(finish(loft('body', [superellipse(x, w, zb, zt, n, ntop=nt, nbot=5.0) for (x, w, zb, zt, nt) in resample(MONO, (0.1, 0.2, 0.5)[lod])]), (1, 1, 0)[lod]), S['mono_rule'], smooth=True))
    for s in (1, -1):
        rings = [superellipse(x, w, zb, zt, (20, 12, 6)[lod], ntop=S['pod_ntop'], nbot=S['pod_nbot'], yoff=s * yc) for (x, yc, w, zb, zt) in resample(POD, (0.09, 0.2, 0.5)[lod])]
        parts.append(paint(finish(loft('pod', rings), (1, 0, 0)[lod]), S['pod_rule'](s), smooth=0.018))

    floor = loft('floor', [superellipse(x, w, 0.055, 0.09, (12, 8, 4)[lod], 6, 6) for (x, w) in ((1.35, 0.2), (0.95, 0.66), (-0.3, 0.86), (-1.6, 0.82), (-2.05, 0.55))])
    parts.append(paint(finish(floor, min((1, 1, 0)[lod], 1)), solid(CF)))
    dif = loft('diffuser', [superellipse(x, w, zb, zt, (10, 6, 4)[lod], 6, 6) for (x, w, zb, zt) in ((-1.9, 0.55, 0.06, 0.1), (-2.38, 0.6, 0.2, 0.25))])
    parts.append(paint(finish(dif, 0), (lambda p, nn: GLOW if S['diffuser_light'] and p.x < -2.35 and abs(p.y) < 0.1 else CF)))
    if lod < 2:
        for yy in (-0.42, -0.15, 0.15, 0.42):
            st = loft('strake', [[Vector((x, yy + dy, z)) for (dy, z) in ((-0.008, zl), (0.008, zl), (0.008, zl + 0.13), (-0.008, zl + 0.13))] for (x, zl) in ((-1.9, 0.08), (-2.38, 0.22))])
            parts.append(paint(finish(st, 0, False), solid(CF)))

    # front wing elements, swept and stepping up toward the endplates
    span, sweep, rise = S['fwing_span'], S['fwing_sweep'], S['fwing_rise']
    for k, (z, ch, xo, pitch, th) in enumerate(S['fwing']):
        st = []
        for i in range(13):
            t = -1 + 2 * i / 12
            st.append((t * span, xo - sweep * abs(t) ** 1.25, z + rise * abs(t) ** 2.2 - 0.022 * (1 - abs(t)), ch * (1 - 0.18 * t * t), th, pitch))
        wg = finish(wing('fwing%d' % k, st, (14, 6, 4)[lod]), 0)
        def chord_u(p, xo=xo, ch=ch, pitch=pitch):
            t = min(1.0, abs(p.y) / span)
            return (xo - sweep * t ** 1.25 - p.x) / (ch * (1 - 0.18 * t * t) * math.cos(math.radians(pitch)))
        parts.append(paint(wg, (lambda p, nn, k=k, cu=chord_u: S['fwing_paint'](k, p, nn, cu(p))), smooth=0.012 if lod == 0 else False))
    fy = S['fplate_y']
    for s in (1, -1):
        if S['nacelle']: nacelle(S, s, lod, parts)
        if S['cheek']:
            ck = wing('cheek', [(s * y, x, z, c, 0.035, p) for (y, x, z, c, p) in S['cheek']], (8, 5, 3)[lod])
            parts.append(paint(finish(ck, 0), S['cheek_paint']))
        if S['fplate'] is None: pass
        else:
          ep = loft('endplate', [[Vector((x, s * yy, z)) for (yy, z) in ((fy, zb), (fy + 0.03, zb), (fy + 0.03, zt), (fy, zt))] for (x, zb, zt) in S['fplate']])
          parts.append(paint(finish(ep, 0, bevel=0.008 if lod == 0 else 0), (lambda p, nn, s=s: S['fplate_paint'](s, p, nn))))
        for (yy, col) in S['fins']:
            fin = loft('ffin', [[Vector((x, s * yv, z)) for (yv, z) in ((yy, zb), (yy + 0.018, zb), (yy + 0.018, zt), (yy, zt))] for (x, zb, zt) in ((2.74, 0.16, 0.22), (2.52, 0.19, 0.42), (2.32, 0.22, 0.4))])
            parts.append(paint(finish(fin, 0, False), solid(col)))

        if S['fenders']:
            for key, (a0, a1, rad, ww, lip) in S['fenders']:
                x, y, r, w = WHEELS[key]
                hub = Vector((x, s * y, r))
                f = arc_shell('fender', (x, s * y, r), r + rad, w + ww, a0, a1, (22, 10, 5)[lod], 0.028, lip=lip, side=s)
                parts.append(paint(finish(f, (1, 1, 0)[lod]), (lambda p, nn, hub=hub, s=s: S['fender_paint'](s, hub, p, nn)), smooth=S['fender_smooth'] if lod == 0 else False))
                if lod < 2:
                    parts.append(paint(finish(strut('stay', (x - 0.05, s * (y - 0.12), r + 0.24), (x + 0.05, s * 0.32, 0.44 if key == 'FL' else 0.48), 0.07, 0.022), 0), solid(CF)))
        if lod < 2:
            x, y, r, w = WHEELS['FL']
            for (z0, z1) in ((0.2, 0.22), (0.4, 0.46)):
                for dx in (0.22, -0.2):
                    parts.append(paint(finish(strut('arm', (x + dx, s * 0.24, z0 + 0.03), (x, s * 0.63, z1 - 0.02), 0.045, 0.016), 0), solid(CF)))
            parts.append(paint(finish(strut('push', (x - 0.05, s * 0.62, 0.2), (x - 0.25, s * 0.22, 0.45), 0.03, 0.03), 0), solid(MT)))
            if not S['nacelle']:
              duct = loft('duct', [superellipse(xx, 0.06, 0.24, 0.44, 8, 3, 3, yoff=s * 0.6) for xx in (x + 0.2, x - 0.12)])
              parts.append(paint(finish(duct, 0), solid(CF)))
            x, y, r, w = WHEELS['RL']
            for (z0, z1) in ((0.2, 0.22), (0.4, 0.46)):
                for dx in (0.25, -0.15):
                    parts.append(paint(finish(strut('arm', (x + dx, s * 0.26, z0 + 0.03), (x, s * 0.6, z1 - 0.02), 0.045, 0.016), 0), solid(CF)))
        if lod < 2 and S['mirrors']:
            parts.append(paint(finish(strut('mstalk', (0.78, s * 0.29, 0.5), (0.86, s * 0.47, 0.66), 0.03, 0.015), 0), solid(CF)))
            mir = loft('mirror', [superellipse(xx, 0.085, 0.62, 0.7, 8, 3, 3, yoff=s * 0.5) for xx in (0.94, 0.8)])
            parts.append(paint(finish(mir, 0), (lambda p, nn: P2 if nn.x > 0.6 else CF)))
        if S['barge']:
            bb = wing('barge', [(s * 0.36, 1.12, 0.17, 0.5, 0.025, -4), (s * 0.66, 0.96, 0.2, 0.44, 0.025, -8)], (8, 5, 3)[lod])
            parts.append(paint(finish(bb, 0), solid(CF)))

    # rear wing, endplates and pylons
    for k, (z, ch, xo, pitch, th) in enumerate(S['rwing']):
        st = [(t * S['rwing_span'], xo - 0.08 * abs(t), z + 0.04 * t * t, ch, th, pitch) for t in (-1, -0.66, -0.33, 0, 0.33, 0.66, 1)]
        parts.append(paint(finish(wing('rwing%d' % k, st, (14, 6, 4)[lod], 0.05), 0), (lambda p, nn, k=k: S['rwing_paint'](k, p, nn))))
    ry = S['rwing_span']
    for s in (1, -1) if S['rplate'] else ():
        ep = loft('rplate', [[Vector((x, s * yy, z)) for (yy, z) in ((ry, zb), (ry + 0.025, zb), (ry + 0.025, zt), (ry, zt))] for (x, zb, zt) in S['rplate']])
        parts.append(paint(finish(ep, 0), S['rplate_paint']))
    for yy in S['pylons']:
        neck = loft('neck', [superellipse(x, 0.02 if yy else 0.03, zb, zt, (8, 6, 4)[lod], 4, 4, yoff=yy) for (x, zb, zt) in ((-1.62, 0.52, 0.62), (-1.86, 0.68, 0.86), (-2.05, 0.9, 1.02), (-2.15, 0.98, 1.06))])
        parts.append(paint(finish(neck, (1, 1, 0)[lod]), solid(CF)))

    box = loft('airbox', [superellipse(x, w, 0.55, zt, (14, 8, 4)[lod], 3, 4) for (x, w, zt) in S['airbox']])
    parts.append(paint(finish(box, (1, 1, 0)[lod]), S['airbox_paint']))
    if lod < 2:
        fin = loft('fin', [[Vector((x, yy, z)) for (yy, z) in ((-0.012, zb), (0.012, zb), (0.012, zt), (-0.012, zt))] for (x, zb, zt) in S['fin']])
        parts.append(paint(finish(fin, 0, False), S['fin_paint']))
        hx = S['helmet_x']
        helmet = loft('helmet', [superellipse(hx + dx, w, 0.5 - h, 0.5 + h, 12, 2, 2) for (dx, w, h) in ((0.18, 0.02, 0.02), (0.12, 0.1, 0.1), (0.0, 0.13, 0.13), (-0.14, 0.11, 0.11), (-0.22, 0.03, 0.03))])
        parts.append(paint(finish(helmet, 1), (lambda p, nn: CF if nn.x > 0.5 and p.z > 0.47 else P1)))
    if S['extras']: S['extras'](lod, parts)

    car = join('body', parts)
    zb = S['glass_zb']
    glass = loft('glass', [superellipse(x, w, zb, zt, n, 2.0, 2.0) for (x, w, zt) in S['glass']])
    glass = finish(glass, (2, 1, 0)[lod])
    paint(glass, solid((0, 0, 0, 1)))
    wheels = [wheel('wheel_' + k, k, (32, 14, 6)[lod], lod < 2, S['wheel_ring'], sidewall_ring=lod < 2) for k in ('FL', 'FR', 'RL', 'RR')]
    return car, glass, wheels

CAMS = {  # attachment points in the car frame
    'cam_chase': (-5.2, 0, 1.9), 'cam_cockpit': (0.35, 0, 0.78), 'cam_front': (3.2, 0, 0.35),
    'cam_rear': (-2.9, 0, 1.25), 'cam_wheel': (1.2, 1.15, 0.45), 'cam_top': (0, 0, 9.0),
}
