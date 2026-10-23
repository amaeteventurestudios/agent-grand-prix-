// Quick check before a deploy: a full race runs to the end, and the chat handler answers.
import { VENUES } from '../js/data.js';
import { setupRace } from '../js/game.js';
const s = setupRace({ venue: VENUES[0], seed: 1, auto: true }); const R = s.make(); R.start();
for (let i = 0; i < 300000 && !R.done; i++) R.step();
if (!R.done || !R.result?.length) { console.error('race did not finish'); process.exit(1); }
console.log('race ok:', R.result[0].car.code, 'wins in', VENUES[0].city);
