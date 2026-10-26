// The Race Intelligence Report: what happened to your team, the calls you made and what followed,
// and the engineer's review. buildReport() reads a finished race into plain data (it is saved, so
// the last report opens again from the home page); reportHTML() draws it. The review only states
// what the race data shows: it never claims a call caused a result.
import { COMPOUNDS } from './data.js';
import { DT } from './sim.js';
import { portraitSVG } from './portrait.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const who = (c) => ({ name: c.name, code: c.code, num: c.num, face: c.face, helmet: c.helmet });
const tm = (t) => ({ c1: t.c1, c2: t.c2, short: t.short, you: !!t.you });

const PACE = { push: 'Push', save: 'Save tyres', normal: 'Normal pace' };
const ERS = { deploy: 'Deploy the battery', harvest: 'Harvest the battery', balanced: 'Balanced battery' };
const BATTLE = { attack: 'Attack', defend: 'Defend', neutral: 'Stop attacking' };
const ORDER = { hold: 'Team orders: hold positions', free: 'Team orders: free to race', swap: 'Team orders: swap places' };
function callText(cmd) {
  const out = [];
  if (cmd.pace) out.push(PACE[cmd.pace]);
  if (cmd.ers) out.push(ERS[cmd.ers]);
  if (cmd.battle) out.push(BATTLE[cmd.battle]);
  if ('box' in cmd) out.push(cmd.box ? `Box for ${COMPOUNDS[cmd.box].name}s` : 'Stay out');
  if ('auto' in cmd) out.push(cmd.auto ? 'Handed the car to the strategist' : 'Took back control');
  if (cmd.order) out.push(ORDER[cmd.order]);
  return out.filter(Boolean).join(' + ');
}

// the lap a car was on at race time t, and its place just before t and about two laps after
function around(car, t) {
  const tr = car.trace;
  let k = 0; while (k < tr.length && tr[k].at <= t) k++;
  const before = k ? tr[k - 1].pos : car.grid, later = tr[Math.min(tr.length - 1, k + 1)];
  return { lap: k + 1, before, after: later && later.at > t ? later.pos : null };
}

export function buildReport(R, m) {
  const res = R.result, mineIds = new Set(m.mine);
  const myCars = R.cars.filter((c) => mineIds.has(c.id));
  const winner = res[0];
  const rows = res.map((x) => ({ pos: x.pos, id: x.id, d: who(x.car), tm: tm(x.car.team), used: x.used, gap: x.gapText, pts: x.points, fastest: x.fastest, dnf: x.dnf, grid: x.car.grid, penalty: x.penalty || 0 }));

  // your calls, in order, with the place before and two laps later; repeats of the same call close together merge
  const calls = [];
  for (const c of R.commands) {
    if (!mineIds.has(c.id)) continue;
    const text = callText(c.cmd); if (!text) continue;
    const car = R.byId.get(c.id), t = c.tick * DT, a = around(car, t), last = calls[calls.length - 1];
    if (last && last.id === c.id && last.text === text && t - last.t < 15) continue;
    calls.push({ t, id: c.id, code: car.code, text, from: c.from || 'principal', lap: Math.min(a.lap, R.laps), before: a.before, after: a.after });
  }
  // what happened to your cars, and the race-wide moments
  const KEEP = new Set(['pit', 'incident', 'dnf', 'mistake']);
  const events = R.events.filter((e) => (e.car && mineIds.has(e.car) && KEEP.has(e.type)) || (e.type === 'sc' && e.phase !== 'in') || e.type === 'weather')
    .map((e) => ({ t: e.t, lap: e.lap, type: e.type, text: e.text, id: e.car, phase: e.phase }));

  const review = [];
  const sc = []; let open = null;
  for (const e of R.events) if (e.type === 'sc') { if (e.phase === 'out') open = { from: e.t, lap: e.lap }; else if (e.phase === 'green' && open) { sc.push({ ...open, to: e.t }); open = null; } }
  if (open) sc.push({ ...open, to: R.t });
  const rainAt = (R.events.find((e) => e.type === 'weather' && /rain/i.test(e.text) && !/stopped/.test(e.text)) || {}).lap;
  for (const car of myCars) {
    const x = res.find((r) => r.id === car.id), first = car.name.split(' ')[0];
    if (x.dnf) { review.push({ id: car.id, kind: 'bad', text: `${first} retired after ${car.lapsDone} laps.` }); continue; }
    const d = car.grid - x.pos;
    review.push({ id: car.id, kind: d > 0 ? 'good' : d < 0 ? 'bad' : 'note', text: `${first} started P${car.grid} and finished P${x.pos}${d ? `: ${d > 0 ? 'up' : 'down'} ${Math.abs(d)} place${Math.abs(d) > 1 ? 's' : ''}` : ''}.` });
    // the best three-lap spell
    const tr = car.trace; let best = null;
    for (let i = 0; i + 3 < tr.length; i++) { const g = tr[i].pos - tr[i + 3].pos; if (g >= 2 && (!best || g > best.g)) best = { g, a: tr[i], b: tr[i + 3] }; }
    if (best) review.push({ id: car.id, kind: 'good', text: `Best spell: laps ${best.a.lap}–${best.b.lap}, from P${best.a.pos} to P${best.b.pos}.` });
    // stops, against the winner's
    const stops = x.used.length - 1, ws = winner.used.length - 1;
    if (winner.id !== car.id) review.push({ id: car.id, kind: 'note', text: `${stops} stop${stops === 1 ? '' : 's'} (${x.used.join(' → ')}); the winner made ${ws} (${winner.used.join(' → ')}).` });
    // the safety car: a cheap moment to stop
    const pits = R.events.filter((e) => e.type === 'pit' && e.car === car.id && /stop,/.test(e.text)).map((e) => e.t);
    for (const s of sc) {
      const under = pits.some((t) => t >= s.from && t <= s.to + 20);
      if (under) review.push({ id: car.id, kind: 'good', text: `Pitted under the safety car on lap ${s.lap}: a stop that cost less time than usual.` });
      else if (stops < 2 && R.laps - s.lap > 3) review.push({ id: car.id, kind: 'note', text: `Stayed out under the safety car on lap ${s.lap}. A stop there costs less time than under green.` });
    }
    // rain: how long it took to change to rain tyres
    if (rainAt) {
      const k = tr.findIndex((t) => t.lap >= rainAt && !COMPOUNDS[t.tyre].dry);
      if (k >= 0) { const late = tr[k].lap - rainAt; review.push({ id: car.id, kind: late <= 2 ? 'good' : 'bad', text: late <= 2 ? `On rain tyres by lap ${tr[k].lap}, soon after the rain came on lap ${rainAt}.` : `Rain came on lap ${rainAt}; rain tyres only on lap ${tr[k].lap}.` }); }
    }
    const end = tr[tr.length - 1];
    if (end && end.wear > 0.75) review.push({ id: car.id, kind: 'bad', text: `Finished on worn ${COMPOUNDS[end.tyre].name}s with ${Math.round((1 - end.wear) * 100)}% left.` });
    if (x.penalty) review.push({ id: car.id, kind: 'bad', text: `A 20 s penalty: a dry race needs two different dry tyres.` });
    if (x.fastest) review.push({ id: car.id, kind: 'good', text: `Fastest lap of the race: one extra point.` });
  }
  const yours = calls.filter((c) => c.from === 'principal').length, theirs = calls.length - yours;
  review.push({ kind: 'note', text: yours ? `You made ${yours} call${yours > 1 ? 's' : ''}${theirs ? `; the strategist and engineer made ${theirs}` : ''}.` : theirs ? `The strategist made all ${theirs} calls: the team raced autonomously.` : 'No calls were made: your drivers raced on their own plans.' });

  return {
    v: 1, at: Date.now(), venue: { id: m.venue.id, flag: m.venue.flag, city: m.venue.city }, label: m.label, laps: R.laps,
    rows, mine: m.mine, calls: calls.slice(0, 60), events: events.slice(0, 60), review,
    trace: Object.fromEntries(myCars.map((c) => [c.id, c.trace.map((t) => [t.lap, t.pos])])),
  };
}

// a small chart of your two cars' places lap by lap (P1 at the top)
function traceSVG(rep) {
  const ids = rep.mine.filter((id) => rep.trace[id] && rep.trace[id].length > 1); if (!ids.length) return '';
  const n = rep.rows.length, W = 600, H = 170, px = (l) => 40 + (l - 1) / Math.max(1, rep.laps - 1) * (W - 50), py = (p) => 10 + (p - 1) / Math.max(1, n - 1) * (H - 26);
  const lines = ids.map((id, k) => {
    const row = rep.rows.find((r) => r.id === id), pts = [[0, row.grid], ...rep.trace[id]].map(([l, p]) => `${px(Math.max(1, l)).toFixed(1)},${py(p).toFixed(1)}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${ink(row.tm.c1)}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" class="tl${k}"/>`;
  }).join('');
  const grid = [1, 5, 10, 15, 20].filter((p) => p <= n).map((p) => `<line x1="40" x2="${W - 10}" y1="${py(p)}" y2="${py(p)}" class="gl"/><text x="2" y="${py(p) + 4}" class="gt">P${p}</text>`).join('');
  return `<svg class="trace" viewBox="0 0 ${W} ${H}" role="img" aria-label="Your cars' places lap by lap">${grid}${lines}</svg>`;
}

export function reportHTML(rep, tab = 'result', head = '') {
  const rows = rep.rows, my = rows.filter((r) => rep.mine.includes(r.id)), code = (id) => (rows.find((r) => r.id === id) || {}).d?.code || '';
  const tabs = `<div class="rtabs" role="tablist">${[['result', 'Result'], ['calls', 'Your calls'], ['review', 'Engineer review']].map(([k, l]) => `<button type="button" role="tab" data-rt="${k}" class="${tab === k ? 'on' : ''}" aria-selected="${tab === k}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (tab === 'result') {
    const top = rows.slice(0, 3), pod = (x, cls) => x ? `<div class="${cls}" style="background:${x.tm.c1};color:${readable(x.tm.c1)}">${portraitSVG(x.d, x.tm, { size: 56 })}<b>${x.pos}</b>${esc(x.d.code)}<br><small>${esc(x.tm.short)}</small></div>` : '';
    body = `${head}<div class="podium">${pod(top[1], 'p2')}${pod(top[0], 'p1')}${pod(top[2], 'p3')}</div>
      <table class="res"><tbody>${rows.map((x) => `<tr class="${x.tm.you ? 'mine' : ''}"><td>${x.pos}</td><td class="pn">${portraitSVG(x.d, x.tm, { size: 26, bg: false })}${esc(x.d.name)}</td><td class="m">${esc(x.tm.short)}</td><td class="m">${x.used.join('›')}${x.fastest ? ' ⏱' : ''}</td><td class="r">${esc(x.gap)}</td><td class="r">${x.pts || ''}</td></tr>`).join('')}</tbody></table>`;
  }
  if (tab === 'calls') {
    const items = [...rep.calls.map((c) => ({ ...c, kind: 'call' })), ...rep.events.map((e) => ({ ...e, kind: 'ev' }))].sort((a, b) => a.t - b.t);
    const mv = (c) => c.after == null ? '' : c.after < c.before ? `<span class="mv up">P${c.before} → P${c.after}</span>` : c.after > c.before ? `<span class="mv dn">P${c.before} → P${c.after}</span>` : `<span class="mv eq">P${c.before}, held</span>`;
    body = `<div class="sub">Places lap by lap</div>${traceSVG(rep)}
      <div class="legend">${my.map((r, k) => `<span><i class="k${k}" style="color:${ink(r.tm.c1)}"></i>${esc(r.d.name)}</span>`).join('')}</div>
      <p class="note">Each call shows the car's place when you made it and two laps later. Many things move a car in two laps, so read it as what followed, not proof.</p>
      <ol class="tline">${items.length ? items.map((x) => x.kind === 'call'
        ? `<li class="call${x.from === 'principal' ? '' : ' other'}"><span class="lp">L${x.lap}</span><span class="tx"><b>${esc(x.code)}</b> ${esc(x.text)}${x.from === 'principal' ? '' : ` <em>(${x.from === 'strategist' ? 'strategist' : 'engineer'})</em>`}</span>${mv(x)}</li>`
        : `<li class="ev ${x.type}"><span class="lp">L${x.lap}</span><span class="tx">${esc(x.text)}</span></li>`).join('') : '<li class="ev"><span class="tx">No calls this race: your drivers raced on their own plans.</span></li>'}</ol>`;
  }
  if (tab === 'review') {
    const groups = [...my.map((r) => ({ title: r.d.name, row: r, items: rep.review.filter((x) => x.id === r.id) })), { title: 'Team', items: rep.review.filter((x) => !x.id) }];
    body = `<p class="note">The engineer reads the race data: places, stops, tyres, weather and the safety car.</p>${groups.map((g) => `<div class="rv">
      <div class="rv-h">${g.row ? portraitSVG(g.row.d, g.row.tm, { size: 34 }) : ''}<b>${esc(g.title)}</b></div>
      <ul>${g.items.map((x) => `<li class="${x.kind}">${esc(x.text)}</li>`).join('')}</ul></div>`).join('')}`;
  }
  return { tabs, body, title: `${rep.venue.flag} ${esc(rep.venue.city)} Grand Prix · ${esc(rep.label)}`, mine: my.map((r) => `${esc(r.d.code)} ${r.dnf ? 'DNF' : 'P' + r.pos}`).join(' · '), code };
}

export function shareText(rep, url) {
  const my = rep.rows.filter((r) => rep.mine.includes(r.id)), pts = my.reduce((s, r) => s + r.pts, 0);
  return [`🏁 Agent Grand Prix`, `${rep.venue.flag} ${rep.venue.city} · ${rep.label}`,
    my.map((r) => `${r.d.code} ${r.dnf ? 'DNF' : 'P' + r.pos}${r.pos === 1 ? ' 🥇' : r.pos === 2 ? ' 🥈' : r.pos === 3 ? ' 🥉' : ''}`).join(' · '), `+${pts} pts`, url].join('\n');
}

// a line colour that shows on the chart: very light team colours draw in slate
function ink(hex) { return readable(hex) === '#111827' && lum(hex) > 0.8 ? '#5d6470' : hex; }
function lum(hex) { let h = String(hex).slice(1); if (h.length === 3) h = h.replace(/./g, '$&$&'); const n = parseInt(h, 16) || 0; return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
function readable(hex) {
  let h = String(hex).slice(1); if (h.length === 3) h = h.replace(/./g, '$&$&');
  const n = parseInt(h, 16) || 0; return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6 ? '#111827' : '#ffffff';
}
