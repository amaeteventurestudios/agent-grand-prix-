// Writes art/voice/brain.json from the drivers' lines in js/brain.js, for art/voice/gen.py:
//   node tools/brain-lines.mjs && LINES=brain python3 art/voice/gen.py <kokoro.onnx> <voices.bin> <piper dir> george lewis daniel fable michael alex
import { writeFileSync } from 'node:fs';
import { LINES } from '../js/brain.js';
writeFileSync(new URL('../art/voice/brain.json', import.meta.url), JSON.stringify(LINES, null, 1) + '\n');
console.log('brain lines:', Object.keys(LINES).length);
