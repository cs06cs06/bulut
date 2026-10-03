"""Replikleri piper (tr_TR-dfki-medium) ile seslendirir.

Her karakter aynı modelden farklı hız / perde / gürültü ayarıyla ayrışır.
Çıktı: build/audio/<id>.wav (44.1 kHz mono) ve build/audio-meta.json
(süre + ağız hareketi için 24 fps genlik zarfı).
"""
import hashlib, json, os, subprocess, sys, wave
import numpy as np
from piper import PiperVoice, SynthesisConfig

FPS = 24
SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EP = sys.argv[sys.argv.index('--ep') + 1] if '--ep' in sys.argv else os.environ.get('EP', 'yedek-anahtar')
BUILD = os.path.join(ROOT, 'build', EP)
AUD = os.path.join(BUILD, 'audio')
MODEL = os.environ.get('PIPER_MODEL', os.path.join(ROOT, 'voices', 'tr_TR-dfki-medium.onnx'))


def read_wav(path):
    with wave.open(path) as w:
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        return data, w.getframerate()


def write_wav(path, data, sr=SR):
    data = np.clip(data, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((data * 32767).astype(np.int16).tobytes())


def trim(x, thr=0.012, pad=0.04):
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(pad * SR)); b = min(len(x), idx[-1] + int(pad * SR))
    return x[a:b]


def envelope(x):
    hop = SR // FPS
    n = int(np.ceil(len(x) / hop))
    env = np.array([np.sqrt(np.mean(x[i * hop:(i + 1) * hop] ** 2) + 1e-9) for i in range(n)])
    peak = np.percentile(env, 95) + 1e-6
    env = np.clip(env / peak, 0, 1)
    env = np.where(env < 0.08, 0, env)
    return [int(round(v * 100)) for v in env]


def main():
    lines = json.load(open(os.path.join(BUILD, 'lines.json')))
    os.makedirs(AUD, exist_ok=True)
    meta_path = os.path.join(BUILD, 'audio-meta.json')
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    voice = PiperVoice.load(MODEL)
    for i, ln in enumerate(lines):
        v = ln['voice']
        key = hashlib.sha1(json.dumps([ln['text'], v]).encode()).hexdigest()[:12]
        out = os.path.join(AUD, ln['id'] + '.wav')
        if ln['id'] in meta and meta[ln['id']].get('key') == key and os.path.exists(out):
            continue
        raw = os.path.join(AUD, '_raw.wav')
        with wave.open(raw, 'wb') as w:
            cfg = SynthesisConfig(length_scale=v['speed'], noise_scale=v['noise'], noise_w_scale=0.8)
            voice.synthesize_wav(ln['text'], w, syn_config=cfg)
        ratio = 2 ** (v['pitch'] / 12)
        shifted = os.path.join(AUD, '_shift.wav')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-af',
                        f'aresample={SR},rubberband=pitch={ratio:.4f}:formant=shifted,'
                        'highpass=f=70,acompressor=threshold=0.2:ratio=3:attack=5:release=80',
                        '-ac', '1', '-ar', str(SR), shifted], check=True)
        x, _ = read_wav(shifted)
        x = trim(x)
        x = x / (np.max(np.abs(x)) + 1e-6) * 0.85
        write_wav(out, x)
        meta[ln['id']] = {'dur': round(len(x) / SR, 3), 'env': envelope(x), 'key': key, 'who': ln['who']}
        print(f'[{i + 1}/{len(lines)}] {ln["id"]} {meta[ln["id"]]["dur"]:.2f}s  {ln["text"][:50]}', flush=True)
    for f in ('_raw.wav', '_shift.wav'):
        p = os.path.join(AUD, f)
        if os.path.exists(p):
            os.remove(p)
    json.dump(meta, open(meta_path, 'w'))
    total = sum(m['dur'] for m in meta.values())
    print(f'toplam konuşma: {total:.1f} sn')


if __name__ == '__main__':
    main()
