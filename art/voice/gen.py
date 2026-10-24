# Records the race engineer's radio lines once, one mp3 per line per voice, then packs each voice
# into assets/voice/<voice>.js (base64 clips in one file, so a voice is a single download).
# Kokoro (Apache 2.0) and Piper (MIT; the voices used here are CC0) run offline.
# Usage: python3 gen.py <kokoro.onnx> <voices.bin> <piper dir> [voice ...]
import base64, json, os, subprocess, sys, tempfile
import numpy as np, soundfile as sf

VOICES = {  # id: (engine, model, phonemes)
    'michael': ('kokoro', 'am_michael', 'en-us'), 'george': ('kokoro', 'bm_george', 'en-gb'),
    'lewis': ('kokoro', 'bm_lewis', 'en-gb'), 'daniel': ('kokoro', 'bm_daniel', 'en-gb'), 'fable': ('kokoro', 'bm_fable', 'en-gb'),
    'nicola': ('kokoro', 'im_nicola', 'en-us'), 'alex': ('kokoro', 'em_alex', 'en-us'), 'santa': ('kokoro', 'em_santa', 'en-us'),
    'alexpt': ('kokoro', 'pm_alex', 'en-us'), 'santapt': ('kokoro', 'pm_santa', 'en-us'),
    'thorsten': ('piper', 'de_DE-thorsten-high', None), 'ronnie': ('piper', 'nl_NL-ronnie-medium', None), 'gilles': ('piper', 'fr_FR-gilles-low', None),
}
here = os.path.dirname(os.path.abspath(__file__))
lines = json.load(open(os.path.join(here, 'lines.json')))
kok_model, kok_voices, piper_dir = sys.argv[1:4]
only = sys.argv[4:] or list(VOICES)
kok = None; pipers = {}

def speak(engine, model, lang, text):
    global kok
    if engine == 'kokoro':
        if kok is None:
            from kokoro_onnx import Kokoro
            kok = Kokoro(kok_model, kok_voices)
        return kok.create(text, voice=model, speed=1.1, lang=lang)
    from piper import PiperVoice, SynthesisConfig
    if model not in pipers: pipers[model] = PiperVoice.load(os.path.join(piper_dir, model + '.onnx'))
    ch = list(pipers[model].synthesize(text, SynthesisConfig(length_scale=0.92)))
    return np.concatenate([c.audio_float_array for c in ch]), ch[0].sample_rate

for name in only:
    engine, model, lang = VOICES[name]
    out = os.path.join(here, 'clips', name); os.makedirs(out, exist_ok=True)
    pack = {}
    for key, text in lines.items():
        dst = os.path.join(out, key + '.mp3')
        if not os.path.exists(dst):
            a, sr = speak(engine, model, lang, text)
            a = np.asarray(a, dtype=np.float32)
            idx = np.where(np.abs(a) > 0.01)[0]
            if len(idx): a = a[max(0, idx[0] - 240): idx[-1] + 1200]
            a = a / max(1e-3, np.abs(a).max()) * 0.9
            f = min(240, len(a) // 4); a[:f] *= np.linspace(0, 1, f); a[-f:] *= np.linspace(1, 0, f)
            with tempfile.NamedTemporaryFile(suffix='.wav') as t:
                sf.write(t.name, a, sr)
                subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', t.name, '-ac', '1', '-ar', '24000', '-b:a', '40k', dst], check=True)
        pack[key] = base64.b64encode(open(dst, 'rb').read()).decode()
    js = os.path.join(here, '..', '..', 'assets', 'voice', name + '.js')
    with open(js, 'w') as fh: fh.write('export default ' + json.dumps(pack, separators=(',', ':')) + ';\n')
    print(name, len(pack), os.path.getsize(js))
