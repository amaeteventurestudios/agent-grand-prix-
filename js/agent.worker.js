// Runs your agent's Daily races off the main thread (js/agent.js).
import { VENUES } from './data.js';
import { agentRace } from './agent.js';

onmessage = (e) => {
  const { id, args } = e.data;
  try { postMessage({ id, out: agentRace({ ...args, venue: VENUES.find((v) => v.id === args.venueId) }) }); }
  catch (err) { postMessage({ id, error: String(err && err.message || err) }); }
};
