// Racing Academy: short lessons run on a real race, each step taught by the race engineer and
// finished by doing the thing (the same calls the buttons and the team radio make). Rules only, no
// AI model: the same actions always move a lesson on the same way. Plain data plus a small runner,
// so Node can test it; main.js draws the card, highlights the control and feeds in what happens.

// Each step: text (HTML, {A} and {B} are your drivers' names), say (engineer clips), hl (the control
// to point at), until (event => true moves on), after (seconds, moves on by itself), act (a button
// on the card that sends { type: 'next' }), go (something main.js does on entering: 'lights',
// 'cam:pit', 'tab:wall'), skip (env => true leaves the step out, e.g. no microphone).
const isCmd = (k, v) => (e) => e.type === 'cmd' && e.c[k] === v;

export const LESSONS = [
  {
    id: 'team', n: 1, title: 'Meet your team', mins: 3,
    goal: 'What a team principal does: two cars, their calls, the battery and a pit stop.',
    learn: ['You run two cars; tap one to give it calls', 'Push is faster but wears the tyres', 'BOOST spends the battery for 12 seconds of speed', 'Pick tyres, then BOX: the crew does the rest', 'You can say every call on the radio'],
    race: { venue: 'sakhir', laps: 5, stage: { grid: { 'you-0': 6, 'you-1': 9 }, showers: [], calm: true } },
    steps: [
      { id: 'hello', say: ['a1_hello'], act: 'Next', until: (e) => e.type === 'next',
        text: 'Welcome to the pit wall. I\'m your race engineer. Your two AI drivers drive the cars. <b>You are the team principal: you make the calls.</b>' },
      { id: 'two', say: ['a1_two'], hl: '[data-mine="you-1"]', go: 'tab:wall', until: (e) => e.type === 'select' && e.id === 'you-1',
        text: 'You run <b>two cars</b>: {A} and {B}. Tap <b>{B}</b> to follow your second car.' },
      { id: 'each', say: ['a1_each'], act: 'Lights out', until: (e) => e.type === 'next',
        text: 'Each car takes its own calls: whichever car you follow is the one you\'re talking to. Ready to race?' },
      { id: 'push', go: 'lights', say: ['a1_push'], hl: '[data-set="pace"][data-val="push"]', until: isCmd('pace', 'push'),
        text: 'We\'re racing. Tell your driver to go faster: tap <b>Push</b>.' },
      { id: 'tyres', say: ['a1_tyres'], hl: '#stats .c4:nth-child(4), #drivers .dc.on', after: 7, act: 'Got it', until: (e) => e.type === 'next',
        text: '<b>Push</b> is faster, but the tyres wear quicker. Keep an eye on <b>tyre life</b>. <b>Save tyres</b> does the opposite.' },
      { id: 'boost', say: ['a1_boost'], hl: '#boost', until: (e) => e.type === 'boost',
        text: 'Now the battery. Tap <b>BOOST</b> for 12 seconds of extra electric power.' },
      { id: 'boost2', say: ['a1_boost2'], after: 6, act: 'Got it', until: (e) => e.type === 'next',
        text: 'BOOST empties the battery. It fills up again as the car brakes for corners, like regen in an electric car.' },
      { id: 'box', say: ['a1_box'], hl: '[data-pick="S"]', go: 'tab:wall', until: (e) => e.type === 'cmd' && !!e.c.box,
        text: 'Time for a pit stop. Pick <b>Soft</b>, then tap <b>BOX</b>.' },
      { id: 'boxing', say: ['a1_boxing'], until: (e) => e.type === 'pitIn',
        text: 'Copied: your driver pits at the end of this lap. The pit entry is just before the start line.' },
      { id: 'stop', go: 'cam:pit', until: (e) => e.type === 'stopDone',
        text: 'Watch the crew. Your car drives down the fast lane to its own box. New tyres in about three seconds.' },
      { id: 'out', say: ['a1_stop'], go: 'cam:live', after: 5, act: 'Next', until: (e) => e.type === 'next',
        text: 'Fresh tyres, and back out on the fast lane. A whole stop costs about 10 seconds.' },
      { id: 'talk', say: ['a1_talk'], hl: '#talkBtn', skip: (env) => !env.mic, act: 'Skip', until: (e) => e.type === 'radio' || e.type === 'next',
        text: 'You can say every call. <b>Hold the mic</b> and say "<b>{A}, push</b>" or "<b>Box box</b>". Let go when you\'ve said it.' },
      { id: 'done', say: ['a1_done'], end: true,
        text: 'That\'s the job: pace, battery, tyres and pit stops, for two cars. <b>Lesson 1 complete.</b>' },
    ],
  },
  {
    id: 'drivers', n: 2, title: 'Command your drivers', mins: 4,
    goal: 'Attack, defend, and team orders between your two cars.',
    learn: ['Attack makes a driver go for gaps, and costs a little tyre', 'BOOST helps a pass when you are within a second', 'Defend makes your car about half as easy to pass', 'Hold positions stops your two cars fighting each other', 'Swap places lets a faster teammate through'],
    race: { venue: 'sakhir', laps: 5, stage: { grid: { 'you-0': 4, 'you-1': 5 }, showers: [], calm: true } },
    steps: [
      { id: 'hello', say: ['a2_hello'], act: 'Next', until: (e) => e.type === 'next',
        text: 'Your drivers race everyone, including each other. <b>You decide when they fight.</b> {A} starts 4th, {B} right behind in 5th.' },
      { id: 'attack', go: 'lights', say: ['a2_attack'], hl: '[data-set="battle"][data-val="attack"]', sel: 'you-0', until: isCmd('battle', 'attack'),
        text: 'Lights out. {A} has a car just ahead. Tap <b>Attack</b>: {A} will go for every gap.' },
      { id: 'attack2', say: ['a2_attack2'], hl: '#boost', after: 12, act: 'Got it', until: (e) => e.type === 'next' || e.type === 'boost',
        text: 'Attack makes a pass more likely, but wears the tyres a little faster and risks contact. Within a second of the car ahead? Add <b>BOOST</b>.' },
      { id: 'defend', say: ['a2_defend'], hl: '[data-set="battle"][data-val="defend"]', sel: 'you-1', until: isCmd('battle', 'defend'),
        text: 'Now {B}. Someone is close behind. Tap <b>Defend</b>.' },
      { id: 'defend2', say: ['a2_defend2'], after: 8, act: 'Got it', until: (e) => e.type === 'next',
        text: 'Defend covers the inside line, so {B} is about half as easy to pass. It costs a little time, so go back to <b>Neutral</b> when the fight is over.' },
      { id: 'hold', say: ['a2_hold'], hl: '[data-order="hold"]', until: (e) => e.type === 'order' && e.o === 'hold',
        text: 'Your own two cars can fight each other and lose time. Tap <b>Hold positions</b> to stop that.' },
      { id: 'swap', say: ['a2_swap'], act: 'Got it', until: (e) => e.type === 'next' || (e.type === 'order' && e.o === 'swap'),
        text: 'When the car behind is faster (fresher tyres, say), <b>Swap places</b> tells the one in front to let it by. It works when your cars run nose to tail.' },
      { id: 'talk', say: ['a2_talk'], hl: '#talkBtn', skip: (env) => !env.mic, act: 'Skip', until: (e) => e.type === 'radio' || e.type === 'next',
        text: 'All of these work on the radio: hold the mic and say "<b>{A}, attack</b>", "<b>defend</b>" or "<b>hold positions</b>".' },
      { id: 'done', say: ['a2_done'], end: true,
        text: 'Attack, defend, hold and swap: <b>Lesson 2 complete.</b>' },
    ],
  },
  {
    id: 'dna', n: 3, title: 'Master the circuit', mins: 4,
    goal: 'How Driver DNA changes what your drivers do on track.',
    learn: ['Driver DNA is how each driver drives: brakes, corners, passing, tyres', 'Late braking gains time but can lock the wheels', 'Tyre care makes a set last longer', 'You tune DNA between races, not during one', 'The Proving Ground tests a change over many races first'],
    race: { venue: 'sakhir', laps: 5, stage: { grid: { 'you-0': 7, 'you-1': 8 }, showers: [], calm: true }, dna: { car1: 'attacker', car2: 'whisperer' } },
    steps: [
      { id: 'hello', say: ['a3_hello'], act: 'Next', until: (e) => e.type === 'next',
        text: 'Every driver has a <b>Driver DNA</b>: how late they brake, how hard they take corners, how eager they are to pass, how kind they are to tyres. It changes what they do on track.' },
      { id: 'two', say: ['a3_two'], act: 'Lights out', until: (e) => e.type === 'next',
        text: 'For this lesson {A} is an <b>Attacker</b>: late on the brakes, into every gap. {B} is a <b>Tyre Whisperer</b>: gentle, and makes a set last.' },
      { id: 'watch', go: 'lights', say: ['a3_watch'], sel: 'you-0', after: 30, act: 'Got it', until: (e) => e.type === 'next' || (e.type === 'race' && e.ev.car === 'you-0' && (e.ev.kind === 'lockup' || e.ev.kind === 'wide' || e.ev.type === 'pass')),
        text: 'Watch {A}. Braking late gains time and wins fights, but now and then {A} locks the wheels or runs wide. The radio feed says when.' },
      { id: 'wear', say: ['a3_wear'], hl: '#stats .c4:nth-child(4), #drivers .dc.on', sel: 'you-1', after: 10, act: 'Got it', until: (e) => e.type === 'next',
        text: 'Now {B}. Compare the <b>tyre life</b>: {B}\'s tyres wear more slowly, so {B} can stay out longer or stop less.' },
      { id: 'circuit', say: ['a3_circuit'], after: 10, act: 'Next', until: (e) => e.type === 'next',
        text: 'Circuits reward different drivers. Long straights favour the brave passer; tight, twisty tracks punish mistakes; hot, rough tracks eat tyres.' },
      { id: 'tune', say: ['a3_tune'], act: 'Open Driver DNA', until: (e) => e.type === 'next',
        text: 'You set DNA between races in <b>Driver DNA</b>. Changes apply from the next race, and the <b>Proving Ground</b> tests a change over many races before you use it.' },
      { id: 'look', go: 'dna', act: 'Back to the race', until: (e) => e.type === 'next',
        text: 'These are your drivers\' own saved styles: the Attacker and the Tyre Whisperer were only lent for this lesson. Have a look round, then tap <b>Done</b>. Nothing you change here touches this race.' },
      { id: 'done', say: ['a3_done'], end: true,
        text: 'Your drivers\' DNA, tuned to the circuit: <b>Lesson 3 complete.</b>' },
    ],
  },
  {
    id: 'strategy', n: 4, title: 'Strategy', mins: 5,
    goal: 'Tyres, the two-compound rule, the safety car and rain.',
    learn: ['Soft is fastest and wears quickest; Hard lasts longest', 'In a dry race you must use two dry compounds, or take 20 seconds', 'A stop under the safety car costs about half', 'Damp track: Inters. Soaked: Wets', 'The weather chip warns you before the rain'],
    race: { venue: 'sakhir', laps: 8, stage: { grid: { 'you-0': 8, 'you-1': 11 }, showers: [], calm: true } },
    steps: [
      { id: 'hello', say: ['a4_hello'], act: 'Next', until: (e) => e.type === 'next',
        text: 'Races are won on strategy. <b>Soft</b> tyres are fastest and wear quickest, <b>Medium</b> is the all-rounder, <b>Hard</b> is slowest and lasts longest.' },
      { id: 'rule', say: ['a4_rule'], act: 'Lights out', until: (e) => e.type === 'next',
        text: 'In a dry race every car must use <b>two different dry compounds</b>, or take a 20-second penalty. So everyone stops at least once.' },
      { id: 'wait', go: 'lights', say: ['a4_wait'], after: 22, act: 'Next', until: (e) => e.type === 'next',
        text: 'A normal stop costs about 10 seconds. The trick is <b>when</b>. Watch for chances the race hands you.' },
      { id: 'sc', go: 'sc', say: ['a4_sc'], hl: '[data-pick="M"]', until: (e) => e.type === 'cmd' && !!e.c.box,
        text: '<b>Safety car!</b> The field slows down, so a stop now costs about half. Pick a different dry tyre (<b>Medium</b>), then <b>BOX</b>.' },
      { id: 'boxing', say: ['a4_boxing'], until: (e) => e.type === 'pitIn', act: 'Skip', 
        text: 'Boxing under the safety car: the cheapest stop of the race.' },
      { id: 'stop', go: 'cam:pit', until: (e) => e.type === 'stopDone',
        text: 'Watch the stop. The field is bunched up behind the safety car, so you drop places now, but every car ahead still has a full-price stop to make. And with a second compound fitted, the tyre rule is done.' },
      { id: 'radar', go: 'rain', say: ['a4_radar'], hl: '#hudWx', go2: 'cam:live', until: (e) => e.type === 'wet',
        text: 'Now look at the <b>weather chip</b> at the top. Rain is coming. On a wet track, slick tyres have no grip.' },
      { id: 'inters', say: ['a4_inters'], hl: '[data-pick="I"]', go: 'tab:wall', until: (e) => e.type === 'cmd' && (e.c.box === 'I' || e.c.box === 'W'),
        text: 'It\'s raining. Pick <b>Inter</b> (the green tyre for a damp track), then <b>BOX</b>. If it gets <b>soaked</b>, Wets (blue).' },
      { id: 'wetstop', until: (e) => e.type === 'stopDone', act: 'Skip',
        text: 'Inters on. When the rain stops and a dry line appears, the first car back on slicks gains the most.' },
      { id: 'done', say: ['a4_done'], end: true,
        text: 'Tyres, the two-compound rule, the safety car and the rain: <b>Lesson 4 complete.</b>' },
    ],
  },
  {
    id: 'gp', n: 5, title: 'Your first Grand Prix', mins: 6,
    goal: 'A full race with the coach beside you, then your summary and Academy badge.',
    learn: ['You ran a whole Grand Prix from the pit wall', 'Two cars, their pace, battery and battles', 'A pit stop at the right moment', 'Push to the flag on the last lap'],
    race: { venue: 'sakhir', coach: true },
    steps: [
      { id: 'hello', say: ['a5_hello'], act: 'Lights out', until: (e) => e.type === 'next',
        text: 'A full Grand Prix, no hand-holding. Your engineer\'s plan: {PLAN}. The <b>coach</b> will tip you off at the right moments. No championship points: just you and the race.' },
      { id: 'race', go: 'lights', say: ['a5_race'], act: 'Hide', until: (e) => e.type === 'pitIn' || e.type === 'next',
        text: 'Run your cars. Keep an eye on tyre life, and box when the pit window opens.' },
      { id: 'stint', until: (e) => e.type === 'lastlap', min: true,
        text: 'Racing. The last lap is when it all counts.' },
      { id: 'last', say: ['a5_last'], hl: '[data-set="pace"][data-val="push"]', after: 20, act: 'Got it', until: (e) => e.type === 'next' || isCmd('pace', 'push')(e),
        text: '<b>Last lap!</b> Tyre wear doesn\'t matter now. <b>Push</b> both cars.' },
      { id: 'flag', until: (e) => e.type === 'finish', min: true,
        text: 'Bring it home.' },
      { id: 'done', say: ['a5_done'], end: true,
        text: 'Chequered flag. <b>You ran a Grand Prix from the pit wall.</b>' },
    ],
  },
];

export const lessonById = (id) => LESSONS.find((l) => l.id === id);

export const fill = (text, names) => text.replace(/\{(A|B|PLAN)\}/g, (m, k) => names[k] ?? '');

// runs one lesson. env: { mic: boolean }. onStep(step, index, count) whenever the step changes.
export class Lesson {
  constructor(def, env = {}, onStep = () => {}) {
    this.def = def; this.onStep = onStep;
    this.steps = def.steps.filter((s) => !(s.skip && s.skip(env)));
    this.i = -1; this.t = 0; this.done = false; this.log = [];
  }
  get step() { return this.steps[this.i] || null; }
  start() { this.go(0); return this.step; }
  go(i) {
    this.i = i; this.t = 0;
    const s = this.step;
    if (s && s.end) this.done = true;
    this.onStep(s, i, this.steps.length);
  }
  // e: { type: 'next' | 'cmd' | 'select' | 'boost' | 'pitIn' | 'stopDone' | 'radio', ... }
  event(e) {
    const s = this.step;
    if (!s || this.done) return false;
    if (s.until && s.until(e)) { this.log.push({ step: s.id, by: e.type, at: this.t }); this.go(this.i + 1); return true; }
    return false;
  }
  // dt: real seconds; steps with `after` move on by themselves
  tick(dt) {
    const s = this.step;
    if (!s || this.done) return false;
    this.t += dt;
    if (s.after && this.t >= s.after) { this.log.push({ step: s.id, by: 'time', at: this.t }); this.go(this.i + 1); return true; }
    return false;
  }
}

// Progress lives in the game's saved data (S.academy) as plain JSON keyed by lesson id, so it can move
// to a Novenique account later as it is: { v: 1, lessons: { team: { done: true, at, secs, runs } } }.
export function progress(S) {
  S.academy ||= { v: 1, lessons: {} };
  return S.academy;
}
export function complete(S, id, secs) {
  const A = progress(S), l = (A.lessons[id] ||= { done: false, runs: 0 });
  l.runs++; l.at = new Date().toISOString();
  if (!l.done || secs < l.secs) l.secs = Math.round(secs);
  l.done = true;
  return l;
}
export const doneCount = (S) => LESSONS.filter((l) => progress(S).lessons[l.id]?.done).length;
