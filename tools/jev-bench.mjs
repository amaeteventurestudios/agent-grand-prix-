// Jev against the game's own matcher, on the same phrases. Needs TYPESAFE_API_KEY in the
// environment (run it from Actions: "Jev benchmark" > Run workflow). Prints, per phrase, what each
// one understood and how long it took, then the totals.
import { parseCall } from '../js/teamradio.js';
import { interpret } from '../server/radio.mjs';

const cars = [{ id: 'you-0', name: 'Nova', code: 'NOV' }, { id: 'you-1', name: 'Echo', code: 'ECH' }];
// [what was said, the call it should make: "car:call[:tyre]" or "clarify" or "none"]
const CASES = [
  ['Nova, push', 'you-0:push'], ['Echo, defend', 'you-1:defend'], ['Box box, Nova, hards', 'you-0:boxnow:H'],
  ['Both cars harvest', 'both:harvest'], ['Echo, stop fighting Nova', 'you-0:hold'], ['Nova, let Echo through', 'you-0:swap'],
  ['Cancel that pit stop', 'you-0:cancel'], ['Nova, use everything you have on the next straight', 'you-0:boost'],
  ['Echo mate, you need to get a move on, we are losing the podium', 'you-1:push'],
  ['Nova bring it in this lap and put the white ones on', 'you-0:box:H'],
  ['Echo, the guy behind is all over you, keep the door shut', 'you-1:defend'],
  ['Take it easy on the rubber Nova', 'you-0:save'], ['Nova get stuck into him', 'you-0:attack'],
  ['Echo, top up the battery for a bit', 'you-1:harvest'], ['Nova, the rain is coming, get the green tyres on', 'you-0:box:I'],
  ['Echo, I need you to be careful with those fronts, they have to last to the end', 'you-1:save'],
  ['Nova, we are going to bring you in at the end of this lap for a set of yellows', 'you-0:box:M'],
  ['Right Echo, stop messing about and get past the car in front', 'you-1:attack'],
  ['Nova, there is a lot of energy left, spend it now', 'you-0:boost'],
  ['Keep your positions boys, no silly stuff between you', 'you-0:hold'],
  ['Echo, the battery is nearly flat so lift a bit and let it fill', 'you-1:harvest'],
  ['What a lovely day', 'none'], ['Push and save', 'clarify'],
];
const fmt = (r) => !r ? 'none' : r.clarify ? 'clarify' : r.calls ? r.calls.map((c) => `${r.who === 'both' && c.k !== 'swap' && c.k !== 'hold' ? 'both' : c.id}:${c.k}${c.tyre ? ':' + c.tyre : ''}`).filter((x, i, a) => a.indexOf(x) === i).join(',') : r.ask ? 'ask' : 'other';
const same = (got, want) => got === want || (want.includes(':box') && got === want.replace(':box', ':boxnow')) || (want.includes(':boxnow') && got === want.replace(':boxnow', ':box'));
let jsOk = 0, jevOk = 0, rescued = 0; const ms = [];
for (const [text, want] of CASES) {
  const t = process.hrtime.bigint(); const a = fmt(parseCall(text, cars, 'you-0')); const jsMs = Number(process.hrtime.bigint() - t) / 1e6;
  let b = 'error', jm = '-';
  try { const r = await interpret(text, cars, 'you-0'); b = fmt(r.calls || r.clarify ? r : null); jm = r.ms; ms.push(r.ms); } catch (e) { b = 'error ' + e.message; }
  const ja = same(a, want), jb = same(b, want); jsOk += ja; jevOk += jb; if (!ja && a === 'none' && jb) rescued++;
  console.log(`${ja ? '✓' : '✗'} game ${jsMs.toFixed(2).padStart(5)} ms  ${jb ? '✓' : '✗'} Jev ${String(jm).padStart(4)} ms  | ${text}  → want ${want}, game ${a}, Jev ${b}`);
}
ms.sort((x, y) => x - y);
console.log(`\nGame matcher: ${jsOk}/${CASES.length} right. Jev: ${jevOk}/${CASES.length} right, ${rescued} phrases the matcher missed and Jev got.`);
if (ms.length) console.log(`Jev time: median ${ms[ms.length >> 1]} ms, slowest ${ms[ms.length - 1]} ms (plus the trip from the player to our server).`);
