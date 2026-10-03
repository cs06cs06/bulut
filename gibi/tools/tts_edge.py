"""Replikleri Microsoft neural sesleriyle (Edge TTS) seslendirir.

Her karakterin kendi sesi vardır (episodes/<bölüm>.js → cast[].voice.edge);
replik duygusuna (e) göre konuşma hızı ve perdesi ayarlanır. Çıktı:
  build/<bölüm>/audio/<id>.wav  (44.1 kHz mono, temizlenmiş)
  build/<bölüm>/audio-meta.json (süre + dudak senkronu için 24 fps özellikler:
    env = açıklık, rnd = yuvarlaklık (o/u), wid = genişlik (i/e))
"""
import asyncio, hashlib, json, os, ssl, subprocess, sys, wave
import numpy as np
import edge_tts.communicate as C

CA = os.environ.get('SSL_CERT_FILE', '/root/.ccr/ca-bundle.crt')
if os.path.exists(CA):
    C._SSL_CTX = ssl.create_default_context(cafile=CA)

FPS, SR = 24, 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EP = sys.argv[sys.argv.index('--ep') + 1] if '--ep' in sys.argv else os.environ.get('EP', 'yonetim')
BUILD = os.path.join(ROOT, 'build', EP)
AUD = os.path.join(BUILD, 'audio')

# duygu → (hız %, perde Hz, ses %)
EMO = {
    'neutral': (0, 0, 0), 'happy': (6, 5, 5), 'angry': (9, 6, 12), 'surprised': (4, 10, 6),
    'sad': (-10, -5, -6), 'smug': (-4, 1, 0), 'scared': (12, 12, 8), 'tired': (-11, -6, -8),
    'serious': (-5, -2, 0),
}


def read_wav(path):
    with wave.open(path) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768


def write_wav(path, x):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


def features(x):
    hop = SR // FPS
    n = int(np.ceil(len(x) / hop))
    env, rnd, wid = [], [], []
    win = np.hanning(2048)
    freqs = np.fft.rfftfreq(2048, 1 / SR)
    lo = (freqs > 250) & (freqs < 900)
    mid = (freqs > 1000) & (freqs < 2600)
    hi = (freqs > 2600) & (freqs < 5000)
    for i in range(n):
        c = i * hop + hop // 2
        seg = x[max(0, c - 1024):c + 1024]
        if len(seg) < 2048:
            seg = np.pad(seg, (0, 2048 - len(seg)))
        rms = np.sqrt(np.mean(seg ** 2) + 1e-9)
        sp = np.abs(np.fft.rfft(seg * win)) + 1e-9
        el, em, eh = sp[lo].sum(), sp[mid].sum(), sp[hi].sum()
        env.append(rms)
        rnd.append(el / (el + em + eh))   # o/u: enerji alçak bölgede
        wid.append(em / (el + em + eh))   # i/e: ikinci formant yüksek
    env = np.array(env); peak = np.percentile(env, 95) + 1e-6
    env = np.clip(env / peak, 0, 1); env[env < 0.07] = 0
    rnd = np.array(rnd); wid = np.array(wid)
    norm = lambda a: np.clip((a - np.percentile(a, 10)) / (np.percentile(a, 90) - np.percentile(a, 10) + 1e-6), 0, 1)
    rnd, wid = norm(rnd) * (env > 0), norm(wid) * (env > 0)
    q = lambda a: [int(round(v * 100)) for v in a]
    return q(env), q(rnd), q(wid)


async def synth(sem, ln, out_mp3):
    v = ln['voice']
    er, ep, ev = EMO.get(ln.get('e') or 'neutral', (0, 0, 0))
    rate = v.get('rate', 0) + er
    pitch = v.get('pitch', 0) + ep
    vol = ev
    if ln.get('p') and 'fısıl' in ln['p']:
        rate -= 6; vol -= 25
    async with sem:
        for attempt in range(5):
            try:
                com = C.Communicate(ln['text'], v['edge'], rate=f'{rate:+d}%', pitch=f'{pitch:+d}Hz', volume=f'{vol:+d}%')
                await com.save(out_mp3)
                if os.path.getsize(out_mp3) > 500:
                    return
            except Exception as e:  # ağ hatası: biraz bekleyip yeniden dene
                print('  yeniden deneniyor', ln['id'], e, flush=True)
            await asyncio.sleep(2 * (attempt + 1))
        raise RuntimeError(f'seslendirilemedi: {ln["id"]}')


def post(mp3, out):
    tmp = out + '.tmp.wav'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', mp3, '-af',
                    f'aresample={SR},highpass=f=75,equalizer=f=3200:t=q:w=1.2:g=1.5,'
                    'acompressor=threshold=0.18:ratio=2.5:attack=8:release=120:makeup=1.2,'
                    'silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.03,'
                    'areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.06,areverse',
                    '-ac', '1', '-ar', str(SR), tmp], check=True)
    x = read_wav(tmp); os.remove(tmp)
    x = x / (np.max(np.abs(x)) + 1e-6) * 0.85
    # yumuşak giriş/çıkış
    f = min(len(x) // 4, int(0.012 * SR))
    if f > 0:
        x[:f] *= np.linspace(0, 1, f); x[-f:] *= np.linspace(1, 0, f)
    write_wav(out, x)
    return x


async def main():
    lines = json.load(open(os.path.join(BUILD, 'lines.json')))
    os.makedirs(AUD, exist_ok=True)
    meta_path = os.path.join(BUILD, 'audio-meta.json')
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    sem = asyncio.Semaphore(4)
    todo = []
    for ln in lines:
        key = hashlib.sha1(json.dumps([ln['text'], ln['voice'], ln.get('e'), ln.get('p')]).encode()).hexdigest()[:12]
        ln['key'] = key
        out = os.path.join(AUD, ln['id'] + '.wav')
        if ln['id'] in meta and meta[ln['id']].get('key') == key and os.path.exists(out):
            continue
        todo.append(ln)
    print(f'{len(todo)}/{len(lines)} replik seslendirilecek', flush=True)

    async def one(ln):
        mp3 = os.path.join(AUD, ln['id'] + '.mp3')
        await synth(sem, ln, mp3)
        out = os.path.join(AUD, ln['id'] + '.wav')
        x = post(mp3, out); os.remove(mp3)
        env, rnd, wid = features(x)
        meta[ln['id']] = {'dur': round(len(x) / SR, 3), 'env': env, 'rnd': rnd, 'wid': wid, 'key': ln['key'], 'who': ln['who']}
        print(f'  {ln["id"]:16s} {meta[ln["id"]]["dur"]:5.2f}s  {ln["voice"]["edge"][:22]:22s} {ln["text"][:48]}', flush=True)

    await asyncio.gather(*(one(ln) for ln in todo))
    json.dump(meta, open(meta_path, 'w'))
    print(f'toplam konuşma: {sum(m["dur"] for m in meta.values()):.1f} sn')


asyncio.run(main())
