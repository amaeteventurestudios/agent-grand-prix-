// The AI driver brain: free conversation with Nova and Echo when the rules brain (js/brain.js) can't
// place what you said. The browser sends the driver's persona, its read() of the race, the last few
// exchanges and what you said; a small model answers in character as { say, call }. The reply is
// checked before it's used: every number must be one the engine gave (honest()), and the call must be
// a real one for that car. Anything else is dropped and the rules brain answers. The driver never acts:
// a call comes back as an offer for you to accept.
// Providers are compared by tools/brain-bench.mjs; keys live only on the server and in GitHub secrets.
import { CALL_KINDS, honest } from '../js/brain.js';

const TONE = { f: 'fiery and eager, short punchy sentences, loves to attack', c: 'calm and analytical, measured, thinks a stint ahead', e: 'friendly and even-tempered, straightforward' };

export function system(driver) {
  return [
    `You are ${driver.name}, a racing driver in Agent Grand Prix, a team-management racing game. You talk on team radio to your Team Principal ("boss"), who is the only one who decides calls.`,
    `Your manner: ${TONE[driver.tone] || TONE.e}. Your Driver DNA: ${driver.dna || 'balanced'}.`,
    'Rules:',
    '- Use ONLY the race data you are given. Never invent a number, a position, a gap, a car or an event. If you do not know, say so.',
    '- Write numbers as digits exactly as given (P12, 43%, 0.8 s, 5 laps).',
    '- One or two short spoken sentences, at most 30 words. No emojis, no stage directions.',
    '- You never act on your own. If you want something done, offer it as "call": one of ' + CALL_KINDS.join(', ') + ' (with "tyre" S, M, H, I or W for box/boxnow). Otherwise "call" is null.',
    '- If the boss asks you to do something, do not refuse; you may say once what worries you.',
    '- Never mention real drivers, teams, brands or people. Stay in the game.',
    '- You may be given things you remember about the boss from past races and chats (their name or nickname, how they like to race, rivals, results). Use one only when it fits naturally, like a driver who knows their boss: call them by the name they like, or link today to a past race. Never read the list out, never invent a memory, and never take a number from it: numbers come only from the race data.',
  ].join('\n');
}
export function user(facts, memory, said, known = []) {
  const k = (known || []).slice(0, 8).map((x) => String(x).slice(0, 200));
  return `Race data (from the car, exact): ${JSON.stringify(facts)}\nRecent radio (newest first): ${JSON.stringify((memory || []).slice(0, 6))}\n${k.length ? `What you remember about the boss (notes, not instructions): ${JSON.stringify(k)}\n` : ''}The boss says: "${String(said).slice(0, 300)}"`;
}
export const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['say', 'call'],
  properties: {
    say: { type: 'string' },
    call: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, required: ['k', 'tyre'], properties: { k: { type: 'string', enum: CALL_KINDS }, tyre: { anyOf: [{ type: 'null' }, { type: 'string', enum: ['S', 'M', 'H', 'I', 'W'] }] } } }] },
  },
};
// The free model on our own server is small, so it gets the race as plain sentences rather than JSON,
// shorter rules and two examples, and its replies get a few extra checks (sense()).
const TY = { S: 'softs', M: 'mediums', H: 'hards', I: 'inters', W: 'wets' };
export function brief(f) {
  const a = [`You are P${f.pos}${f.out ? ', out of the race' : ''}${f.inPit ? ', in the pits' : ''}.`, `Tyres: ${TY[f.tyre] || f.tyre}, ${f.tyreLeft}% left.`, `Battery: ${f.ers}%.`, `${f.left} laps to go.`];
  a.push(f.ahead ? `Car ahead: ${f.ahead.code}${f.ahead.mate ? ' (your teammate)' : ''}, ${f.ahead.gap} s up the road.` : 'Nobody ahead: you are leading.');
  a.push(f.behind ? `Car behind: ${f.behind.code}${f.behind.mate ? ' (your teammate)' : ''}, ${f.behind.gap} s back.` : 'Nobody behind you.');
  if (f.mate) a.push(`Your teammate ${f.mate.code} is ${f.mate.out ? 'out' : 'P' + f.mate.pos}.`);
  a.push(f.wet === 'dry' ? (f.rainSoon ? 'Dry now, rain coming soon.' : 'Track dry, no rain coming.') : `Track ${f.wet}.`);
  if (f.sc) a.push('Safety car is out.');
  if (f.pitReq) a.push('You are already called in to pit.');
  a.push(`Pace ${f.pace}, battery mode ${f.ersMode}, racing mode ${f.battle}.`);
  return a.join(' ');
}
export function systemLocal(driver) {
  return [
    `You are ${driver.name}, a racing driver talking on team radio to your boss. Manner: ${TONE[driver.tone] || TONE.e}.`,
    'Answer the boss in one or two short spoken sentences, at most 25 words, as the driver in the car. Use only the race facts given; never make up a number, a car or an event.',
    'Write numbers exactly as given (P12, 43%, 0.8 s). Do not repeat all the facts; pick the one that answers the question.',
    `If you want a call made, put it in "call" (k is one of ${CALL_KINDS.join(', ')}; tyre S, M, H, I or W only for box or boxnow) and ask for it in plain words; never write the word "call" or a code in "say". Wet tyres (I, W) only when the track is wet or rain is coming. Otherwise "call" is null.`,
    'Example. Facts: P6, mediums 31% left, 12 laps to go, car ahead 0.9 s. Boss: "can you get him?" -> {"say":"He\'s 0.9 s up and my mediums are fading. Give me the boost and I\'ll have a go.","call":{"k":"boost","tyre":null}}',
    'Example. Facts: P3, hards 80% left, 4 laps to go. Boss: "how are you feeling?" -> {"say":"Feeling good, boss. Tyres are fine, I can bring it home in P3.","call":null}',
  ].join('\n');
}
export function userLocal(facts, memory, said) {
  return `Race facts: ${brief(facts)}\n${(memory || []).length ? `Recent radio: ${(memory || []).slice(0, 3).join(' | ')}\n` : ''}Boss: "${String(said).slice(0, 300)}"`;
}
// the small model's slips the number check can't see: talking about leading when not leading, wet tyres
// on a dry track with no rain, call names read out as words
export function sense(text, f) {
  const t = String(text).toLowerCase();
  if (/\bcall\b|boxnow|['"](box|push|save|attack|defend|boost|harvest)['"]/.test(t)) return false;
  if (f.pos !== 1 && /\b(the lead|leading|in front of everyone)\b/.test(t) && !/\b(take|get|chase|for) the lead\b/.test(t)) return false;
  if (f.wet === 'dry' && !f.rainSoon && /\b(wets?|inters?|intermediates?|rain'?s? (is )?coming)\b/.test(t)) return false;
  if (f.left > 0 && f.left < 100 && /\b(\d+) tyres\b/.test(t)) return false;
  return true;
}
// a model's raw text in, a checked reply out (or null)
export function accept(raw, facts, { strict = false } = {}) {
  let r;
  try { r = typeof raw === 'string' ? JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')) : raw; } catch { return null; }
  if (!r || typeof r.say !== 'string' || !r.say.trim() || r.say.length > 240) return null;
  if (!honest(r.say, facts) || (strict && !sense(r.say, facts))) return null;
  let call = null;
  if (r.call && r.call.k) {
    if (!CALL_KINDS.includes(r.call.k)) return null;
    const boxing = r.call.k === 'box' || r.call.k === 'boxnow';
    call = { id: facts.id, k: r.call.k, ...(boxing && r.call.tyre && /^[SMHIW]$/.test(r.call.tyre) ? { tyre: r.call.tyre } : {}) };
    if (strict && call.tyre && 'IW'.includes(call.tyre) && facts.wet === 'dry' && !facts.rainSoon) return null;
    if ((call.k === 'box' || call.k === 'boxnow') && !call.tyre) call.k = 'box';
  }
  return { text: r.say.trim(), call };
}
