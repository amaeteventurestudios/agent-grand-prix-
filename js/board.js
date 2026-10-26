// The Daily leaderboard in the browser. Nothing here claims a result: the game sends the race it
// ran — the setup and every call, with the engine step each was made on, the same record that lets a
// race survive a refresh — and the server replays it with the game's own engine and reads the finish
// from its own run (server/leaders.mjs). So a board is a list of races that were actually raced.
// People and agents are ranked apart, and a board shows team names and driver codes, never accounts.
const API = '/api/board';
const TIMEOUT = 6000;

async function ask(route, opts, wait = TIMEOUT) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), wait);
  try { const r = await fetch(API + route, { credentials: 'same-origin', signal: c.signal, ...opts }); return r.ok ? await r.json() : null; }
  catch { return null; } finally { clearTimeout(t); }
}

export const board = { on: null };            // null until asked, then true or false
export async function boardOn() {
  if (board.on === null) { const h = await ask('/health'); board.on = !!(h && h.board); }
  return board.on;
}
// the day's board, or null when the service is off or unreachable
export async function fetchBoard(day) { return (await boardOn()) ? ask(`/daily?day=${day}`) : null; }
// send the race you just raced. The server decides what it was worth; a refused record is simply not ranked.
export async function submitDaily({ day, team, agent, rec }) {
  if (!rec || !(await boardOn())) return null;
  const send = () => ask('/daily', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ day, team, agent: !!agent, rec }) }, 30000);   // the server runs the whole race again
  // no session yet (the account check timed out on a slow start): ask for one, then once more
  return (await send()) || (await fetch('/api/me', { credentials: 'same-origin' }).catch(() => null), send());
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const place = (e) => `<b>${e.place}</b><span>${esc(e.team)}</span><em>${e.codes.map((c, i) => `${esc(c)} ${e.places[i] ? 'P' + e.places[i] : 'DNF'}`).join(' · ')}</em><i>${e.pts}</i>`;

// the week's league: seven Dailies added up (#1-#7, #8-#14, ...), the same weeks the server keeps
export const weekOf = (day) => Math.floor((day - 1) / 7) + 1;
export async function fetchWeek(day) { return (await boardOn()) ? ask(`/week?week=${weekOf(day)}&today=${day}`) : null; }

const tabs = (tab, b) => `<div class="rtabs"><button type="button" data-bt="human" class="${tab === 'human' ? 'on' : ''}">On the radio${b ? ` (${b.humans})` : ''}</button>
      <button type="button" data-bt="agent" class="${tab === 'agent' ? 'on' : ''}">Agents${b ? ` (${b.agents})` : ''}</button>
      <button type="button" data-bt="week" class="${tab === 'week' ? 'on' : ''}">This week</button></div>`;
const OFF = '<p class="note">The leaderboard is not reachable right now. Your race is saved on this device either way.</p>';
const sora = (n) => `${n.toLocaleString('en')} Sora`;

// one board, as the sheet shows it: people by default, agents on their own tab
export function boardHTML(b, tab = 'human') {
  if (!b) return tabs(tab) + OFF;
  const list = tab === 'agent' ? b.agent : b.human, n = tab === 'agent' ? b.agents : b.humans;
  const mine = b.you && (tab === 'agent') === !!b.you.agent ? b.you : null;
  return `${tabs(tab, b)}
    ${list.length ? `<ol class="board">${list.map((e) => `<li class="${mine && e.place === mine.place ? 'you' : ''}">${place(e)}</li>`).join('')}</ol>`
      : `<p class="note">${tab === 'agent' ? 'No agent has raced today yet.' : 'Nobody has raced today yet. Be first.'}</p>`}
    ${mine && mine.place > list.length ? `<ol class="board mine"><li class="you">${place(mine)}</li></ol>` : ''}
    <p class="small">${n} ${n === 1 ? 'team has' : 'teams have'} raced ${tab === 'agent' ? 'by agent ' : ''}today${mine ? `. You are P${mine.place}.` : '.'} Your first race of the day is the one that counts.</p>`;
}

// the week's table. People share the prize pot; agents get a table of their own and no prizes, so
// a team can't win the pot by leaving an agent to race for it.
const wrow = (e) => `<b>${e.place}</b><span>${esc(e.team)}</span><em>${e.codes.map(esc).join(' · ')} · ${e.races} ${e.races === 1 ? 'race' : 'races'}</em><i>${e.pts} pts${e.prize ? `<small>${sora(e.prize)}</small>` : ''}</i>`;
export function leagueHTML(w, day, side = 'human') {
  if (!w) return tabs('week') + OFF;
  const list = side === 'agent' ? w.agent : w.human, mine = w.you && (side === 'agent') === !!w.you.agent ? w.you : null;
  const left = w.to - day;
  return `${tabs('week')}
    <p class="small">Week ${w.week}: Dailies #${w.from} to #${w.to}. ${w.done ? 'This week is over; the table is final.' : left > 0 ? `${left} ${left === 1 ? 'Daily' : 'Dailies'} to go after today.` : 'Today is the last Daily of the week.'}
      ${w.pot ? `Prize pot <b>${sora(w.pot)}</b>, shared by the top ${w.shares.length} teams on the radio. Paid in Sora once your account is connected; Sora is earned, never bought or cashed out.` : 'Prizes come later.'}</p>
    <div class="wside"><button type="button" data-bw="human" class="btn ${side === 'human' ? '' : 'ghost'} small">On the radio (${w.humans})</button>
      <button type="button" data-bw="agent" class="btn ${side === 'agent' ? '' : 'ghost'} small">Agents (${w.agents})</button></div>
    ${list.length ? `<ol class="board week">${list.map((e) => `<li class="${mine && e.place === mine.place ? 'you' : ''}">${wrow(e)}</li>`).join('')}</ol>`
      : '<p class="note">No one has raced a Daily this week yet.</p>'}
    ${mine && mine.place > list.length ? `<ol class="board week mine"><li class="you">${wrow(mine)}</li></ol>` : ''}
    <p class="small">Every checked Daily counts: your first run of each day, added up across the week.${mine ? ` You are P${mine.place}${mine.prize ? `, on course for ${sora(mine.prize)}` : ''}.` : ''}</p>`;
}
