// The drivers' spoken voice for free talk: Kokoro (Apache 2.0, via kokoro-js) reads one sentence of a
// driver's AI reply in that driver's own voice, the same voices the game's recorded clips use. Runs
// on the server's CPU (fp32 is the fastest there: a short sentence in under a second), one sentence
// at a time, and answers with a small 16-bit WAV. The model downloads once into HF_CACHE.
const VOICES = { george: 'bm_george', lewis: 'bm_lewis', daniel: 'bm_daniel', fable: 'bm_fable', michael: 'am_michael', alex: 'em_alex' };
const SPEED = 1.1; // race radio is brisk, as in art/voice/gen.py

let tts = null, queue = Promise.resolve();
export function warm() {
  tts ||= (async () => {
    const T = await import('@huggingface/transformers');
    if (process.env.HF_CACHE) T.env.cacheDir = process.env.HF_CACHE;
    const { KokoroTTS } = await import('kokoro-js');
    return KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'cpu' });
  })().catch((e) => { tts = null; throw e; });
  return tts;
}

export const voiceFor = (id) => VOICES[id] || null;

// one sentence in, a WAV out; sentences wait their turn so the CPU never runs two at once
export function speak(text, id) {
  const voice = voiceFor(id), t = String(text || '').trim().slice(0, 240);
  if (!voice || !t) return Promise.resolve(null);
  const job = queue.then(async () => {
    const m = await warm();
    const a = await m.generate(t, { voice, speed: SPEED });
    return wav16(a.audio, a.sampling_rate);
  });
  queue = job.catch(() => {});
  return job;
}

export function wav16(samples, rate) {
  const n = samples.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return b;
}
