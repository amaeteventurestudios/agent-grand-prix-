// Modelled cars, built in Blender (see art/cars) and exported as compressed GLB files with three
// levels of detail. Every vertex carries a livery mask in its colour (R primary, G secondary,
// B light strip, A finish), so one file serves every team: the shader tints it per car.
// All cars at one level of detail are drawn together (instancing), a handful of draw calls in all.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const MODELS = [{ id: 'falcon', name: 'Falcon' }];

const cache = new Map();
export function loadCar(id) {
  if (!cache.has(id)) {
    cache.set(id, new Promise((res, rej) => {
      const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
      const ok = (g) => res(parse(g.scene, id));
      // some hosts won't serve .glb files; then the same file comes as a base64 module beside it
      const fallback = () => import(`../assets/vehicles/${id}/${id}.glb.js`)
        .then((m) => { const b = Uint8Array.from(atob(m.default), (c) => c.charCodeAt(0)); l.parse(b.buffer, '', ok, rej); }).catch(rej);
      l.load(new URL(`../assets/vehicles/${id}/${id}.glb`, import.meta.url).href, ok, undefined, fallback);
    }));
  }
  return cache.get(id);
}

// each level: its parts (geometry + placement in the car), wheels marked with their hub
function parse(root, id) {
  root.updateMatrixWorld(true);
  const lods = [], cams = {};
  for (let i = 0; i < 3; i++) {
    const L = root.getObjectByName(`${id}_LOD${i}`);
    const inv = L.matrixWorld.clone().invert(), parts = [];
    L.traverse((o) => {
      if (o.isMesh) {
        const local = inv.clone().multiply(o.matrixWorld);
        const wheel = /wheel_(FL|FR|RL|RR)/.exec(o.name)?.[1] || null;
        const glass = /glass/.test(o.name) || /glass/.test(o.material?.name || '');
        const part = { geo: o.geometry, local, wheel, glass };
        if (wheel) {
          o.geometry.computeBoundingBox();
          const hub = o.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(local);
          part.hub = hub;
          part.pre = new THREE.Matrix4().makeTranslation(-hub.x, -hub.y, -hub.z).multiply(local);
        }
        parts.push(part);
      } else if (o.name.startsWith('cam_')) cams[o.name.slice(4)] = o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    });
    lods.push(parts);
  }
  return { id, lods, cams };
}

const glow = { value: 0.8 };
function liveryMaterial(env) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0, envMap: env, envMapIntensity: 1.0 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uGlow = glow;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 iC1;\nattribute vec3 iC2;\nvarying vec3 vC1;\nvarying vec3 vC2;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvC1 = iC1; vC2 = iC2;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vC1;\nvarying vec3 vC2;\nuniform float uGlow;')
      .replace('#include <color_fragment>', `
        vec4 mk = vColor;
        float isMetal = step(0.7, mk.a) * step(mk.a, 0.9);
        vec3 base = mix(vec3(0.010, 0.011, 0.013), vec3(0.11, 0.115, 0.125), isMetal);
        base = mix(base, vC1, mk.r);
        base = mix(base, vC2, mk.g);
        base = mix(base, vec3(1.0), mk.b);
        diffuseColor.rgb = base;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(clamp(0.86 - 0.66 * mk.a, 0.2, 0.9), 0.32, isMetal);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = isMetal * 0.85;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += mk.b * vec3(0.85, 0.95, 1.0) * uGlow;');
  };
  m.customProgramCacheKey = () => 'agp-livery';
  return m;
}

// an environment map from the venue's own sky, so paint and glass reflect the right colours
function skyEnv(renderer, world) {
  const s = new THREE.Scene(), sky = world.sky.clone();
  sky.scale.setScalar(40 / 4000); s.add(sky);
  const g = new THREE.Mesh(new THREE.CircleGeometry(40, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: world.venue.time === 'night' ? '#15171c' : '#5d6168' }));
  g.position.y = -1.5; s.add(g);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.02, 0.1, 100); pm.dispose();
  return rt;
}

const M = new THREE.Matrix4(), W = new THREE.Matrix4(), R = new THREE.Matrix4(), Y = new THREE.Matrix4(), Sc = new THREE.Matrix4();
const P = new THREE.Vector3(), Q = new THREE.Quaternion(), V = new THREE.Vector3(1, 1, 1), C = new THREE.Color();

// the race cars (and the paddock's spare cars) drawn from one model
export class Fleet {
  constructor(world, model, scale) {
    this.world = world; this.model = model; this.scale = scale;
    this.env = skyEnv(world.renderer, world);
    this.mat = liveryMaterial(this.env.texture);
    this.glassMat = new THREE.MeshStandardMaterial({ color: '#0a0d12', roughness: 0.04, metalness: 0, envMap: this.env.texture, envMapIntensity: 1.4, transparent: true, opacity: 0.72 });
    this.group = new THREE.Group(); world.scene.add(this.group);
    this.cap = 48;
    this.layers = model.lods.map((parts, lod) => parts.map((p) => {
      const geo = p.geo.clone();
      geo.setAttribute('iC1', new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3));
      geo.setAttribute('iC2', new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3));
      const im = new THREE.InstancedMesh(geo, p.glass ? this.glassMat : this.mat, this.cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false; im.count = 0;
      this.group.add(im);
      return { im, p };
    }));
    // every car's shadow comes from its lightest body, drawn only into the shadow map
    const sp = model.lods[2].find((p) => !p.wheel && !p.glass);
    this.shadow = { im: new THREE.InstancedMesh(sp.geo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), this.cap), local: sp.local };
    this.shadow.im.castShadow = true; this.shadow.im.frustumCulled = false; this.shadow.im.count = 0;
    this.group.add(this.shadow.im);
    this.state = new Map(); // per car: wheel spin, steer, last position
  }

  setGlow(k) { glow.value = k; }

  counts() { return this.layers.map((L) => L[0].im.count); }

  // cars: [{ id, group, c1, c2, selected }]; the camera picks each car's level of detail
  update(cars, camera, dt) {
    for (const L of this.layers) for (const { im } of L) im.count = 0;
    const sh = this.shadow; sh.im.count = 0;
    const tanF = Math.tan(camera.fov * Math.PI / 360), lite = this.world.lite;
    for (const c of cars) {
      if (!c.group.visible) continue;
      let st = this.state.get(c.id);
      if (!st) { st = { spin: 0, steer: 0, x: c.group.position.x, z: c.group.position.z, ry: c.group.rotation.y }; this.state.set(c.id, st); }
      if (dt > 0) {
        const mv = Math.hypot(c.group.position.x - st.x, c.group.position.z - st.z);
        st.spin = (st.spin + mv / (0.34 * this.scale)) % (Math.PI * 2);
        let dy = c.group.rotation.y - st.ry; if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2;
        st.steer += (THREE.MathUtils.clamp(dy / Math.max(dt, 1e-3) * 0.35, -0.4, 0.4) - st.steer) * Math.min(1, dt * 8);
      }
      st.x = c.group.position.x; st.z = c.group.position.z; st.ry = c.group.rotation.y;
      // how big the car is on screen picks the detail: close-ups get the full model
      const px = 5.4 * this.scale / (Math.max(0.1, camera.position.distanceTo(c.group.position)) * tanF);
      const lod = px > 2.5 || (c.selected && px > (lite ? 0.6 : 0.3)) ? 0 : px > (lite ? 0.7 : 0.3) ? 1 : 2;
      c.group.updateMatrix();
      W.copy(c.group.matrix).multiply(Sc.makeScale(this.scale, this.scale, this.scale));
      sh.im.setMatrixAt(sh.im.count++, M.copy(W).multiply(sh.local));
      for (const { im, p } of this.layers[lod]) {
        const i = im.count++;
        if (p.wheel) {
          R.makeRotationZ(-st.spin);
          if (p.wheel[0] === 'F') R.premultiply(Y.makeRotationY(st.steer));
          M.makeTranslation(p.hub.x, p.hub.y, p.hub.z).multiply(R).multiply(p.pre);
          im.setMatrixAt(i, M.premultiply(W));
        } else im.setMatrixAt(i, M.copy(W).multiply(p.local));
        C.set(c.c1); im.geometry.attributes.iC1.setXYZ(i, C.r, C.g, C.b);
        C.set(c.c2); im.geometry.attributes.iC2.setXYZ(i, C.r, C.g, C.b);
      }
    }
    sh.im.instanceMatrix.needsUpdate = true;
    for (const L of this.layers) for (const { im } of L) {
      if (!im.count) continue;
      im.instanceMatrix.needsUpdate = true;
      im.geometry.attributes.iC1.needsUpdate = im.geometry.attributes.iC2.needsUpdate = true;
    }
  }

  dispose() {
    this.world.scene.remove(this.group);
    for (const L of this.layers) for (const { im } of L) im.geometry.dispose();
    this.mat.dispose(); this.glassMat.dispose(); this.env.dispose();
  }
}
