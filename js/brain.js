// Your drivers' own brains (rules version). Each driver reads the race only from the engine (read()),
// talks in a manner set by its Driver DNA (persona()), remembers what you told it and what it said
// (memory), recommends calls and says when it disagrees. It never acts: a recommendation is an offer
// you accept with "do it", and every call still goes through your command path, so the engine's
// authority rule holds. Every number a driver says comes from read(); nothing is made up.
// Plain data and functions, no DOM, so Node can test it and a server brain can share it later.
// Lines are recorded once per driver voice (art/voice/brain.json, written by tools/brain-lines.mjs):
// a reply is a list of clip keys, 'br_*' from the brain pack and the rest from the voice's main pack.

export const LINES = {
  // readings
  br_tyres: 'Tyres are at', br_bat: 'Battery is at', br_gap_ahead: 'Gap to the car ahead:', br_gap_behind: 'Gap to the car behind:',
  br_leading: "Nobody ahead. We're leading.", br_clear_behind: 'Nobody close behind.', br_were: "We're", br_mate: 'My teammate is',
  br_mate_out: 'My teammate is out of the race.', br_many: 'Plenty of laps to go.', br_last: 'Last lap!',
  br_tf_fresh: 'They feel fresh.', br_tf_ok: 'Still plenty of grip.', br_tf_going: "They're starting to go off.", br_tf_gone: "They're finished. I'm sliding everywhere.",
  br_dry: 'Track is dry.', br_damp: 'Track is damp.', br_wet: 'Track is wet.', br_soaked: "It's soaked out here.",
  br_rain_soon: 'Radar shows rain coming.', br_no_rain: 'No rain on the radar.', br_sc: 'Safety car is out.',
  // how it feels, in the driver's own manner (_f fiery, _c cool, _e even)
  br_feel_f: "Car's mega! Let's go and get them.", br_feel_c: 'Car feels balanced. All under control.', br_feel_e: 'Car feels good, boss.',
  br_feel_bad: "It's hard work out here.",
  // can you pass him?
  br_pass_f: "Yes! Give me the boost and I'll send it.", br_pass_c: "I can do it. I'll set it up for the straight.", br_pass_e: "I think so. I'm close enough.",
  br_pass_far: "He's too far ahead for now. I need to close the gap first.", br_pass_nobat: 'Not without battery. Let me charge first.',
  br_pass_tyres: 'My tyres are too worn to fight him.', br_pass_lead: "There's nobody to pass. We're leading!", br_pass_mate: "That's my teammate ahead. Your call on team orders.",
  // what do you think? (recommendations, offered for your "do it")
  br_op_wet: "It's wet and I'm on slicks. Box me?", br_op_dry: 'There is a dry line. I want slicks.', br_op_box: "These tyres are done. I'd box now.",
  br_op_stretch: 'I can stretch these a few more laps.', br_op_attack_f: "He's right there. Let me attack with the boost.",
  br_op_attack_c: "I'm close. Let me attack on the next straight.", br_op_attack_e: "I'm close behind. Let me attack.",
  br_op_defend: "He's all over me. Let me defend.", br_op_harvest: 'Battery is low. Let me harvest for a lap.',
  br_op_push: 'Tyres are good. Let me push.', br_op_save: "Long way to go. I'd save the tyres for now.", br_op_keep: "All good. I'd keep it as it is.",
  br_op_boxing: "We're already boxing, like you called.", br_op_rain: "Rain's coming. I'd stay out until it hits.",
  br_op_swap: "I'm faster than my teammate. Can we swap?", br_offer: "Say do it, and I'll go.", br_offer_short: 'Your call, boss.',
  // when a call goes against what the driver reads, it still does it, and says why it worries
  br_dis_save: "Really? I'm right on his gearbox. Okay, saving.", br_dis_swap_f: "Are you sure? I'm faster. Fine, letting them through.",
  br_dis_hold: "Hold? I'm quicker than my teammate. Okay, holding.", br_dis_harvest: "Copy, harvesting. But he's close behind me.",
  br_dis_defend: 'Copy, defending. It will cost me some time.', br_dis_push: "Copy. But these tyres won't last long like this.",
  br_dis_slicks: "Copy. But it's still wet out here.", br_dis_wet: "Copy. But I think it's too dry for those.",
  br_why_ok: 'No complaints, boss. Just racing.', br_why_was: 'Like I said:',
  // what are my orders?
  br_ord: 'My orders:', br_o_push: 'push,', br_o_save: 'save tyres,', br_o_normal: 'normal pace,', br_o_harvest: 'harvest,', br_o_deploy: 'deploy,',
  br_o_balanced: 'balanced battery,', br_o_attack: 'and attack.', br_o_defend: 'and defend.', br_o_neutral: 'and race clean.',
  br_o_box: 'And we box this lap.', br_o_hold: 'Holding position with my teammate.', br_o_none: "You haven't changed anything yet.",
  // you talk to them
  br_thanks_f: "Yes! Let's keep going!", br_thanks_c: 'Thanks. Focus on the next lap.', br_thanks_e: 'Thanks, boss!',
  br_enc_f: 'Leave it with me!', br_enc_c: "Copy. I'm doing everything I can.", br_enc_e: 'On it, boss.',
  br_sorry: 'Sorry, boss. I know. I will fix it.',
  // the driver calls you
  br_pro_tyres: "Boss, the tyres are going. I'll need a stop soon.", br_pro_rain: "It's raining and I'm on slicks!",
  br_pc0: 'nearly zero.',
  ...Object.fromEntries([10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => ['br_pc' + n, (n === 100 ? 'a hundred' : ['ten', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'][n / 10 - 1]) + ' percent.'])),
};
const TYRE = { S: 'softs', M: 'mediums', H: 'hards', I: 'inters', W: 'wets' };

const v01 = (params, k) => Math.max(0, Math.min(1, (params?.[k] ?? 50) / 100));
// a manner from the DNA: an aggressive racer speaks with fire, a careful one stays cool
export function persona(params) {
  const p = (k) => v01(params, k);
  const bold = (p('pass_eagerness') + p('gap_acceptance') + p('late_braking') + 1 - p('side_by_side_caution')) / 4;
  const care = (p('tyre_care') + 1 - p('energy_deployment')) / 2;
  const steady = (p('consistency') + p('slipstream_patience')) / 2;
  const tone = bold > 0.6 ? 'f' : steady > 0.6 || care > 0.6 ? 'c' : 'e';
  return { bold, care, steady, loyal: p('team_order_compliance'), coop: p('teammate_cooperation'), wet: p('wet_confidence'), change: p('grip_change_response'), tone };
}

// What the driver knows: only what the engine holds for its car (plus the weather radar the pit wall
// shows). Numbers are rounded the way they are said.
export function read(R, car) {
  const ahead = car.pos > 1 ? R.order[car.pos - 2] : null, behind = R.order[car.pos] || null, mate = R.mate(car);
  const lapT = R.track.lapTime * 1.05, left = R.lapsLeft(car);
  const shower = R.weather?.showers?.find((s) => s.start > R.t && (s.start - R.t) / lapT < 3);
  return {
    id: car.id, code: car.code, pos: car.pos, out: !!car.dnf, done: !!car.finished, inPit: !!car.pit,
    tyre: car.tyre.c, tyreLeft: Math.round((1 - car.tyre.wear) * 100), ers: Math.round(car.ers * 100), left,
    ahead: ahead && !ahead.dnf ? { code: ahead.code, gap: +Math.max(0.1, car.interval).toFixed(1), mate: ahead.team.id === car.team.id } : null,
    behind: behind && !behind.dnf && !behind.pit && !behind.lapsDown ? { code: behind.code, gap: +Math.max(0.1, behind.interval).toFixed(1), mate: behind.team.id === car.team.id } : null,
    mate: mate ? { code: mate.code, pos: mate.pos, out: !!mate.dnf } : null,
    wet: R.wet > 0.7 ? 'soaked' : R.wet > 0.35 ? 'wet' : R.wet > 0.12 ? 'damp' : 'dry', rainSoon: !!shower, sc: !!R.sc,
    pitReq: car.pitReq || null, pace: car.pace, ersMode: car.ersMode, battle: car.battle, order: car.order || 'free', auto: !!car.auto,
  };
}
const pc = (n) => (n < 5 ? 'br_pc0' : 'br_pc' + Math.max(10, Math.min(100, Math.round(n / 10) * 10)));
const pcText = (n) => LINES[pc(n)];
// (whole seconds start at four: the clips run from 0.1 to 3.0, then four to fifteen seconds)
const gapClip = (g) => (g < 3.5 ? 'n' + String(Math.max(1, Math.min(30, Math.round(g * 10)))).padStart(2, '0') : g < 15.5 ? 's' + Math.round(g) : 's_big');
const gapText = (g) => (g < 3.05 ? `${Math.max(0.1, g).toFixed(1)} s.` : g < 3.5 ? '3 seconds.' : g < 15.5 ? `${Math.round(g)} seconds.` : 'More than fifteen seconds.');
const lapsClip = (n) => (n >= 2 && n <= 10 ? 'u_laps' + n : n <= 1 ? 'br_last' : 'br_many');
const lapsText = (n) => (n >= 2 && n <= 10 ? `${n} laps to go.` : n <= 1 ? LINES.br_last : LINES.br_many);

// What you said to the driver, for the things the command matcher doesn't cover: questions,
// opinions, praise. Returns an intent or null.
const W = (s) => ' ' + String(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
const any = (t, list) => list.some((w) => t.includes(' ' + w + ' '));
export function intent(text) {
  const t = W(text);
  if (any(t, ['what are my orders', 'what are your orders', 'what did i tell you', 'what did i say', 'remind me', 'what am i', 'whats the plan', 'what is the plan', 'what are we doing', 'your orders', 'my orders', 'orders'])) return 'orders';
  if (any(t, ['can you pass', 'can you get him', 'can you get her', 'can you get past', 'can you overtake', 'can you catch', 'can you take him', 'can you take her', 'can you make it stick', 'pass him', 'pass her'])) return /^ (can|could|will|do you think)/.test(t) || t.includes(' can you ') ? 'pass' : null;
  if (any(t, ['what do you think', 'what should we do', 'what would you do', 'your opinion', 'any ideas', 'what do you need', 'what do you want', 'your call', 'thoughts', 'recommend', 'suggestion', 'advice', 'whats best', 'what is best'])) return 'opinion';
  if (any(t, ['tyres', 'tires', 'tyre', 'tire', 'rubber', 'grip'])) return 'tyres';
  if (any(t, ['battery', 'ers', 'energy', 'charge'])) return 'battery';
  if (any(t, ['gap', 'gaps', 'how far', 'how close', 'who is ahead', 'whos ahead', 'who is behind', 'whos behind', 'behind you', 'ahead of you'])) return 'gaps';
  if (any(t, ['rain', 'weather', 'wet', 'radar', 'dry', 'track conditions', 'conditions'])) return 'weather';
  if (any(t, ['teammate', 'team mate', 'other car'])) return 'mate';
  if (any(t, ['position', 'where are you', 'what position', 'what place', 'laps left', 'how many laps', 'laps to go'])) return 'position';
  if (any(t, ['why', 'whats wrong', 'what is wrong', 'losing time', 'so slow', 'problem', 'issue'])) return 'why';
  if (any(t, ['how are you', 'how you feeling', 'how are you feeling', 'hows the car', 'how is the car', 'how does it feel', 'how is it', 'hows it going', 'talk to me', 'status', 'you ok', 'you okay', 'all good'])) return 'feel';
  if (any(t, ['good job', 'great job', 'well done', 'nice', 'brilliant', 'awesome', 'great', 'good work', 'great work', 'amazing', 'love it', 'thank you', 'thanks', 'good stuff', 'mega', 'fantastic', 'perfect'])) return 'praise';
  if (any(t, ['come on', 'you can do it', 'you got this', 'youve got this', 'keep going', 'keep it up', 'believe', 'lets go', 'dig deep'])) return 'encourage';
  if (any(t, ['what was that', 'what happened', 'that was bad', 'terrible', 'mistake', 'careful', 'wake up'])) return 'scold';
  return null;
}

// One driver's brain. remember() is called for every call that reaches the car, and for every
// exchange on the radio; the last few are kept, newest first.
export class Brain {
  constructor(id, params) { this.id = id; this.p = persona(params); this.mem = []; this.orders = {}; this.concern = null; this.saidAt = {}; }
  remember(entry) { this.mem.unshift(entry); if (this.mem.length > 12) this.mem.length = 12; }
  // a call from you, after it reached the car (lap = the car's lap when you said it)
  heard(cmd, lap, t) {
    for (const k of ['pace', 'ers', 'battle', 'box', 'order']) if (k in cmd) this.orders[k] = { v: cmd[k], lap, t };
    this.remember({ t, lap, from: 'you', cmd });
  }
  // the reply to a question or remark (kind from intent()); f is read() for this car, mate the
  // teammate's read(). Returns { text, clips, call? } or null.
  answer(kind, f, mate) {
    const P = this.p, out = (clips, text, call) => { const r = { clips, text, ...(call ? { call } : {}) }; this.remember({ t: Date.now(), from: 'driver', kind, text }); return r; };
    const tone = (k) => k + '_' + P.tone;
    if (f.out) return null;
    switch (kind) {
      case 'tyres': {
        const feel = f.tyreLeft > 80 ? 'br_tf_fresh' : f.tyreLeft > 55 ? 'br_tf_ok' : f.tyreLeft > 30 ? 'br_tf_going' : 'br_tf_gone';
        return out(['br_tyres', pc(f.tyreLeft), feel], `${TYRE[f.tyre][0].toUpperCase() + TYRE[f.tyre].slice(1)}: ${LINES.br_tyres} ${pcText(f.tyreLeft)} ${LINES[feel]}`);
      }
      case 'battery': return out(['br_bat', pc(f.ers)], `${LINES.br_bat} ${pcText(f.ers)}${f.ersMode === 'harvest' ? ' Harvesting.' : f.ersMode === 'deploy' ? ' Deploying.' : ''}`);
      case 'gaps': {
        const c = [], t = [];
        if (f.ahead) { c.push('br_gap_ahead', gapClip(f.ahead.gap)); t.push(`${LINES.br_gap_ahead} ${f.ahead.code}, ${gapText(f.ahead.gap)}`); } else { c.push('br_leading'); t.push(LINES.br_leading); }
        if (f.behind && f.behind.gap < 4) { c.push('br_gap_behind', gapClip(f.behind.gap)); t.push(`${LINES.br_gap_behind} ${f.behind.code}, ${gapText(f.behind.gap)}`); } else { c.push('br_clear_behind'); t.push(LINES.br_clear_behind); }
        return out(c, t.join(' '));
      }
      case 'position': return out(['br_were', 'p' + f.pos, lapsClip(f.left)], `${LINES.br_were} P${f.pos}. ${lapsText(f.left)}`);
      case 'mate': return f.mate && !f.mate.out ? out(['br_mate', 'p' + f.mate.pos], `${LINES.br_mate} P${f.mate.pos} (${f.mate.code}).`) : out(['br_mate_out'], LINES.br_mate_out);
      case 'weather': {
        const k = 'br_' + f.wet, c = [k], t = [LINES[k]];
        if (f.sc) { c.push('br_sc'); t.push(LINES.br_sc); }
        const rk = f.rainSoon ? 'br_rain_soon' : 'br_no_rain'; c.push(rk); t.push(LINES[rk]);
        return out(c, t.join(' '));
      }
      case 'feel': {
        const bad = f.tyreLeft < 35 || (f.wet !== 'dry' && 'SMH'.includes(f.tyre)) || f.ers < 15;
        if (bad) { const r = this.why(f); return out(['br_feel_bad', ...r.clips], `${LINES.br_feel_bad} ${r.text}`); }
        return out([tone('br_feel'), 'br_were', 'p' + f.pos], `${LINES[tone('br_feel')]} ${LINES.br_were} P${f.pos}.`);
      }
      case 'why': { const r = this.why(f); return out(r.clips, r.text); }
      case 'pass': {
        const a = f.ahead;
        if (!a) return out(['br_pass_lead'], LINES.br_pass_lead);
        if (a.mate) return out(['br_pass_mate'], LINES.br_pass_mate);
        if (a.gap > 1.6) return out(['br_pass_far', 'br_gap_ahead', gapClip(a.gap)], `${LINES.br_pass_far} ${LINES.br_gap_ahead} ${gapText(a.gap)}`);
        if (f.tyreLeft < 25) return out(['br_pass_tyres'], LINES.br_pass_tyres);
        if (f.ers < 20) return out(['br_pass_nobat'], LINES.br_pass_nobat, { id: f.id, k: 'harvest' });
        return out([tone('br_pass'), 'br_offer'], `${LINES[tone('br_pass')]} ${LINES.br_offer}`, P.tone === 'f' ? [{ id: f.id, k: 'attack' }, { id: f.id, k: 'boost' }] : { id: f.id, k: 'attack' });
      }
      case 'opinion': { const o = this.opinion(f, mate); return out(o.clips, o.text, o.call); }
      case 'orders': return out(...this.ordersSaid(f));
      case 'praise': return out([tone('br_thanks')], LINES[tone('br_thanks')]);
      case 'encourage': return out([tone('br_enc')], LINES[tone('br_enc')]);
      case 'scold': return out(['br_sorry'], LINES.br_sorry);
      default: return null;
    }
  }
  // why the pace is what it is: the first thing that explains it, or the worry it raised last
  why(f) {
    if (this.concern && Date.now() - this.concern.at < 90000) return { clips: ['br_why_was', ...this.concern.clips], text: `${LINES.br_why_was} ${this.concern.text}` };
    if (f.inPit) return { clips: ['x_cold'], text: 'In the pits now.' };
    if (f.wet !== 'dry' && 'SMH'.includes(f.tyre) && f.wet !== 'damp') return { clips: ['x_wet'], text: `It's really slippery out here on ${TYRE[f.tyre]}.` };
    if (f.tyreLeft < 40) return { clips: ['br_tyres', pc(f.tyreLeft), 'br_tf_gone'], text: `${LINES.br_tyres} ${pcText(f.tyreLeft)} ${LINES.br_tf_gone}` };
    if (f.pace === 'save') return { clips: ['x_saving'], text: "I'm saving the tyres, like you asked." };
    if (f.ers < 15 || f.ersMode === 'harvest') return { clips: ['br_bat', pc(f.ers)], text: `${LINES.br_bat} ${pcText(f.ers)} Harvesting.` };
    if (f.ahead && !f.ahead.mate && f.ahead.gap < 1.2) return { clips: ['x_traffic'], text: `I'm stuck in dirty air behind ${f.ahead.code}.` };
    return { clips: ['br_why_ok'], text: LINES.br_why_ok };
  }
  // the driver's own read of what to do next, in its own manner; a call comes as an offer only
  opinion(f, mate) {
    const P = this.p, o = (keys, text, call) => ({ clips: call ? [...keys, 'br_offer'] : keys, text: call ? `${text} ${LINES.br_offer}` : text, call });
    const dryTyre = f.tyre === 'S' ? 'M' : f.tyre === 'M' ? 'H' : 'M';
    if (f.inPit || f.pitReq) return o(['br_op_boxing'], LINES.br_op_boxing);
    if ((f.wet === 'wet' || f.wet === 'soaked') && 'SMH'.includes(f.tyre)) { const ty = f.wet === 'soaked' ? 'W' : 'I'; return o(['br_op_wet', 'q_' + ty], `${LINES.br_op_wet} ${TYRE[ty][0].toUpperCase() + TYRE[ty].slice(1)}.`, { id: f.id, k: 'boxnow', tyre: ty }); }
    if (f.wet === 'dry' && (f.tyre === 'I' || f.tyre === 'W') && P.change > 0.35) return o(['br_op_dry', 'q_M'], `${LINES.br_op_dry} Mediums.`, { id: f.id, k: 'boxnow', tyre: 'M' });
    if (f.rainSoon && 'SMH'.includes(f.tyre) && f.wet === 'dry') return o(['br_op_rain'], LINES.br_op_rain);
    if (f.tyreLeft < 22 + 10 * (1 - P.care) && f.left > 1) return o(['br_op_box', 'q_' + dryTyre], `${LINES.br_op_box} ${TYRE[dryTyre][0].toUpperCase() + TYRE[dryTyre].slice(1)}.`, { id: f.id, k: 'boxnow', tyre: dryTyre });
    if (f.tyreLeft < 40 && f.left > 2 && P.care > 0.55) return o(['br_op_stretch', 'br_tyres', pc(f.tyreLeft)], `${LINES.br_op_stretch} ${LINES.br_tyres} ${pcText(f.tyreLeft)}`);
    if (f.ahead && f.ahead.mate && f.ahead.gap < 1.0 && f.order === 'hold' && P.coop < 0.5 && f.tyreLeft > (mate ? mate.tyreLeft + 15 : 100)) return o(['br_op_swap'], LINES.br_op_swap, { id: f.id, k: 'swap' });
    if (f.ahead && !f.ahead.mate && f.ahead.gap < 1.0 + 0.4 * P.bold && f.ers > 30 && f.battle !== 'attack') return o(['br_op_attack_' + P.tone], LINES['br_op_attack_' + P.tone], P.tone === 'f' ? [{ id: f.id, k: 'attack' }, { id: f.id, k: 'boost' }] : { id: f.id, k: 'attack' });
    if (f.behind && !f.behind.mate && f.behind.gap < 0.8 && f.battle !== 'defend') return o(['br_op_defend'], LINES.br_op_defend, { id: f.id, k: 'defend' });
    if (f.ers < 20 && f.ersMode !== 'harvest') return o(['br_op_harvest', 'br_bat', pc(f.ers)], `${LINES.br_op_harvest} ${LINES.br_bat} ${pcText(f.ers)}`, { id: f.id, k: 'harvest' });
    if (f.tyreLeft > 60 && f.pace !== 'push' && (P.bold > 0.5 || f.left < 6)) return o(['br_op_push'], LINES.br_op_push, { id: f.id, k: 'push' });
    if (f.tyreLeft < 60 && f.left > 8 && f.pace === 'push' && P.care > 0.45) return o(['br_op_save'], LINES.br_op_save, { id: f.id, k: 'save' });
    return o(['br_op_keep'], LINES.br_op_keep);
  }
  ordersSaid(f) {
    const c = ['br_ord'], t = [LINES.br_ord];
    const add = (k) => { c.push(k); t.push(LINES[k]); };
    if (!Object.keys(this.orders).length && f.pace === 'normal' && f.ersMode === 'balanced' && f.battle === 'neutral' && !f.pitReq && f.order === 'free') return [['br_o_none'], LINES.br_o_none];
    add('br_o_' + f.pace); add('br_o_' + f.ersMode); add('br_o_' + f.battle);
    if (f.pitReq) add('br_o_box');
    if (f.order === 'hold') add('br_o_hold');
    return [c, t.join(' ')];
  }
  // a call you made that the driver reads differently: it obeys, and says what worries it (once)
  react(call, f, mate) {
    const P = this.p, k = call.k;
    let w = null;
    if (k === 'save' && f.ahead && !f.ahead.mate && f.ahead.gap < 1.0 && P.bold > 0.55) w = 'br_dis_save';
    else if (k === 'swap' && P.loyal < 0.45 && f.ahead && f.ahead.mate === false && f.behind && f.behind.mate) w = 'br_dis_swap_f';
    else if (k === 'hold' && P.coop < 0.45 && f.ahead && f.ahead.mate && f.ahead.gap < 1.0) w = 'br_dis_hold';
    else if (k === 'harvest' && f.behind && !f.behind.mate && f.behind.gap < 0.8) w = 'br_dis_harvest';
    else if (k === 'defend' && P.bold > 0.65) w = 'br_dis_defend';
    else if (k === 'push' && f.tyreLeft < 45 && f.left > 4 && P.care > 0.5) w = 'br_dis_push';
    else if ((k === 'box' || k === 'boxnow') && call.tyre && 'SMH'.includes(call.tyre) && (f.wet === 'wet' || f.wet === 'soaked')) w = 'br_dis_slicks';
    else if ((k === 'box' || k === 'boxnow') && (call.tyre === 'W') && (f.wet === 'dry' || f.wet === 'damp')) w = 'br_dis_wet';
    if (!w) return null;
    const key = w + ':' + Math.floor(Date.now() / 30000);
    if (this.saidAt[key]) return null;
    this.saidAt[key] = true;
    this.concern = { clips: [w], text: LINES[w], at: Date.now() };
    this.remember({ t: Date.now(), from: 'driver', kind: 'concern', text: LINES[w] });
    return { clips: [w], text: LINES[w] };
  }
  // the driver calls you when something needs your decision (at most one call every 90 s, each
  // reason once per stint); it never acts on its own
  nudge(f, now) {
    if (f.out || f.done || f.inPit || f.pitReq || f.auto) return null;
    if (now - (this.lastNudge || -1e9) < 90000) return null;
    let r = null;
    if (f.tyreLeft < 22 && f.left > 2 && !this.saidAt['tyres:' + f.tyre]) { this.saidAt['tyres:' + f.tyre] = true; r = { clips: ['br_pro_tyres'], text: LINES.br_pro_tyres, why: 'tyres' }; }
    else if ((f.wet === 'wet' || f.wet === 'soaked') && 'SMH'.includes(f.tyre) && !this.saidAt['rain:' + f.tyre]) { this.saidAt['rain:' + f.tyre] = true; r = { clips: ['br_pro_rain'], text: LINES.br_pro_rain, why: 'rain' }; }
    if (r) { this.lastNudge = now; this.remember({ t: now, from: 'driver', kind: 'nudge', text: r.text }); }
    return r;
  }
}

// For the AI brain (server/talk.mjs): the calls a reply may offer, and a check that every number in a
// reply is one the engine gave (as said: rounded gaps, tyre and battery in tens). A reply that fails
// is dropped and the rules brain answers instead.
export const CALL_KINDS = ['box', 'boxnow', 'cancel', 'push', 'save', 'normal', 'attack', 'defend', 'neutral', 'boost', 'harvest', 'balanced', 'swap', 'hold', 'free'];
export function honest(text, f) {
  const ok = [f.pos, f.left, f.tyreLeft, f.ers, f.mate?.pos, f.ahead?.gap, f.behind?.gap].filter((x) => x != null);
  const near = (n) => ok.some((x) => Math.abs(x - n) < 1e-9) || [f.tyreLeft, f.ers].some((x) => Math.abs(Math.round(x / 10) * 10 - n) < 1e-9)
    || [f.ahead?.gap, f.behind?.gap].some((g) => g != null && Math.abs(Math.round(g) - n) < 1e-9);
  // small counting words ("one more lap", "two cars") are fine; a number with a unit or a P must be real
  for (const m of String(text).matchAll(/\b(?:P\s?)?(\d+(?:\.\d+)?)\s*(%|percent|s\b|sec|seconds?|laps?)?/gi)) {
    const n = Number(m[1]), unit = m[2] || /^P/i.test(m[0]);
    if (!unit && n <= 2) continue;
    if (!near(n)) return false;
  }
  return true;
}
