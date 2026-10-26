// The car's cutaway: what sits under the bodywork, built from simple shapes in the same place in
// every car, and what each part does. The showroom (js/showroom.js) turns the bodywork to glass,
// then pulls the car apart, and lets you tap a part to fly to it and read about it.
//
// Positions are in Blender's car frame (X forward, Y left, Z up), like the car models; V() turns them
// into the scene's. Wheel hubs come from the car itself, so brakes, suspension and driveshafts meet
// each car's own wheels.
import * as THREE from 'three';

export const V = (x, y, z) => new THREE.Vector3(x, z, -y);

// what you can tap, in the order the tour visits them. inside: shown through the glass bodywork.
// at: where the pin sits (Blender frame). out: which way the part moves when the car is pulled apart.
export const PARTS = [
  { id: 'cell', inside: true, name: 'Survival cell', short: 'The carbon tub the driver sits in.',
    how: 'Layers of carbon fibre and honeycomb, baked hard. Everything else bolts to it: the engine behind, the suspension at both ends.',
    fact: 'It weighs about as much as a child, yet takes crash loads of many tonnes.', at: [0.9, 0, 0.36], out: [0, 0, 0] },
  { id: 'driver', inside: true, name: 'Driver', short: 'Lying almost flat, feet up in the nose.',
    how: 'Lying low keeps the weight down and the car narrow. The steering wheel carries the buttons for the battery, the radio and the brakes.',
    fact: 'Drivers feel up to five times their own weight in fast corners.', at: [0.2, 0, 0.55], out: [0, 0, 0.12] },
  { id: 'halo', inside: true, name: 'Halo', short: 'A titanium hoop over the driver\'s head.',
    how: 'It sits above the cockpit and deflects a loose wheel or a car that lands on top. The canopy covers it on our cars.',
    fact: 'It can hold the weight of a double-decker bus.', at: [0.55, 0, 0.72], out: [0, 0, 0.5] },
  { id: 'fuel', inside: true, name: 'Fuel cell', short: 'A rubber bag of fuel behind the seat.',
    how: 'A tough, flexible bag inside the tub, so a crash bends it instead of splitting it. Pumps inside keep fuel flowing in every corner.',
    fact: 'It holds about 100 kg of fuel at the start, enough for the whole race.', at: [-0.42, 0, 0.5], out: [0, 0, 0.45] },
  { id: 'battery', inside: true, name: 'Battery', short: 'Stores energy saved under braking.',
    how: 'Under braking, the electric motor turns the car\'s speed back into electricity and fills this battery. BOOST spends it again.',
    fact: 'It gives back about 160 extra horsepower for a few seconds each lap.', at: [-0.42, 0.18, 0.12], out: [0, 0, -0.25] },
  { id: 'engine', inside: true, name: 'Power unit', short: 'A small turbo engine plus electric motors.',
    how: 'Six cylinders in a V burn the fuel; a turbo squeezes air in, and the electric motors add their push. All of it drives the rear wheels.',
    fact: 'About 1000 horsepower from an engine smaller than a family car’s.', at: [-1.05, 0, 0.62], out: [0, 0, 0.6] },
  { id: 'turbo', inside: true, name: 'Turbo', short: 'Exhaust gas spins it to push more air in.',
    how: 'Hot exhaust spins a little turbine; on the same shaft a compressor crams air into the engine. More air, more fuel burned, more power.',
    fact: 'It spins up to 125,000 times a minute.', at: [-0.78, 0, 0.6], out: [0.25, 0, 0.75] },
  { id: 'mguk', inside: true, name: 'Electric motor', short: 'Charges the battery, then pushes the car.',
    how: 'Geared to the engine: it brakes the car and makes electricity, then turns the other way round and helps the engine when you press BOOST.',
    fact: 'It can harvest about 2 megajoules a lap, enough to boil a kettle five times.', at: [-0.9, 0.2, 0.24], out: [0, 0.3, -0.1] },
  { id: 'radiator', inside: true, name: 'Radiators', short: 'Air from the side intakes cools everything.',
    how: 'Air enters the side intakes, passes through the radiators\' thin fins, and carries away the heat from the water, oil and battery.',
    fact: 'The water inside runs at about 120 °C, kept from boiling by pressure.', at: [0.08, -0.5, 0.34], out: [0, 0.55, 0] },
  { id: 'gearbox', inside: true, name: 'Gearbox', short: 'Eight gears, shifts in milliseconds.',
    how: 'Bolted to the back of the engine, it also holds the rear suspension and the rear wing. Driveshafts carry the power out to the wheels.',
    fact: 'A gear change takes a few hundredths of a second, faster than a blink.', at: [-1.72, 0, 0.32], out: [-0.55, 0, 0] },
  { id: 'exhaust', inside: true, name: 'Exhaust', short: 'Hot gas out of the back.',
    how: 'After spinning the turbo, the exhaust leaves through one tailpipe under the rear wing. It glows at full throttle.',
    fact: 'The gas leaves at around 900 °C.', at: [-2.05, 0, 0.5], out: [-0.35, 0, 0.3] },
  { id: 'suspension', inside: true, name: 'Suspension', short: 'Arms that hold each wheel to the car.',
    how: 'Two wishbones hold each wheel; a pushrod carries the bumps to springs hidden inside the car, so the air flows cleanly past.',
    fact: 'The car runs only a few centimetres off the road, so it is set very stiff.', at: [1.2, 0.38, 0.3], out: [0, 0, 0] },
  { id: 'brakes', inside: true, name: 'Brakes', short: 'Carbon discs that glow red hot.',
    how: 'Six-piston callipers squeeze carbon discs inside each wheel. The electric motor helps at the rear and saves energy while it does.',
    fact: 'The discs reach about 1000 °C and stop the car from 300 km/h in about 4 seconds.', at: [1.55, -0.62, 0.34], out: [0, 0, 0] },
  { id: 'fwing', inside: false, name: 'Front wing', short: 'Presses the front tyres into the road.',
    how: 'Shaped like an upside-down aeroplane wing: air pushes it down, giving the front tyres more grip in corners.',
    fact: 'At top speed the whole car makes enough downforce to drive upside down.', at: [2.75, 0.55, 0.16], out: [0, 0, 0] },
  { id: 'rwing', inside: false, name: 'Rear wing', short: 'Grip for the rear, with a flap for speed.',
    how: 'Like the front wing, it pushes the rear tyres down. On straights a flap opens to cut drag and add speed.',
    fact: 'Opening the flap is worth 10 to 15 km/h on a long straight.', at: [-2.15, 0.4, 1.12], out: [0, 0, 0] },
  { id: 'floor', inside: false, name: 'Floor', short: 'Tunnels underneath suck the car down.',
    how: 'Air speeds up through shaped tunnels under the car, which lowers the pressure there and pulls the car to the track.',
    fact: 'More than half the car\'s grip comes from the floor.', at: [-0.6, -0.86, 0.08], out: [0, 0, 0] },
  { id: 'tyres', inside: false, name: 'Tyres', short: 'Soft, medium, hard, and two for rain.',
    how: 'Softer rubber grips more but wears out sooner. Choosing when to change them is the biggest call you make in a race.',
    fact: 'A pit crew changes all four in about two seconds.', at: [1.55, 0.72, 0.36], out: [0, 0, 0] },
];
export const partById = (id) => PARTS.find((p) => p.id === id);

// the parts, one group each; returns { group, parts: Map(id -> { g, mats, rest }), update(dt, k) }
export function buildInside(hubs = {}, lite = false) {
  const group = new THREE.Group();
  const parts = new Map();
  let cur = null;
  const part = (id) => { const g = new THREE.Group(); g.name = id; group.add(g); cur = { g, mats: [], spin: [] }; parts.set(id, cur); return cur; };
  const mat = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.15, transparent: true, ...o }); m.userData.base = { opacity: 1, emissive: m.emissive.clone(), ei: m.emissiveIntensity }; cur.mats.push(m); return m; };
  const put = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.copy(V(x, y, z)); o.rotation.set(rx, ry, rz); o.castShadow = !lite; cur.g.add(o); return o; };
  // a rounded capsule lying along the car, scaled to a length, width and height
  const pod = (x0, x1, w, z0, z1, m, y = 0) => {
    const r = Math.min(w, (z1 - z0) / 2), len = Math.max(0.01, x1 - x0 - 2 * r);
    const o = put(new THREE.CapsuleGeometry(r, len, 6, 16), m, (x0 + x1) / 2, y, (z0 + z1) / 2, 0, 0, Math.PI / 2);
    o.scale.set((z1 - z0) / 2 / r, 1, w / r); return o;
  };
  // a rod from one point to another (scene frame)
  const rod = (a, b, r, m) => {
    const d = b.clone().sub(a), o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), m);
    o.position.copy(a).add(b).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); cur.g.add(o); return o;
  };
  const hub = (k, fx, fy) => (hubs[k] ? hubs[k].clone() : V(fx, fy, 0.34));
  const H = { FL: hub('FL', 1.55, 0.62), FR: hub('FR', 1.55, -0.62), RL: hub('RL', -1.55, 0.6), RR: hub('RR', -1.55, -0.6) };

  // the tub, the driver, the halo
  part('cell');
  const carbon = mat('#1a1d22', { roughness: 0.32, metalness: 0.3 });
  pod(-0.3, 1.95, 0.27, 0.05, 0.44, carbon);
  pod(1.4, 2.35, 0.14, 0.08, 0.3, carbon);                                   // the nose box
  const weave = mat('#2a2f37', { roughness: 0.25, metalness: 0.4 });
  put(new THREE.BoxGeometry(0.62, 0.02, 0.5), weave, 0.3, 0, 0.45);           // the cockpit rim
  part('driver');
  const suit = mat('#1f3a8a'), helmet = mat('#f4f4f4', { roughness: 0.25, metalness: 0.1 }), visor = mat('#111418', { roughness: 0.05, metalness: 0.6 });
  pod(-0.08, 0.5, 0.15, 0.16, 0.36, suit);
  pod(0.45, 1.35, 0.1, 0.14, 0.27, suit, 0.07); pod(0.45, 1.35, 0.1, 0.14, 0.27, suit, -0.07);
  put(new THREE.SphereGeometry(0.115, 24, 16), helmet, 0.05, 0, 0.5);
  put(new THREE.SphereGeometry(0.117, 24, 8, -0.9, 1.8, 1.25, 0.5), visor, 0.05, 0, 0.5, 0, Math.PI / 2, 0);
  const wheel = put(new THREE.TorusGeometry(0.08, 0.016, 8, 24), mat('#22252b'), 0.56, 0, 0.42); wheel.rotation.y = Math.PI / 2;
  put(new THREE.BoxGeometry(0.03, 0.07, 0.12), mat('#3a7bff', { emissive: '#1d4fd0', emissiveIntensity: 0.8 }), 0.56, 0, 0.42);
  part('halo');
  const ti = mat('#b8bec7', { metalness: 0.9, roughness: 0.25 });
  const arc = put(new THREE.TorusGeometry(0.3, 0.025, 10, 32, Math.PI), ti, 0.18, 0, 0.66, Math.PI / 2, 0, Math.PI / 2);
  arc.scale.set(1, 1.15, 1);
  rod(V(0.6, 0, 0.66), V(0.75, 0, 0.44), 0.025, ti);

  // fuel, battery, power unit
  part('fuel');
  pod(-0.72, -0.12, 0.23, 0.17, 0.6, mat('#545a63', { roughness: 0.85 }));
  put(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 12), mat('#e0a21b', { metalness: 0.6 }), -0.42, 0, 0.62);
  part('battery');
  const cellM = mat('#2f6bff', { emissive: '#1a47c9', emissiveIntensity: 0.65, roughness: 0.4 });
  put(new THREE.BoxGeometry(0.6, 0.07, 0.46), mat('#1d2633', { metalness: 0.5 }), -0.42, 0, 0.12);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) put(new THREE.BoxGeometry(0.08, 0.02, 0.09), cellM, -0.65 + i * 0.092, -0.15 + j * 0.1, 0.165);
  part('engine');
  const alloy = mat('#a3aab4', { metalness: 0.85, roughness: 0.28 }), red = mat('#c4262e', { roughness: 0.4 }), dark = mat('#3d424a', { metalness: 0.6, roughness: 0.4 });
  pod(-1.42, -0.72, 0.17, 0.12, 0.4, dark);
  for (const s of [1, -1]) {
    for (let i = 0; i < 3; i++) put(new THREE.CylinderGeometry(0.055, 0.055, 0.2, 14), alloy, -1.3 + i * 0.2, s * 0.12, 0.44, s * 0.55, 0, 0);
    put(new THREE.BoxGeometry(0.58, 0.04, 0.1), red, -1.1, s * 0.19, 0.55, s * 0.55);
  }
  for (let i = 0; i < 6; i++) put(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 10), alloy, -1.32 + i * 0.09, 0, 0.62);   // intake trumpets
  put(new THREE.BoxGeometry(0.62, 0.06, 0.18), mat('#2b3038', { metalness: 0.5 }), -1.08, 0, 0.7);                       // plenum
  part('turbo');
  const steel = mat('#c9ced6', { metalness: 0.95, roughness: 0.18 });
  const snail = put(new THREE.TorusGeometry(0.07, 0.035, 10, 24), steel, -0.76, 0, 0.6); snail.rotation.y = Math.PI / 2;
  const fan = new THREE.Group(); fan.position.copy(V(-0.76, 0, 0.6)); cur.g.add(fan);
  const blade = mat('#eef1f5', { metalness: 0.9, roughness: 0.15 });
  for (let i = 0; i < 8; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.02), blade); b.rotation.x = (i / 8) * Math.PI * 2; fan.add(b); }
  cur.spin.push([fan, 'x', 40]);
  part('mguk');
  const mg = put(new THREE.CylinderGeometry(0.085, 0.085, 0.18, 24), mat('#e0a21b', { metalness: 0.55, roughness: 0.3 }), -0.9, 0.2, 0.24, Math.PI / 2);
  for (let i = 0; i < 3; i++) put(new THREE.TorusGeometry(0.087, 0.006, 6, 24), mat('#7a5a10', { metalness: 0.6 }), -0.9, 0.14 + i * 0.06, 0.24, 0, 0, 0);
  cur.spin.push([mg, 'y', 6]);
  part('radiator');
  const copper = mat('#b8743d', { metalness: 0.65, roughness: 0.42 });
  for (const s of [1, -1]) {
    const core = new THREE.Group(); core.position.copy(V(0.08, s * 0.5, 0.32)); core.rotation.y = s * 0.18; cur.g.add(core);
    // the fins: a stack of thin plates the air passes between
    const n = lite ? 8 : 16, fin = new THREE.BoxGeometry(0.62, 0.24, 0.004);
    for (let i = 0; i < n; i++) { const f = new THREE.Mesh(fin, copper); f.position.z = (i - n / 2) * (0.05 / n); core.add(f); }
    core.add(new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.26, 0.06), mat('#6b4426', { transparent: true, opacity: 0.35, metalness: 0.4 })));
    const pipe = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.2, s * 0.45, 0.3), V(-0.5, s * 0.3, 0.32), V(-0.8, s * 0.14, 0.3)]), 16, 0.018, 8);
    cur.g.add(new THREE.Mesh(pipe, mat('#3d8fd6', { roughness: 0.4 })));
  }
  part('gearbox');
  const gb = put(new THREE.CylinderGeometry(0.075, 0.13, 0.62, 6, 1), mat('#5b616b', { metalness: 0.75, roughness: 0.32 }), -1.72, 0, 0.27, 0, 0, Math.PI / 2);
  gb.rotation.y = Math.PI / 6;
  const shaftM = mat('#8d949e', { metalness: 0.9, roughness: 0.25 });
  for (const k of ['RL', 'RR']) { const a = V(-1.6, 0, 0.27), b = H[k].clone(); b.y = a.y; const sh = rod(a, b, 0.02, shaftM); cur.spin.push([sh, 'y', 30]); }
  part('exhaust');
  const ex = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.8, 0, 0.52), V(-1.3, 0, 0.74), V(-1.8, 0, 0.62), V(-2.2, 0, 0.55)]), 24, 0.035, 10);
  cur.g.add(new THREE.Mesh(ex, mat('#8a6b4f', { metalness: 0.8, roughness: 0.35 })));
  put(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16), mat('#ff7a2e', { emissive: '#ff4a00', emissiveIntensity: 1.2 }), -2.21, 0, 0.55, 0, 0, Math.PI / 2);
  part('suspension');
  const arm = mat('#2b2f36', { metalness: 0.5, roughness: 0.35 });
  for (const k of ['FL', 'FR', 'RL', 'RR']) {
    const h = H[k], front = k[0] === 'F', s = h.z > 0 ? 1 : -1, x0 = front ? 1.2 : -1.25, w = front ? 0.16 : 0.2;
    for (const [dz, dx] of [[0.1, 0.22], [-0.06, 0.22]]) {
      const tip = h.clone().add(new THREE.Vector3(0, dz, -s * 0.04));
      rod(V(x0 + dx, s * -w, 0.3 + dz), tip, 0.012, arm); rod(V(x0 - dx, s * -w, 0.3 + dz), tip, 0.012, arm);
    }
    rod(h.clone().add(new THREE.Vector3(0, -0.06, -s * 0.06)), V(x0, s * -0.12, 0.48), 0.014, mat('#c9ced6', { metalness: 0.9, roughness: 0.2 }));
  }
  part('brakes');
  const disc = mat('#3a2d2a', { emissive: '#ff3a00', emissiveIntensity: 0.0, metalness: 0.3, roughness: 0.6 });
  const cal = mat('#d81f26', { roughness: 0.35 });
  for (const k of ['FL', 'FR', 'RL', 'RR']) {
    const h = H[k], s = h.z > 0 ? 1 : -1;
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 32), disc); d.position.copy(h).add(new THREE.Vector3(0, 0, -s * 0.08)); d.rotation.x = Math.PI / 2; cur.g.add(d);
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.06), cal); c.position.copy(h).add(new THREE.Vector3(-0.1, 0.06, -s * 0.08)); cur.g.add(c);
    cur.spin.push([d, 'y', 25]);
  }
  cur.disc = disc;

  // flows: energy from the battery to the motor, fuel to the engine, air through the radiators
  const flows = new THREE.Group(); flows.name = 'flows'; group.add(flows);
  const dots = (pts, color, n, speed) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.022, 8, 6), m, n); im.frustumCulled = false; flows.add(im);
    return { curve, im, n, speed, m };
  };
  const streams = [
    dots([V(-0.42, 0.1, 0.18), V(-0.66, 0.22, 0.22), V(-0.9, 0.2, 0.24)], '#5cc8ff', lite ? 6 : 10, 0.6),
    dots([V(-0.42, 0, 0.62), V(-0.7, 0, 0.72), V(-1.08, 0, 0.7)], '#ffb020', lite ? 5 : 8, 0.45),
    ...[1, -1].map((s) => dots([V(0.55, s * 0.62, 0.36), V(0.1, s * 0.5, 0.33), V(-0.4, s * 0.34, 0.38), V(-0.9, s * 0.2, 0.5)], '#d9f2ff', lite ? 6 : 12, 0.8)),
  ];
  const M4 = new THREE.Matrix4(), P = new THREE.Vector3();
  let t = 0;
  function update(dt, k, sel) {
    t += dt;
    for (const p of parts.values()) for (const [o, ax, w] of p.spin) o.rotation[ax] += w * dt * (0.4 + k);
    // the brakes heat up and cool down, as if the car were braking for corners
    const heat = Math.max(0, Math.sin(t * 1.3)) ** 3;
    parts.get('brakes').disc.emissiveIntensity = 0.15 + heat * 1.6 + (sel === 'brakes' ? 0.6 : 0);
    flows.visible = k > 0.4;
    for (const s of streams) {
      s.m.opacity = Math.min(1, (k - 0.4) * 3) * 0.9;
      for (let i = 0; i < s.n; i++) { s.curve.getPointAt(((t * s.speed + i / s.n) % 1 + 1) % 1, P); M4.makeTranslation(P.x, P.y, P.z); s.im.setMatrixAt(i, M4); }
      s.im.instanceMatrix.needsUpdate = true;
    }
  }
  // the chosen part glows; the others step back so it stands out
  function highlight(id) {
    const pulse = 0.55 + 0.45 * Math.sin(t * 4);
    for (const [pid, p] of parts) for (const m of p.mats) {
      const on = !id || pid === id;
      m.opacity = on ? 1 : 0.18;
      m.depthWrite = on;
      if (pid === id && pid !== 'brakes') { m.emissive.set('#3aa0ff'); m.emissiveIntensity = 0.25 * pulse; }
      else if (pid !== 'brakes') { m.emissive.copy(m.userData.base.emissive); m.emissiveIntensity = m.userData.base.ei; }
    }
  }
  return { group, parts, update, highlight };
}
