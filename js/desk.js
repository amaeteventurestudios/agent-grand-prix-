// The race on a wide desktop screen: one dark command center. Race order and a live circuit map on
// the left, the race in the middle, and four tabs on the right (Driver, Strategy, Radio, AI Team).
// It only arranges what the race already has: every button calls the same functions the pit wall
// and the radio use (main.js passes them in), every call still goes through Race.may, and every
// number comes from the race engine. Phones never get this (html.mob); small windows keep the
// tabbed layout. Switching tabs only shows and hides panels: the race, camera and radio carry on.
import { sampleTrack } from './track.js';

const TABS = [['driver', 'Driver'], ['strat', 'Strategy'], ['radio', 'Radio'], ['team', 'AI Team']];
const STYLE = { f: ['Fighter', 'Goes for gaps and defends hard'], c: ['Calm', 'Looks after the tyres, rarely makes mistakes'], e: ['Balanced', 'Neither reckless nor timid'] };
const PACE = { save: 'Saving tyres', normal: 'Normal pace', push: 'Pushing' };
const ERS = { harvest: 'Harvesting', balanced: 'Balanced battery', deploy: 'Deploying' };
const BATTLE = { defend: 'Defending', neutral: 'Neutral', attack: 'Attacking' };
const ORDER = { free: 'Free to race', hold: 'Holding positions', swap: 'Swapping places' };
const LEVELS = [
  ['you', 'You make every call', 'Team Principal. Your agents answer to you; the engineer speaks when you ask.'],
  ['ask', 'Agents propose, you approve', 'Your agents run pace, battery and battles, and ask you before every pit stop.'],
  ['full', 'Full delegation', 'Your agents run both cars and make every call within the race rules.'],
];
const MIC = {
  idle: 'Hold to talk', listen: 'Listening…', think: 'Thinking…', sent: 'Sent', rx: 'Incoming', muted: 'Sound off · hold to talk',
  na: 'No microphone in this browser', off: 'Radio off',
};
const tick8 = (n) => Math.round(n);

export function createDesk(api) {
  const { G, S, $, $$, esc } = api;
  const Q = matchMedia('(min-width: 1000px) and (min-height: 560px)'), PORT = matchMedia('(max-width: 1199px) and (orientation: portrait)');
  const d = { on: false, built: false, tab: 'driver', full: false, big: false, log: [], seen: {}, pend: [], sig: {}, pos: {}, view: null };

  const wanted = () => !api.appOn() && Q.matches && !PORT.matches;
  function check() {
    const on = wanted();
    if (on && !d.built) build();
    if (on === d.on) return;
    d.on = on; document.documentElement.classList.toggle('dk', on);
    d.sig = {}; mapSize();
    if (on && G.race && !G.attract) tick(G.race);
  }
  Q.addEventListener?.('change', () => { check(); api.resize(); });
  PORT.addEventListener?.('change', check);

  // ---------- the layout, made once ----------
  function build() {
    d.built = true;
    const tower = $('#tower');
    tower.insertAdjacentHTML('afterbegin', '<div class="dk-only dk-head"><b>Race</b><span>Pos · Driver</span><span>Gap</span></div>');
    tower.insertAdjacentHTML('beforeend', `<button type="button" class="dk-only dk-full" aria-expanded="false">Full standings</button>
      <section class="dk-only dk-map" aria-label="Circuit map">
        <div class="dk-mhead"><b class="dk-mname"></b><button type="button" class="dk-icon dk-expand" aria-label="Bigger map" title="Bigger map"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8V3h5M17 12v5h-5M3 3l5.5 5.5M17 17l-5.5-5.5"/></svg></button></div>
        <div class="dk-mwrap"><canvas class="dk-mc" aria-hidden="true"></canvas><span class="dk-flagbar" hidden></span></div>
        <ul class="dk-legend"><li><i class="me"></i>Your cars</li><li><i class="lead"></i>Leader</li><li><i class="pit"></i>Pit lane</li><li><i class="out"></i>Stopped car</li><li><i class="sp f"></i>Flat out</li><li><i class="sp b"></i>Braking</li><li><i class="sp s"></i>Slow corner</li></ul>
        <p class="dk-mfacts"></p>
      </section>`);
    $('.dk-full', tower).addEventListener('click', () => { d.full = !d.full; tower.classList.toggle('dk-all', d.full); $('.dk-full', tower).textContent = d.full ? 'Top five and your cars' : 'Full standings'; $('.dk-full', tower).setAttribute('aria-expanded', String(d.full)); });
    $('.dk-expand', tower).addEventListener('click', () => bigMap(true));

    const stage = $('#stage');
    stage.insertAdjacentHTML('beforeend', `<div class="dk-only dk-talk"><button type="button" class="dk-mic" aria-label="Team radio: hold and speak" title="Hold and speak, or hold T"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg></button><span class="dk-to"></span><small class="dk-st"></small></div>
      <div class="dk-big" hidden><div class="dk-bigin"><div class="dk-mhead"><b class="dk-mname"></b><button type="button" class="dk-icon dk-close" aria-label="Close the big map">×</button></div><canvas class="dk-mc"></canvas></div></div>`);
    mic($('.dk-talk .dk-mic', stage));
    $('.dk-big .dk-close', stage).addEventListener('click', () => bigMap(false));
    $('.dk-big', stage).addEventListener('click', (e) => { if (e.target.classList.contains('dk-big')) bigMap(false); });

    const wall = $('#wall');
    wall.insertAdjacentHTML('afterbegin', `<nav class="dk-only dk-tabs" role="tablist" aria-label="Pit wall">${TABS.map(([k, l]) => `<button type="button" role="tab" id="dkt-${k}" aria-controls="dkp-${k}" data-dk="${k}">${l}<i class="dk-dot" hidden></i></button>`).join('')}</nav>
      <div class="dk-only dk-panes">${TABS.map(([k]) => `<section class="dk-pane" role="tabpanel" id="dkp-${k}" aria-labelledby="dkt-${k}" data-pane="${k}"></section>`).join('')}</div>`);
    $$('.dk-tabs [data-dk]', wall).forEach((b) => b.addEventListener('click', () => setTab(b.dataset.dk)));
    $('.dk-tabs', wall).addEventListener('keydown', (e) => {
      const i = TABS.findIndex(([k]) => k === d.tab), n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!n) return; e.preventDefault(); setTab(TABS[(i + n + TABS.length) % TABS.length][0]); $(`#dkt-${d.tab}`).focus();
    });
    wall.addEventListener('click', click);
    wall.addEventListener('submit', (e) => { const f = e.target.closest('.dk-type'); if (!f) return; e.preventDefault(); const i = $('input', f); if (i.value.trim()) { api.radioText(i.value.trim()); i.value = ''; } });
    wall.addEventListener('change', (e) => { const t = e.target.closest('[data-perm]'); if (t) perm(t.dataset.perm, t.checked); });
    setTab(d.tab);
  }
  function setTab(t) {
    d.tab = t;
    $$('.dk-tabs [data-dk]').forEach((b) => { const on = b.dataset.dk === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    $$('.dk-pane').forEach((p) => { p.hidden = p.dataset.pane !== t; });
    if (t === 'radio') { $('#dkt-radio .dk-dot').hidden = true; radioLog(true); }
    d.sig[t] = ''; if (G.race && !G.attract) pane(G.race);
  }

  // hold to talk, on the race and in the Radio tab: the same radio as the T key and the phone's button
  function mic(b) {
    b.addEventListener('pointerdown', (e) => { if (b.disabled) return; e.preventDefault(); b.setPointerCapture?.(e.pointerId); api.talkStart(); });
    b.addEventListener('pointerup', api.talkStop); b.addEventListener('pointercancel', api.talkStop);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); api.talkStart(); } });
    b.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') api.talkStop(); });
  }
  const chanName = (R) => (G.chan === 'eng' ? 'Engineer' : G.chan === 'all' ? 'All team' : (R.byId.get(G.mineSel || 'you-0')?.name || 'your driver'));
  function talkUI(R) {
    const st = api.talkState(), to = `Talking to ${chanName(R)}`;
    for (const w of $$('.dk-talk, .dk-ptt')) {
      const b = $('.dk-mic', w); b.disabled = st === 'na' || st === 'off';
      if (w.dataset.st !== st) { w.dataset.st = st; $('.dk-st', w).textContent = MIC[st]; }
      const t = $('.dk-to', w); if (t && t.textContent !== to) t.textContent = to;
    }
  }

  // ---------- each refresh (five times a second, from main.js tick) ----------
  function tick(R) {
    if (!d.on || !R || G.attract) return;
    head(R); watch(R); talkUI(R); pane(R);
  }
  function head(R) {
    const T = R.track, v = G.venue;
    const name = `${v.city} ${T.street ? 'street circuit' : 'circuit'}`;
    for (const n of $$('.dk-mname')) if (n.textContent !== name) n.textContent = name;
    const f = $('.dk-mfacts'), facts = `${(T.L / 1000).toFixed(2)} km · ${T.apex.length} turns · ${R.laps} laps${v.country ? ` · ${v.flag} ${v.country}` : ''}`;
    if (f.textContent !== facts) f.textContent = facts;
    const fb = $('.dk-flagbar'), sc = R.sc ? (R.sc.kind === 'VSC' ? 'Virtual safety car' : R.sc.phase === 'in' ? 'Safety car in this lap' : 'Safety car') : '';
    fb.hidden = !sc; if (sc && fb.textContent !== sc) fb.textContent = sc;
    $('.dk-map').classList.toggle('sc', !!R.sc);
    // the race order shows the top five and your two cars; a gap line where the order skips
    let prev = 0;
    for (const li of $$('#towerList li')) {
      const p = +li.children[0].textContent, show = p <= 5 || li.classList.contains('mine');
      li.classList.toggle('dk-skip', show && p > 5 && p !== prev + 1 && !d.full);
      if (show) prev = p;
    }
  }
  // what your agents did, noticed as it happens: the strategist's calls on a car you handed over
  // (it sets pace, battery and battles directly, so they're read from the car), plus every box call
  function watch(R) {
    for (const c of api.myCars()) {
      if (!c) continue;
      const was = d.seen[c.id], now = { pace: c.pace, ers: c.ersMode, battle: c.battle, box: c.pitReq || null, auto: !!c.auto, pit: !!c.pit };
      d.seen[c.id] = now;
      if (!was || c.dnf) continue;
      const lap = R.lapOf(c);
      if (c.auto && was.auto) {
        if (now.pace !== was.pace) note(lap, 'pace', `Strategist set ${c.code} to ${PACE[now.pace].toLowerCase()}`);
        if (now.ers !== was.ers) note(lap, 'ers', `Strategist switched ${c.code} to ${ERS[now.ers].toLowerCase()}`);
        if (now.battle !== was.battle) note(lap, 'battle', `Strategist told ${c.code}: ${BATTLE[now.battle].toLowerCase()}`);
      }
      if (now.box && now.box !== was.box && c.pitBy && c.pitBy !== 'principal') note(lap, 'box', `${c.pitBy === 'strategist' ? 'Strategist' : 'Engineer'} boxed ${c.code} for ${api.COMPOUNDS[now.box].name}s`);
      if (now.pit && !was.pit) note(lap, 'pit', `${c.code} in the pit lane${c.pitBy && c.pitBy !== 'principal' ? '' : ' on your call'}`);
      if (now.auto !== was.auto) note(lap, 'auto', `${c.code}: ${now.auto ? 'handed to the agents' : 'back with you'}`);
    }
    d.pend = d.pend.filter((p) => { const c = R.byId.get(p.id); return c && !c.dnf && !c.finished && !c.pit && !(p.action.box && c.pitReq) && !(p.action.ers && c.ersMode === p.action.ers) && R.lapOf(c) - p.lap < 2; });
  }
  function note(lap, kind, text) { d.log.unshift({ lap, kind, text }); if (d.log.length > 40) d.log.length = 40; d.sig.team = ''; }

  // ---------- the panes ----------
  const sel = (R) => R.byId.get(G.mineSel || 'you-0');
  function pane(R) {
    const fn = { driver: driverPane, strat: stratPane, radio: radioPane, team: teamPane }[d.tab];
    fn(R, $(`#dkp-${d.tab}`));
  }
  // innerHTML only when the words changed, so a click is never lost to a redraw
  function put(el, k, html) { if (d.sig[k] !== html) { d.sig[k] = html; el.innerHTML = html; } }

  const status = (c) => (c.dnf ? 'Out' : c.finished ? 'Finished' : c.pit ? 'In the pits' : c.pitReq ? 'Boxing this lap' : 'Racing');
  const stClass = (c) => (c.dnf ? 'out' : c.finished ? 'fin' : c.pit || c.pitReq ? 'pit' : 'ok');
  const gapTo = (R, c) => { const a = R.order[c.pos - 2]; return a && !c.dnf ? `${esc(a.code)} +${Math.max(0, c.interval).toFixed(1)} s` : c.pos === 1 && !c.dnf ? 'Leading' : '–'; };
  const gapBack = (R, c) => { const b = R.order[c.pos]; return b && !b.dnf && !c.dnf ? `${esc(b.code)} ${Math.max(0, b.interval).toFixed(1)} s` : '–'; };
  function picker(R, k) {
    return `<div class="dk-pick" role="group" aria-label="Your drivers">${api.myCars().map((c) => `<button type="button" data-mine="${c.id}" class="${c.id === (G.mineSel || 'you-0') ? 'on' : ''}${c.dnf ? ' out' : ''}" aria-pressed="${c.id === (G.mineSel || 'you-0')}">
      ${face(c, 38)}<span><b>${esc(c.code)}</b><small>${esc(c.name)}</small></span><em>${c.dnf ? 'OUT' : 'P' + c.pos}</em></button>`).join('')}</div>`;
  }
  const faces = new Map();
  function face(c, size) { const k = c.id + size + c.team.c1 + c.name; if (!faces.has(k)) faces.set(k, api.portraitSVG(c, c.team, { size, bg: false })); return faces.get(k); }

  // while your agents run a car, the way back is one big button on every tab: Take control. Any call
  // you make takes the car back too, and the engineer goes quiet again in Team Principal mode
  const takeBack = (c) => (c.auto && !c.dnf && !c.finished ? `<button type="button" class="dk-take" data-act="takeback"><b>Take control</b><small>Your agents are running ${esc(c.code)}. Tap to make the calls yourself; the engineer goes quiet.</small></button>` : '');
  function driverPane(R, el) {
    const c = sel(R); if (!c) return;
    const life = Math.round((1 - Math.min(1, c.tyre.wear)) * 100), e = Math.round(c.ers * 100), b = G.brains?.[c.id];
    const temp = c.tyre.temp ?? 0.55, tt = temp < 0.5 ? 'Cold' : temp > 0.72 ? 'Overheating' : 'In the window';
    const st = STYLE[b?.p.tone || 'e'], ahead = R.order[c.pos - 2];
    const close = ahead && !c.dnf && !c.pit && c.interval > 0 && c.interval < 1.0;
    const atk = c.dnf || c.finished || c.pit ? '–' : c.drs ? 'DRS open' : close ? (c.ers > 0.2 ? `In range of ${esc(ahead.code)}` : 'In range, battery low') : ahead ? `${Math.max(0, c.interval).toFixed(1)} s to ${esc(ahead.code)}` : 'Leading';
    const err = c.tele ? c.tele.mistakes + c.tele.spins + c.tele.wides : 0;
    const last = lastWords(c);
    put(el, 'driver', `${picker(R)}
      <div class="dk-card dk-prof">${face(c, 64)}<div><h3>${esc(c.name)}</h3><p>${esc(c.team.name)} · #${c.num ?? ''}</p>
        <div class="dk-row">${c.dnf ? '' : `<b class="dk-pos">P${c.pos}</b>`}<span class="dk-chip ${stClass(c)}"><i></i>${status(c)}</span>${c.auto ? '<span class="dk-chip ag">Agent driving</span>' : ''}</div></div></div>
      ${takeBack(c)}
      <dl class="dk-tele">
        <div><dt>Speed</dt><dd>${tick8(c.v * 3.6)} km/h</dd></div>
        <div><dt>Gap ahead</dt><dd>${gapTo(R, c)}</dd></div>
        <div><dt>Gap behind</dt><dd>${gapBack(R, c)}</dd></div>
        <div><dt>Last lap</dt><dd>${c.lastLap ? api.fmtLap(c.lastLap) : '–'}</dd></div>
        <div><dt>Best lap</dt><dd>${isFinite(c.best) ? api.fmtLap(c.best) : '–'}</dd></div>
        <div><dt>Tyres</dt><dd>${api.tyreHTML(c.tyre.c)} ${life}% <small>${Math.floor(c.tyre.laps || 0) ? `${Math.floor(c.tyre.laps)} lap${Math.floor(c.tyre.laps) > 1 ? 's' : ''} old` : 'new'}</small><span class="dk-bar ${life < 15 ? 'low blink' : life < 28 ? 'low' : life <= 50 ? 'mid' : ''}"><i style="width:${life}%"></i></span></dd></div>
        <div><dt>Tyre temperature</dt><dd>${tt}</dd></div>
        <div><dt>ERS battery</dt><dd>${e}%<span class="dk-bar ers ${e < 20 ? 'low' : ''}"><i style="width:${e}%"></i></span></dd></div>
      </dl>
      <h4 class="dk-sub">Driver status</h4>
      <div class="dk-grid3">
        <div class="dk-card dk-mini"><small>Driving style</small><b>${st[0]}</b><span>${st[1]} (Driver DNA)</span></div>
        <div class="dk-card dk-mini"><small>Attack window</small><b>${atk}</b><span>${c.drs ? 'Within a second on a straight' : 'A second behind with battery to spend'}</span></div>
        <div class="dk-card dk-mini"><small>Mistakes</small><b>${err}</b><span>${c.tele ? `${c.tele.lockups} lock-ups this race` : ''}</span></div>
      </div>
      <h4 class="dk-sub">Current orders</h4>
      <ul class="dk-orders"><li>${c.auto ? 'Set by your agents' : 'Set by you'}</li><li>${PACE[c.pace]}</li><li>${ERS[c.ersMode]}</li><li>${BATTLE[c.battle]}</li><li>${ORDER[c.letBy || R.mate(c)?.letBy ? 'swap' : c.order || 'free']}</li>${c.pitReq && !c.pit ? `<li class="hot">Box this lap · ${api.COMPOUNDS[c.pitReq].name}s</li>` : '<li class="hot" style="visibility:hidden">Box</li>'}</ul>
      ${last ? `<h4 class="dk-sub">Last on the radio</h4><p class="dk-quote">“${esc(last)}”</p>` : ''}`);
  }
  function lastWords(c) { const m = d.radio && d.radio.find((x) => x.from === 'driver' && x.code === c.code); return m ? m.text : ''; }

  function stratPane(R, el) {
    const c = sel(R); if (!c) return;
    const dis = c.dnf || c.finished, lock = dis, wet = R.wet, ideal = wet > 0.6 ? 'W' : wet > 0.17 ? 'I' : null;
    const pick = api.boxPick(c), lap = R.lapOf(c);
    const tyres = Object.keys(api.COMPOUNDS).map((k) => {
      const hint = k === c.tyre.c ? 'Fitted' : ideal ? (k === ideal ? 'Right for the track' : 'S M H'.includes(k) ? 'Too wet' : 'Not wet enough') : 'IW'.includes(k) ? 'Track is dry' : '';
      return `<button type="button" data-pick="${k}" class="${pick === k ? 'on' : ''}${k === c.tyre.c ? ' cur' : ''}" ${lock || c.pit ? 'disabled' : ''} aria-pressed="${pick === k}">${api.tyreHTML(k)}<span>${api.COMPOUNDS[k].name}</span><small>${hint}</small></button>`;
    }).join('');
    const opt = (key, set, val, label) => `<button type="button" data-set="${set}" data-val="${val}" class="${c[key] === val ? 'on' : ''}" ${lock ? 'disabled' : ''} aria-pressed="${c[key] === val}">${label}</button>`;
    const box = c.finished ? `<div class="dk-boxst">Finished P${c.pos}</div>` : c.dnf ? '<div class="dk-boxst">Out of the race</div>'
      : c.pit ? '<div class="dk-boxst live">In the pit lane · stop in progress</div>'
      : c.pitReq ? `<div class="dk-boxst req"><span><b>Box requested</b> · ${api.COMPOUNDS[c.pitReq].name}s. ${esc(c.code)} turns in at the end of this lap.</span>${c.auto ? '' : '<button type="button" data-act="cancel">Cancel</button>'}</div>`
      : `<button type="button" class="dk-boxnow" data-act="boxnow" ${lock ? 'disabled' : ''}>Box this lap <small>${api.COMPOUNDS[pick].name}s</small></button>`;
    const pair = api.myCars(), a = pair[0], b2 = pair[1];
    const boost = G.boost && G.boost.id === c.id;
    put(el, 'strat', `${picker(R)}
      <div class="dk-card dk-shead"><div><b>${esc(c.name)}</b><small>${esc(c.team.name)}</small></div>
        <dl><div><dt>Last lap</dt><dd>${c.lastLap ? api.fmtLap(c.lastLap) : '–'}</dd></div><div><dt>Best lap</dt><dd>${isFinite(c.best) ? api.fmtLap(c.best) : '–'}</dd></div><div><dt>Gap ahead</dt><dd>${gapTo(R, c)}</dd></div></dl>
        <b class="dk-pos">${c.dnf ? 'OUT' : 'P' + c.pos}</b></div>
      ${takeBack(c)}
      ${c.plan?.lap && !c.pit && !dis ? `<div class="dk-card dk-window"><small>Next pit window</small><b>Lap ${Math.max(c.plan.lap, lap)}</b><span>${c.plan.next ? api.COMPOUNDS[c.plan.next].name + 's planned' : ''}</span></div>` : ''}
      <h4 class="dk-sub">Tyres for the next stop</h4><div class="dk-tyres">${tyres}</div>
      ${box}
      <h4 class="dk-sub">Race pace</h4><div class="dk-seg">${opt('pace', 'pace', 'save', 'Save')}${opt('pace', 'pace', 'normal', 'Normal')}${opt('pace', 'pace', 'push', 'Push')}</div>
      <h4 class="dk-sub">ERS battery <span>${Math.round(c.ers * 100)}%</span></h4><div class="dk-seg">${opt('ersMode', 'ersMode', 'harvest', 'Harvest')}${opt('ersMode', 'ersMode', 'balanced', 'Balanced')}${opt('ersMode', 'ersMode', 'deploy', 'Deploy')}</div>
      <button type="button" class="dk-boost${boost ? ' on' : ''}" data-act="boost" ${dis || c.pit || (!boost && c.ers < 0.08) ? 'disabled' : ''}>${boost ? `Boosting · ${Math.ceil(G.boost.until - R.t)} s` : 'Boost for 12 s'}</button>
      <h4 class="dk-sub">Battle</h4><div class="dk-seg">${opt('battle', 'battle', 'defend', 'Defend')}${opt('battle', 'battle', 'neutral', 'Neutral')}${opt('battle', 'battle', 'attack', 'Attack')}</div>
      <h4 class="dk-sub">Team orders · both cars</h4><div class="dk-seg">
        <button type="button" data-order="free" class="${c.order === 'free' ? 'on' : ''}" ${dis ? 'disabled' : ''}>Race</button>
        <button type="button" data-order="hold" class="${c.order === 'hold' ? 'on' : ''}" ${dis ? 'disabled' : ''}>Hold</button>
        <button type="button" data-order="swap" class="${c.letBy || R.mate(c)?.letBy ? 'on' : ''}" ${a && b2 && Math.abs(a.pos - b2.pos) === 1 && !a.pit && !b2.pit && !dis ? '' : 'disabled'} title="Works when your cars run nose to tail">Swap</button></div>
      ${engCard(R, c)}
      ${timeline(R, c)}`);
  }
  // the engineer: in Team Principal mode only the fact, and a view when you ask (the engineer never
  // tells you what to do unasked); when the agents or the engineer run the stops, their reading
  function engCard(R, c) {
    if (c.dnf || c.finished) return '';
    const p = d.pend.find((x) => x.id === c.id), v = d.view && d.view.id === c.id && R.t - d.view.t < 45 ? d.view : null;
    const engineerReads = c.auto || c.assist;
    let body, act = '';
    if (v) { body = v.text.replace(/ Say "do it".*$/, ''); if (v.call) act = `<button type="button" class="dk-go" data-view="go">${callLabel(v.call)}</button>`; }
    else if (engineerReads) { const o = api.stratRead(c); body = o.text; }
    else if (p) body = p.fact;
    else body = 'Quiet on the radio: in Team Principal mode your engineer speaks when you ask.';
    return `<div class="dk-card dk-eng">${api.ENG_FACE}<div><small>${engineerReads ? 'Engineer reading' : v ? 'Engineer recommendation' : p ? 'Race info' : 'Your engineer'}</small><p>${esc(body)}</p>
      <div class="dk-acts">${act}${!engineerReads && !v ? '<button type="button" class="dk-ghost" data-act="ask">Ask the engineer</button>' : ''}</div></div></div>`;
  }
  const callLabel = (k) => (k.k === 'boxnow' ? `Box for ${api.COMPOUNDS[k.tyre].name}s` : k.k === 'boost' ? 'Boost' : k.k === 'harvest' ? 'Harvest' : 'Do it');
  // lap 1 to the flag: the stints so far from the car's own lap record, the planned stop, and now
  function timeline(R, c) {
    const L = R.laps, lap = R.lapOf(c), x = (n) => ((n - 1) / Math.max(1, L - 1) * 100).toFixed(2);
    const st = []; let cur = null;
    for (const t of c.trace || []) { if (!cur || cur.c !== t.tyre) { cur = { c: t.tyre, from: t.lap }; st.push(cur); } }
    if (!st.length) st.push({ c: c.tyre.c, from: 1 });
    if (st[st.length - 1].c !== c.tyre.c) st.push({ c: c.tyre.c, from: lap });
    const seg = st.map((s, i) => { const to = i + 1 < st.length ? st[i + 1].from : lap; return `<i style="left:${x(s.from)}%;width:${Math.max(0.8, x(to) - x(s.from))}%;--c:${api.COMPOUNDS[s.c].color}" title="${api.COMPOUNDS[s.c].name}s from lap ${s.from}"></i>`; }).join('');
    const plan = c.plan?.lap && c.plan.lap >= lap && !c.dnf && !c.finished ? c.plan.lap : null;
    const after = plan && c.plan.next ? `<i class="plan" style="left:${x(plan)}%;width:${100 - x(plan)}%;--c:${api.COMPOUNDS[c.plan.next].color}"></i>` : '';
    const ticks = [1, ...[0.25, 0.5, 0.75].map((f) => Math.round(1 + f * (L - 1))), L].filter((v, i, a) => a.indexOf(v) === i);
    return `<h4 class="dk-sub">Race strategy</h4><div class="dk-time" aria-label="Lap ${lap} of ${L}${plan ? `, stop planned on lap ${plan}` : ''}">
      <div class="dk-track">${seg}${after}<b class="now" style="left:${x(lap)}%"></b>${plan ? `<b class="pin" style="left:${x(plan)}%"><span>${api.tyreHTML(c.plan.next || api.boxPick(c))} Lap ${plan}</span></b>` : ''}</div>
      <div class="dk-ticks">${ticks.map((t) => `<span style="left:${x(t)}%">${t}</span>`).join('')}</div>
      <p class="dk-tl">${st.map((s) => api.COMPOUNDS[s.c].name).join(' → ')}${plan ? ` → ${api.COMPOUNDS[c.plan.next || api.boxPick(c)].name} (lap ${plan})` : ''} · ${Math.max(0, L - lap)} laps to go</p></div>`;
  }

  // ---------- radio ----------
  d.radio = [];
  const CH = [['car', 'you-0'], ['car', 'you-1'], ['eng', null], ['all', null]];
  function radioPane(R, el) {
    const cars = api.myCars();
    const sig = `${G.chan}|${G.mineSel}|${cars.map((c) => c.name + c.dnf).join()}|${S.settings.handsfree}|${S.settings.replies}`;
    if (d.sig.radio !== sig) {
      d.sig.radio = sig; d.logN = -1;
      const quick = [['Tyre status?', 'q:tyres'], ['Gap ahead?', 'q:gaps'], ['Push now', 'c:push'], ['Hold position', 'o:hold'], ['Box this lap', 'c:box'], ['Ask the engineer', 'q:eng']];
      el.innerHTML = `<div class="dk-rhead"><b>Team radio</b><span class="dk-live"><i></i>Connected</span></div>
        <div class="dk-chans" role="radiogroup" aria-label="Who hears you">${CH.map(([k, id], i) => {
          const on = k === 'car' ? (G.chan || 'car') === 'car' && (G.mineSel || 'you-0') === id : G.chan === k;
          const lbl = k === 'car' ? esc(cars[i].name) : k === 'eng' ? 'Engineer' : 'All team';
          return `<button type="button" role="radio" aria-checked="${on}" class="${on ? 'on' : ''}" data-chan="${k}"${id ? ` data-id="${id}"` : ''}>${lbl}</button>`;
        }).join('')}</div>
        <ol class="dk-log" aria-live="polite"></ol>
        <div class="dk-ptt"><button type="button" class="dk-mic big" aria-label="Hold and speak to your team"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg></button>
          <div><small class="dk-st"></small><span class="dk-to"></span><p>Hold the button or the T key, speak, let go.</p></div></div>
        <div class="dk-ropts"><label><input type="checkbox" data-perm="handsfree" ${S.settings.handsfree ? 'checked' : ''}> Hands-free: say “Radio” first</label><label><input type="checkbox" data-perm="replies" ${S.settings.replies !== false ? 'checked' : ''}> Drivers answer out loud</label></div>
        <form class="dk-type"><input type="text" placeholder="Or type a call: “Nova, push”" aria-label="Type a radio call" maxlength="140" autocomplete="off"><button type="submit">Send</button></form>
        <h4 class="dk-sub">Quick calls</h4><div class="dk-quick">${quick.map(([l, k]) => `<button type="button" data-quick="${k}">${l}</button>`).join('')}</div>`;
      mic($('.dk-mic', el)); talkUI(R);
    }
    radioLog();
  }
  // the radio log, newest first: each line keeps who said it, the lap, and its buttons
  function radioLog(force) {
    const ol = $('#dkp-radio .dk-log'); if (!ol || (!force && d.logN === d.radio.length)) return;
    d.logN = d.radio.length;
    ol.innerHTML = d.radio.slice(0, 40).map((m, i) => {
      const who = m.from === 'engineer' ? 'Engineer' : m.from === 'you' ? 'You · Team Principal' : m.from === 'driver' ? (m.name || m.code || 'Driver') : m.from === 'info' ? 'Pit wall' : 'Race control';
      const pic = m.from === 'driver' && m.car ? face(m.car, 34) : m.from === 'engineer' ? api.ENG_FACE : m.from === 'you' ? '<span class="dk-me">TP</span>' : '<span class="dk-rc">RC</span>';
      return `<li class="${m.from}">${pic}<div><p class="dk-who"><b>${esc(who)}</b><span>Lap ${m.lap}</span></p><p>${esc(m.text)}</p>${m.action && !m.done ? `<div class="dk-acts"><button type="button" class="dk-go" data-rad="${i}">${m.action.box ? `Box for ${api.COMPOUNDS[m.action.box].name}s` : m.action.ers ? 'Harvest' : 'Do it'}</button><button type="button" class="dk-ghost" data-radno="${i}">Not now</button></div>` : ''}</div></li>`;
    }).join('') || '<li class="dk-empty">Nothing on the radio yet.</li>';
  }
  function radio(m) {
    const R = G.race; if (!R) return;
    const car = m.code ? api.myCars().find((c) => c && c.code === m.code) : null;
    d.radio.unshift({ ...m, lap: R.leaderLap(), car, name: car?.name });
    if (d.radio.length > 60) d.radio.length = 60;
    if (d.on && d.tab === 'radio') radioLog(); else if (d.on && m.from !== 'you') $('#dkt-radio .dk-dot').hidden = false;
  }
  // engine advice for your cars: on the radio, and waiting in AI Team until it's settled
  function advice(e, car, fact) {
    if (!e.action) return;
    d.pend = d.pend.filter((p) => p.id !== car.id || JSON.stringify(p.action) !== JSON.stringify(e.action));
    d.pend.unshift({ id: car.id, code: car.code, text: e.text, fact, action: e.action, lap: e.lap ?? G.race.lapOf(car) });
    note(e.lap ?? G.race.lapOf(car), 'advice', `Engineer: ${e.text}`);
    d.sig.team = d.sig.strat = '';
  }

  // ---------- AI Team ----------
  const level = (cars) => { const run = cars.filter((c) => c && !c.dnf && !c.finished); if (!run.length) return 'you'; return run.every((c) => c.auto) ? (run.some((c) => c.ask) ? 'ask' : 'full') : 'you'; };
  function teamPane(R, el) {
    const cars = api.myCars(), lv = level(cars), anyAssist = cars.some((c) => c && c.assist);
    const doing = (c) => (c.dnf ? 'Out of the race' : c.finished ? `Finished P${c.pos}` : c.pit ? 'Pit stop' : c.auto ? `Racing · ${PACE[c.pace].toLowerCase()}, ${BATTLE[c.battle].toLowerCase()}` : `Racing on your orders · P${c.pos}`);
    const eng = lv === 'full' ? 'Running strategy for both cars' : lv === 'ask' ? 'Proposing pit stops for your approval' : anyAssist ? 'Calling the pit stops for you' : 'Watching the race; speaks when you ask';
    const agent = (pic, name, role, st, cls) => `<div class="dk-agent">${pic}<div><b>${esc(name)}</b><small>${role}</small></div><span class="dk-chip ${cls}"><i></i>${st}</span></div>`;
    const sw = (k, on, label, note, dis) => `<label class="dk-perm${dis ? ' dis' : ''}"><span><b>${label}</b><small>${note}</small></span><input type="checkbox" role="switch" data-perm="${k}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}></label>`;
    const live = cars.some((c) => c && !c.dnf && !c.finished) && G.kind !== 'academy' && !R.done;
    const pend = d.pend.map((p, i) => {
      const c = R.byId.get(p.id);
      return `<div class="dk-pend"><div class="dk-ph"><b>${esc(p.action.box ? `Pit ${c.code} for ${api.COMPOUNDS[p.action.box].name}s` : p.action.ers ? `${c.code}: switch to harvest` : `${c.code}: ${esc(p.text)}`)}</b><small>Lap ${p.lap}</small></div>
        <p>${esc(p.fact || p.text)} · Tyres ${Math.round((1 - c.tyre.wear) * 100)}%, P${c.pos}, ${R.lapsLeft(c)} laps left</p>
        <div class="dk-acts"><button type="button" class="dk-go" data-ok="${i}">Approve</button><button type="button" class="dk-ghost" data-no="${i}">Reject</button><button type="button" class="dk-ghost" data-why="${i}">Review</button></div></div>`;
    }).join('');
    put(el, 'team', `<h4 class="dk-sub first">Team agents</h4>
      <div class="dk-agents">${cars.map((c) => agent(face(c, 44), c.name, `Driver · ${c.code}`, c.dnf ? 'Out' : c.finished ? 'Finished' : c.pit ? 'In the pits' : c.auto ? 'Racing for you' : 'Racing', stClass(c))).join('')}
        ${agent(api.ENG_FACE, api.engName(), 'Race engineer', lv === 'you' && !anyAssist ? 'Advisory' : 'Working', 'ok')}</div>
      <div class="dk-doing">${cars.map((c) => `<p><b>${esc(c.code)}</b> ${esc(doing(c))}</p>`).join('')}<p><b>ENG</b> ${eng}</p></div>
      <h4 class="dk-sub">Who makes the calls</h4>
      <div class="dk-levels" role="radiogroup" aria-label="Who makes the calls">${LEVELS.map(([k, l, n]) => `<button type="button" role="radio" aria-checked="${lv === k}" class="${lv === k ? 'on' : ''}" data-level="${k}" ${live ? '' : 'disabled'}><b>${l}</b><small>${n}</small></button>`).join('')}</div>
      <h4 class="dk-sub">Permissions</h4>
      ${sw('assist', anyAssist, 'Engineer calls the pit stops', 'While you make the calls, your engineer boxes both cars at the right time.', lv !== 'you' || !live)}
      ${sw('replies', S.settings.replies !== false, 'Drivers answer on the radio', 'Your drivers reply in their own voices and speak up when something needs you.')}
      ${sw('engvoice', S.settings.voice !== false, 'Engineer speaks', 'Your engineer reads race news and calls out loud.')}
      <p class="dk-note">You always keep the last word: a call from you goes straight to the car, whatever the agents are doing.</p>
      <h4 class="dk-sub">Waiting for you ${d.pend.length ? `<span class="dk-count">${d.pend.length}</span>` : ''}</h4>
      ${pend || '<p class="dk-empty">Nothing waiting. Proposals from your engineer and agents show here.</p>'}
      <h4 class="dk-sub">Recent AI actions</h4>
      <ol class="dk-acts-log">${d.log.slice(0, 10).map((x) => `<li><span>Lap ${x.lap}</span>${esc(x.text)}</li>`).join('') || '<li class="dk-empty">No agent actions yet this race.</li>'}</ol>`);
  }
  function setLevel(k) {
    const R = G.race; if (!R) return;
    for (const c of api.myCars()) {
      if (!c || c.dnf || c.finished) continue;
      if (k === 'you') { if (c.ask) R.command(c.id, { ask: false }); }
      else R.command(c.id, { ask: k === 'ask' });
    }
    api.handTeam(k !== 'you');
    note(R.leaderLap(), 'level', k === 'you' ? 'You took back every call' : k === 'ask' ? 'Agents run the cars and ask before pit stops' : 'Full delegation to your agents');
  }
  function perm(k, on) {
    if (k === 'assist') { S.settings.assist = on; for (const id of ['you-0', 'you-1']) G.race?.command(id, { assist: on }); api.toast(on ? 'Your engineer calls the pit stops.' : 'You call the pit stops.'); }
    if (k === 'replies') S.settings.replies = on;
    if (k === 'engvoice') S.settings.voice = on ? undefined : false;
    if (k === 'handsfree') S.settings.handsfree = on;
    api.save(); d.sig = {}; if (G.race) { api.renderControls(true); pane(G.race); }
  }

  // ---------- clicks in the right column ----------
  function click(e) {
    const t = e.target.closest('button'); if (!t || t.disabled) return;
    const R = G.race; if (!R) return;
    const id = G.mineSel || 'you-0', c = R.byId.get(id);
    if (t.dataset.mine) { G.mineSel = t.dataset.mine; if ((G.chan || 'car') !== 'car') G.chan = 'car'; api.select(t.dataset.mine); }
    else if (t.dataset.pick) (G.boxPicks ||= {})[id] = t.dataset.pick;
    else if (t.dataset.act === 'takeback') api.handTeam(false);
    else if (t.dataset.act === 'boxnow') api.cmd({ box: api.boxPick(c) });
    else if (t.dataset.act === 'cancel') api.cmd({ box: null });
    else if (t.dataset.act === 'boost') api.boostCar(c);
    else if (t.dataset.act === 'ask') { const o = api.askEngineer(c); if (o) d.view = { id, text: o.text, call: o.call, t: R.t }; }
    else if (t.dataset.view === 'go' && d.view) { api.radioCalls([d.view.call]); d.view = null; }
    else if (t.dataset.set) api.cmd({ [{ pace: 'pace', ersMode: 'ers', battle: 'battle' }[t.dataset.set]]: t.dataset.val });
    else if (t.dataset.order) api.teamOrder(t.dataset.order);
    else if (t.dataset.chan) { G.chan = t.dataset.chan; if (t.dataset.id) { G.mineSel = t.dataset.id; api.select(t.dataset.id); } }
    else if (t.dataset.quick) quick(t.dataset.quick, c);
    else if (t.dataset.rad || t.dataset.radno) { const m = d.radio[+(t.dataset.rad || t.dataset.radno)]; if (m) { if (t.dataset.rad) api.cmd(m.action, m.car?.id || id); m.done = true; radioLog(true); } }
    else if (t.dataset.level) setLevel(t.dataset.level);
    else if (t.dataset.ok || t.dataset.no || t.dataset.why) {
      const p = d.pend[+(t.dataset.ok || t.dataset.no || t.dataset.why)]; if (!p) return;
      const pc = R.byId.get(p.id);
      if (t.dataset.why) { G.mineSel = p.id; api.select(p.id); setTab('strat'); return; }
      d.pend = d.pend.filter((x) => x !== p);
      if (t.dataset.ok) { api.approve(p.id, p.action); note(R.lapOf(pc), 'ok', `You approved: ${p.action.box ? `${pc.code} boxes for ${api.COMPOUNDS[p.action.box].name}s` : p.text}`); }
      else note(R.lapOf(pc), 'no', `You turned down: ${p.action.box ? `pitting ${pc.code}` : p.text}`);
    } else return;
    d.sig[d.tab] = ''; api.tick();
  }
  // quick calls go through the radio, as if you'd said them on the open channel
  function quick(k, c) {
    const nm = c.name.split(' ')[0];
    if (k === 'q:eng') { const o = api.askEngineer(c); if (o) d.view = { id: c.id, text: o.text, call: o.call, t: G.race.t }; setTab('strat'); return; }
    const text = { 'q:tyres': `${nm}, how are the tyres?`, 'q:gaps': `${nm}, what's the gap ahead?`, 'c:push': `${nm}, push now`, 'o:hold': 'Both cars, hold positions', 'c:box': `${nm}, box this lap` }[k];
    api.radioText(text, true);
  }

  // ---------- the circuit map ----------
  const map = { T: null, key: '', bg: null, fit: null, s: {} };
  function mapSize() { map.key = ''; }
  function bigMap(on) { d.big = on; $('.dk-big').hidden = !on; map.key = ''; if (on) $('.dk-big .dk-close').focus(); }
  function fit(T, w, h, pad) {
    const P = T.pit, pts = [];
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < T.N; i += 4) { x0 = Math.min(x0, T.x[i]); x1 = Math.max(x1, T.x[i]); z0 = Math.min(z0, T.z[i]); z1 = Math.max(z1, T.z[i]); }
    x0 -= Math.abs(P.lat); x1 += Math.abs(P.lat); z0 -= Math.abs(P.lat); z1 += Math.abs(P.lat);
    // the circuit's long side runs up the map, the same way in the small map and the big one
    const rot = x1 - x0 > z1 - z0;
    const bw = rot ? z1 - z0 : x1 - x0, bh = rot ? x1 - x0 : z1 - z0, k = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    return (x, z) => (rot ? [w / 2 + (z - cz) * k, h / 2 - (x - cx) * k] : [w / 2 + (x - cx) * k, h / 2 + (z - cz) * k]);
  }
  const tmp = {};
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  const lum = (hex) => { const n = parseInt(hex.slice(1, 7), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  function lane(T, P, s0, s1, lat) {
    const out = [];
    for (let s = s0; s <= s1; s += 6) { sampleTrack(T, s, lat * Math.min(1, Math.min(s - s0, s1 - s) / 40 + 0.15), tmp); out.push([tmp.x, tmp.z]); }
    return out;
  }
  function background(cv, T, w, h, r) {
    const P = T.pit, f = fit(T, w, h, w > 400 ? 34 : 24), bg = document.createElement('canvas');
    bg.width = w * r; bg.height = h * r;
    const g = bg.getContext('2d'); g.scale(r, r); g.lineJoin = g.lineCap = 'round';
    const path = (pts, close) => { g.beginPath(); pts.forEach(([x, z], i) => { const [a, b] = f(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); if (close) g.closePath(); };
    const loop = []; for (let i = 0; i < T.N; i += 3) loop.push([T.x[i], T.z[i]]);
    const pl = lane(T, P, P.inS, P.outS, P.lat);
    const sw = w > 400 ? 1.6 : 1;
    path(pl); g.strokeStyle = 'rgba(86, 214, 255, .75)'; g.lineWidth = 3 * sw; g.setLineDash([5, 4]); g.stroke(); g.setLineDash([]);
    // the pit building along the pit lane, on the far side from the track
    { const s0 = P.box[0] - 6, s1 = P.box[P.box.length - 1] + 10, out = P.lat + P.side * 9; g.beginPath();
      for (let s = s0; s <= s1; s += 4) { sampleTrack(T, s, out, tmp); const [a, b] = f(tmp.x, tmp.z); s === s0 ? g.moveTo(a, b) : g.lineTo(a, b); }
      g.strokeStyle = 'rgba(160, 178, 214, .5)'; g.lineWidth = 5 * sw; g.lineCap = 'butt'; g.stroke(); g.lineCap = 'round'; }
    path(loop, true); g.strokeStyle = '#0a1226'; g.lineWidth = 11 * sw; g.stroke();
    g.strokeStyle = '#3a4a6e'; g.lineWidth = 7 * sw; g.stroke();
    // the racing line coloured by the speed the track allows: green flat out, amber braking, red the slow corners
    const vcol = (v) => { const q = v / T.vmax; return q > 0.74 ? '#3ddc5a' : q > 0.46 ? '#ffb020' : '#ff4d5e'; };
    g.lineWidth = (w > 400 ? 2.6 : 1.8);
    for (let i = 0; i < T.N; i += 6) {
      const j = Math.min(i + 7, T.N), [a, b] = f(T.x[i], T.z[i]), [c2, d2] = f(T.x[j % T.N], T.z[j % T.N]);
      g.strokeStyle = vcol(T.v[i]); g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d2); g.stroke();
    }
    // red and white kerbs on the outside of every slow corner
    for (const ai of T.apex) {
      const side = Math.sign(T.k[ai]) > 0 ? -1 : 1;
      for (let s = -14, n = 0; s <= 14; s += 4, n++) {
        sampleTrack(T, ai + s, side * (T.half + 1), tmp); const [a, b] = f(tmp.x, tmp.z);
        g.fillStyle = n % 2 ? '#ffffff' : '#e10600'; g.fillRect(a - 1.2 * sw, b - 1.2 * sw, 2.4 * sw, 2.4 * sw);
      }
    }
    // start / finish: a chequered bar across the track at the line
    sampleTrack(T, 0, 0, tmp);
    const [sx, sz] = f(tmp.x, tmp.z), [ex, ez] = f(tmp.x + tmp.tx * 10, tmp.z + tmp.tz * 10), a = Math.atan2(ez - sz, ex - sx);
    g.save(); g.translate(sx, sz); g.rotate(a);
    for (let i = 0; i < 2; i++) for (let j = -3; j < 3; j++) { g.fillStyle = (i + j) % 2 ? '#fff' : '#0a1226'; g.fillRect(-3 + i * 3, j * 2.4 * sw, 3, 2.4 * sw); }
    g.restore();
    g.font = `700 ${w > 400 ? 13 : 10}px "Barlow Semi Condensed", system-ui, sans-serif`;
    const [mx, my] = f(T.centroid[0], T.centroid[1]);
    // a label sits off the track, on the side away from the middle of the circuit, and inside the box
    const tag = (txt, s, col, along = 0) => {
      sampleTrack(T, s, P.lat, tmp); const [px, py] = f(tmp.x, tmp.z);
      let dx = px - mx, dy = py - my; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const tw = g.measureText(txt).width, off = w > 400 ? 18 : 12;
      let x = px + dx * off + (dx > 0.3 ? 0 : dx < -0.3 ? -tw : -tw / 2), y = py + dy * off + 4 + along;
      // no room outside the circuit: the label goes on the inside of the track instead
      if (x < 3 || x + tw > w - 3) x = px - dx * off + (dx > 0.3 ? -tw : dx < -0.3 ? 0 : -tw / 2);
      x = Math.max(3, Math.min(w - tw - 3, x)); y = Math.max(11, Math.min(h - 4, y));
      g.fillStyle = 'rgba(8, 17, 42, .82)'; g.fillRect(x - 3, y - 10, tw + 6, 13); g.fillStyle = col; g.fillText(txt, x, y);
      g.beginPath(); g.arc(px, py, 2.5 * sw, 0, 7); g.fill();
    };
    g.textAlign = 'left';
    // turn numbers, just inside each corner
    g.font = `700 ${w > 400 ? 11 : 9}px "Barlow Semi Condensed", system-ui, sans-serif`; g.textAlign = 'center';
    const put = [];
    T.apex.forEach((ai, n) => {
      sampleTrack(T, ai, 0, tmp); const [px, py] = f(tmp.x, tmp.z);
      let dx = mx - px, dy = my - py; const l = Math.hypot(dx, dy) || 1, off = w > 400 ? 15 : 11;
      const x = clampN(px + dx / l * off, 8, w - 8), y = clampN(py + dy / l * off, 8, h - 8), rr = w > 400 ? 8 : 6.5;
      // two corners close together share one badge: the second is left out rather than drawn on top
      if (put.some(([a, b]) => Math.hypot(a - x, b - y) < rr * 2.1)) return; put.push([x, y]);
      g.fillStyle = 'rgba(8, 17, 42, .85)'; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
      g.strokeStyle = 'rgba(238, 243, 255, .35)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = 'rgba(238, 243, 255, .85)'; g.fillText(String(n + 1), x, y + (w > 400 ? 4 : 3));
    });
    g.textAlign = 'left'; g.font = `700 ${w > 400 ? 13 : 10}px "Barlow Semi Condensed", system-ui, sans-serif`;
    tag('PIT IN', P.inS, '#56d6ff', -12); tag('PIT OUT', P.outS, '#56d6ff', 12); tag('START / FINISH', 0, '#eef3ff');
    return { bg, f };
  }
  function draw(cv, R, r) {
    const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    const T = R.track, key = `${T.seed}|${w}|${h}|${r}`;
    if (cv._key !== key) { cv._key = key; cv.width = w * r; cv.height = h * r; Object.assign(cv, background(cv, T, w, h, r)); }
    const g = cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.drawImage(cv.bg, 0, 0); g.setTransform(r, 0, 0, r, 0, 0);
    const big = w > 400, my = api.mine(), lead = R.order.find((c) => !c.dnf), f = cv.f;
    const at = (c) => { sampleTrack(T, c.dist, c.lat, tmp); return f(tmp.x, tmp.z); };
    // the safety car, where the engine has it
    if (R.sc && R.sc.kind === 'SC' && R.sc.dist != null) { const [x, y] = at({ dist: R.sc.dist, lat: 0 }); g.fillStyle = '#ffd400'; g.fillRect(x - 7, y - 5, 14, 10); g.fillStyle = '#0a1226'; g.font = '700 8px system-ui'; g.textAlign = 'center'; g.fillText('SC', x, y + 3); }
    for (const c of R.cars) {
      if (my.includes(c.id) || c === lead || c.finished && !c.dnf && R.done) continue;
      if (c.dnf) { if (c.cleared) continue; const [x, y] = at(c); g.strokeStyle = '#ff4d5e'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x - 4, y - 4); g.lineTo(x + 4, y + 4); g.moveTo(x + 4, y - 4); g.lineTo(x - 4, y + 4); g.stroke(); continue; }
      // every car a team-coloured dot with its position in it
      const [x, y] = at(c), rr = big ? 7 : 5.5; g.fillStyle = c.team.c1; g.strokeStyle = 'rgba(10,18,38,.95)'; g.lineWidth = 1.4; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); g.stroke();
      g.fillStyle = lum(c.team.c1) > 0.6 ? '#0a1226' : '#ffffff'; g.font = `700 ${big ? 9 : 7.5}px system-ui`; g.textAlign = 'center'; g.fillText(String(c.pos), x, y + (big ? 3.2 : 2.7));
      if (big) { g.fillStyle = 'rgba(238,243,255,.7)'; g.font = '600 10px system-ui'; g.textAlign = 'left'; g.fillText(c.code, x + rr + 2, y - 5); }
    }
    // a car's tag sits up and to the right of its dot, or to the left near the right edge
    const label = (c, x, y, txt, col) => {
      g.font = `700 ${big ? 12 : 10}px "Barlow Semi Condensed", system-ui, sans-serif`;
      const tw = g.measureText(txt).width + 8, lx = x + 7 + tw > w - 2 ? x - 7 - tw : x + 7, ly = Math.max(2, y - 17);
      g.fillStyle = col; g.beginPath(); g.roundRect(lx, ly, tw, big ? 16 : 14, 4); g.fill(); g.fillStyle = '#0a1226'; g.textAlign = 'left'; g.fillText(txt, lx + 4, ly + (big ? 12 : 11));
    };
    if (lead && !my.includes(lead.id)) { const [x, y] = at(lead); g.fillStyle = lead.team.c1; g.strokeStyle = '#ffd400'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, big ? 6.5 : 5, 0, 7); g.fill(); g.stroke(); label(lead, x, y, `P1 ${lead.code}`, '#ffd400'); }
    for (const id of my) {
      const c = R.byId.get(id); if (!c || (c.dnf && c.cleared)) continue;
      const [x, y] = at(c);
      if (c.dnf) { g.strokeStyle = '#ff4d5e'; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 5, y - 5); g.lineTo(x + 5, y + 5); g.moveTo(x + 5, y - 5); g.lineTo(x - 5, y + 5); g.stroke(); label(c, x, y, `${c.code} OUT`, '#ff8a95'); continue; }
      g.fillStyle = c.team.c1; g.strokeStyle = '#c6ff3d'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, big ? 7.5 : 6, 0, 7); g.fill(); g.stroke();
      if (id === (G.mineSel || 'you-0')) { g.strokeStyle = 'rgba(198,255,61,.35)'; g.lineWidth = 5; g.beginPath(); g.arc(x, y, big ? 12 : 10, 0, 7); g.stroke(); }
      label(c, x, y, `P${c.pos} ${c.code}${c.pit ? ' · PIT' : ''}`, '#c6ff3d');
    }
  }
  let mt = 0;
  function frame(R, dt) {
    if (!d.on || !R || G.attract) return;
    mt += dt; if (mt < 1 / 30) return; mt = 0;
    const r = Math.min(2, devicePixelRatio || 1);
    draw($('.dk-map .dk-mc'), R, r);
    if (d.big) draw($('.dk-big .dk-mc'), R, r);
  }
  function start(R) {
    d.log = []; d.pend = []; d.seen = {}; d.view = null; d.radio = []; d.logN = -1; d.sig = {};
    if (G.chan !== 'eng' && G.chan !== 'all') G.chan = 'car';
    for (const cv of $$('.dk-mc')) cv._key = '';
    if (d.on) radioLog(true);
  }
  function keydown(e) { if (d.on && d.big && e.key === 'Escape') { bigMap(false); return true; } return false; }

  check();
  return { get on() { return d.on; }, check, tick, frame, radio, advice, start, keydown, setTab, get tab() { return d.tab; }, get pending() { return d.pend; }, get log() { return d.log; } };
}
