// The owner's screen: every Novenique game on one page, read from the one SpacetimeDB server where
// each game has its own database (spacetime/README.md). Only the owner gets here: Caddy asks for the
// owner's password (the OWNER_PASSWORD secret) before anything reaches this service, and this service
// only listens on the server itself. It reads the private tables with the SpacetimeDB owner login that
// published them, so nothing a player can reach ever sees those rows.
//
//   GET /                the page
//   GET /api/summary     the same as JSON: per game, who is online, totals, and the game's services
import http from 'node:http';
import { execFile } from 'node:child_process';

const PORT = +(process.env.OWNER_PORT || 8150);
const STDB = (process.env.STDB_URL || 'http://127.0.0.1:3010').replace(/\/$/, '');
const TOKEN = process.env.STDB_TOKEN || '';

// one entry per game: its database, its private people table, its public counts, and its services
const GAMES = [
  { id: 'agp', name: 'Agent Grand Prix', site: 'https://agentgrandprix.com', people: 'player', where: 'screen', counts: 'lobby',
    services: ['agp-web', 'agp-accounts', 'agp-board', 'agp-live', 'agp-radio', 'agent-grand-prix'] },
  { id: 'palasora', name: 'Palasora', site: 'https://palasora.com', people: 'resident', where: 'district', counts: 'pulse',
    services: ['palasora-pb', 'palasora-api', 'palasora-worker', 'palasora-web'] },
];

async function sql(db, query) {
  const r = await fetch(`${STDB}/v1/database/${db}/sql`, {
    method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'text/plain' }, body: query,
  });
  if (!r.ok) throw new Error(`${db}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const out = await r.json();
  const t = Array.isArray(out) ? out[0] : out;
  const cols = (t?.schema?.elements || []).map((e) => e.name?.some ?? e.name);
  return (t?.rows || []).map((row) => Object.fromEntries(cols.map((c, i) => [c, plain(row[i])])));
}
// SpacetimeDB sends identities and times as small wrappers; the page wants plain values
function plain(v) {
  if (Array.isArray(v) && v.length === 1) return plain(v[0]);
  if (v && typeof v === 'object') {
    const k = Object.keys(v)[0];
    if (/micros_since_unix_epoch/.test(k || '')) return new Date(Number(v[k]) / 1000).toISOString();
    if (/identity/.test(k || '')) return String(v[k]);
  }
  return v;
}

const active = (unit) => new Promise((res) => execFile('systemctl', ['is-active', unit], (e, out) => res(String(out).trim() || 'unknown')));

async function game(g) {
  const out = { id: g.id, name: g.name, site: g.site, ok: true, online: [], total: 0, counts: null, services: {} };
  try {
    const people = await sql(g.id, `SELECT * FROM ${g.people}`);
    out.total = people.length;
    out.online = people.filter((p) => p.online).map((p) => ({ name: p.name || 'Guest', where: p[g.where] || '', since: p.last_seen || p.lastSeen || '' }));
    out.recent = people.filter((p) => !p.online).sort((a, b) => String(b.last_seen || '').localeCompare(String(a.last_seen || ''))).slice(0, 10)
      .map((p) => ({ name: p.name || 'Guest', where: p[g.where] || '', seen: p.last_seen || '' }));
    out.counts = (await sql(g.id, `SELECT * FROM ${g.counts}`))[0] || null;
  } catch (e) { out.ok = false; out.error = String(e.message || e); }
  for (const s of g.services) out.services[s] = await active(s);
  return out;
}

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Novenique owner</title><meta name="robots" content="noindex">
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#101828;--mute:#667085;--line:#e4e7ec;--ok:#12b76a;--bad:#f04438;--acc:#1570ef}
@media (prefers-color-scheme:dark){:root{--bg:#0b0f17;--card:#141a26;--ink:#eef2f6;--mute:#98a2b3;--line:#263042;--acc:#53b1fd}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 48px}h1{font-size:22px;margin:0 0 4px}p.sub{color:var(--mute);margin:0 0 20px}
.tabs{display:flex;gap:8px;margin:0 0 16px;flex-wrap:wrap}.tabs button{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:8px 14px;font:inherit;cursor:pointer}
.tabs button.on{background:var(--acc);border-color:var(--acc);color:#fff}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}
.card h2{font-size:17px;margin:0 0 2px}.card a{color:var(--acc);text-decoration:none;font-size:13px}
.stats{display:flex;gap:20px;margin:14px 0}.stat b{display:block;font-size:26px}.stat span{color:var(--mute);font-size:12px}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{text-align:left;padding:6px 4px;border-top:1px solid var(--line)}th{color:var(--mute);font-weight:500}
.svc{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.svc span{font-size:12px;border-radius:6px;padding:3px 8px;border:1px solid var(--line)}
.svc .active{color:var(--ok)}.svc span:not(.active){color:var(--bad)}.err{color:var(--bad);font-size:13px}.empty{color:var(--mute);font-size:13px}
</style></head><body><main><h1>Your games</h1><p class="sub">Live from each game's own database. Refreshes every 15 seconds.</p>
<div class="tabs" id="tabs"></div><div id="out" class="grid"></div></main>
<script>
let data = [], tab = 'all';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ago = (t) => { if (!t) return ''; const s = (Date.now() - Date.parse(t)) / 1000; return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
function card(g) {
  const c = g.counts || {};
  return '<section class="card"><h2>' + esc(g.name) + '</h2><a href="' + esc(g.site) + '" target="_blank" rel="noopener">' + esc(g.site.replace('https://', '')) + '</a>' +
    (g.ok ? '<div class="stats"><div class="stat"><b>' + g.online.length + '</b><span>online now</span></div>' +
      (c.racing != null ? '<div class="stat"><b>' + c.racing + '</b><span>racing</span></div>' : '') +
      '<div class="stat"><b>' + g.total + '</b><span>ever connected</span></div></div>' +
      (g.online.length ? '<table><tr><th>Online</th><th>Where</th></tr>' + g.online.map((p) => '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.where) + '</td></tr>').join('') + '</table>' : '<p class="empty">Nobody online right now.</p>') +
      (g.recent && g.recent.length ? '<table><tr><th>Recently</th><th>Last seen</th></tr>' + g.recent.map((p) => '<tr><td>' + esc(p.name) + '</td><td>' + ago(p.seen) + '</td></tr>').join('') + '</table>' : '')
      : '<p class="err">Database not answering: ' + esc(g.error) + '</p>') +
    '<div class="svc">' + Object.entries(g.services).map(([k, v]) => '<span class="' + esc(v) + '">' + esc(k) + ' · ' + esc(v) + '</span>').join('') + '</div></section>';
}
function draw() {
  document.getElementById('tabs').innerHTML = [['all', 'All games'], ...data.map((g) => [g.id, g.name])].map(([k, n]) => '<button data-k="' + k + '" class="' + (k === tab ? 'on' : '') + '">' + esc(n) + '</button>').join('');
  document.getElementById('out').innerHTML = data.filter((g) => tab === 'all' || g.id === tab).map(card).join('');
}
document.getElementById('tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.k; draw(); } };
async function load() { try { data = await (await fetch('api/summary')).json(); draw(); } catch (e) { document.getElementById('out').innerHTML = '<p class="err">Could not reach the server.</p>'; } }
load(); setInterval(load, 15000);
</script></body></html>`;

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/summary') {
    const body = JSON.stringify(await Promise.all(GAMES.map(game)));
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end(body);
  }
  if (url.pathname === '/health') { res.writeHead(200); return res.end(TOKEN ? 'ok' : 'no owner login'); }
  if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(page); }
  res.writeHead(404); res.end();
}).listen(PORT, '127.0.0.1', () => console.log(`owner screen on 127.0.0.1:${PORT}`));
