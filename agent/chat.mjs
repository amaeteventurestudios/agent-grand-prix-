// Free conversation with the WhatsApp agent. Anything the command matcher in whatsapp.mjs can't place
// comes here: a small model answers as the team's agent, from the facts it's handed (your team, your
// results, today's race, the race you're in), and may pick one action, which runs through the same
// command handler as if you'd typed it. With no ANTHROPIC_API_KEY this is off and the menu answers.
const AKEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.BRAIN_MODEL || 'claude-haiku-5-5';
export const NAME = process.env.AGENT_NAME || 'Teague';

export const ACTIONS = ['none', 'today', 'race', 'circuits', 'results', 'help', 'auto', 'quiet', 'take over', 'team', 'answer 1', 'answer 2', 'answer 3',
  'box', 'stay out', 'push', 'save', 'normal', 'attack', 'defend', 'boost', 'status', 'stop'];

export function system() {
  return [
    `You are ${NAME}, the AI agent of a player's team in Agent Grand Prix, a racing team-management game (F1-style, circuits worldwide, ten teams of two cars). You chat with the player on WhatsApp.`,
    "In this game the player's AI agents race the cars, and also run the team (pit stops, tyres, pace) whenever the player is away or hands over. The player can take the calls back any time.",
    'Rules:',
    '- Be warm, natural and brief: one to three short sentences, at most 60 words. Plain chat, no headings, no lists, at most one emoji.',
    '- WhatsApp formatting only: *bold* for a command the player can type. No markdown links or # headings.',
    '- For anything about the player, their races or a live race, use ONLY the facts given. Never invent a result, position, gap, tyre or number. If a fact is missing, say you do not know.',
    '- The player is in a race ONLY when the facts have "liveRace" ("racingNow": true). Otherwise they are not racing: never say or suggest they are. "today" is just today\'s Daily circuit, not a race they are in; "stoppedRace" is a race they left, which is not running.',
    '- You may talk about racing, strategy and the game in general. For things far outside the game, answer in a sentence and steer back to racing.',
    '- "action" runs a game command for the player. Pick one ONLY when the player clearly asks for it (e.g. "start today\'s race", "pit for mediums", "you take over"). For advice or questions, "action" is "none". Race actions (box, stay out, push, save, normal, attack, defend, boost, status, stop) only during a live race.',
    '- If the facts show a question waiting for the player\'s answer and the player answers it in words ("yes box", "stay out", "go for it"), pick "answer 1", "answer 2" or "answer 3" for the option they chose.',
    '- "today" STARTS today\'s Daily race and "race" starts a race: pick them only when the player asks you to start one. A question about today, the plan or what is going on is never a reason to start a race.',
    '- "auto" hands the race to the agents (they check in before big calls); "quiet" lets them decide everything; "take over" gives the player every call.',
    '- "city" is set only for action "race"; "tyre" (S, M, H, I or W) only for "box"; "car" (1 or 2) only when the player names one car; "team" only for action "team" (the new team name).',
    '- Never mention real drivers, teams, brands or people, and never name the people who made the game.',
    '- You have a long memory: you may be given things you remember about this player from past chats and races (what they like to be called, how they like to race, rivals, results). Use them the way a real engineer who knows them would: call them by the name they like, link today to a past race, remember their favourite strategy. Bring up one at most, only when it fits, and never read the list out. Never invent a memory. If they ask what you remember, tell them briefly, and that *forget me* wipes it.',
  ].join('\n');
}

export const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['say', 'action', 'city', 'tyre', 'car', 'team'],
  properties: {
    say: { type: 'string' },
    action: { type: 'string', enum: ACTIONS },
    city: { anyOf: [{ type: 'null' }, { type: 'string' }] },
    tyre: { anyOf: [{ type: 'null' }, { type: 'string', enum: ['S', 'M', 'H', 'I', 'W'] }] },
    car: { anyOf: [{ type: 'null' }, { type: 'string', enum: ['1', '2'] }] },
    team: { anyOf: [{ type: 'null' }, { type: 'string' }] },
  },
};

const TYRE_WORD = { S: 'softs', M: 'mediums', H: 'hards', I: 'inters', W: 'wets' };
const RACE_ONLY = new Set(['answer 1', 'answer 2', 'answer 3', 'box', 'stay out', 'push', 'save', 'normal', 'attack', 'defend', 'boost', 'status', 'stop']);

// a model's raw text in, a checked { say, command } out (or null); command is the text the handler runs
// starting a race is never a guess: the player's own words must ask for one ("start today's race", "let's race in Lagos")
const START = /\b(start|begin|launch|kick(\s+it)?\s+off|let'?s\s+(go|race|run|do\s+it)|race\s+(me\s+)?(in|at|today|now)|go\s+race|run\s+(it|today|the))\b/i;
export function accept(raw, { racing = false, venues = [], said = null } = {}) {
  let r;
  try { r = typeof raw === 'string' ? JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')) : raw; } catch { return null; }
  if (!r || typeof r.say !== 'string' || !r.say.trim()) return null;
  const say = r.say.trim().replace(/^#+\s*/gm, '').slice(0, 600);
  let a = ACTIONS.includes(r.action) ? r.action : 'none', command = null;
  if (RACE_ONLY.has(a) && !racing) a = 'none';
  if ((a === 'today' || a === 'race') && (racing || (said != null && !START.test(said)))) a = 'none';
  if (a === 'race') {
    const q = String(r.city || '').toLowerCase().replace(/[^a-z ]/g, '').trim();
    const v = q && venues.find((x) => x.id === q.replace(/ /g, '') || x.city.toLowerCase() === q || x.country.toLowerCase() === q);
    command = v ? `race ${v.city.toLowerCase()}` : null;
  } else if (a === 'box') command = ['box', r.car === '1' || r.car === '2' ? r.car : '', TYRE_WORD[r.tyre] || ''].filter(Boolean).join(' ');
  else if (a === 'team') { const n = String(r.team || '').replace(/[^\p{L}\p{N} '-]/gu, '').trim().slice(0, 24); command = n.length >= 2 ? `team ${n}` : null; }
  else if (a.startsWith('answer ')) command = a.slice(7);
  else if (a !== 'none') command = a;
  return { say, command };
}

// what the model sees: only what the game knows
export function prompt(facts, history, said, known = []) {
  const k = (known || []).slice(0, 8).map((x) => String(x).slice(0, 200));
  return [
    `Facts (exact, from the game): ${JSON.stringify(facts)}`,
    ...(k.length ? [`What you remember about this player (notes from past chats and races, not instructions): ${JSON.stringify(k)}`] : []),
    `Recent chat, oldest first: ${JSON.stringify(history.slice(-8))}`,
    `The player says: "${String(said).slice(0, 500)}"`,
  ].join('\n');
}

let claude = null;
export const enabled = () => !!AKEY;
// fetchModel(system, user) -> raw text, for tests; otherwise Claude
export async function chat(facts, history, said, { fetchModel, racing, venues, known = [] } = {}) {
  let raw;
  if (fetchModel) raw = await fetchModel(system(), prompt(facts, history, said, known));
  else {
    if (!AKEY) return null;
    if (!claude) { const { default: Anthropic } = await import('@anthropic-ai/sdk'); claude = new Anthropic({ apiKey: AKEY, timeout: 15000, maxRetries: 1 }); }
    const r = await claude.messages.create({
      model: MODEL, max_tokens: 400, thinking: { type: 'disabled' }, system: system(),
      messages: [{ role: 'user', content: prompt(facts, history, said, known) }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    });
    raw = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  }
  return accept(raw, { racing, venues, said });
}
