// Engine sound, made in the browser with Web Audio (no sound files). The cars nearest the camera
// each get a voice. A voice is a turbo V6: one engine cycle (two turns of the crank) is drawn as a
// waveform whose harmonics follow the six firing pulses, the bank-to-bank imbalance and a little
// cylinder-to-cylinder roughness, so it growls rather than buzzes. It runs through a soft clipper
// and two exhaust resonances, with a rasp of noise pulsing at the firing rate, a turbo whine on top,
// a cut on every upshift, pops on the overrun, and a Doppler sweep as a car goes past the camera.
// A short room echo gives it space. Each team's engine has its own pitch and character.
// Plus wind and crowd, the pit wheel guns and rain.
const GEARS = [0, 22, 36, 50, 63, 75, 86, 96, 120]; // gear tops in m/s
const IDLE = 4000, MAX = 12000;
const C_SOUND = 446;   // speed of sound in world units (the world is drawn a little larger than life)

export class Sound {
  constructor() { this.on = false; this.ctx = null; this.voices = []; this.lite = false; this.vol = 0.8; this.excite = 0; this.roarV = 0; }

  // the crowd: excite (0..1) builds toward the end, roar() is a burst for a pass or the flag
  roar(k = 0.6) { this.roarV = Math.max(this.roarV, k); }

  // must run inside a tap or click: browsers only start audio after a gesture. Tests can pass an
  // OfflineAudioContext to render a clip.
  start(lite, ctx) {
    this.lite = lite;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC && !ctx) return false;
      const x = this.ctx = ctx || new AC();
      this.master = x.createGain(); this.master.gain.value = ctx ? this.vol : 0;
      const comp = x.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2;
      // the compressor adds make-up gain, so trim after it to keep peaks clear of clipping
      const trim = x.createGain(); trim.gain.value = 0.55;
      this.master.connect(comp).connect(trim).connect(x.destination);
      // a short room: the stands and the pit wall throw the sound back
      this.verb = x.createConvolver(); this.verb.buffer = room(x, 1.3);
      const vg = x.createGain(); vg.gain.value = 0.22; this.verb.connect(vg).connect(comp);
      this.curve = shaper(1.8);
      // a noise buffer feeds the rasp, the ambience, the wheel guns and the rain
      const nb = x.createBuffer(1, x.sampleRate * 2, x.sampleRate), d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = nb;
      this.waves = [0, 1, 2].map((k) => engineWave(x, k));
      for (let i = 0; i < (lite ? 4 : 7); i++) this.voices.push(this.voice());
      this.amb = this.bed(500, 0.6); this.rain = this.bed(3200, 0.8); this.guns = this.bed(2400, 6); this.crowd = this.bed(950, 0.45);
    }
    if (this.ctx.resume && !(this.ctx instanceof (window.OfflineAudioContext || Object))) this.ctx.resume();
    this.on = true;
    if (!ctx) this.master.gain.setTargetAtTime(this.vol, this.ctx.currentTime, 0.2);
    return true;
  }

  stop() {
    this.on = false;
    if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
  }

  voice() {
    const x = this.ctx;
    const o1 = x.createOscillator(), o2 = x.createOscillator();
    o1.setPeriodicWave(this.waves[0]); o2.setPeriodicWave(this.waves[0]); o2.detune.value = 9;
    const mix = x.createGain(); mix.gain.value = 0.5;
    const g2 = x.createGain(); g2.gain.value = 0.45;
    const drive = x.createGain(); drive.gain.value = 1.4;
    const ws = x.createWaveShaper(); ws.curve = this.curve; ws.oversample = '2x';
    // exhaust resonances, then the distance and load filter
    const f1 = x.createBiquadFilter(); f1.type = 'peaking'; f1.frequency.value = 330; f1.Q.value = 1.1; f1.gain.value = 7;
    const f2 = x.createBiquadFilter(); f2.type = 'peaking'; f2.frequency.value = 1150; f2.Q.value = 1.6; f2.gain.value = 5;
    const lp = x.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.9; lp.frequency.value = 2400;
    const hp = x.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38;
    // the rasp: filtered noise, pulsed at the firing rate
    const ns = x.createBufferSource(); ns.buffer = this.noise; ns.loop = true; ns.playbackRate.value = 0.8 + Math.random() * 0.4;
    const nf = x.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2600; nf.Q.value = 0.7;
    const rasp = x.createGain(); rasp.gain.value = 0;
    const pulse = x.createOscillator(); pulse.type = 'square';
    const depth = x.createGain(); depth.gain.value = 0;
    pulse.connect(depth).connect(rasp.gain);
    // the turbo and the energy recovery motor whine above it all
    const whine = x.createOscillator(); whine.type = 'sine';
    const wg = x.createGain(); wg.gain.value = 0;
    const out = x.createGain(); out.gain.value = 0;
    const pan = x.createStereoPanner ? x.createStereoPanner() : null;
    o1.connect(mix); o2.connect(g2).connect(mix);
    mix.connect(drive).connect(ws).connect(f1).connect(f2).connect(lp).connect(hp).connect(out);
    ns.connect(nf).connect(rasp).connect(lp);
    whine.connect(wg).connect(out);
    const dest = pan ? (out.connect(pan), pan) : out;
    dest.connect(this.master);
    const send = x.createGain(); send.gain.value = 0; dest.connect(send).connect(this.verb);
    o1.start(); o2.start(); ns.start(); pulse.start(); whine.start();
    return { o1, o2, lp, out, pan, send, rasp, depth, pulse, whine, wg, drive, f1, id: null, gear: 1, cut: 0, pop: 0, dPrev: null, vr: 0 };
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
    const dtA = this.lastT === undefined ? 0.016 : Math.max(0.001, Math.min(0.1, t - this.lastT)); this.lastT = t;
    for (const [d, c, p] of pick) {
      let v = this.voices.find((q) => q.id === c.id);
      if (!v) {
        v = free.shift(); if (!v) continue; v.id = c.id; v.dPrev = null; v.vr = 0;
        const w = this.waves[Math.floor(hash(c.team.id + 'w') * 3)]; v.o1.setPeriodicWave(w); v.o2.setPeriodicWave(w);
      }
      const team = hash(c.team.id), pitch = 0.95 + team * 0.1;
      // revs from speed in the current gear
      const sp = Number.isFinite(c.v) ? Math.max(0, c.v) : 0;
      let g = 1; while (g < GEARS.length - 1 && sp > GEARS[g]) g++;
      const lo = GEARS[g - 1], hi = GEARS[g], f = g === 1 ? sp / hi : (sp - lo) / (hi - lo);
      const idle = c.stopT > 0 || (c.pit && sp < 25);
      const rpm = idle ? IDLE + 600 + 300 * Math.sin(t * 3 + team * 9) : IDLE + (MAX - IDLE) * (0.5 + 0.5 * Math.min(1, f));
      // on the throttle, or lifting and braking (the overrun pops and crackles)
      const load = idle ? 0.25 : (c._vt ?? c.v) >= c.v - 0.5 ? 1 : 0.15;
      if (!idle && g > v.gear) v.cut = 0.07;                  // the upshift: a split-second cut
      if (!idle && g < v.gear && Math.random() < 0.7) v.pop = 0.12;   // the downshift blip
      v.gear = g;
      v.cut = Math.max(0, v.cut - dtA); v.pop = Math.max(0, v.pop - dtA);
      // Doppler: the note rises as a car comes at the camera and drops as it goes away
      const sel = c.id === selId, cockpit = mode === 'fpv' && sel;
      if (v.dPrev !== null && !paused) v.vr += ((d - v.dPrev) / dtA - v.vr) * Math.min(1, dtA * 10);
      v.dPrev = d;
      if (!Number.isFinite(v.vr)) v.vr = 0;   // a camera jump can leave a bad value; never pass one to Web Audio
      const dop = cockpit || paused ? 1 : Math.max(0.72, Math.min(1.3, C_SOUND / (C_SOUND + v.vr)));
      const fc = (Number.isFinite(rpm) ? rpm : IDLE) / 120 * pitch * dop * (c.ersMode === 'deploy' ? 1.01 : 1);   // one engine cycle
      v.o1.frequency.setTargetAtTime(fc, t, 0.03);
      v.o2.frequency.setTargetAtTime(fc, t, 0.03);
      v.pulse.frequency.setTargetAtTime(fc * 6, t, 0.03);
      v.whine.frequency.setTargetAtTime((2600 + 4200 * (rpm - IDLE) / (MAX - IDLE)) * dop, t, 0.06);
      v.drive.gain.setTargetAtTime(0.9 + 1.1 * load, t, 0.05);
      v.f1.frequency.setTargetAtTime(300 + 90 * team + 60 * load, t, 0.1);
      // distance takes the top off; on board you hear the intake and the gearbox
      const far = 1 / (1 + d / 220);
      v.lp.frequency.setTargetAtTime(cockpit ? 1500 + 1200 * load : (900 + 3200 * load) * (0.35 + 0.65 * far), t, 0.05);
      const raspK = (0.05 + 0.1 * load + (v.pop > 0 ? 0.6 : 0) + (load < 0.5 && Math.random() < 0.05 ? 0.35 : 0)) * (0.4 + 0.6 * far);
      v.rasp.gain.setTargetAtTime(raspK * 0.5, t, 0.015);
      v.depth.gain.setTargetAtTime(raspK * 0.5, t, 0.015);
      v.wg.gain.setTargetAtTime((cockpit ? 0.02 : 0.009) * load * far, t, 0.08);
      let vol = cockpit ? 0.5 : 0.8 / (1 + (d / 26) ** 2) * (sel ? 1.25 : 1);
      vol *= 0.55 + 0.45 * load;
      if (v.cut > 0) vol *= 0.3;
      if (paused) vol = 0;
      if (!Number.isFinite(vol)) vol = 0;
      v.out.gain.setTargetAtTime(vol, t, v.cut > 0 ? 0.008 : 0.05);
      v.send.gain.setTargetAtTime(cockpit ? 0.05 : 0.5 * Math.min(1, d / 40), t, 0.1);
      if (v.pan) {
        const dx = p.x - cp.x, dz = p.z - cp.z, dl = Math.hypot(dx, dz) || 1;
        v.pan.pan.setTargetAtTime(cockpit ? 0 : Math.max(-0.9, Math.min(0.9, (dx * rx + dz * rz) / dl || 0)), t, 0.05);
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

// one engine cycle of a V6: six firing pulses (harmonics 6, 12, 18...), the two banks a little
// out of step (3, 9, 15...) and some roughness on every harmonic. k picks one of three characters.
function engineWave(x, k) {
  const N = 64, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
  let seed = 1234 + k * 977;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let h = 1; h <= N; h++) {
    let a = (0.04 + 0.05 * k / 2) * rnd() / Math.sqrt(h);
    if (h % 3 === 0) a += (0.32 + 0.08 * k) / Math.pow(h / 3, 0.7);
    if (h % 6 === 0) a += 1.0 / Math.pow(h / 6, 0.85 - 0.08 * k);
    if (h === 1 || h === 2) a += 0.18;   // the deep pulse you feel in your chest
    const ph = rnd() * Math.PI * 2;
    re[h] = a * Math.cos(ph); im[h] = a * Math.sin(ph);
  }
  return x.createPeriodicWave(re, im);
}

// a stereo impulse that dies away over `sec` seconds
function room(x, sec) {
  const n = Math.floor(x.sampleRate * sec), b = x.createBuffer(2, n, x.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) { const t = i / n; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < x.sampleRate * 0.012 ? i / (x.sampleRate * 0.012) : 1); }
  }
  return b;
}

function shaper(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return c;
}

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return ((h >>> 0) % 1000) / 1000; }
