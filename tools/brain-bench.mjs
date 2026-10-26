// Which model should power the drivers' AI brain? Asks every provider whose key is set the same
// free-form radio questions, in real race situations from the engine, and measures speed (time to the
// whole reply), reliability (errors and timeouts), honesty (valid JSON, real numbers only, real calls)
// and cost. Run it from Actions: "Driver brain benchmark" > Run workflow; the table lands in the run's
// summary. Keys (GitHub secrets, any subset): ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, GROQ_API_KEY.
import Anthropic from '@anthropic-ai/sdk';
import { appendFileSync } from 'node:fs';
import { VENUES } from '../js/data.js';
import { setupRace, DEFAULT_TEAM, raceLaps, trackFor } from '../js/game.js';
import { PRESETS } from '../js/dna.js';
import { persona, read } from '../js/brain.js';
import { system, user, SCHEMA, accept } from '../server/talk.mjs';

const TIMEOUT = 4000;
// price per 1M tokens, in and out (list prices, October 2026; check each provider's page before deciding)
const PROVIDERS = [
  { id: 'claude-haiku-5-5', key: 'ANTHROPIC_API_KEY', price: [0.10, 0.50], run: anthropic },
  { id: 'gemini-2.5-flash-lite', key: 'GEMINI_API_KEY', price: [0.10, 0.40], run: gemini },
  { id: 'gemini-3.1-flash-lite', key: 'GEMINI_API_KEY', price: [0.25, 1.50], run: gemini },
  { id: 'gpt-5-nano', key: 'OPENAI_API_KEY', price: [0.05, 0.40], run: openai },
  { id: 'llama-3.1-8b-instant', key: 'GROQ_API_KEY', price: [0.05, 0.08], run: groq },
];

let claude = null;
async function anthropic(model, sys, msg) {
  claude ||= new Anthropic({ timeout: TIMEOUT, maxRetries: 0 });
  const r = await claude.messages.create({
    model, max_tokens: 300, thinking: { type: 'disabled' }, system: sys,
    messages: [{ role: 'user', content: msg }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  });
  const text = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { text, inT: r.usage.input_tokens, outT: r.usage.output_tokens };
}
async function post(url, headers, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
  return res.json();
}
async function gemini(model, sys, msg) {
  const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { 'x-goog-api-key': process.env.GEMINI_API_KEY }, {
    systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts: [{ text: msg }] }],
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 300, thinkingConfig: { thinkingBudget: 0 } },
  });
  return { text: j.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '', inT: j.usageMetadata?.promptTokenCount || 0, outT: j.usageMetadata?.candidatesTokenCount || 0 };
}
async function openaiLike(url, key, model, sys, msg, extra = {}) {
  const j = await post(url, { authorization: 'Bearer ' + key }, { model, messages: [{ role: 'system', content: sys + '\nAnswer as JSON: {"say": string, "call": null | {"k": string, "tyre": string|null}}' }, { role: 'user', content: msg }], response_format: { type: 'json_object' }, ...extra });
  return { text: j.choices?.[0]?.message?.content || '', inT: j.usage?.prompt_tokens || 0, outT: j.usage?.completion_tokens || 0 };
}
function openai(model, sys, msg) { return openaiLike('https://api.openai.com/v1/chat/completions', process.env.OPENAI_API_KEY, model, sys, msg, { reasoning_effort: 'minimal', max_completion_tokens: 600 }); }
function groq(model, sys, msg) { return openaiLike('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, model, sys, msg, { max_tokens: 300 }); }

// real moments from real races: early, mid-stint, worn tyres, a wet race
const v = VENUES.find((x) => x.id === 'lagos') || VENUES[0];
const moments = [];
for (const [seed, steps] of [[91, 900], [91, 4000], [55, 7000], [202, 2500], [11, 9000], [77, 5500]]) {
  const R = setupRace({ venue: v, seed, team: JSON.parse(JSON.stringify(DEFAULT_TEAM)), startCompounds: { 'you-0': 'S', 'you-1': 'H' }, auto: false, car: 'peregrine', laps: raceLaps(trackFor(v), 'medium') }).make();
  R.start(); for (let i = 0; i < steps && !R.done; i++) R.step();
  for (const id of ['you-0', 'you-1']) { const c = R.byId.get(id); if (!c.dnf && !c.finished) moments.push(read(R, c)); }
}
const QUESTIONS = [
  'Talk me through that last lap, where are you losing time?', 'Do you reckon these tyres can make it to the end?',
  'Honestly, is the car good enough for points today?', 'What would you do if you were me right now?',
  'Your teammate is quicker than you. How do you feel about that?', 'Should we be worried about the car behind?',
];
const drivers = [
  { name: 'Nova', tone: persona(PRESETS[1].params).tone, dna: PRESETS[1].name + ': ' + PRESETS[1].blurb },
  { name: 'Echo', tone: persona(PRESETS[6].params).tone, dna: PRESETS[6].name + ': ' + PRESETS[6].blurb },
];

const pct = (a, p) => (a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN);
const rows = [], samples = [];
for (const P of PROVIDERS) {
  if (!process.env[P.key]) { rows.push(`| ${P.id} | no ${P.key} | | | | | |`); continue; }
  const ms = []; let ok = 0, err = 0, bad = 0, inT = 0, outT = 0, n = 0;
  for (const [mi, f] of moments.entries()) {
    const d = drivers[f.id === 'you-1' ? 1 : 0];
    for (const q of QUESTIONS.slice(0, 4).concat(QUESTIONS[(mi % 2) + 4])) {
      n++;
      const t = performance.now();
      try {
        const r = await P.run(P.id, system(d), user(f, [], q));
        ms.push(performance.now() - t); inT += r.inT; outT += r.outT;
        const a = accept(r.text, f);
        if (a) { ok++; if (samples.filter((s) => s.p === P.id).length < 4) samples.push({ p: P.id, q, a: a.text + (a.call ? ` [offer: ${a.call.k}${a.call.tyre ? ' ' + a.call.tyre : ''}]` : '') }); }
        else { bad++; if (bad <= 3) console.log(P.id, 'rejected:', r.text.slice(0, 200)); }
      } catch (e) { err++; if (err <= 3) console.log(P.id, 'error:', e.message.slice(0, 160)); }
    }
  }
  const cost = (inT / n * P.price[0] + outT / n * P.price[1]) / 1e6 * 1000;
  rows.push(`| ${P.id} | ${n} | ${Math.round(ok / n * 100)}% | ${Math.round(err / n * 100)}% | ${Math.round(pct(ms, 0.5))} / ${Math.round(pct(ms, 0.95))} | ${Math.round(inT / n)} / ${Math.round(outT / n)} | $${cost.toFixed(3)} |`);
}
const md = ['## Driver brain benchmark', '', `${moments.length} race moments, 5 questions each. Usable = valid JSON, only the engine's numbers, a real call. Time is the whole reply, from this runner.`, '',
  '| Model | Asked | Usable | Errors | ms p50 / p95 | Tokens in / out | $ per 1,000 replies |', '|---|---|---|---|---|---|---|', ...rows, '',
  '### Sample replies', '', ...samples.map((s) => `- **${s.p}** · _${s.q}_ → ${s.a}`)].join('\n');
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
