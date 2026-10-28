// Team radio: what the team principal says into the mic becomes the same calls the buttons make.
// parseCall() is plain text in, calls out (no browser APIs), so Node can test it; listen() wraps the
// browser's own speech recognition (free, no download) with push-to-talk.

import { SAY } from './radio-words.js';

// Other languages: plain letters (no accents, one Arabic alef), then each known phrase becomes the
// English call it means. setRadioLang() picks the language; English passes through untouched.
let SAID = null;
export function setRadioLang(l) {
  const list = Object.entries(SAY[l] || {}).flatMap(([en, ws]) => ws.map((w) => [plain(w).trim(), en]));
  SAID = list.length ? list.sort((a, b) => b[0].length - a[0].length) : null;
}
const plain = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f\u064b-\u0655]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[’']/g, '').replace(/[^\p{L}\p{N} ]+/gu, ' ');
function inEnglish(s) {
  if (!SAID) return s;
  let t = ' ' + plain(s).replace(/\s+/g, ' ').trim() + ' ';
  for (const [w, en] of SAID) t = t.split(' ' + w + ' ').join(' ' + en + ' ').split(' ' + w + ' ').join(' ' + en + ' ');
  return t.trim();
}

const WORDS = (s) => ' ' + inEnglish(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
const has = (t, list) => list.some((w) => t.includes(' ' + w + ' '));

const TYRES = [['S', ['soft', 'softs', 'reds', 'red']], ['M', ['medium', 'mediums', 'yellows', 'yellow', 'meds']],
  ['H', ['hard', 'hards', 'whites', 'white']], ['I', ['inter', 'inters', 'intermediate', 'intermediates', 'greens', 'green']],
  ['W', ['wet', 'wets', 'full wets', 'blues']]];

// Each rule: words that trigger it and the call it makes. Order matters: the first match wins, so the
// more specific phrases sit above the short ones ("stay out" before "out", "box now" before "box").
const RULES = [
  { k: 'cancel', w: ['stay out', 'dont box', 'do not box', 'cancel box', 'cancel the box', 'cancel that', 'cancel the pit stop', 'cancel that pit stop', 'cancel the stop', 'cancel pit', 'no box', 'abort'] },
  { k: 'boxnow', w: ['box now', 'box box', 'pit now', 'box this lap', 'i said box', 'just box', 'box it', 'pit pit'] },
  { k: 'box', w: ['box', 'pit', 'pits', 'pit stop', 'come in', 'stop for', 'tyres on', 'new tyres', 'fresh tyres'] },
  { k: 'swap', w: ['swap', 'swap places', 'let him through', 'let her through', 'let them through', 'let him by', 'let her by', 'let them by', 'let your teammate'] },
  { k: 'hold', w: ['hold position', 'hold positions', 'hold station', 'no fighting', 'dont fight', 'stop fighting', 'stop racing each other', 'stop racing his teammate', 'stop racing her teammate'] },
  { k: 'free', w: ['race freely', 'free to race', 'youre free', 'you are free', 'race each other'] },
  { k: 'boost', w: ['boost', 'overtake mode', 'full power', 'all the power', 'use the battery', 'deploy', 'use everything', 'everything you have', 'everything youve got'] },
  { k: 'harvest', w: ['harvest', 'charge', 'charge the battery', 'recharge', 'save battery', 'save the battery', 'save energy', 'conserve the battery', 'conserve battery', 'conserve energy', 'conserve the energy', 'save your battery', 'top up', 'top up the battery', 'fill the battery', 'charge up'] },
  { k: 'balanced', w: ['balanced', 'standard battery'] },
  { k: 'attack', w: ['attack', 'overtake', 'go for it', 'send it', 'pass him', 'pass her', 'pass them', 'get past', 'get him', 'get her', 'take him', 'take her', 'make the move', 'go for the gap', 'have a go', 'dive', 'get stuck in', 'get stuck into', 'hunt him down', 'hunt her down', 'chase him down', 'chase her down'] },
  { k: 'defend', w: ['defend', 'cover', 'cover the inside', 'hold him off', 'hold her off', 'keep him behind', 'keep her behind', 'dont let him', 'dont let her', 'shut the door', 'keep the door shut', 'close the door', 'stay ahead', 'all over you', 'protect'] },
  { k: 'neutral', w: ['neutral', 'no risks', 'stay calm', 'keep it clean'] },
  { k: 'save', w: ['save tyres', 'save the tyres', 'save your tyres', 'look after the tyres', 'tyre management', 'slow down', 'ease off', 'back off', 'take it easy', 'easy', 'calm down', 'bring it home', 'manage', 'lift and coast', 'conserve', 'cool the tyres', 'save'] },
  { k: 'push', w: ['push', 'push push', 'faster', 'go faster', 'speed up', 'flat out', 'give it everything', 'hammer time', 'quali mode', 'go go', 'full attack', 'pick it up', 'get a move on', 'move it', 'hurry', 'hurry up', 'step it up', 'find some time', 'more pace'] },
  { k: 'normal', w: ['normal', 'normal pace', 'normal mode', 'standard pace', 'back to normal'] },
];

const NUM = { one: 1, a: 1, two: 2, three: 3, four: 4, five: 5, couple: 2 };
const GROUP = { push: 'pace', save: 'pace', normal: 'pace', attack: 'battle', defend: 'battle', neutral: 'battle', boost: 'ers', harvest: 'ers', balanced: 'ers', box: 'box', boxnow: 'box', cancel: 'box' };

// text: what was heard; cars: your two cars as [{ id, name, code }]; sel: the car you're following.
// Returns null when nothing was understood, or one of:
//   { calls: [{ id, k, tyre?, after?: { laps }, until?: { gap } }], who: 'one' | 'both' }
//   { ask: 'best' | 'why', id }          a question for the strategist or a driver
//   { confirm: true }                    "do it" after the strategist's suggestion
//   { clarify: 'question to ask back' }  heard two calls that contradict each other
export function parseCall(text, cars, sel) {
  const t = WORDS(text);
  if (t.trim().length === 0) return null;
  let ids = [];
  const mentions = (c) => {
    const first = String(c.name || '').toLowerCase().split(/\s+/);
    return [...first.filter((w) => w.length > 1), String(c.code || '').toLowerCase()].some((w) => w && t.includes(' ' + w + ' '));
  };
  if (has(t, ['both', 'both cars', 'everyone', 'everybody', 'all cars', 'guys', 'boys', 'team'])) ids = cars.map((c) => c.id);
  else {
    ids = cars.filter(mentions).map((c) => c.id);
    if (!ids.length && has(t, ['car one', 'car 1', 'first car'])) ids = [cars[0].id];
    if (!ids.length && has(t, ['car two', 'car 2', 'second car'])) ids = [cars[1].id];
  }
  // "Tell Nova to let Echo through": the first name said is the one being spoken to
  if (ids.length > 1 && !has(t, ['both', 'both cars', 'everyone', 'everybody', 'all cars', 'guys', 'boys', 'team'])) {
    const at = (c) => Math.min(...[...String(c.name || '').toLowerCase().split(/\s+/), String(c.code || '').toLowerCase()].filter(Boolean).map((w) => { const i = t.indexOf(' ' + w + ' '); return i < 0 ? 1e9 : i; }));
    ids = [cars.filter(mentions).sort((a, b) => at(a) - at(b))[0].id];
    if (has(t, ['both', 'and'])) ids = cars.filter(mentions).map((c) => c.id);
  }
  const one = ids.length === 1 ? ids[0] : sel;
  if (!ids.length) ids = [sel];

  // questions for the strategist (or engineer) and the drivers
  const question = /^ (what|whats|why|how|hows|where|wheres|is|are|any|should|can|do we|talk to me)\b/.test(t) || has(t, ['strategist', 'engineer', 'best option', 'what do you think', 'what should we do', 'options', 'whats wrong', 'losing time', 'why are you', 'how are the tyres', 'how are your tyres', 'status', 'talk to me']);
  if (question) {
    if (has(t, ['why', 'whats wrong', 'losing time', 'so slow', 'how are the tyres', 'how are your tyres', 'how is the car', 'hows the car', 'status', 'talk to me', 'how are you'])) return { ask: 'why', id: one };
    if (has(t, ['strategist', 'engineer', 'best option', 'what do you think', 'what should', 'options', 'should we', 'plan', 'strategy'])) return { ask: 'best', id: one };
  }
  if (/^ (do it|yes|yeah|yep|go ahead|make the call|make it|lets do it|agreed|affirmative|copy that|do that)\b/.test(t)) return { confirm: true };

  // "let Echo through", "let your teammate by"
  if (/ let (\w+ ){1,2}(through|by|past|pass) /.test(t)) return { calls: [{ id: sel, k: 'swap' }], who: 'both' };
  const hit = RULES.filter((r) => has(t, r.w));
  // "bring Nova in", "call him in"
  if (/ (bring|call|get) (\w+ ){1,2}in /.test(t) && !hit.some((r) => r.k === 'box' || r.k === 'boxnow' || r.k === 'cancel')) hit.push(RULES.find((r) => r.k === 'box'));
  if (!hit.length) return null;
  let rule = hit[0];
  const tyre = (TYRES.find(([, w]) => has(t, w)) || [])[0];
  // team orders act on the pair, not on one car
  if (rule.k === 'swap' || rule.k === 'hold' || rule.k === 'free') return { calls: [{ id: sel, k: rule.k }], who: 'both' };

  // "save the tyres for two laps, then push"
  const then = t.indexOf(' then ');
  if (then > 0) {
    const a = parseCall(t.slice(0, then), cars, sel), b = parseCall(t.slice(then + 5), cars, sel);
    const m = t.match(/ (\d+|one|a|two|three|four|five|couple)( of)? laps? /);
    const laps = m ? (NUM[m[1]] || +m[1]) : 1;
    if (a && a.calls && b && b.calls) {
      return { calls: [...a.calls.map((c) => ({ ...c, id: ids.length === 1 ? ids[0] : c.id })), ...b.calls.map((c) => ({ ...c, id: ids.length === 1 ? ids[0] : c.id, after: { laps } }))], who: ids.length > 1 ? 'both' : 'one' };
    }
  }
  // two calls that fight each other ("push and save") need a question back, never a guess
  const clash = hit.find((r) => r !== rule && GROUP[r.k] && GROUP[r.k] === GROUP[rule.k] && !(rule.k === 'boxnow' && r.k === 'box') && !(rule.k === 'cancel' && r.k === 'box'));
  if (clash) return { clarify: `${cap(rule.k)} or ${clash.k}?` };
  // "conserve the battery until we're closer to the car ahead"
  const until = rule.k === 'harvest' && has(t, ['until', 'till', 'til']) && has(t, ['closer', 'close', 'ahead', 'catch', 'within']) ? { gap: 1.0 } : null;
  return { calls: ids.map((id) => ({ id, k: rule.k, ...(tyre ? { tyre } : {}), ...(until ? { until } : {}) })), who: ids.length > 1 ? 'both' : 'one' };
}
const cap = (k) => ({ boxnow: 'Box', box: 'Box', cancel: 'Stay out' }[k] || k[0].toUpperCase() + k.slice(1));

// Hands-free: the mic stays open, and only what follows the wake word is a call, so the game's own
// sound and a conversation in the room are never taken for one. "Radio, box box", "Radio. Nova, push".
// Returns the words after the wake word ('' when it was said alone), or null when it wasn't said.
const WAKE = /^\s*(?:(?:hey|ok|okay|oi|and)\s+)?(?:team\s+)?(?:radio|radios|raydio)\b[\s,.!:;-]*/i;
export function wakeSplit(text) {
  if (SAID) text = inEnglish(text);
  const m = String(text || '').match(WAKE);
  return m ? text.slice(m[0].length).trim() : null;
}

// The browser's speech recognition, push-to-talk. onWords gets every partial result while you talk,
// so a call can land before you let go; onEnd fires when the mic closes.
export const radioSupported = () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

export function listen({ onStart, onWords, onEnd, onError, lang }) {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new R();
  rec.lang = lang || 'en-GB';
  rec.interimResults = true;
  rec.continuous = true;
  rec.maxAlternatives = 3;
  rec.onresult = (e) => {
    let text = '', final = true;
    const alts = [];
    for (let i = e.resultIndex; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      if (!e.results[i].isFinal) final = false;
      for (let a = 1; a < e.results[i].length; a++) alts.push(e.results[i][a].transcript);
    }
    onWords(text, final, alts);
  };
  rec.onaudiostart = () => onStart && onStart();
  rec.onerror = (e) => onError && onError(e.error);
  let ended = false;
  const end = () => { if (!ended) { ended = true; onEnd && onEnd(); } };
  rec.onend = end;
  rec.start();
  return { stop: () => { try { rec.stop(); } catch { /* already stopped */ } }, abort: () => { try { rec.abort(); } catch { /* already stopped */ } }, end };
}
