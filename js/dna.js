// Driver DNA: how each of your two drivers drives. A profile is 17 settings from 0 to 100 (50 is
// balanced, not slow), grouped as below, plus 8 Quick dials that move groups of them together.
// Only settings the race engine can honour exist here: each one maps through simInputs() to a
// bounded change in a real mechanism of js/sim.js, never to extra grip or top speed.
// Plain data and pure functions, no DOM, so the same file can run on a server later.
import { hashString } from './rng.js';

export const DNA_VERSION = 1;

export const GROUPS = [
  { id: 'corners', label: 'Braking and corners' },
  { id: 'racecraft', label: 'Overtaking and defending' },
  { id: 'tyres', label: 'Tyres and energy' },
  { id: 'weather', label: 'Weather' },
  { id: 'judgement', label: 'Judgement' },
  { id: 'team', label: 'Team play' },
];

// lo / hi say what 0 and 100 mean; cost is the price of turning it up
export const PARAMS = [
  { key: 'late_braking', group: 'corners', label: 'Late braking', lo: 'Brakes early, with margin', hi: 'Brakes as late as the car allows', gain: 'Shorter braking zones', cost: 'More lock-ups and flat spots' },
  { key: 'entry_speed', group: 'corners', label: 'Entry vs exit', lo: 'Slow in, fast out', hi: 'Carries speed into the corner', gain: 'Faster corner entry, easier dives', cost: 'Slower exits, more running wide' },
  { key: 'corner_commitment', group: 'corners', label: 'Corner commitment', lo: 'Leaves grip in reserve', hi: 'Uses nearly all the grip', gain: 'Higher corner speed', cost: 'Tyre wear and more mistakes' },
  { key: 'kerb_usage', group: 'corners', label: 'Kerb use', lo: 'Stays off the kerbs', hi: 'Rides every kerb', gain: 'A little time in each corner', cost: 'Tyre wear and the odd big moment' },
  { key: 'throttle_aggression', group: 'corners', label: 'Throttle aggression', lo: 'Gentle on the power', hi: 'Full power early', gain: 'Faster exits in the dry', cost: 'Wheelspin, worse in the wet' },
  { key: 'pass_eagerness', group: 'racecraft', label: 'Overtaking eagerness', lo: 'Waits for a sure thing', hi: 'Tries every chance', gain: 'More passing attempts', cost: 'More contact and aborted moves' },
  { key: 'gap_acceptance', group: 'racecraft', label: 'Gap acceptance', lo: 'Needs a big gap', hi: 'Goes for half a gap', gain: 'Passes from further back', cost: 'Tighter moves, more contact' },
  { key: 'slipstream_patience', group: 'racecraft', label: 'Slipstream patience', lo: 'Dives into corners', hi: 'Waits for the straight', gain: 'Cleaner, safer passes', cost: 'Fewer chances on twisty tracks' },
  { key: 'defending', group: 'racecraft', label: 'Defending', lo: 'Lets faster cars go', hi: 'Covers every move', gain: 'Harder to pass', cost: 'Slower laps while defending, tyre wear' },
  { key: 'side_by_side_caution', group: 'racecraft', label: 'Side-by-side caution', lo: 'Holds the line, door to door', hi: 'Gives room, avoids contact', gain: 'Fewer collisions', cost: 'Loses more wheel-to-wheel fights' },
  { key: 'tyre_care', group: 'tyres', label: 'Tyre care', lo: 'Uses the tyres up', hi: 'Nurses the tyres', gain: 'Longer stints, fewer stops', cost: 'Slower laps' },
  { key: 'energy_deployment', group: 'tyres', label: 'Battery use', lo: 'Saves charge for fights', hi: 'Spends charge freely', gain: 'Faster on the straights', cost: 'Less in reserve to attack or defend' },
  { key: 'wet_confidence', group: 'weather', label: 'Wet confidence', lo: 'Very careful in the wet', hi: 'Pushes in the rain', gain: 'Faster on a wet track', cost: 'Spins and offs in the wet' },
  { key: 'grip_change_response', group: 'weather', label: 'Tyre-change timing', lo: 'Stays out on the old tyres', hi: 'Asks to change early', gain: 'First onto the right tyres', cost: 'Sometimes stops too soon' },
  { key: 'consistency', group: 'judgement', label: 'Consistency', lo: 'Spectacular, up and down', hi: 'Steady, lap after lap', gain: 'Fewer mistakes, even laps', cost: 'Fewer stand-out laps' },
  { key: 'team_order_compliance', group: 'team', label: 'Team-order compliance', lo: 'Argues with orders', hi: 'Obeys at once', gain: 'Swaps happen fast', cost: 'Gives up places without a fight' },
  { key: 'teammate_cooperation', group: 'team', label: 'Teammate cooperation', lo: 'Races the teammate hard', hi: 'Helps the teammate', gain: 'Fewer team clashes', cost: 'Slow to fight a teammate for position' },
];
export const KEYS = PARAMS.map((p) => p.key);

// the Quick dials: each moves its settings together (a minus sign moves one the other way)
export const QUICK = [
  { key: 'braking', label: 'Braking aggression', maps: ['late_braking', 'entry_speed'], lo: 'Early and safe', hi: 'Late and hard', cost: 'Lock-ups, missed apexes' },
  { key: 'cornering', label: 'Cornering style', maps: ['corner_commitment', 'kerb_usage'], lo: 'Grip in reserve', hi: 'On the limit', cost: 'Tyre wear, running wide' },
  { key: 'overtaking', label: 'Overtaking', maps: ['pass_eagerness', 'gap_acceptance', '-slipstream_patience'], lo: 'Patient', hi: 'Opportunist', cost: 'Contact, aborted moves' },
  { key: 'defending', label: 'Defensive racing', maps: ['defending'], lo: 'Lets them by', hi: 'Covers everything', cost: 'Slower laps, tyre wear' },
  { key: 'tyres', label: 'Tyre preservation', maps: ['tyre_care'], lo: 'Uses them up', hi: 'Nurses them', cost: 'Slower laps' },
  { key: 'throttle', label: 'Throttle aggression', maps: ['throttle_aggression'], lo: 'Gentle', hi: 'Aggressive', cost: 'Wheelspin, wet weakness' },
  { key: 'wet', label: 'Wet-weather confidence', maps: ['wet_confidence', 'grip_change_response'], lo: 'Careful', hi: 'Confident', cost: 'Spins in the rain' },
  { key: 'consistency', label: 'Consistency', maps: ['consistency', 'side_by_side_caution'], lo: 'Spectacular', hi: 'Steady', cost: 'Fewer stand-out moves' },
];

const P = (o) => Object.fromEntries(KEYS.map((k) => [k, o[k] ?? 50]));
// nine original personalities (no real drivers); every one has a weakness
export const PRESETS = [
  { id: 'balanced', name: 'Balanced', blurb: 'Even in everything. A good place to start.', params: P({}) },
  { id: 'attacker', name: 'Attacker', blurb: 'Late on the brakes and into every gap. Wins fights, wears tyres, finds walls.',
    params: P({ late_braking: 78, entry_speed: 70, corner_commitment: 68, kerb_usage: 65, throttle_aggression: 70, pass_eagerness: 88, gap_acceptance: 80, slipstream_patience: 25, defending: 60, side_by_side_caution: 25, tyre_care: 30, energy_deployment: 72, consistency: 35, team_order_compliance: 35, teammate_cooperation: 30 }) },
  { id: 'technician', name: 'Technician', blurb: 'Clean lines and smooth hands. Quick and tidy, but rarely makes a bold move.',
    params: P({ late_braking: 55, entry_speed: 35, corner_commitment: 66, kerb_usage: 40, throttle_aggression: 45, pass_eagerness: 35, gap_acceptance: 35, slipstream_patience: 75, defending: 45, side_by_side_caution: 70, tyre_care: 62, consistency: 82 }) },
  { id: 'strategist', name: 'Strategist', blurb: 'Thinks a stint ahead: saves tyres and charge, then strikes late.',
    params: P({ late_braking: 45, corner_commitment: 52, pass_eagerness: 45, slipstream_patience: 70, tyre_care: 78, energy_deployment: 32, grip_change_response: 70, consistency: 70, team_order_compliance: 80, teammate_cooperation: 75 }) },
  { id: 'allrounder', name: 'All-Rounder', blurb: 'A little above average almost everywhere, a master of nothing.',
    params: P({ late_braking: 58, entry_speed: 55, corner_commitment: 58, kerb_usage: 55, throttle_aggression: 55, pass_eagerness: 58, gap_acceptance: 55, defending: 58, tyre_care: 55, wet_confidence: 58, consistency: 58 }) },
  { id: 'rain', name: 'Wet-Weather Specialist', blurb: 'Comes alive in the rain and reads a drying track first. Ordinary in the dry.',
    params: P({ late_braking: 45, corner_commitment: 46, throttle_aggression: 35, wet_confidence: 88, grip_change_response: 82, consistency: 60, tyre_care: 55 }) },
  { id: 'whisperer', name: 'Tyre Whisperer', blurb: 'Makes a set last for ever, so stops less. Slower on fresh rubber.',
    params: P({ late_braking: 40, corner_commitment: 42, kerb_usage: 25, throttle_aggression: 35, tyre_care: 90, side_by_side_caution: 62, consistency: 68 }) },
  { id: 'qualifier', name: 'Qualifying Specialist', blurb: 'One blistering lap after another while the tyres last. Fades in long stints.',
    params: P({ late_braking: 72, entry_speed: 62, corner_commitment: 82, kerb_usage: 75, throttle_aggression: 68, tyre_care: 25, energy_deployment: 75, consistency: 45 }) },
  { id: 'anchor', name: 'Defensive Anchor', blurb: 'Almost impossible to pass, and loses time doing it. Rarely attacks.',
    params: P({ late_braking: 55, pass_eagerness: 30, gap_acceptance: 35, defending: 92, side_by_side_caution: 35, tyre_care: 55, energy_deployment: 40, consistency: 65, team_order_compliance: 70, teammate_cooperation: 70 }) },
];

const clampI = (v) => Math.max(0, Math.min(100, Math.round(v)));
const sortedJSON = (o) => JSON.stringify(KEYS.map((k) => o[k]));
export const paramsHash = (params) => (hashString('dna1:' + sortedJSON(params)) >>> 0).toString(36);

export const SLOTS = ['car1', 'car2'];
export function makeProfile(slot, params, origin = 'preset:balanced', name = 'Balanced', parent = null, rev = 1) {
  const p = P(Object.fromEntries(KEYS.map((k) => [k, clampI(params[k] ?? 50)])));
  return { v: DNA_VERSION, slot, name, origin, params: p, rev, parent, hash: paramsHash(p) };
}
export const defaultProfile = (slot) => makeProfile(slot, PRESETS[0].params);
export const fromPreset = (slot, id) => { const pr = PRESETS.find((x) => x.id === id); return pr ? makeProfile(slot, pr.params, 'preset:' + id, pr.name) : null; };

// a blend: [{ id, w }] with weights summing to 100; the result is rounded, so it is deterministic
export function blend(slot, parts, presets = PRESETS) {
  const tot = parts.reduce((s, x) => s + x.w, 0);
  if (Math.abs(tot - 100) > 1e-6) throw new Error('blend weights must add up to 100');
  const out = {};
  for (const k of KEYS) out[k] = parts.reduce((s, x) => s + presets.find((q) => q.id === x.id).params[k] * x.w, 0) / 100;
  const name = parts.filter((x) => x.w > 0).map((x) => `${presets.find((q) => q.id === x.id).name} ${x.w}%`).join(' + ');
  return makeProfile(slot, out, 'blend:' + parts.map((x) => `${x.id}:${x.w}`).join(','), name);
}

// Quick dial value: the average of its settings (inverted ones counted from the other end)
export function quickOf(params, q) {
  const m = q.maps.map((s) => (s[0] === '-' ? 100 - params[s.slice(1)] : params[s]));
  return Math.round(m.reduce((a, b) => a + b, 0) / m.length);
}
export const quickAll = (params) => Object.fromEntries(QUICK.map((q) => [q.key, quickOf(params, q)]));
// moving a Quick dial shifts each of its settings by the same step, so custom offsets survive
export function setQuick(params, key, value) {
  const q = QUICK.find((x) => x.key === key), d = clampI(value) - quickOf(params, q), out = { ...params };
  for (const s of q.maps) { const inv = s[0] === '-', k = inv ? s.slice(1) : s; out[k] = clampI(out[k] + (inv ? -d : d)); }
  return out;
}

export function diff(a, b) {
  const d = {};
  for (const k of KEYS) if (a[k] !== b[k]) d[k] = [a[k], b[k]];
  return d;
}

// a new revision of a profile: same slot, parent pointer, new hash
export function revise(prev, params, origin = 'custom', name = prev.name) {
  return makeProfile(prev.slot, params, origin, name, prev.hash, (prev.rev || 1) + 1);
}

// imported or stored profiles are checked field by field; nothing out of bounds gets through
export function validate(obj, slot) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['not a profile'] };
  if (obj.v !== DNA_VERSION) errors.push(`unknown version ${obj.v}`);
  const ps = obj.params;
  if (!ps || typeof ps !== 'object') errors.push('no settings');
  else {
    for (const k of Object.keys(ps)) if (!KEYS.includes(k)) errors.push(`unknown setting ${k}`);
    for (const k of KEYS) {
      const v = ps[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100 || Math.round(v) !== v) errors.push(`${k} must be a whole number from 0 to 100`);
    }
  }
  if (errors.length) return { ok: false, errors };
  const name = typeof obj.name === 'string' ? obj.name.slice(0, 40).replace(/[<>]/g, '') : 'Imported';
  return { ok: true, errors: [], profile: makeProfile(slot || (SLOTS.includes(obj.slot) ? obj.slot : 'car1'), ps, 'import', name) };
}
// export carries only the profile: no team, device or race data
export const exportProfile = (p) => JSON.stringify({ v: p.v, name: p.name, params: p.params, hash: p.hash });

// ---------- the engine contract ----------
// simInputs turns a profile into bounded modifiers for one driver controller. Every modifier is 1
// (or 0 for additive ones) at 50, so a Balanced driver drives exactly as the engine did before.
// Each is a trade-off: whatever a setting gains it pays for somewhere else (see PARAMS[].cost).
const u = (v) => (v - 50) / 50;   // -1 .. 1
export function simInputs(profile) {
  const x = profile ? profile.params : P({});
  const s = Object.fromEntries(KEYS.map((k) => [k, u(x[k])]));
  return {
    hash: profile ? profile.hash : paramsHash(x),
    // speed plan (applied through a per-driver plan, within the car's limits)
    brake: 1 + 0.15 * s.late_braking,                 // share of the braking limit used
    entry: 1 + 0.015 * s.entry_speed,                  // corner-entry speed
    exit: 1 - 0.01 * s.entry_speed + 0.02 * s.throttle_aggression,   // exit acceleration
    lateral: 1 + 0.02 * s.corner_commitment + 0.006 * s.kerb_usage,  // share of lateral grip used
    // risk and wear that pay for it
    lockup: Math.max(0, s.late_braking) * 1.6 + Math.max(0, s.entry_speed) * 0.6,
    wide: Math.max(0, s.corner_commitment) * 1.2 + Math.max(0, s.kerb_usage) * 0.8 + Math.max(0, s.entry_speed) * 0.5,
    wear: 1 + 0.12 * s.corner_commitment + 0.08 * s.kerb_usage + 0.08 * s.throttle_aggression - 0.22 * s.tyre_care,
    pace: 1 - 0.006 * s.tyre_care,                     // tyre care costs a little pace
    wetPace: 1 + 0.02 * s.wet_confidence - 0.02 * s.throttle_aggression,
    wetRisk: Math.max(0, s.wet_confidence) * 1.5 + Math.max(0, s.throttle_aggression) * 0.8,
    changeDelay: 1 - 0.5 * s.grip_change_response,    // how long a wrong tyre is tolerated
    mistakes: 1 - 0.45 * s.consistency,
    variance: 1 - 0.5 * s.consistency,
    // racecraft
    passP: 1 + 0.6 * s.pass_eagerness,
    passGap: 13 + 3 * s.gap_acceptance,                 // metres behind from which a move starts
    cornerPass: (1 - 0.6 * s.slipstream_patience) * (1 + 0.4 * s.entry_speed),   // appetite for moves into corners
    defend: 0.5 * Math.max(0, s.defending),            // automatic cover when someone is close
    defendCost: 1 - 0.004 * Math.max(0, s.defending),
    contact: 1 - 0.5 * s.side_by_side_caution,
    yieldSide: 0.5 * s.side_by_side_caution,
    // energy and team
    deploy: 1 + 0.5 * s.energy_deployment,
    obey: 1 + s.team_order_compliance,                 // how quickly a team order is carried out
    coop: s.teammate_cooperation,
  };
}

// the version a race uses: a frozen copy taken at the start; edits after that wait for the next race
export function lockForRace(profiles) {
  const out = {};
  for (const slot of SLOTS) out[slot] = Object.freeze({ ...(profiles[slot] || defaultProfile(slot)), params: Object.freeze({ ...(profiles[slot] || defaultProfile(slot)).params }) });
  return Object.freeze(out);
}
export const slotOf = (carId) => (carId === 'you-1' ? 'car2' : 'car1');
