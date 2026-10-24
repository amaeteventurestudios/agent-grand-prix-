// The buildings kit: one facade material shared by every tower, office, hotel and the paddock's
// glass, plus the tower shapes the cities are built from. Windows are drawn in the shader from the
// world position, so a building can be scaled to any size and still keeps real-sized windows and
// floors: no textures, and every tower of one shape is one draw call.
// A geometry (or, on an instanced mesh with { instanced: true }, each instance) carries `fac`:
// window width in metres (negative on round towers, measured round the centre), floor height in
// metres, style plus a glass tint between the two glass colours as its fraction (2.5 = style 2,
// halfway tint), and the height of the first floor line. Styles:
//   0 plain wall, 1 glass curtain wall, 2 punched windows in a painted wall, 3 balconies,
//   4 glass with a lit edge (neon) at night.
// Roofs (faces pointing up) always show the plain wall colour.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function facade(geo, ww, fh, style, y0 = 0) {
  const n = geo.attributes.position.count, a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { a[i * 4] = ww; a[i * 4 + 1] = fh; a[i * 4 + 2] = style; a[i * 4 + 3] = y0; }
  geo.setAttribute('fac', new THREE.BufferAttribute(a, 4));
  return geo;
}

// pal: the world palette (sky top and horizon for reflections, lamps for lit windows)
export function facadeMaterial(pal, { glass = '#2c4a66', glass2 = glass, lit = 0.45, key = 'a', instanced = false, neon = ['#ff3fa8', '#33e0ff'] } = {}) {
  // dusk: the sky still lights the glass and only some windows are on
  const night = pal.lamps ? (pal.elev > 40 ? 1 : 0.4) : 0;
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: false });
  const U = {
    uTop: { value: new THREE.Color(pal.top) }, uHor: { value: new THREE.Color(pal.hor) },
    uGlass: { value: new THREE.Color(glass) }, uGlass2: { value: new THREE.Color(glass2) }, uNight: { value: night }, uLit: { value: lit },
    uNeon: { value: new THREE.Color(neon[0]) }, uNeon2: { value: new THREE.Color(neon[1]) },
  };
  m.userData.uniforms = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        ${instanced ? 'attribute vec4 ifac;' : 'attribute vec4 fac;'}
        varying vec4 vFac; varying vec3 vFW; varying vec3 vFN; varying vec2 vFC;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        {
          vec4 fp = vec4(transformed, 1.0), fc = vec4(0.0, 0.0, 0.0, 1.0); vec3 fn = objectNormal;
          #ifdef USE_INSTANCING
            fp = instanceMatrix * fp; fc = instanceMatrix * fc; fn = mat3(instanceMatrix) * fn;
          #endif
          vFW = (modelMatrix * fp).xyz; vFN = normalize(mat3(modelMatrix) * fn); vFC = (modelMatrix * fc).xz;
          vFac = ${instanced ? 'ifac' : 'fac'};
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uTop, uHor, uGlass, uGlass2, uNeon, uNeon2; uniform float uNight, uLit;
        varying vec4 vFac; varying vec3 vFW; varying vec3 vFN; varying vec2 vFC;
        // a hash without sin(), which loses precision on big numbers on some phone GPUs
        float fHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 N = normalize(vFN);
          float style = floor(vFac.z + 0.01), tk = fract(vFac.z);
          if (abs(N.y) < 0.5 && style > 0.5) {
            vec3 Tn = normalize(vec3(-N.z, 0.0, N.x));
            float ww = abs(vFac.x), u = dot(vFW, Tn), v = vFW.y - vFac.w;
            // a number for this face of this building (from values that don't vary across the face, so it can't flicker)
            float face = dot(floor(N * 2.0 + 0.5), vec3(1.3, 0.0, 2.7)) + floor(vFC.x * 0.37) + floor(vFC.y * 0.71);
            if (vFac.x < 0.0) { vec2 d = vFW.xz - vFC; u = atan(d.y, d.x) * length(d); face = floor(vFC.x * 0.37) + floor(vFC.y * 0.71); }
            vec2 cell = vec2(floor(u / ww), floor(v / vFac.y));
            vec2 f = vec2(fract(u / ww), fract(v / vFac.y));
            // how much of this point is glass: curtain walls are nearly all glass, punched windows less
            float glass;
            if (style < 1.5 || style > 3.5) {
              float mull = step(0.06, f.x) * step(f.x, 0.94);
              float band = step(0.16, f.y);
              glass = mull * band;
            } else {
              float wx = step(0.22, f.x) * step(f.x, 0.78), wy = step(0.3, f.y) * step(f.y, 0.86);
              glass = wx * wy;
            }
            // far away the grid gets finer than a pixel: fade it to its average so it doesn't shimmer
            vec2 fw = fwidth(vec2(u / ww, v / vFac.y));
            float aa = clamp(max(fw.x, fw.y) * 2.5 - 0.6, 0.0, 1.0);
            glass = mix(glass, (style < 1.5 || style > 3.5) ? 0.8 : 0.32, aa);
            if (style > 2.5 && style < 3.5) {
              // balconies: a pale slab and a shadow under it on every floor
              float slab = step(f.y, 0.12);
              diffuseColor.rgb *= 1.0 - 0.45 * step(0.12, f.y) * step(f.y, 0.24);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95), slab * 0.8);
            }
            // the glass: a tint plus the sky it reflects, brighter at grazing angles
            vec3 V = normalize(vFW - cameraPosition);
            vec3 R = reflect(V, N);
            vec3 sky = mix(uHor, uTop, smoothstep(0.0, 0.6, R.y));
            sky = mix(mix(uHor, uTop, 0.6) * 0.5 + uGlass * 0.25, sky, smoothstep(-0.15, 0.05, R.y));
            float fres = 0.25 + 0.75 * pow(1.0 - abs(dot(V, N)), 3.0);
            float jitter = fHash(cell + face * 7.13);
            vec3 tint = mix(uGlass, uGlass2, tk) * (0.75 + 0.5 * jitter);
            vec3 g = tint * 0.22;
            diffuseColor.rgb = mix(diffuseColor.rgb, g, glass);
            // reflections are a little patchy, as real panes are never quite flat
            float wob = 0.85 + 0.3 * fHash(cell + vec2(face, 1.0));
            totalEmissiveRadiance += glass * (sky * fres * wob * (0.95 - 0.55 * uNight) + tint * 0.2);
            // lit windows at night, warm and cool, some floors brighter than others
            float on = step(1.0 - uLit, fHash(cell * vec2(1.0, 1.7) + face * 3.1 + 0.5));
            on = mix(on, uLit * 0.8, aa);   // far away: an even glow instead of speckle
            vec3 warm = mix(vec3(1.0, 0.78, 0.45), vec3(0.75, 0.88, 1.0), step(0.7, jitter));
            totalEmissiveRadiance += glass * on * uNight * warm * (0.55 + 0.6 * fHash(cell.yy + face));
            if (style > 3.5) {
              // neon: a glowing strip along the floor bands and edges
              float edge = (1.0 - step(0.07, f.y)) * step(mod(cell.y, 4.0), 0.5)
                         + step(0.45, abs(f.x - 0.5)) * step(mod(cell.x, 6.0), 0.5);
              totalEmissiveRadiance += clamp(edge, 0.0, 1.0) * (1.0 - aa * 0.6) * uNight * mix(uNeon, uNeon2, step(0.5, tk)) * 1.8;
            }
          }
        }`);
  };
  m.customProgramCacheKey = () => 'agp-facade-' + key + (instanced ? '-i' : '');
  return m;
}

// six tower shapes in unit space: footprint 1 x 1, base at y = 0, height 1
export function towerShapes(lite = false) {
  const box = (w, h, d, y = 0, x = 0, z = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return g; };
  const clean = (gs) => { const m = mergeGeometries(gs.map((g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; })); return m; };
  const shapes = {};
  // a plain slab
  shapes.slab = clean([box(1, 1, 1)]);
  // setbacks: three tiers
  shapes.setback = clean([box(1, 0.55, 1), box(0.78, 0.28, 0.78, 0.55), box(0.55, 0.17, 0.55, 0.83)]);
  // a round tower
  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, lite ? 12 : 18, 1); cyl.translate(0, 0.5, 0);
  shapes.round = clean([cyl]);
  // a slanted top: the roof slopes down to one side
  const sl = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1); sl.translate(0, 0.5, 0);
  { const p = sl.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.9) p.setY(i, p.getX(i) > 0 ? 0.82 : 1); }
  sl.computeVertexNormals();
  shapes.slant = clean([sl]);
  // a crown: the top steps in twice and ends in a spire
  const sp = new THREE.CylinderGeometry(0.0, 0.05, 0.14, 6); sp.translate(0, 1.07, 0);
  shapes.crown = clean([box(1, 0.86, 1), box(0.82, 0.06, 0.82, 0.86), box(0.6, 0.06, 0.6, 0.92), sp]);
  // a tapering octagon
  const oct = new THREE.CylinderGeometry(0.36, 0.55, 1, 8, 1); oct.rotateY(Math.PI / 8); oct.translate(0, 0.5, 0);
  shapes.taper = clean([oct]);
  for (const g of Object.values(shapes)) g.computeVertexNormals();
  return shapes;
}

// street lamps: a pole with one or two arms, drawn in one call, plus the lamp heads, which glow when
// the lights are on. spots: [x, y, z, heading (radians, the way the arm reaches), double]
export function streetLamps(spots, lampsOn) {
  const g = (w, h, d, x, y, z) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); b.deleteAttribute('uv'); return b; };
  const pole = new THREE.CylinderGeometry(0.09, 0.14, 9, 6); pole.translate(0, 4.5, 0); pole.deleteAttribute('uv');
  const one = mergeGeometries([pole.toNonIndexed(), g(1.9, 0.1, 0.1, 0.95, 8.9, 0).toNonIndexed(), g(0.8, 0.16, 0.34, 1.9, 8.85, 0).toNonIndexed()]);
  const two = mergeGeometries([one, g(1.9, 0.1, 0.1, -0.95, 8.9, 0).toNonIndexed(), g(0.8, 0.16, 0.34, -1.9, 8.85, 0).toNonIndexed()]);
  const out = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: '#6d747e' });
  const heads = [];
  for (const [geo, dbl] of [[one, false], [two, true]]) {
    const L = spots.filter((s) => !!s[4] === dbl); if (!L.length) continue;
    const im = new THREE.InstancedMesh(geo, mat, L.length);
    L.forEach(([x, y, z, h], i) => {
      q.setFromAxisAngle(up, -h); m4.compose(p.set(x, y, z), q, s1); im.setMatrixAt(i, m4);
      for (const sd of dbl ? [1, -1] : [1]) heads.push([x + Math.cos(h) * 1.9 * sd, y + 8.75, z + Math.sin(h) * 1.9 * sd, h]);
    });
    out.add(im);
  }
  if (lampsOn && heads.length) {
    const hg = new THREE.BoxGeometry(0.7, 0.06, 0.28);
    const im = new THREE.InstancedMesh(hg, new THREE.MeshBasicMaterial({ color: '#ffe3a6' }), heads.length);
    heads.forEach(([x, y, z, h], i) => { q.setFromAxisAngle(up, -h); m4.compose(p.set(x, y, z), q, s1); im.setMatrixAt(i, m4); });
    out.add(im);
  }
  return out;
}
