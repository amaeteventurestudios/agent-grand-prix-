// Runs Proving Ground trials off the main thread, one matched pair of races at a time.
import { VENUES } from './data.js';
import { trial, pickSeeds } from './proving.js';

onmessage = (e) => {
  const { venueId, n, weather, a, b } = e.data;
  const venue = VENUES.find((v) => v.id === venueId);
  const seeds = pickSeeds(venue, n, weather);
  postMessage({ seeds });
  let i = 0;
  for (const pair of trial({ venue, seeds, a, b })) postMessage({ pair, i: ++i, n: seeds.length });
  postMessage({ done: true });
};
