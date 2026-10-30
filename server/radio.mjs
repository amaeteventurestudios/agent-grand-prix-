// Team radio interpreter: the optional second opinion for what the game's own matcher can't place.
// The browser sends the words it heard; this asks Jev (TypeSafe's classifier) three typed questions
// (which call, which car, which tyre) and answers with the same calls the buttons make. Anything Jev
// isn't sure of comes back as a question for the player, never a guess. The key stays on the server
// (TYPESAFE_API_KEY); with no key the service still answers /health with { interpreter: false }.
// It also serves the drivers' AI brain at /api/radio/talk once ANTHROPIC_API_KEY is set (Anthropic's
// SDK, MIT, installed beside the app by install.sh). Node 18+.
import http from 'node:http';
import { open as openSession } from './accounts.mjs';

const KEY = process.env.TYPESAFE_API_KEY || '';
const PORT = +(process.env.RADIO_PORT || 8140);
const URL = 'https://api.typesafe.ai/v1/systemone';
const SURE = 0.7; // below this, ask back
const TIMEOUT = 1200; // ms; the browser gives up at 1500

export const ACTIONS = {
  box: 'Come into the pits for new tyres',
  cancel: 'Do not pit, stay out on track',
  push: 'Drive faster, push the pace',
  save: 'Slow down, look after the tyres',
  normal: 'Normal pace',
  attack: 'Try to overtake the car ahead',
  defend: 'Defend position from the car behind',
  boost: 'Use the battery for full electric power now',
  harvest: 'Recharge or save the battery',
  swap: 'The two team cars swap positions',
  hold: 'The two team cars hold positions, stop fighting each other',
  free: 'The two team cars may race each other',
  none: 'Not a race instruction, small talk or unclear',
};
const TYRES = { S: 'Soft tyres', M: 'Medium tyres', H: 'Hard tyres', I: 'Intermediate tyres', W: 'Full wet tyres', none: 'No tyre named' };

export function questions(cars) {
  const who = { both: 'Both cars or the whole team' };
  for (const c of cars) who[c.id] = `The driver ${c.name} (${c.code})`;
  who.none = 'No driver named';
  return {
    action: { type: 'choice', instructions: 'Which instruction the team principal gave', criteria: ACTIONS },
    driver: { type: 'choice', instructions: 'Which driver the instruction is for', criteria: who },
    tyre: { type: 'choice', instructions: 'Which tyre the driver should fit, if any', criteria: TYRES },
  };
}

// Jev's answers -> the game's calls. Pure, so it can be tested without a key.
export function toCalls(answers, cars, sel) {
  const a = answers.action || {}, d = answers.driver || {}, t = answers.tyre || {};
  if (!a.choice || a.choice === 'none') return {};
  if ((a.confidence ?? 0) < SURE) {
    const [x, y] = Object.entries(a.probabilities || {}).filter(([k]) => k !== 'none').sort((p, q) => q[1] - p[1]);
    return { clarify: x && y ? `${cap(x[0])} or ${y[0]}?` : 'Say that again?' };
  }
  const k = a.choice;
  if (k === 'swap' || k === 'hold' || k === 'free') return { calls: [{ id: sel, k }], who: 'both' };
  let ids = d.choice === 'both' ? cars.map((c) => c.id) : cars.some((c) => c.id === d.choice) ? [d.choice] : [sel];
  if (d.choice && d.choice !== 'none' && (d.confidence ?? 0) < SURE) return { clarify: `${cap(k)}: ${cars.map((c) => c.name).join(' or ')}?` };
  const tyre = k === 'box' && t.choice && t.choice !== 'none' && (t.confidence ?? 0) >= SURE ? t.choice : null;
  return { calls: ids.map((id) => ({ id, k, ...(tyre ? { tyre } : {}) })), who: ids.length > 1 ? 'both' : 'one' };
}
const cap = (k) => k[0].toUpperCase() + k.slice(1);

export async function interpret(text, cars, sel, { key = KEY, fetchImpl = fetch } = {}) {
  const t0 = Date.now();
  const res = await fetchImpl(URL, {
    method: 'POST', signal: AbortSignal.timeout(TIMEOUT),
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'jev-latest', state: `In a motor race, the team principal says on the radio to their drivers: "${text}"`, questions: questions(cars) }),
  });
  if (!res.ok) throw new Error('jev ' + res.status);
  const j = await res.json();
  return { ...toCalls(j.answers || {}, cars, sel), ms: Date.now() - t0, model: j.model };
}

// ---- the drivers' AI brain (server/talk.mjs): Claude answers in character, checked before use ----
const AKEY = process.env.ANTHROPIC_API_KEY || '';
const BRAIN = process.env.BRAIN_MODEL || 'claude-haiku-5-5';
let claude = null;
// the team's long-term memory (server/memory.mjs): a signed-in boss is remembered across races. Recall is local and
// fast; if it isn't back in 400 ms the driver answers without it. What was said is handed back to be remembered.
const MEMORY = (process.env.MEMORY_URL || 'http://127.0.0.1:8144').replace(/\/$/, '');
const memo = (route, b, ms) => fetch(MEMORY + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b), signal: AbortSignal.timeout(ms) }).then((r) => (r.ok ? r.json() : null));
export async function recall(uid, q) {
  if (!uid) return [];
  try { return ((await memo('/memory/recall', { uid, q, k: 5 }, 400)) || {}).items?.map((x) => x.text) || []; } catch { return []; }
}
export async function talk(j, { fetchModel, uid = null, known = null } = {}) {
  const { system, user, SCHEMA, accept } = await import('./talk.mjs');
  const facts = j.facts && typeof j.facts === 'object' ? j.facts : null;
  if (!facts || (facts.id !== 'you-0' && facts.id !== 'you-1')) return null;
  const driver = { name: clean(j.driver?.name, 30) || 'Driver', tone: ['f', 'c', 'e'].includes(j.driver?.tone) ? j.driver.tone : 'e', dna: clean(j.driver?.dna, 120) };
  const memory = (Array.isArray(j.memory) ? j.memory : []).slice(0, 6).map((m) => clean(m, 160));
  const t0 = Date.now();
  known ??= await recall(uid, clean(j.said, 300));
  let raw;
  if (fetchModel) raw = await fetchModel(system(driver), user(facts, memory, clean(j.said, 300), known));
  else {
    if (!claude) { const { default: Anthropic } = await import('@anthropic-ai/sdk'); claude = new Anthropic({ apiKey: AKEY, timeout: 2600, maxRetries: 0 }); }
    const r = await claude.messages.create({
      model: BRAIN, max_tokens: 300, thinking: { type: 'disabled' }, system: system(driver),
      messages: [{ role: 'user', content: user(facts, memory, clean(j.said, 300), known) }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    });
    raw = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  }
  const ok = accept(raw, facts);
  if (ok && uid) memo('/memory/talk', { uid, source: 'driver', turns: [{ role: 'user', content: `(to driver ${driver.name}) ${clean(j.said, 300)}` }, { role: 'assistant', content: ok.text }] }, 3000).catch(() => {});
  return ok ? { ...ok, ms: Date.now() - t0 } : null;
}

// ---- the service ----
const hits = new Map(); // ip -> [times]: 20 calls a minute each, plenty for one race
const limited = (ip) => {
  const now = Date.now(), h = (hits.get(ip) || []).filter((x) => now - x < 60000);
  h.push(now); hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.length > 20;
};
// the AI costs money, so it has a daily budget (the interpreter too: INTERPRET_DAY_LIMIT for everyone): each player (account, or address for guests) gets
// BRAIN_PLAYER_DAY chats with the drivers a day, everyone together BRAIN_DAY_LIMIT; past that the
// game's own rules brain answers (the page falls back to it on any refusal)
// Both default to 0: the owner pays for every AI call, so it stays off until a limit is set on the server.
const DAY = { perPlayer: +(process.env.BRAIN_PLAYER_DAY || 15), all: +(process.env.BRAIN_DAY_LIMIT || 0), interpret: +(process.env.INTERPRET_DAY_LIMIT || 0) };
let day = { d: '', n: 0, i: 0, by: new Map() };
const brainOn = () => !!AKEY && DAY.all > 0, interpOn = () => !!KEY && DAY.interpret > 0;
const overBudget = (who) => {
  const d = new Date().toISOString().slice(0, 10);
  if (day.d !== d) day = { d, n: 0, i: 0, by: new Map() };
  if (who === null) { if (day.i >= DAY.interpret) return true; day.i++; return false; }
  const k = day.by.get(who) || 0;
  if (k >= DAY.perPlayer || day.n >= DAY.all) return true;
  day.by.set(who, k + 1); day.n++; return false;
};
const vhits = new Map(); // the spoken replies: a sentence each, 40 a minute
const vlimited = (ip) => { const now = Date.now(), h = (vhits.get(ip) || []).filter((x) => now - x < 60000); h.push(now); vhits.set(ip, h); if (vhits.size > 5000) vhits.clear(); return h.length > 40; };
let voiceOn = false;
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
// who is talking: only a signed-in player (the game's session cookie, the same one the accounts service sets) has a memory
const signedIn = (req) => {
  const c = String(req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith('agp.sid='));
  const s = c && openSession(decodeURIComponent(c.slice(8)));
  return s && s.uid && /^[A-Za-z0-9_-]{1,64}$/.test(s.uid) ? s.uid : null;
};
const clean = (s, n) => String(s ?? '').replace(/[^\p{L}\p{N} .,'?!-]/gu, '').slice(0, n);

export function serve(port = PORT) {
  return http.createServer((req, res) => {
    if (req.url === '/api/radio/health') return send(res, 200, { interpreter: interpOn(), brain: brainOn(), voice: voiceOn });
    if (req.url === '/api/radio/voice' && req.method === 'POST') {
      if (!voiceOn) return send(res, 503, { error: 'off' });
      const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',').pop().trim();
      if (vlimited(ip)) return send(res, 429, { error: 'slow down' });
      let body = '';
      req.on('data', (d) => { body += d; if (body.length > 1000) req.destroy(); });
      req.on('end', async () => {
        try {
          const j = JSON.parse(body), { speak } = await import('./voice.mjs');
          const w = await speak(String(j.text || '').replace(/[^\p{L}\p{N} .,'?!%:-]/gu, '').slice(0, 240), String(j.voice || ''));
          if (!w) return send(res, 400, {});
          res.writeHead(200, { 'content-type': 'audio/wav', 'cache-control': 'no-store', 'content-length': w.length }); res.end(w);
        } catch (e) { send(res, 502, { error: String(e.message || e).slice(0, 80) }); }
      });
      return;
    }
    const isTalk = req.url === '/api/radio/talk';
    if ((req.url !== '/api/radio/interpret' && !isTalk) || req.method !== 'POST') return send(res, 404, {});
    if (!(isTalk ? brainOn() : interpOn())) return send(res, 503, { error: 'off' });
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',').pop().trim();
    if (limited(ip)) return send(res, 429, { error: 'slow down' });
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 8000) req.destroy(); });
    req.on('end', async () => {
      try {
        const j = JSON.parse(body);
        if (overBudget(isTalk ? signedIn(req) || ip : null)) return send(res, 429, { error: 'budget' });
        if (isTalk) { const r = await talk(j, { uid: signedIn(req) }); return send(res, r ? 200 : 422, r || { error: 'no usable reply' }); }
        const cars = (Array.isArray(j.cars) ? j.cars : []).filter((c) => c.id === 'you-0' || c.id === 'you-1').map((c) => ({ id: c.id, name: clean(c.name, 30), code: clean(c.code, 4) }));
        const text = clean(j.text, 200), sel = j.sel === 'you-1' ? 'you-1' : 'you-0';
        if (!text.trim() || cars.length !== 2) return send(res, 400, {});
        send(res, 200, await interpret(text, cars, sel));
      } catch (e) { send(res, 502, { error: String(e.message || e).slice(0, 80) }); }
    });
  }).listen(port, '127.0.0.1');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  serve();
  // the drivers' spoken replies switch on once the voice model has loaded (a one-time download)
  if (AKEY) import('./voice.mjs').then((v) => v.warm()).then(() => { voiceOn = true; console.log('driver voices ready'); })
    .catch((e) => console.log('driver voices off:', String(e.message || e).slice(0, 120)));
  console.log(`team radio on 127.0.0.1:${PORT}, interpreter ${KEY ? 'on' : 'off (no TYPESAFE_API_KEY)'}, driver brain ${AKEY ? 'on' : 'off (no ANTHROPIC_API_KEY)'}`);
}
