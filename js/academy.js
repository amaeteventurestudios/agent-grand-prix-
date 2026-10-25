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
        text: 'You run <b>two cars</b>: {A} and {B}. Tap <b>{B}</b> on the pit wall to follow your second car.' },
      { id: 'each', say: ['a1_each'], act: 'Lights out', until: (e) => e.type === 'next',
        text: 'Each car takes its own calls: whichever car you follow is the one you\'re talking to. Ready to race?' },
      { id: 'push', go: 'lights', say: ['a1_push'], hl: '[data-set="pace"][data-val="push"]', until: isCmd('pace', 'push'),
        text: 'We\'re racing. Tell your driver to go faster: tap <b>Push</b>.' },
      { id: 'tyres', say: ['a1_tyres'], hl: '#stats .c4:nth-child(4)', after: 7, act: 'Got it', until: (e) => e.type === 'next',
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
  { id: 'drivers', n: 2, title: 'Command your drivers', mins: 4, soon: true,
    goal: 'Attack, defend, team orders and when to use them.' },
  { id: 'dna', n: 3, title: 'Master the circuit', mins: 4, soon: true,
    goal: 'How Driver DNA changes what your drivers do on track.' },
  { id: 'strategy', n: 4, title: 'Strategy', mins: 5, soon: true,
    goal: 'Tyres, pit windows, rain and the safety car.' },
  { id: 'gp', n: 5, title: 'Your first Grand Prix', mins: 6, soon: true,
    goal: 'A full race with the engineer beside you, then your summary and badge.' },
];

export const lessonById = (id) => LESSONS.find((l) => l.id === id);

export const fill = (text, names) => text.replace(/\{A\}/g, names.A).replace(/\{B\}/g, names.B);

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
