// Team radio interpreter: the optional second opinion for what the game's own matcher can't place.
// The browser sends the words it heard; this asks Jev (TypeSafe's classifier) three typed questions
// (which call, which car, which tyre) and answers with the same calls the buttons make. Anything Jev
// isn't sure of comes back as a question for the player, never a guess. The key stays on the server
// (TYPESAFE_API_KEY); with no key the service still answers /health with { interpreter: false }.
// No packages: Node 18+.
import http from 'node:http';

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

// ---- the service ----
const hits = new Map(); // ip -> [times]: 20 calls a minute each, plenty for one race
const limited = (ip) => {
  const now = Date.now(), h = (hits.get(ip) || []).filter((x) => now - x < 60000);
  h.push(now); hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.length > 20;
};
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
const clean = (s, n) => String(s ?? '').replace(/[^\p{L}\p{N} .,'?!-]/gu, '').slice(0, n);

export function serve(port = PORT) {
  return http.createServer((req, res) => {
    if (req.url === '/api/radio/health') return send(res, 200, { interpreter: !!KEY });
    if (req.url !== '/api/radio/interpret' || req.method !== 'POST') return send(res, 404, {});
    if (!KEY) return send(res, 503, { error: 'off' });
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',').pop().trim();
    if (limited(ip)) return send(res, 429, { error: 'slow down' });
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 4000) req.destroy(); });
    req.on('end', async () => {
      try {
        const j = JSON.parse(body);
        const cars = (Array.isArray(j.cars) ? j.cars : []).filter((c) => c.id === 'you-0' || c.id === 'you-1').map((c) => ({ id: c.id, name: clean(c.name, 30), code: clean(c.code, 4) }));
        const text = clean(j.text, 200), sel = j.sel === 'you-1' ? 'you-1' : 'you-0';
        if (!text.trim() || cars.length !== 2) return send(res, 400, {});
        send(res, 200, await interpret(text, cars, sel));
      } catch (e) { send(res, 502, { error: String(e.message || e).slice(0, 80) }); }
    });
  }).listen(port, '127.0.0.1');
}

if (import.meta.url === `file://${process.argv[1]}`) { serve(); console.log(`team radio on 127.0.0.1:${PORT}, interpreter ${KEY ? 'on' : 'off (no TYPESAFE_API_KEY)'}`); }
