// The ten cars of the series: names, default liveries and their strengths. No Three.js here, so
// the race engine and Node tests can read it.
//
// Each car trades one strength against another: corners (cornering grip), braking (braking power
// and the speed it carries into a corner) and straights (top speed and pull). The three always add
// up to zero, and one step of any of them is worth the same lap time (0.4%) averaged over every
// circuit in the calendar, so no car is faster overall: each is faster somewhere.
export const CARS = [
  { id: 'falcon', name: 'Falcon', line: 'Wheel pods, big glass canopy', c1: '#2a2d33', c2: '#9be01c', glow: '#d8ff6a', corners: 1, braking: 0, straights: -1 },
  { id: 'vortex', name: 'Vortex', line: 'Needle nose, open wheels', c1: '#17191e', c2: '#d8262c', glow: '#ff2a2a', corners: 0, braking: -1, straights: 1 },
  { id: 'spectre', name: 'Spectre', line: 'Graphite wheel pods', c1: '#2c2f35', c2: '#d61a2b', glow: '#ffffff', corners: -1, braking: 1, straights: 0 },
  { id: 'raptor', name: 'Raptor', line: 'Hooked fenders, light strips', c1: '#22252b', c2: '#ff7a1a', glow: '#ffffff', corners: 1, braking: -1, straights: 0 },
  { id: 'arrowhead', name: 'Arrowhead', line: 'Fighter-jet scoop', c1: '#3a3f47', c2: '#ff6a13', glow: '#ff8a3a', corners: -1, braking: 0, straights: 1 },
  { id: 'manta', name: 'Manta', line: 'Wing on curved hoops', c1: '#2f3238', c2: '#d6f20c', glow: '#ffffff', corners: 0, braking: 1, straights: -1 },
  { id: 'kestrel', name: 'Kestrel', line: 'Wing-like fenders', c1: '#4a4f57', c2: '#ff7417', glow: '#ffffff', corners: 0.5, braking: 0.5, straights: -1 },
  { id: 'stratos', name: 'Stratos', line: 'Light-framed intakes', c1: '#33363c', c2: '#c9f51d', glow: '#ffffff', corners: 1, braking: -0.5, straights: -0.5 },
  { id: 'peregrine', name: 'Peregrine', line: 'Built for top speed', c1: '#eceef1', c2: '#e8501e', glow: '#ffffff', corners: -0.5, braking: -0.5, straights: 1 },
  { id: 'tempest', name: 'Tempest', line: 'Turbine fan, red tunnels', c1: '#1c1e23', c2: '#e0202e', glow: '#ff3040', corners: -0.5, braking: 1, straights: -0.5 },
];
export const carById = (id) => CARS.find((c) => c.id === id) || null;

// one step of each strength, up and down (solved against the calendar, see tools/test/cars.test.mjs)
const STEP = {
  lateral: [1.0147, 0.9855],
  brake: [1.16, 0.857], entry: [1.0178, 0.9943],
  top: [1.00995, 0.99025],
};
const at = (k, t) => (t >= 0 ? 1 + t * (STEP[k][0] - 1) : 1 + -t * (STEP[k][1] - 1));

// what the engine needs from a car: multipliers on cornering grip, braking, corner entry and top
// speed (js/track.js driverPlan). No car, or an unknown one, is neutral.
export function carMods(id) {
  const c = carById(id);
  if (!c) return null;
  return { lateral: at('lateral', c.corners), brake: at('brake', c.braking), entry: at('entry', c.braking), top: at('top', c.straights) };
}

// which car each team races: yours is the one you pick; the nine other teams take the rest of the
// series in order, so all ten cars are on the grid
export function teamCars(teamIds, mine) {
  const rest = CARS.map((c) => c.id).filter((id) => id !== mine);
  const out = {};
  teamIds.forEach((id, i) => { out[id] = rest[i % rest.length]; });
  out.you = mine;
  return out;
}

// strengths as 0..100 bars for the garage (50 is the series average)
export function strengthBars(id) {
  const c = carById(id);
  return c ? [['Corners', c.corners], ['Braking', c.braking], ['Straights', c.straights]].map(([k, v]) => [k, Math.round(50 + v * 35)]) : [];
}
