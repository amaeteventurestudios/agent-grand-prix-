// The race engineer's voice: short lines recorded once with Kokoro (art/voice/gen.py), joined
// into calls like "Car two. These tyres are finished. Box for mediums?" and played through a
// radio filter with a squelch click. Clips load on first use; stale calls are dropped.
export const VOICES = [
  { id: 'michael', name: 'Michael', note: 'American' },
  { id: 'george', name: 'George', note: 'British' },
  { id: 'heart', name: 'Heart', note: 'American' },
  { id: 'emma', name: 'Emma', note: 'British' },
];
const COMMON = ['car1', 'car2', 'q_S', 'q_M', 'q_H', 'q_I', 'q_W', 'b_S', 'b_M', 'b_H', 'w_window', 'w_finished', 'lights', 'nice', 'lost', 'goodstop', 'k_chase', 'k_defend', 'k_team'];

export class Voice {
  constructor(base = 'assets/voice/') { this.base = base; this.id = null; this.buf = new Map(); this.q = []; this.busy = false; this.ctx = null; this.duck = null; }
  // ctx: the game's AudioContext when sound is on, so the radio sits in the same mix
  use(id, ctx) {
    if (id !== this.id) { this.buf.clear(); this.q = []; }
    this.id = id;
    if (ctx && ctx !== this.ctx) { this.ctx = ctx; this.chain = null; }
    if (id) COMMON.forEach((k) => this.load(k));
  }
  context() {
    if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; this.ctx = new AC(); }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.chain) {
      // radio: band-limited, a little drive, slightly louder than the engines
      const x = this.ctx, hp = x.createBiquadFilter(), lp = x.createBiquadFilter(), sh = x.createWaveShaper(), g = x.createGain();
      hp.type = 'highpass'; hp.frequency.value = 320; lp.type = 'lowpass'; lp.frequency.value = 3600; lp.Q.value = 0.9;
      const n = 256, curve = new Float32Array(n); for (let i = 0; i < n; i++) { const v = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(v * 1.8) / Math.tanh(1.8); }
      sh.curve = curve; g.gain.value = 1.15;
      hp.connect(lp).connect(sh).connect(g).connect(x.destination);
      this.chain = hp;
    }
    return this.ctx;
  }
  load(k) {
    if (!this.id) return Promise.resolve(null);
    const key = this.id + '/' + k;
    if (!this.buf.has(key)) {
      this.buf.set(key, fetch(this.base + key + '.mp3').then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((ab) => ab && this.context()?.decodeAudioData(ab)).catch(() => null));
    }
    return this.buf.get(key);
  }
  // parts: clip ids in order. prio calls jump the queue; anything older than 7 s is skipped.
  say(parts, prio = false) {
    if (!this.id || !parts.length) return;
    parts.forEach((k) => this.load(k));
    const item = { parts, at: performance.now() };
    if (prio) this.q.unshift(item); else this.q.push(item);
    if (this.q.length > 3) this.q.length = 3;
    this.next();
  }
  stop() { this.q = []; }
  async next() {
    if (this.busy) return;
    const item = this.q.shift(); if (!item) return;
    if (performance.now() - item.at > 7000) return this.next();
    this.busy = true;
    try {
      const bufs = (await Promise.all(item.parts.map((k) => this.load(k)))).filter(Boolean);
      const x = this.context();
      if (x && bufs.length) {
        this.duck?.(true);
        let t = x.currentTime + 0.05;
        t = this.click(x, t);
        for (const b of bufs) { const s = x.createBufferSource(); s.buffer = b; s.connect(this.chain); s.start(t); t += b.duration + 0.08; }
        t = this.click(x, t);
        await new Promise((res) => setTimeout(res, (t - x.currentTime) * 1000 + 250));
        this.duck?.(false);
      }
    } finally { this.busy = false; }
    this.next();
  }
  // the squelch at either end of a transmission
  click(x, t) {
    const n = Math.floor(x.sampleRate * 0.05), b = x.createBuffer(1, n, x.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.18 * (1 - i / n);
    const s = x.createBufferSource(); s.buffer = b; s.connect(this.chain); s.start(t);
    return t + 0.07;
  }
}
