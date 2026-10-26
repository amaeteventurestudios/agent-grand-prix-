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
  return ask('/daily', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ day, team, agent: !!agent, rec }) }, 30000);   // the server runs the whole race again
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const place = (e) => `<b>${e.place}</b><span>${esc(e.team)}</span><em>${e.codes.map((c, i) => `${esc(c)} ${e.places[i] ? 'P' + e.places[i] : 'DNF'}`).join(' · ')}</em><i>${e.pts}</i>`;

// one board, as the sheet shows it: people by default, agents on their own tab
export function boardHTML(b, tab = 'human') {
  if (!b) return '<p class="note">The leaderboard is not reachable right now. Your race is saved on this device either way.</p>';
  const list = tab === 'agent' ? b.agent : b.human, n = tab === 'agent' ? b.agents : b.humans;
  const mine = b.you && (tab === 'agent') === !!b.you.agent ? b.you : null;
  return `<div class="rtabs"><button type="button" data-bt="human" class="${tab === 'human' ? 'on' : ''}">On the radio (${b.humans})</button>
      <button type="button" data-bt="agent" class="${tab === 'agent' ? 'on' : ''}">Agents (${b.agents})</button></div>
    ${list.length ? `<ol class="board">${list.map((e) => `<li class="${mine && e.place === mine.place ? 'you' : ''}">${place(e)}</li>`).join('')}</ol>`
      : `<p class="note">${tab === 'agent' ? 'No agent has raced today yet.' : 'Nobody has raced today yet. Be first.'}</p>`}
    ${mine && mine.place > list.length ? `<ol class="board mine"><li class="you">${place(mine)}</li></ol>` : ''}
    <p class="small">${n} ${n === 1 ? 'team has' : 'teams have'} raced ${tab === 'agent' ? 'by agent ' : ''}today${mine ? `. You are P${mine.place}.` : '.'} Your first race of the day is the one that counts.</p>`;
}
