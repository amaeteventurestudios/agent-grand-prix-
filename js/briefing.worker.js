// Runs the pre-race briefing's projection off the main thread (js/briefing.js).
import { VENUES } from './data.js';
import { project } from './briefing.js';

onmessage = (e) => {
  const { args, plans, n } = e.data;
  const venue = VENUES.find((v) => v.id === args.venueId);
  for (const r of project({ ...args, venue }, plans, n)) postMessage(r);
  postMessage({ done: true });
};
