// The race engineer's voice: short lines recorded once with Kokoro and Piper (art/voice/gen.py), joined
// into calls like "Car two. These tyres are finished. Box for mediums?" and played through a
// radio filter with a squelch click. Each voice is one file of clips (assets/voice/<id>.js), loaded
// when the voice is picked; a clip is decoded on first use. Stale calls are dropped.
export const VOICES = [
  { id: 'michael', name: 'Michael', note: 'American' }, { id: 'george', name: 'George', note: 'British' },
  { id: 'lewis', name: 'Lewis', note: 'British' }, { id: 'daniel', name: 'Daniel', note: 'British' },
  { id: 'fable', name: 'Fable', note: 'British' }, { id: 'nicola', name: 'Nicola', note: 'Italian' },
  { id: 'alex', name: 'Alex', note: 'Spanish' }, { id: 'santa', name: 'Santiago', note: 'Spanish' },
  { id: 'alexpt', name: 'Tiago', note: 'Portuguese' }, { id: 'santapt', name: 'Rui', note: 'Portuguese' },
  { id: 'thorsten', name: 'Thorsten', note: 'German' }, { id: 'ronnie', name: 'Ronnie', note: 'Dutch' },
  { id: 'gilles', name: 'Gilles', note: 'French' },
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
  pack(id = this.id) {
    this.packs ||= new Map();
    if (!this.packs.has(id)) this.packs.set(id, import(`../${this.base}${id}.js`).then((m) => m.default).catch(() => ({})));
    return this.packs.get(id);
  }
  // k is a clip id in the engineer's voice, or '@voice/clip' for someone else on the radio (a driver)
  load(k) {
    if (!this.id) return Promise.resolve(null);
    const [id, clip] = k[0] === '@' ? k.slice(1).split('/') : [this.id, k];
    const key = id + '/' + clip; k = clip;
    if (!this.buf.has(key)) {
      this.buf.set(key, this.pack(id).then((p) => {
        if (!p[k]) return null;
        const bin = atob(p[k]), u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return this.context()?.decodeAudioData(u8.buffer);
      }).catch(() => null));
    }
    return this.buf.get(key);
  }
  // parts: clip ids in order. prio calls jump the queue; anything older than 9 s is skipped.
  say(parts, prio = false) {
    if (!this.id || !parts.length) return;
    parts.forEach((k) => this.load(k));
    const item = { parts, at: performance.now() };
    if (prio) this.q.unshift(item); else this.q.push(item);
    if (this.q.length > 5) this.q.length = 5;
    this.next();
  }
  // a line with no recorded clip (a driver's AI reply), read by our server a sentence at a time:
  // chunks are promises of WAV data, and the first sentence plays while the next is still being made
  sayLive(chunks) {
    if (!this.id || !chunks.length) return;
    const live = chunks.map((p) => p.then((ab) => (ab ? this.context()?.decodeAudioData(ab) : null)).catch(() => null));
    this.q.push({ live, at: performance.now() });
    this.next();
  }
  stop() { this.q = []; }
  // a transmission playing, waiting, or just ended: the hands-free mic closes so it never hears our own radio
  speaking() { return this.busy || this.q.length > 0 || performance.now() - (this.endAt || 0) < 700; }
  // nothing playing or waiting, for the engineer's regular updates (they never push out a call)
  idle() { return !!this.id && !this.busy && !this.q.length && performance.now() - (this.endAt || 0) > 1200; }
  async next() {
    if (this.busy) return;
    const item = this.q.shift(); if (!item) return;
    if (performance.now() - item.at > 9000) return this.next();
    this.busy = true;
    if (item.live) {
      try {
        const first = await item.live[0], x = this.context();
        if (x && first) {
          this.duck?.(true);
          let t = this.click(x, x.currentTime + 0.05);
          for (const p of item.live) {
            const b = await p; if (!b) break;
            t = Math.max(t, x.currentTime + 0.02);
            const s = x.createBufferSource(); s.buffer = b; s.connect(this.chain); s.start(t); t += b.duration + 0.1;
          }
          t = this.click(x, t);
          await new Promise((res) => setTimeout(res, (t - x.currentTime) * 1000 + 250));
          this.duck?.(false);
        }
      } finally { this.busy = false; this.endAt = performance.now(); }
      return this.next();
    }
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
    } finally { this.busy = false; this.endAt = performance.now(); }
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
