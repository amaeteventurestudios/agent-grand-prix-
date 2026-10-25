// Weather sources. A race's weather is fixed when the race is set up: a timeline of showers with
// a starting wetness, so a seed always gives the same race. 'simulated' is the seeded model in
// js/sim.js. A live source (real weather at the circuit) can be added here later: it must turn its
// forecast into the same timeline at race start and say where the data came from.
import { makeWeather } from './sim.js';

export const WEATHER_SOURCES = {
  simulated: { label: 'Simulated', note: 'Seeded weather typical of the circuit, not live', make: (venue, seed, duration) => makeWeather(venue, seed, duration) },
};

export function weatherFor(source, venue, seed, duration) {
  const src = WEATHER_SOURCES[source] || WEATHER_SOURCES.simulated;
  const w = src.make(venue, seed, duration);
  w.source = WEATHER_SOURCES[source] ? source : 'simulated';
  return w;
}
