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
  ].join('\n');
}
export function user(facts, memory, said) {
  return `Race data (from the car, exact): ${JSON.stringify(facts)}\nRecent radio (newest first): ${JSON.stringify((memory || []).slice(0, 6))}\nThe boss says: "${String(said).slice(0, 300)}"`;
}
export const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['say', 'call'],
  properties: {
    say: { type: 'string' },
    call: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, required: ['k', 'tyre'], properties: { k: { type: 'string', enum: CALL_KINDS }, tyre: { anyOf: [{ type: 'null' }, { type: 'string', enum: ['S', 'M', 'H', 'I', 'W'] }] } } }] },
  },
};
// a model's raw text in, a checked reply out (or null)
export function accept(raw, facts) {
  let r;
  try { r = typeof raw === 'string' ? JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')) : raw; } catch { return null; }
  if (!r || typeof r.say !== 'string' || !r.say.trim() || r.say.length > 240) return null;
  if (!honest(r.say, facts)) return null;
  let call = null;
  if (r.call && r.call.k) {
    if (!CALL_KINDS.includes(r.call.k)) return null;
    call = { id: facts.id, k: r.call.k, ...(r.call.tyre && /^[SMHIW]$/.test(r.call.tyre) ? { tyre: r.call.tyre } : {}) };
    if ((call.k === 'box' || call.k === 'boxnow') && !call.tyre) call.k = 'box';
  }
  return { text: r.say.trim(), call };
}
