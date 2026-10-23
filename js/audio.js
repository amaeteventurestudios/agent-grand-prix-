// Engine sound, made in the browser with Web Audio (no sound files). The cars nearest the
// camera each get a voice: a V6 note from two detuned oscillators through a soft clipper and a
// filter, pitched by speed and gear, panned and faded by where the car is. Each team's engine has
// its own pitch and grit, so cars sound different. Plus wind and crowd, the pit wheel guns and rain.
const GEARS = [0, 22, 36, 50, 63, 75, 86, 96, 120]; // gear tops in m/s
const IDLE = 4200, MAX = 11800;

export class Sound {
  constructor() { this.on = false; this.ctx = null; this.voices = []; this.lite = false; this.vol = 0.8; this.excite = 0; this.roarV = 0; }

  // the crowd: excite (0..1) builds toward the end, roar() is a burst for a pass or the flag
  roar(k = 0.6) { this.roarV = Math.max(this.roarV, k); }

  // must run inside a tap or click: browsers only start audio after a gesture
  start(lite) {
    this.lite = lite;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      const x = this.ctx = new AC();
      this.master = x.createGain(); this.master.gain.value = 0;
      const comp = x.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
      this.master.connect(comp).connect(x.destination);
      this.curve = shaper(2.2);
      for (let i = 0; i < (lite ? 4 : 7); i++) this.voices.push(this.voice());
      // a noise buffer feeds the ambience, the wheel guns and the rain
      const nb = x.createBuffer(1, x.sampleRate * 2, x.sampleRate), d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = nb;
      this.amb = this.bed(500, 0.6); this.rain = this.bed(3200, 0.8); this.guns = this.bed(2400, 6); this.crowd = this.bed(950, 0.45);
    }
    this.ctx.resume();
    this.on = true;
    this.master.gain.setTargetAtTime(this.vol, this.ctx.currentTime, 0.2);
    return true;
  }

  stop() {
    this.on = false;
    if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
  }

  voice() {
    const x = this.ctx;
    const o1 = x.createOscillator(), o2 = x.createOscillator(), sub = x.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'sawtooth'; sub.type = 'square';
    const mix = x.createGain(); mix.gain.value = 0.32;
    const g2 = x.createGain(); g2.gain.value = 0.22;
    const gs = x.createGain(); gs.gain.value = 0.12;
    const ws = x.createWaveShaper(); ws.curve = this.curve;
    const lp = x.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2.5; lp.frequency.value = 1600;
    const out = x.createGain(); out.gain.value = 0;
    const pan = x.createStereoPanner ? x.createStereoPanner() : null;
    o1.connect(mix); o2.connect(g2).connect(mix); sub.connect(gs).connect(mix);
    mix.connect(ws).connect(lp).connect(out);
    if (pan) out.connect(pan).connect(this.master); else out.connect(this.master);
    o1.start(); o2.start(); sub.start();
    return { o1, o2, sub, lp, out, pan, id: null };
  }

  bed(freq, q) {
    const x = this.ctx, src = x.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = x.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = x.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master); src.start();
    return g;
  }

  // once a frame: race, the world (car positions), the camera, the followed car and the camera mode
  update(race, world, camera, selId, mode, speed) {
    if (!this.on || !this.ctx || !race) return;
    const t = this.ctx.currentTime, cp = camera.position;
    const paused = speed === 0;
    // the forward and right vectors of the camera, for panning
    const e = camera.matrixWorld.elements, rx = e[0], rz = e[2];
    // nearest cars to the camera
    const near = [];
    for (const c of race.cars) {
      if (c.dnf || c.finished && c.v < 2) continue;
      const o = world.carObjs.get(c.id); if (!o) continue;
      const p = o.group.position, d = Math.hypot(p.x - cp.x, p.y - cp.y, p.z - cp.z);
      near.push([d, c, p]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const pick = near.slice(0, this.voices.length);
    const ids = new Set(pick.map((n) => n[1].id));
    // keep voices on cars that are still near, so notes don't jump between cars
    const free = this.voices.filter((v) => !ids.has(v.id));
    for (const v of this.voices) if (v.id && !ids.has(v.id)) v.id = null;
    for (const [d, c, p] of pick) {
      let v = this.voices.find((q) => q.id === c.id);
      if (!v) { v = free.shift(); if (!v) continue; v.id = c.id; }
      const team = hash(c.team.id), pitch = 0.94 + team * 0.12;
      // revs from speed in the current gear
      const sp = Number.isFinite(c.v) ? Math.max(0, c.v) : 0;
      let g = 1; while (g < GEARS.length - 1 && sp > GEARS[g]) g++;
      const lo = GEARS[g - 1], hi = GEARS[g], f = g === 1 ? sp / hi : (sp - lo) / (hi - lo);
      const rpm = c.stopT > 0 || (c.pit && sp < 25) ? IDLE + 600 + 300 * Math.sin(t * 3 + team * 9) : IDLE + (MAX - IDLE) * (0.45 + 0.55 * Math.min(1, f));
      const hz = rpm / 20 * pitch * (c.ersMode === 'deploy' ? 1.012 : 1);
      v.o1.frequency.setTargetAtTime(hz, t, 0.04);
      v.o2.frequency.setTargetAtTime(hz * 2.003, t, 0.04);
      v.sub.frequency.setTargetAtTime(hz / 2, t, 0.04);
      const sel = c.id === selId, cockpit = mode === 'fpv' && sel;
      const load = 0.5 + 0.5 * Math.min(1, f);
      v.lp.frequency.setTargetAtTime(cockpit ? 900 + 900 * load : 1100 + 2600 * load * (0.6 + team * 0.4) / (1 + d / 160), t, 0.05);
      let vol = cockpit ? 0.55 : 0.75 / (1 + (d / 28) ** 2) * (sel ? 1.25 : 1);
      if (paused) vol = 0;
      v.out.gain.setTargetAtTime(vol, t, 0.06);
      if (v.pan) {
        const dx = p.x - cp.x, dz = p.z - cp.z, dl = Math.hypot(dx, dz) || 1;
        v.pan.pan.setTargetAtTime(cockpit ? 0 : Math.max(-0.9, Math.min(0.9, (dx * rx + dz * rz) / dl)), t, 0.05);
      }
    }
    for (const v of this.voices) if (!v.id) v.out.gain.setTargetAtTime(0, t, 0.08);
    // the crowd and the wind, the wheel guns when a car near the camera is in its box, the rain
    this.amb.gain.setTargetAtTime(paused ? 0.02 : 0.05, t, 0.3);
    this.roarV *= 0.985;
    this.crowd.gain.setTargetAtTime(paused ? 0 : 0.015 + 0.07 * this.excite + 0.22 * this.roarV, t, 0.25);
    const gun = pick.some(([d, c]) => c.stopT > 0 && c.stopT < (c.stopLen || 3) - 0.3 && d < 120);
    this.guns.gain.setTargetAtTime(gun && !paused ? (Math.sin(t * 38) > 0.2 ? 0.16 : 0.02) : 0, t, 0.01);
    this.rain.gain.setTargetAtTime(Math.min(0.12, race.rain * 0.16), t, 0.4);
  }
}

function shaper(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return c;
}

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return ((h >>> 0) % 1000) / 1000; }
