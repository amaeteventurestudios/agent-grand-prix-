# Records the race engineer's radio lines with Kokoro (Apache 2.0), one mp3 per line per voice.
# Usage: python3 gen.py <kokoro.onnx> <voices.bin>   (writes ../../assets/voice/<voice>/<id>.mp3)
import json, os, subprocess, sys, tempfile
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

VOICES = {'michael': ('am_michael', 'en-us'), 'george': ('bm_george', 'en-gb'), 'heart': ('af_heart', 'en-us'), 'emma': ('bf_emma', 'en-gb')}
here = os.path.dirname(os.path.abspath(__file__))
lines = json.load(open(os.path.join(here, 'lines.json')))
k = Kokoro(sys.argv[1], sys.argv[2])
only = sys.argv[3:] or list(VOICES)
for name in only:
    vid, lang = VOICES[name]
    out = os.path.join(here, '..', '..', 'assets', 'voice', name); os.makedirs(out, exist_ok=True)
    for key, text in lines.items():
        dst = os.path.join(out, key + '.mp3')
        if os.path.exists(dst): continue
        a, sr = k.create(text, voice=vid, speed=1.12, lang=lang)
        # trim silence, short fades
        idx = np.where(np.abs(a) > 0.01)[0]
        if len(idx): a = a[max(0, idx[0] - 240): idx[-1] + 1200]
        f = min(240, len(a) // 4); a[:f] *= np.linspace(0, 1, f); a[-f:] *= np.linspace(1, 0, f)
        with tempfile.NamedTemporaryFile(suffix='.wav') as t:
            sf.write(t.name, a, sr)
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', t.name, '-ac', '1', '-ar', '24000', '-b:a', '40k', dst], check=True)
    print(name, 'done')
