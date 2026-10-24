// The Driver DNA Studio: tune how each of your two drivers drives. Quick mode moves 8 dials,
// Advanced shows all 17 settings by group. Every change is a draft until you save it, and a
// saved change is a new version you can restore. A race in progress keeps the DNA it started
// with; saved changes apply from the next race.
import { PARAMS, KEYS, GROUPS, QUICK, QUICK_LOW, LOW, PRESETS, SLOTS, makeProfile, blend, quickOf, setQuick,
  validate, exportProfile, paramsHash } from './dna.js';
import { dnaState, setProfile, restore, saveCustomPreset } from './dnastore.js';
import { summarize, verdict, trial, pickSeeds } from './proving.js';
import { STRATEGISTS, decide } from './strategist.js';
import { VENUES } from './data.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SHORT = { braking: 'Braking', cornering: 'Corners', overtaking: 'Overtaking', defending: 'Defending', tyres: 'Tyres', throttle: 'Throttle', wet: 'Wet', consistency: 'Steady' };
const label = (k) => PARAMS.find((p) => p.key === k).label;
const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 90 ? 'just now' : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
const SRC = { you: 'You', preset: 'Preset', blend: 'Blend', import: 'Import', strategist: 'Strategist', restore: 'Restore' };

// the 8 dials as a shape: Balanced is the dashed ring at 50
export function shapeSVG(params, ref, size = 220) {
  const c = size / 2, R = c - 34, n = QUICK.length;
  const pt = (i, v) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2, r = (v / 100) * R; return [c + Math.cos(a) * r, c + Math.sin(a) * r]; };
  const poly = (vals) => vals.map((v, i) => pt(i, v).map((x) => x.toFixed(1)).join(',')).join(' ');
  const cur = QUICK.map((q) => quickOf(params, q)), base = QUICK.map(() => 50);
  const rings = [25, 50, 75, 100].map((v) => `<polygon points="${poly(QUICK.map(() => v))}" class="${v === 50 ? 'bal' : 'ring'}"/>`).join('');
  const axes = QUICK.map((q, i) => { const [x, y] = pt(i, 100), [lx, ly] = pt(i, 122); return `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/><text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${SHORT[q.key]}</text>`; }).join('');
  const was = ref ? `<polygon points="${poly(QUICK.map((q) => quickOf(ref, q)))}" class="was"/>` : '';
  return `<svg class="shape" viewBox="-18 -4 ${size + 36} ${size + 8}" role="img" aria-label="Driver DNA shape: ${QUICK.map((q, i) => `${q.label} ${cur[i]}`).join(', ')}">
    <g class="grid">${rings}${axes}</g>${was}<polygon points="${poly(cur)}" class="now"/>${cur.map((v, i) => { const [x, y] = pt(i, v); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"/>`; }).join('')}
    <desc>${base.length} axes</desc></svg>`;
}

// plain-words trade-offs: every setting away from 50 gains something and pays for it
export function tradeoffs(params) {
  const out = [];
  for (const p of PARAMS) {
    const d = params[p.key] - 50; if (Math.abs(d) < 12) continue;
    const [g, c] = d > 0 ? [p.gain, p.cost] : LOW[p.key];
    out.push({ key: p.key, size: Math.abs(d), gain: g, cost: c, label: p.label, v: params[p.key] });
  }
  return out.sort((a, b) => b.size - a.size);
}

export function openStudio(ctx, opts = {}) {
  const { S, show, save, team } = ctx;
  // the race's toasts sit under this sheet, so the Studio has its own
  const toast = (text) => {
    let el = document.querySelector('.dna-toast');
    if (!el) { el = document.createElement('div'); el.className = 'dna-toast'; el.setAttribute('aria-live', 'polite'); document.body.append(el); }
    el.textContent = text; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 3200);
  };
  const d = dnaState(S);
  const st = { slot: opts.slot || 'car1', mode: S.settings.dnaMode || 'quick', view: opts.view || 'tune', open: new Set(['corners']), leaving: false,
    draft: Object.fromEntries(SLOTS.map((s) => [s, { params: { ...d.slots[s].active.params }, name: d.slots[s].active.name, origin: d.slots[s].active.origin }])) };
  const act = () => d.slots[st.slot].active;
  const dr = () => st.draft[st.slot];
  const dirty = (slot = st.slot) => paramsHash(st.draft[slot].params) !== d.slots[slot].active.hash || st.draft[slot].name !== d.slots[slot].active.name;
  const driver = (slot) => team().drivers[SLOTS.indexOf(slot)];
  const back = opts.back || (() => {});
  if (opts.draft) st.draft[st.slot] = { ...opts.draft, params: { ...opts.draft.params } };
  st.pg = { venueId: opts.venue?.id || 'abuja', n: 12, weather: 'any', against: 'saved', run: null, pairs: [], seeds: null, res: null, slot: null };
  d.trials ||= [];
  let sh;

  function render() {
    const a = act(), x = dr();
    sh = show(`
      <div class="dna-head"><div><div class="sub">Driver DNA${opts.locked ? ' · race in progress' : ''}</div><h2>How your drivers drive</h2></div>
        <button class="btn ghost" data-a="close" type="button">${st.leaving ? 'Discard and leave' : 'Done'}</button></div>
      ${opts.locked ? `<p class="dna-lock">🔒 This race is using the DNA your drivers started with (version ${a.rev}). Anything you save now applies from the next race.</p>` : ''}
      <div class="dna-cars" role="tablist">${SLOTS.map((s, i) => `<button type="button" role="tab" data-slot="${s}" aria-selected="${s === st.slot}" class="${s === st.slot ? 'on' : ''}">
        <i style="background:${team().c1}"></i><b>Car ${i + 1} · ${esc(driver(s).name)}</b><span>${esc(st.draft[s].name)}${dirty(s) ? ' · unsaved' : ` · v${d.slots[s].active.rev}`}</span></button>`).join('')}</div>
      <div class="dna-views" role="tablist">${[['tune', 'Tune'], ['test', 'Proving Ground'], ['coach', `Strategist${pend().length ? ` (${pend().length})` : ''}`], ['history', 'History'], ['share', 'Export / import']].map(([v, l]) => `<button type="button" data-view="${v}" class="${st.view === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="dna-body">${st.view === 'tune' ? tune(x, a) : st.view === 'test' ? proving() : st.view === 'coach' ? coach() : st.view === 'history' ? history() : share(x)}</div>
      <div class="dna-foot" ${dirty() ? '' : 'data-clean'}>
        <span class="dna-state">${dirty() ? `Unsaved changes to ${esc(driver(st.slot).name)}'s DNA` : `${esc(driver(st.slot).name)} races with <b>${esc(a.name)}</b> (v${a.rev})`}</span>
        <button class="btn ghost" data-a="revert" type="button" ${dirty() ? '' : 'disabled'}>Undo changes</button>
        <button class="btn" data-a="save" type="button" ${dirty() ? '' : 'disabled'}>Save as version ${a.rev + 1}</button></div>`, 'dna');
    sh.onclick = click; sh.oninput = input; sh.onchange = change;
  }

  function tune(x, a) {
    const tr = tradeoffs(x.params);
    const presets = [...PRESETS, ...d.custom];
    return `<div class="dna-grid">
      <div class="dna-side">
        ${shapeSVG(x.params, dirty() ? a.params : null)}
        <p class="dna-legend"><span class="k now"></span>${dirty() ? 'Your changes' : esc(x.name)} <span class="k bal"></span>Balanced${dirty() ? ' <span class="k was"></span>Saved' : ''}</p>
        <div class="dna-trade"><div class="sub">What this driver gains and gives up</div>
          ${tr.length ? `<ul>${tr.slice(0, 6).map((t) => `<li><b>${esc(t.label)} ${t.v}</b><span class="g">+ ${esc(t.gain)}</span><span class="c">− ${esc(t.cost)}</span></li>`).join('')}</ul>` : '<p class="note">Balanced in everything: no strong habits and no weak spots. Move a dial to give this driver a style.</p>'}
          <p class="note">No setting adds grip or top speed. Each one changes a habit, and every habit has a price.</p></div>
      </div>
      <div class="dna-main">
        <div class="sub">Start from a personality</div>
        <div class="dna-presets">${presets.map((p) => `<button type="button" data-preset="${p.id}" class="${x.origin === 'preset:' + p.id && !dirtyFromPreset(x, p) ? 'on' : ''}" title="${esc(p.blurb)}"><b>${esc(p.name)}</b></button>`).join('')}
          <button type="button" data-a="blend" class="mix"><b>Blend two…</b></button></div>
        <p class="note dna-blurb">${esc(blurbOf(x))}</p>
        <div id="blendBox" hidden></div>
        <div class="dna-mode" role="tablist"><button type="button" data-mode="quick" class="${st.mode === 'quick' ? 'on' : ''}">Quick</button><button type="button" data-mode="advanced" class="${st.mode === 'advanced' ? 'on' : ''}">Advanced · all ${KEYS.length}</button></div>
        ${st.mode === 'quick' ? quick(x) : advanced(x)}
        <label class="field dna-name"><span>Profile name</span><input id="dnaName" maxlength="40" value="${esc(x.name)}"></label>
        <div class="dna-tools"><button class="link" data-view="test" type="button">Test in the Proving Ground</button><button class="link" data-a="copy" type="button">Copy to Car ${st.slot === 'car1' ? 2 : 1}</button>
          <button class="link" data-a="preset" type="button">Save as my own preset</button></div>
      </div></div>`;
  }
  const dirtyFromPreset = (x, p) => KEYS.some((k) => x.params[k] !== p.params[k]);
  function blurbOf(x) {
    const id = x.origin.startsWith('preset:') ? x.origin.slice(7) : null, p = [...PRESETS, ...d.custom].find((q) => q.id === id);
    if (p && !dirtyFromPreset(x, p)) return p.blurb;
    if (x.origin.startsWith('blend:')) return 'A blend of two personalities, settings averaged by your weights.';
    return 'Your own tuning.';
  }
  const slider = (key, v, lo, hi, name, extra = '') => `<input type="range" min="0" max="100" step="1" value="${v}" data-k="${key}" aria-label="${esc(name)}" aria-valuetext="${v}: ${esc(v < 50 ? lo : v > 50 ? hi : 'balanced')}" ${extra}>`;
  function quick(x) {
    return `<div class="dna-dials">${QUICK.map((q) => { const v = quickOf(x.params, q); return `<div class="dial" data-q="${q.key}">
      <div class="dl"><b>${esc(q.label)}</b><output>${v}</output></div>
      ${slider('q:' + q.key, v, q.lo, q.hi, q.label)}
      <div class="lh"><span>${esc(q.lo)}</span><span>${esc(q.hi)}</span></div>
      <p class="cost">${costLine(q, v)}</p></div>`; }).join('')}</div>`;
  }
  const costLine = (q, v) => (v >= 62 ? `Watch for: ${esc(q.cost)}` : v <= 38 ? `Watch for: ${esc(QUICK_LOW[q.key])}` : '&nbsp;');
  function advanced(x) {
    return `<div class="dna-adv">${GROUPS.map((g) => { const ps = PARAMS.filter((p) => p.group === g.id), moved = ps.filter((p) => x.params[p.key] !== 50).length;
      return `<details ${st.open.has(g.id) ? 'open' : ''} data-g="${g.id}"><summary><b>${esc(g.label)}</b><span>${ps.length} settings${moved ? ` · ${moved} changed` : ''}</span></summary>
      ${ps.map((p) => { const v = x.params[p.key]; return `<div class="dial" data-p="${p.key}">
        <div class="dl"><b>${esc(p.label)}</b><output>${v}</output></div>
        ${slider(p.key, v, p.lo, p.hi, p.label)}
        <div class="lh"><span>${esc(p.lo)}</span><span>${esc(p.hi)}</span></div>
        <p class="cost">${advLine(p, v)}</p></div>`; }).join('')}</details>`; }).join('')}</div>`;
  }
  const advLine = (p, v) => (v > 50 ? `<span class="g">+ ${esc(p.gain)}</span> <span class="c">− ${esc(p.cost)}</span>` : v < 50 ? `<span class="g">+ ${esc(LOW[p.key][0])}</span> <span class="c">− ${esc(LOW[p.key][1])}</span>` : 'Balanced');

  const pend = () => (d.pending || []).filter((p) => p.slot === st.slot && p.status === 'proposed');
  function coach() {
    const ps = pend(), log = d.log.filter((l) => l.slot === st.slot && l.source === 'strategist').slice(0, 8);
    return `<p class="lede">After each race your Strategist reads what ${esc(driver(st.slot).name)} did (lock-ups, trips wide, collisions, tyre wear, passes) and may suggest one change, with the numbers behind it. Nothing changes until you approve it.</p>
      <div class="strat-who">${Object.values(STRATEGISTS).map((x) => `<div class="${x.available ? 'on' : 'off'}"><b>${esc(x.label)}</b><span>${esc(x.note)}</span></div>`).join('')}</div>
      ${ps.length ? ps.map(proposalHTML).join('') : '<p class="note">No suggestions waiting. Finish a race and check back.</p>'}
      ${log.length ? `<div class="sub" style="margin-top:14px">Decisions</div><ul class="dna-log">${log.map((l) => `<li><span class="src">${/^rejected/.test(l.why) ? 'Declined' : 'Approved'}</span><div><b>${esc(l.why.replace(/^rejected: /, ''))}</b><span>${Object.entries(l.diff || {}).map(([k, [a, b]]) => `${esc(label(k))} ${a}→${b}`).join(' · ')}</span></div><time>${ago(l.at)}</time></li>`).join('')}</ul>` : ''}`;
  }
  function history() {
    const sl = d.slots[st.slot], log = d.log.filter((l) => l.slot === st.slot).slice(0, 20);
    const vers = [sl.active, ...sl.history.filter(Boolean)];
    return `<div class="sub">Versions</div><p class="note">Every save is kept (the last 30). Restoring makes a new version, so nothing is lost.</p>
      <ul class="dna-hist">${vers.map((p, i) => `<li><div><b>v${p.rev} · ${esc(p.name)}</b><span>${i === 0 ? 'Racing now' : 'Earlier'} · ${tradeoffs(p.params).slice(0, 2).map((t) => esc(t.label) + ' ' + t.v).join(', ') || 'Balanced'}</span></div>
        ${i === 0 ? '<em>Active</em>' : `<button class="btn ghost" data-restore="${p.hash}" type="button">Restore</button>`}</li>`).join('')}</ul>
      <div class="sub">Change log</div>
      ${log.length ? `<ul class="dna-log">${log.map((l) => `<li><span class="src">${SRC[l.source] || l.source}</span><div><b>${esc(l.why || (l.rev ? 'Saved version ' + l.rev : 'Change'))}</b>
        <span>${Object.entries(l.diff || {}).slice(0, 4).map(([k, [a, b]]) => `${esc(label(k))} ${a}→${b}`).join(' · ') || ''}${Object.keys(l.diff || {}).length > 4 ? ` · +${Object.keys(l.diff).length - 4} more` : ''}</span></div><time>${ago(l.at)}</time></li>`).join('')}</ul>` : '<p class="note">No changes yet.</p>'}`;
  }
  function share(x) {
    return `<div class="sub">Export</div><p class="note">The profile only: its name and ${KEYS.length} settings. Nothing about your team or this device.</p>
      <textarea class="share" id="dnaOut" rows="4" readonly>${esc(exportProfile(makeProfile(st.slot, x.params, x.origin, x.name)))}</textarea>
      <div class="actions"><button class="btn ghost" data-a="copyout" type="button">Copy</button></div>
      <div class="sub" style="margin-top:14px">Import</div><p class="note">Paste a profile. It is checked setting by setting and loads as unsaved changes for ${esc(driver(st.slot).name)}.</p>
      <textarea class="share" id="dnaIn" rows="4" placeholder='{"v":1,"name":"…","params":{…}}'></textarea><p class="dna-err" id="dnaErr"></p>
      <div class="actions"><button class="btn ghost" data-a="import" type="button">Check and load</button></div>`;
  }

  // live updates while a slider moves, without rebuilding the sheet (so the drag keeps going)
  function refreshLive() {
    const x = dr(), a = act();
    const side = sh.querySelector('.dna-side');
    if (side) {
      side.querySelector('.shape').outerHTML = shapeSVG(x.params, dirty() ? a.params : null);
      const tr = tradeoffs(x.params), box = side.querySelector('.dna-trade ul, .dna-trade > p.note:first-of-type');
      const html = tr.length ? `<ul>${tr.slice(0, 6).map((t) => `<li><b>${esc(t.label)} ${t.v}</b><span class="g">+ ${esc(t.gain)}</span><span class="c">− ${esc(t.cost)}</span></li>`).join('')}</ul>` : '<p class="note">Balanced in everything: no strong habits and no weak spots. Move a dial to give this driver a style.</p>';
      if (box) box.outerHTML = html;
      side.querySelector('.dna-legend').innerHTML = `<span class="k now"></span>${dirty() ? 'Your changes' : esc(x.name)} <span class="k bal"></span>Balanced${dirty() ? ' <span class="k was"></span>Saved' : ''}`;
    }
    for (const el of sh.querySelectorAll('.dial[data-q]')) { const q = QUICK.find((z) => z.key === el.dataset.q), v = quickOf(x.params, q); el.querySelector('output').textContent = v; el.querySelector('.cost').innerHTML = costLine(q, v); }
    for (const el of sh.querySelectorAll('.dial[data-p]')) { const p = PARAMS.find((z) => z.key === el.dataset.p), v = x.params[p.key]; el.querySelector('output').textContent = v; el.querySelector('.cost').innerHTML = advLine(p, v); }
    const foot = sh.querySelector('.dna-foot');
    foot.toggleAttribute('data-clean', !dirty());
    foot.querySelector('.dna-state').innerHTML = dirty() ? `Unsaved changes to ${esc(driver(st.slot).name)}'s DNA` : `${esc(driver(st.slot).name)} races with <b>${esc(a.name)}</b> (v${a.rev})`;
    foot.querySelectorAll('button').forEach((b) => (b.disabled = !dirty()));
    const tab = sh.querySelector(`[data-slot="${st.slot}"] span`); if (tab) tab.textContent = `${x.name}${dirty() ? ' · unsaved' : ` · v${a.rev}`}`;
    for (const b of sh.querySelectorAll('[data-preset]')) b.classList.toggle('on', x.origin === 'preset:' + b.dataset.preset && !dirtyFromPreset(x, [...PRESETS, ...d.custom].find((q) => q.id === b.dataset.preset)));
    const bl = sh.querySelector('.dna-blurb'); if (bl) bl.textContent = blurbOf(x);
    st.leaving = false; const c = sh.querySelector('[data-a="close"]'); if (c) c.textContent = 'Done';
  }

  function input(e) {
    if (e.target.id === 'pgVenue') { st.pg.venueId = e.target.value; st.pg.res = null; return; }
    const k = e.target.dataset.k;
    if (e.target.id === 'dnaName') { dr().name = e.target.value.replace(/[<>]/g, '').slice(0, 40) || 'Unnamed'; refreshLive(); return; }
    if (!k) return;
    const v = +e.target.value, x = dr();
    if (k.startsWith('q:')) x.params = setQuick(x.params, k.slice(2), v); else x.params = { ...x.params, [k]: v };
    if (!x.origin.startsWith('custom')) x.origin = x.origin.startsWith('preset:') || x.origin.startsWith('blend:') ? x.origin : 'custom';
    e.target.setAttribute('aria-valuetext', String(v));
    refreshLive();
  }
  function change(e) {
    if (e.target.dataset.k) {
      const x = dr(), p = [...PRESETS, ...d.custom].find((q) => 'preset:' + q.id === x.origin);
      if ((p && dirtyFromPreset(x, p)) || x.origin.startsWith('blend:')) { x.origin = 'custom'; if (!/\(tuned\)$/.test(x.name)) x.name = (x.name + ' (tuned)').slice(0, 40); const n = sh.querySelector('#dnaName'); if (n) n.value = x.name; refreshLive(); }
    }
  }

  function click(e) {
    const t = e.target.closest('button, summary'); if (!t) return;
    if (t.tagName === 'SUMMARY') { const g = t.parentElement.dataset.g; setTimeout(() => { t.parentElement.open ? st.open.add(g) : st.open.delete(g); }); return; }
    if (t.dataset.slot) { if (st.pg.run) pgStop(); st.slot = t.dataset.slot; st.pg.res = null; return render(); }
    if (t.dataset.view) { st.view = t.dataset.view; return render(); }
    if (t.dataset.pg) { const [k, v] = t.dataset.pg.split(':'); st.pg[k] = k === 'n' ? +v : v; st.pg.res = null; return render(); }
    if (t.dataset.mode) { st.mode = t.dataset.mode; S.settings.dnaMode = st.mode; save(); return render(); }
    if (t.dataset.preset) {
      const p = [...PRESETS, ...d.custom].find((q) => q.id === t.dataset.preset);
      st.draft[st.slot] = { params: { ...p.params }, name: p.name, origin: 'preset:' + p.id };
      return render();
    }
    if (t.dataset.sp) {
      const p = pend().find((q) => q.id === t.closest('[data-prop]').dataset.prop); if (!p) return;
      if (t.dataset.sp === 'test') { const next = { ...act().params }; for (const [k, [, to]] of Object.entries(p.diff)) next[k] = to; st.draft[st.slot] = { params: next, name: act().name, origin: 'strategist' }; st.view = 'test'; return render(); }
      decide(S, p, t.dataset.sp === 'yes');
      d.pending = d.pending.filter((q) => q.id !== p.id); save(); syncDraft(st.slot);
      toast(p.status === 'applied' ? `Applied as v${act().rev}. You can restore the old version in History.` : p.status === 'rejected' ? 'Okay, no change.' : 'That suggestion is out of date: the settings have changed since.');
      return render();
    }
    if (t.dataset.restore) { const p = restore(S, st.slot, t.dataset.restore); if (p) { save(); syncDraft(st.slot); toast(`${driver(st.slot).name}: restored as v${p.rev}`); } return render(); }
    const a = t.dataset.a;
    if (a === 'pgrun') return pgStart();
    if (a === 'pgstop') { pgStop(); return render(); }
    if (a === 'close') {
      if (st.pg.run && !st.leaving) pgStop();
      if (SLOTS.some((s) => dirty(s)) && !st.leaving) { st.leaving = true; t.textContent = 'Discard and leave'; toast('You have unsaved changes. Save them, or tap again to leave without saving.'); return; }
      return back();
    }
    if (a === 'revert') { syncDraft(st.slot); return render(); }
    if (a === 'save') {
      const x = dr(), src = x.origin === 'strategist' ? 'strategist' : x.origin.startsWith('preset:') ? 'preset' : x.origin.startsWith('blend:') ? 'blend' : x.origin === 'import' ? 'import' : 'you';
      const p = setProfile(S, makeProfile(st.slot, x.params, x.origin, x.name), src, `saved ${x.name}`);
      save(); syncDraft(st.slot);
      toast(`${driver(st.slot).name}: ${p.name} saved as v${p.rev}${opts.locked ? '. It applies from the next race.' : '.'}`);
      return render();
    }
    if (a === 'copy') {
      const o = st.slot === 'car1' ? 'car2' : 'car1';
      st.draft[o] = { ...dr(), params: { ...dr().params } };
      toast(`Copied to Car ${o === 'car1' ? 1 : 2} as unsaved changes.`); st.slot = o; return render();
    }
    if (a === 'preset') {
      const name = dr().name.replace(/ \(tuned\)$/, '') || 'My preset';
      const id = saveCustomPreset(S, name, dr().params); save();
      dr().origin = 'preset:' + id; dr().name = name; toast(`Saved "${name}" to your presets.`); return render();
    }
    if (a === 'blend') return blendBox();
    if (a === 'mix') {
      const A = sh.querySelector('#bA').value, B = sh.querySelector('#bB').value, w = +sh.querySelector('#bW').value;
      const presets = [...PRESETS, ...d.custom];
      const p = A === B ? makeProfile(st.slot, presets.find((q) => q.id === A).params, 'preset:' + A, presets.find((q) => q.id === A).name)
        : blend(st.slot, [{ id: A, w }, { id: B, w: 100 - w }], presets);
      st.draft[st.slot] = { params: { ...p.params }, name: p.name, origin: p.origin };
      return render();
    }
    if (a === 'copyout') { const ta = sh.querySelector('#dnaOut'); ta.select(); navigator.clipboard?.writeText(ta.value).then(() => toast('Copied.'), () => toast('Select the text and copy it.')); return; }
    if (a === 'import') {
      let obj; const err = sh.querySelector('#dnaErr');
      try { obj = JSON.parse(sh.querySelector('#dnaIn').value); } catch { err.textContent = 'That is not a profile: it should start with { and end with }.'; return; }
      const r = validate(obj, st.slot);
      if (!r.ok) { err.textContent = 'Not loaded: ' + r.errors.slice(0, 3).join('; ') + (r.errors.length > 3 ? ` (and ${r.errors.length - 3} more)` : ''); return; }
      st.draft[st.slot] = { params: { ...r.profile.params }, name: r.profile.name, origin: 'import' };
      st.view = 'tune'; toast('Loaded as unsaved changes. Check it, then save.'); return render();
    }
  }

  // ---------- Proving Ground: the same races twice, once with each version ----------
  const pairsFor = () => {
    const base = Object.fromEntries(SLOTS.map((s) => [s, d.slots[s].active]));
    const A = { ...base, [st.slot]: st.pg.against === 'balanced' ? makeProfile(st.slot, PRESETS[0].params, 'preset:balanced', 'Balanced') : base[st.slot] };
    const B = { ...base, [st.slot]: makeProfile(st.slot, dr().params, dr().origin, dr().name) };
    return { A, B };
  };
  const ROWS = [
    ['Average finish', (m) => m.pos, -1, (v) => 'P' + v.toFixed(1)], ['Places gained from the grid', (m) => m.gained, 1, (v) => (v > 0 ? '+' : '') + v.toFixed(1)],
    ['Overtakes made', (m) => m.passes, 1], ['Times overtaken', (m) => m.lost, -1], ['Passing attempts', (m) => m.attempts, 0],
    ['Contacts', (m) => m.contacts, -1], ['Lock-ups', (m) => m.lockups, -1], ['Running wide', (m) => m.wides, -1], ['Spins', (m) => m.spins, -1],
    ['Other mistakes', (m) => m.mistakes, -1], ['Tyre wear per lap', (m) => m.wearPerLap, -1, (v) => (v * 100).toFixed(1) + '%'], ['Pit stops', (m) => m.stops, 0],
  ];
  function proving() {
    const pg = st.pg, { A, B } = pairsFor(), same = A[st.slot].hash === B[st.slot].hash, v = VENUES.find((x) => x.id === pg.venueId);
    const nm = esc(driver(st.slot).name), bName = esc(dr().name), aName = pg.against === 'balanced' ? 'Balanced' : esc(act().name) + ' v' + act().rev;
    const opt = (k, val, l) => `<button type="button" data-pg="${k}:${val}" class="${String(pg[k]) === String(val) ? 'on' : ''}" ${pg.run ? 'disabled' : ''}>${l}</button>`;
    const res = pg.res && pg.slot === st.slot ? results() : '';
    return `<p class="lede">Run the same races twice: once with <b>${aName}</b>, once with <b>${dirty() ? 'your changes' : bName}</b>. Same circuit, grid, weather and rivals, so the only difference is how ${nm} drives.</p>
      <div class="pg-set">
        <label class="field"><span>Circuit</span><select id="pgVenue" ${pg.run ? 'disabled' : ''}>${VENUES.map((x) => `<option value="${x.id}" ${x.id === pg.venueId ? 'selected' : ''}>${x.flag} ${esc(x.city)}</option>`).join('')}</select></label>
        <div class="field"><span>Weather</span><div class="pg-seg">${opt('weather', 'any', 'As forecast')}${opt('weather', 'dry', 'Dry')}${opt('weather', 'wet', 'Rain')}</div></div>
        <div class="field"><span>Races</span><div class="pg-seg">${opt('n', 6, '6')}${opt('n', 12, '12')}${opt('n', 24, '24')}</div></div>
        <div class="field"><span>Compare with</span><div class="pg-seg">${opt('against', 'saved', 'Saved version')}${opt('against', 'balanced', 'Balanced')}</div></div>
      </div>
      ${pg.weather === 'wet' && v.rain < 0.15 ? `<p class="note">It rarely rains in ${esc(v.city)}, so there may be fewer wet races than you asked for.</p>` : ''}
      ${pg.run ? `<div class="pg-run"><div class="pg-bar"><i style="width:${(100 * pg.pairs.length / Math.max(1, pg.seeds?.length || pg.n)).toFixed(0)}%"></i></div>
        <span>Race ${pg.pairs.length + (pg.pairs.length < (pg.seeds?.length || pg.n) ? 1 : 0)} of ${pg.seeds?.length || pg.n}, twice each${pg.eta ? ` · about ${pg.eta} s left` : ''}</span>
        <button class="btn ghost" data-a="pgstop" type="button">Stop</button></div>`
        : `<div class="actions"><button class="btn" data-a="pgrun" type="button" ${same ? 'disabled' : ''}>Run ${pg.n} races</button></div>
        ${same ? `<p class="note">Nothing to compare yet: change ${nm}'s settings on the Tune tab, or compare with Balanced.</p>` : ''}`}
      ${res}
      ${d.trials.filter((t) => t.slot === st.slot).length ? `<div class="sub" style="margin-top:18px">Earlier tests</div><ul class="dna-log">${d.trials.filter((t) => t.slot === st.slot).slice(0, 6).map((t) => `<li><span class="src pg-${t.verdict}">${t.verdict === 'better' ? 'Better' : t.verdict === 'worse' ? 'Worse' : 'Close'}</span><div><b>${esc(t.name)} vs ${esc(t.against)}</b><span>${esc(t.city)} · ahead in ${t.better} of ${t.n}, behind in ${t.worse}${t.weather !== 'any' ? ' · ' + t.weather : ''}</span></div><time>${ago(t.at)}</time></li>`).join('')}</ul>` : ''}`;
  }
  function results() {
    const pg = st.pg, sum = summarize(pg.pairs, st.slot), vd = verdict(sum), same = sum.n - sum.better - sum.worse;
    const dt = sum.lapDelta, fmt = (r, v) => (r[3] ? r[3](v) : v.toFixed(1));
    return `<div class="pg-res pg-${vd.id}">
      <div class="pg-head"><b>${vd.text}</b><span>${esc(driver(st.slot).name)} finished ahead in <b>${sum.better}</b> of ${sum.n} races, behind in <b>${sum.worse}</b>${same ? `, the same in ${same}` : ''}.${dt != null && sum.timed >= 3 ? ` Best lap ${Math.abs(dt) < 0.005 ? 'the same' : `${Math.abs(dt).toFixed(2)} s ${dt < 0 ? 'quicker' : 'slower'}`} (median).` : ''}</span></div>
      <table class="res pg-t"><thead><tr><td></td><td class="r">${pg.against === 'balanced' ? 'Balanced' : 'Saved'}</td><td class="r">Changes</td></tr></thead><tbody>
      ${ROWS.map((r) => { const m = metricOf(sum, r[1]), d0 = m.b - m.a, good = r[2] === 0 || Math.abs(d0) < 0.05 ? '' : (d0 * r[2] > 0 ? 'g' : 'c');
        return `<tr><td>${r[0]}</td><td class="r m">${fmt(r, m.a)}</td><td class="r ${good}">${fmt(r, m.b)}</td></tr>`; }).join('')}
      <tr><td>Retirements</td><td class="r m">${sum.dnf.a}</td><td class="r ${sum.dnf.b > sum.dnf.a ? 'c' : sum.dnf.b < sum.dnf.a ? 'g' : ''}">${sum.dnf.b}</td></tr></tbody></table>
      <p class="note">Averages per race. Racing is chaotic: one safety car or a spin ahead can swing a result, so treat 6 races as a hint and 24 as a good read. The same settings on the same circuit always give the same answer.</p>
      ${dirty() ? `<div class="actions"><button class="btn" data-a="save" type="button">Keep these changes (save v${act().rev + 1})</button><button class="btn ghost" data-view="tune" type="button">Back to tuning</button></div>` : ''}</div>`;
  }
  // summarize() reports each metric as { a, b }; this reads one by the row's accessor
  function metricOf(sum, f) {
    const pick = { pos: sum.pos, gained: sum.gained, passes: sum.passes, lost: sum.lost, attempts: sum.attempts, contacts: sum.contacts, lockups: sum.lockups,
      wides: sum.wides, spins: sum.spins, mistakes: sum.mistakes, wearPerLap: sum.wearPerLap, stops: sum.stops };
    return { a: f(Object.fromEntries(Object.entries(pick).map(([k, v]) => [k, v.a]))), b: f(Object.fromEntries(Object.entries(pick).map(([k, v]) => [k, v.b]))) };
  }
  function pgStart() {
    const pg = st.pg, { A, B } = pairsFor(), t0 = performance.now();
    Object.assign(pg, { pairs: [], seeds: null, res: null, slot: st.slot, eta: null, aName: pg.against === 'balanced' ? 'Balanced' : act().name + ' v' + act().rev, bName: dr().name });
    const onPair = (pair) => {
      pg.pairs.push(pair);
      const per = (performance.now() - t0) / pg.pairs.length, left = (pg.seeds?.length || pg.n) - pg.pairs.length;
      pg.eta = left > 0 ? Math.max(1, Math.round((per * left) / 1000)) : null;
      if (st.view === 'test') { const bar = sh.querySelector('.pg-bar i'), sp = sh.querySelector('.pg-run span'); if (bar && sp) { bar.style.width = (100 * pg.pairs.length / (pg.seeds?.length || pg.n)).toFixed(0) + '%'; sp.textContent = `Race ${Math.min(pg.pairs.length + 1, pg.seeds?.length || pg.n)} of ${pg.seeds?.length || pg.n}, twice each${pg.eta ? ` · about ${pg.eta} s left` : ''}`; } }
    };
    const onDone = () => {
      pg.run = null; pg.res = true;
      if (pg.pairs.length) {
        const sum = summarize(pg.pairs, pg.slot), vd = verdict(sum), v = VENUES.find((x) => x.id === pg.venueId);
        d.trials.unshift({ at: Date.now(), slot: pg.slot, venue: v.id, city: v.city, n: sum.n, weather: pg.weather, better: sum.better, worse: sum.worse, lapDelta: sum.lapDelta, verdict: vd.id, name: pg.bName, against: pg.aName });
        d.trials.length = Math.min(d.trials.length, 20); save();
      }
      if (st.view === 'test') render();
    };
    pg.run = runTrialAsync({ venueId: pg.venueId, n: pg.n, weather: pg.weather, a: A, b: B }, (seeds) => { pg.seeds = seeds; }, onPair, onDone);
    render();
  }
  function pgStop() { const pg = st.pg; if (pg.run) { pg.run.stop(); pg.run = null; pg.res = pg.pairs.length ? true : null; } }

  function syncDraft(slot) { const p = d.slots[slot].active; st.draft[slot] = { params: { ...p.params }, name: p.name, origin: p.origin }; }

  function blendBox() {
    const box = sh.querySelector('#blendBox'); if (!box) return;
    if (!box.hidden) { box.hidden = true; return; }
    const presets = [...PRESETS, ...d.custom], opt = (sel) => presets.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    box.innerHTML = `<div class="dna-blend"><label><span>First</span><select id="bA">${opt('attacker')}</select></label>
      <label class="w"><span><output id="bWa">60</output>% · <output id="bWb">40</output>%</span><input type="range" id="bW" min="0" max="100" step="5" value="60" aria-label="Blend weight"></label>
      <label><span>Second</span><select id="bB">${opt('technician')}</select></label>
      <button class="btn" data-a="mix" type="button">Blend</button></div>`;
    box.hidden = false;
    box.querySelector('#bW').addEventListener('input', (e) => { box.querySelector('#bWa').textContent = e.target.value; box.querySelector('#bWb').textContent = 100 - e.target.value; e.stopPropagation(); });
  }

  render();
  return { render, state: st };
}

// Runs a trial in a Web Worker so the page stays smooth; falls back to the page itself (one race
// pair per tick) where module workers are not available.
export function runTrialAsync(job, onSeeds, onPair, onDone) {
  let w = null, stopped = false;
  try { w = new Worker(new URL('./proving.worker.js', import.meta.url), { type: 'module' }); } catch { w = null; }
  if (w) {
    let got = false;
    w.onmessage = (e) => { got = true; const m = e.data; if (stopped) return; if (m.seeds) onSeeds(m.seeds); else if (m.pair) onPair(m.pair); else if (m.done) { w.terminate(); onDone(); } };
    w.onerror = () => { if (!got && !stopped) { w.terminate(); w = null; local(); } };
    w.postMessage(job);
  } else local();
  function local() {
    const venue = VENUES.find((v) => v.id === job.venueId), seeds = pickSeeds(venue, job.n, job.weather);
    onSeeds(seeds);
    const it = trial({ venue, seeds, a: job.a, b: job.b });
    const next = () => { if (stopped) return; const r = it.next(); if (r.done) return onDone(); onPair(r.value); setTimeout(next, 0); };
    setTimeout(next, 30);
  }
  return { stop() { stopped = true; if (w) w.terminate(); } };
}

// one Strategist suggestion as a card: what it saw, the evidence, the exact change, and your choice
export function proposalHTML(p) {
  return `<div class="prop" data-prop="${p.id}"><div class="ph"><span>Car ${p.slot === 'car1' ? 1 : 2}</span>${p.status !== 'proposed' ? `<em class="st-${p.status}">${p.status === 'applied' ? 'Applied' : p.status === 'rejected' ? 'Not now' : 'Out of date'}</em>` : ''}</div>
    <b>${esc(p.title)}</b><p>${esc(p.observation)}</p>
    <div class="ev">${p.evidence.map((e) => `<span>${esc(e.label)} <b>${esc(e.value)}</b></span>`).join('')}</div>
    <div class="chg">${Object.entries(p.diff).map(([k, [a, b]]) => `<span>${esc(label(k))} <b>${a} → ${b}</b></span>`).join('')}<small><span class="g">+ ${esc(p.benefit)}</span> <span class="c">− ${esc(p.risk)}</span></small></div>
    ${p.status === 'proposed' ? `<div class="acts"><button class="btn" data-sp="yes" type="button">Approve</button><button class="btn ghost" data-sp="test" type="button">Test it first</button><button class="btn ghost" data-sp="no" type="button">Not now</button></div>` : p.error ? `<p class="note">${esc(p.error)}</p>` : ''}</div>`;
}

// a one-line summary for the pre-race screen
export function dnaLine(S, team) {
  const d = dnaState(S);
  return SLOTS.map((s, i) => `<span><b>${esc(team.drivers[i].name)}</b> ${esc(d.slots[s].active.name)}</span>`).join('');
}
