// The game's theme, Electrasurge: on the home screen and menus, over the grid as a race starts (it fades
// out under the engines), and back for the podium and the results. One audio file, streamed and looped.
// It plays through Web Audio so fades work everywhere (an iPhone ignores an audio element's volume),
// and only after the player's first tap or key, as browsers require.
const SRC = 'assets/music/electrasurge.mp3';

export class Music {
  constructor() { this.vol = 0.42; this.want = 0; this.ctx = null; this.el = null; this.gain = null; this.ok = () => true; this.timer = 0; this.armed = false; }

  // ok() says whether music is allowed right now (the player's Music and Sound settings)
  allow(ok) { this.ok = ok; }

  // the level we'd like (0 = silent), reached over `sec` seconds
  set(level, sec = 1.2) {
    this.want = level;
    clearTimeout(this.timer);
    if (!this.ok() || document.hidden) level = 0;
    if (!this.ctx) { if (level > 0) this.arm(); return; }
    const t = this.ctx.currentTime, g = this.gain.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(level * this.vol, t + sec);
    if (level > 0) { if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); if (this.el.paused) this.el.play().catch(() => {}); }
    else this.timer = setTimeout(() => { if (!this.want || !this.ok() || document.hidden) this.el.pause(); }, sec * 1000 + 100);
  }
  play(sec) { clearTimeout(this.later); this.set(1, sec); }
  stop(sec = 1.2) { clearTimeout(this.later); this.set(0, sec); }
  // a moment of music (the grid), then it gives way
  fadeAfter(wait, sec) { this.set(0.75, 0.8); clearTimeout(this.later); this.later = setTimeout(() => { if (this.want) this.stop(sec); }, wait * 1000); }
  // the player's settings changed: follow them
  refresh() { this.set(this.want, 0.6); }

  // the first tap or key builds the audio graph and starts whatever is wanted
  arm() {
    if (this.armed) return; this.armed = true;
    const go = () => {
      ['pointerdown', 'keydown', 'touchend'].forEach((k) => document.removeEventListener(k, go, true));
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        this.ctx = new AC();
        this.el = new Audio(); this.el.src = SRC; this.el.loop = true; this.el.preload = 'auto'; this.el.crossOrigin = 'anonymous';
        this.gain = this.ctx.createGain(); this.gain.gain.value = 0;
        this.ctx.createMediaElementSource(this.el).connect(this.gain).connect(this.ctx.destination);
        document.addEventListener('visibilitychange', () => this.refresh());
      }
      this.refresh();
    };
    ['pointerdown', 'keydown', 'touchend'].forEach((k) => document.addEventListener(k, go, true));
  }
}
