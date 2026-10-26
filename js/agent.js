// Your agent while you're away: when you haven't raced a Daily Grand Prix by your cover time (21:00
// by default), your agent races it for you on Autonomous, following your playbook, and writes the
// report. It acts only through the strategist's rights (the engine refuses anything else), never
// changes Driver DNA and never enters races you didn't allow. Agent results keep your streak but
// are marked as the agent's, apart from your own.
// Pure and DOM-free: runs in a Web Worker (agent.worker.js), in Node tests, or on a server.
import { COMPOUNDS } from './data.js';
import { setupRace, EPOCH } from './game.js';
import { plans as briefPlans } from './briefing.js';
import { buildReport } from './report.js';

export const PLAYBOOK = { on: true, cover: 21, pit: 'plan', rain: 'normal', orders: 'free', risk: 'normal' };
export const PLAYBOOK_CHOICES = {
  pit: [['plan', 'Follow Plan A', "The engineer's briefing plan for each car."], ['engine', 'Strategist decides', 'Stops when the tyres say so.']],
  rain: [['cautious', 'Cautious', 'Rain tyres at the first spots of rain.'], ['normal', 'Normal', 'Rain tyres once the track is properly wet.'], ['bold', 'Bold', 'Stays on slicks as long as it dares.']],
  orders: [['free', 'Race freely', 'Your two cars may fight each other.'], ['hold', 'Hold positions', 'No fighting between your cars.']],
  risk: [['careful', 'Careful', 'Saves tyres, avoids fights.'], ['normal', 'Normal', 'Pushes in the last laps.'], ['aggressive', 'Aggressive', 'Attacks all race, pushes and deploys at the end.']],
};
const WET_AT = { cautious: 0.22, normal: 0.35, bold: 0.5 };
const isDry = (c) => COMPOUNDS[c].dry;

export const playbookOf = (S) => ({ ...PLAYBOOK, ...(S.agent && S.agent.playbook) });

// when your agent would race Daily n: your cover hour, on that day, in your own time zone
export function coverTime(n, hour = 21) {
  const d = new Date(EPOCH + (n - 1) * 86400000);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour).getTime();
}

// the Dailies your agent should race now: missed, past the cover time, at most a week back, oldest first
export function dueDailies(S, today, now = Date.now()) {
  const pb = playbookOf(S); if (!pb.on) return [];
  const from = Math.max(1, today - 6, (S.agent && S.agent.since) || 1);
  const out = [];
  for (let n = from; n <= today; n++) if (!S.daily.days[n] && coverTime(n, pb.cover) <= now) out.push(n);
  return out;
}

// races one Daily for you. args: { venue, seed, team, dna, car, laps, playbook, label }
export function agentRace(args) {
  const pb = { ...PLAYBOOK, ...args.playbook };
  const base = { venue: args.venue, seed: args.seed, team: args.team, dna: args.dna, car: args.car, laps: args.laps, auto: true };
  const probe = setupRace(base), W = probe.weather;
  const P = briefPlans({ laps: probe.laps, wear: args.venue.wear || 1, wet0: W.wet0, showers: W.showers.length });
  const plan = { 'you-0': P['you-0'][0], 'you-1': P['you-1'][0] };
  const R = setupRace({ ...base, ...(pb.pit === 'plan' ? { startCompounds: { 'you-0': plan['you-0'].start, 'you-1': plan['you-1'].start } } : {}) }).make();
  // team orders are yours alone, so the playbook's rule is set before the start, as your own standing order
  if (pb.orders === 'hold') { const [a, b] = ['you-0', 'you-1'].map((id) => R.byId.get(id)); a.order = b.order = 'hold'; R.emit('order', `Team orders from your playbook: ${a.code} and ${b.code} hold positions.`, a, { other: b.id }); }
  R.start();
  // the record of this race, so the leaderboard can run it again on the server and rank it the same
  // way as a race you drove yourself: the setup, the standing order, and every call with its step
  const rec = { kind: 'daily', venue: args.venue.id, seed: args.seed, n: 0,
    args: { team: args.team, startCompounds: R.cars.filter((c) => c.team.you).reduce((o, c) => ({ ...o, [c.id]: c.tyre.c }), {}), auto: true, dna: args.dna, car: args.car, orders: pb.orders === 'hold' ? 'hold' : undefined }, cmds: [] };
  const ids = ['you-0', 'you-1'], cmd = (id, c) => { rec.cmds.push([rec.n, id, c, 'strategist']); return R.command(id, c, 'strategist'); }, k = { 'you-0': 0, 'you-1': 0 }, said = {};
  if (pb.risk === 'careful') ids.forEach((id) => cmd(id, { pace: 'save' }));
  if (pb.risk === 'aggressive') ids.forEach((id) => cmd(id, { battle: 'attack' }));
  let guard = 0;
  while (!R.done && guard++ < 400000) {
    if (R.tick % 20 === 0) for (const id of ids) {
      const c = R.byId.get(id); if (c.dnf || c.finished) continue;
      const left = R.lapsLeft(c), once = (key, call) => { if (!said[id + key]) { said[id + key] = true; cmd(id, call); } };
      // the end of the race: careful drivers bring it home, the others push
      if (left <= 2 && pb.risk === 'careful') once('home', { pace: 'normal' });
      if (left <= 2 && pb.risk === 'normal') once('push', { pace: 'push' });
      if (left <= 3 && pb.risk === 'aggressive') once('push', { pace: 'push' });
      if (left <= 1 && pb.risk === 'aggressive') once('deploy', { ers: 'deploy' });
      if (c.pit || c.pitReq) continue;
      const lap = Math.max(0, Math.floor(c.dist / R.track.L)), p = plan[id], s = p.stops[k[id]];
      if (R.wet > WET_AT[pb.rain] && isDry(c.tyre.c) && left > 1) cmd(id, { box: R.wet > 0.7 ? 'W' : 'I' });
      else if (R.wet < 0.12 && !isDry(c.tyre.c) && left > 1) { cmd(id, { box: s ? s.tyre : left > 6 ? 'M' : 'S' }); if (s) k[id]++; }
      else if (pb.pit === 'plan' && s && lap >= s.lap && isDry(c.tyre.c)) { cmd(id, { box: s.tyre }); k[id]++; }
    }
    R.step(); rec.n++;
  }
  const report = buildReport(R, { venue: args.venue, label: args.label, mine: ids });
  const my = R.result.filter((x) => ids.includes(x.id));
  return { report, rec, best: Math.min(...my.map((x) => x.pos)), pts: my.reduce((s, x) => s + x.points, 0), places: my.map((x) => (x.dnf ? null : x.pos)) };
}
