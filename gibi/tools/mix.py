"""Bölüm ses miksajı: replikler + sentezlenmiş efektler + müzik + ortam sesi.

Girdi : build/timeline.json, build/audio/*.wav
Çıktı : build/episode.wav (44.1 kHz stereo) ve build/episode.m4a
Bütün efektler ve müzik burada numpy ile sıfırdan üretilir (dış ses dosyası yok).
"""
import json, os, sys, subprocess, wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EP = sys.argv[sys.argv.index('--ep') + 1] if '--ep' in sys.argv else os.environ.get('EP', 'yedek-anahtar')
BUILD = os.path.join(ROOT, 'build', EP)
rng = np.random.default_rng(7)


def read_wav(path):
    with wave.open(path) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768


def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)


def bp(x, f0, f1, order=2):
    return sosfilt(butter(order, [f0, f1], 'band', fs=SR, output='sos'), x)


def tt(d):
    return np.arange(int(d * SR)) / SR


def env_exp(d, tau):
    return np.exp(-tt(d) / tau)


def noise(d):
    return rng.standard_normal(int(d * SR)).astype(np.float32)


def place(buf, x, at, gain=1.0):
    i = int(at * SR)
    if i < 0:
        x = x[-i:]; i = 0
    j = min(len(buf), i + len(x))
    if j > i:
        buf[i:j] += x[:j - i] * gain


# ---------------------------------------------------------------- efektler
def thump(f=110, d=0.18, tau=0.04, nz=0.6, nlp=900):
    t = tt(d)
    body = np.sin(2 * np.pi * f * t * (1 - 0.3 * t / d)) * np.exp(-t / tau)
    n = lp(noise(d), nlp) * np.exp(-t / (tau * 0.6)) * nz
    return (body + n).astype(np.float32)


def click(d=0.03, f=3500):
    t = tt(d)
    return (bp(noise(d), f * 0.6, min(f * 1.6, 18000)) * np.exp(-t / 0.004) * 2.2).astype(np.float32)


def creak(d=0.8, f0=260, f1=420):
    t = tt(d)
    f = np.linspace(f0, f1, len(t)) * (1 + 0.04 * np.sin(2 * np.pi * 9 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    saw = 2 * ((ph / (2 * np.pi)) % 1) - 1
    am = (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 23 * t))) * np.sin(np.pi * t / d) ** 0.5
    return (bp(saw, 300, 2500) * am * 0.35).astype(np.float32)


def jingle(d=0.5, n=9):
    out = np.zeros(int(d * SR), np.float32)
    for _ in range(n):
        f = rng.uniform(3000, 7000)
        at = rng.uniform(0, d * 0.6)
        tone = np.sin(2 * np.pi * f * tt(0.12)) * env_exp(0.12, 0.025) * rng.uniform(0.15, 0.35)
        place(out, tone.astype(np.float32), at)
    return out


def marimba(f, d=0.35, a=1.0):
    t = tt(d)
    return ((np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t / 0.02)) * np.exp(-t / 0.12) * a).astype(np.float32)


def sfx_bank():
    B = {}
    k = np.zeros(int(0.9 * SR), np.float32)
    for i in range(3):
        place(k, thump(150, 0.15, 0.03, 0.9, 1500), i * 0.26)
    B['knock'] = k * 0.9
    o = np.zeros(int(0.9 * SR), np.float32)
    place(o, click(0.04, 2500), 0); place(o, click(0.03, 4000), 0.06); place(o, creak(0.7, 240, 360) * 0.6, 0.12)
    B['doorOpen'] = o
    c = np.zeros(int(0.5 * SR), np.float32)
    place(c, thump(95, 0.25, 0.05, 0.5), 0); place(c, click(0.03, 3000), 0.03)
    B['doorClose'] = c * 0.9
    s = np.zeros(int(1.0 * SR), np.float32)
    place(s, thump(70, 0.6, 0.12, 1.2, 1200) * 1.4, 0); place(s, click(0.05, 2500) * 0.8, 0.02)
    place(s, (bp(noise(0.35), 600, 3000) * env_exp(0.35, 0.06) * 0.25).astype(np.float32), 0.05)
    B['slam'] = s
    ph = np.zeros(int(2.4 * SR), np.float32)
    notes = [659, 784, 988, 1319, 988, 784]
    for rep in range(2):
        for i, f in enumerate(notes):
            place(ph, marimba(f, 0.3, 0.55), rep * 1.15 + i * 0.13)
    B['phone'] = ph
    u = np.zeros(int(0.7 * SR), np.float32)
    place(u, jingle(0.4, 6), 0); place(u, click(0.03, 3000), 0.35); place(u, click(0.03, 2200), 0.45)
    B['unlock'] = u
    B['click'] = (click(0.04, 2800) + np.pad(click(0.03, 1800), (int(0.02 * SR), 0))[:int(0.04 * SR)]).astype(np.float32)
    cl = bp(noise(0.7), 400, 4000) * np.sin(np.pi * tt(0.7) / 0.7) ** 2 * 0.25
    B['cloth'] = cl.astype(np.float32)
    B['keys'] = jingle(0.5, 10)
    B['creak'] = creak(1.0, 220, 380)
    w = lp(noise(2.0), 600, 2) * np.sin(np.pi * tt(2.0) / 2.0) ** 2 * 0.9
    w = w * (1 + 0.3 * np.sin(2 * np.pi * 1.3 * tt(2.0)))
    B['wind'] = w.astype(np.float32)
    # minibüs: motor gelir, frene basar
    d = 3.8; t = tt(d)
    f = 42 + 10 * np.clip(t / 2.5, 0, 1)
    eng = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.5 * np.sin(4 * np.pi * np.cumsum(f) / SR)
    eng = lp(eng + 0.4 * noise(d), 400) * np.clip(t / 1.5, 0, 1) * np.clip((d - t) / 0.4, 0, 1)
    sq = np.sin(2 * np.pi * 2300 * tt(0.35)) * np.sin(np.pi * tt(0.35) / 0.35) * 0.08
    van = eng * 0.5
    place(van, sq.astype(np.float32), 2.9)
    B['van'] = van.astype(np.float32)
    vd = np.zeros(int(0.8 * SR), np.float32)
    place(vd, (bp(noise(0.4), 200, 1500) * env_exp(0.4, 0.15) * 0.3).astype(np.float32), 0)
    place(vd, thump(80, 0.3, 0.06, 0.8), 0.4)
    B['vanDoor'] = vd
    sc = bp(noise(0.7), 1500, 6000) * (0.5 + 0.5 * np.sin(2 * np.pi * 14 * tt(0.7))) * 0.25
    B['scratch'] = sc.astype(np.float32)
    # telefon tuşları
    ty = np.zeros(int(1.8 * SR), np.float32)
    for i in range(13):
        place(ty, click(0.02, rng.uniform(2500, 4000)) * 0.35, 0.05 + i * 0.12 + rng.uniform(0, 0.03))
    B['typing'] = ty
    er = np.zeros(int(0.6 * SR), np.float32)
    for i in range(2):
        tone = np.sign(np.sin(2 * np.pi * 220 * tt(0.14))) * 0.12
        place(er, lp(tone, 2000).astype(np.float32), i * 0.18)
    B['error'] = er
    okk = np.zeros(int(0.9 * SR), np.float32)
    for i, f in enumerate([784, 988, 1319]):
        place(okk, marimba(f, 0.4, 0.45), i * 0.09)
    B['ok'] = okk
    B['tap'] = marimba(1568, 0.15, 0.25)
    bell = np.zeros(int(1.2 * SR), np.float32)
    for k in range(3):
        tb = tt(1.0)
        ding = (np.sin(2 * np.pi * 2093 * tb) + 0.5 * np.sin(2 * np.pi * 3136 * tb)) * np.exp(-tb / 0.25) * 0.25
        place(bell, ding.astype(np.float32), k * 0.07)
    B['bell'] = bell
    cash = np.zeros(int(1.0 * SR), np.float32)
    place(cash, thump(160, 0.12, 0.02, 0.8, 3000), 0)
    place(cash, jingle(0.3, 6), 0.08)
    tb = tt(0.8)
    place(cash, ((np.sin(2 * np.pi * 2637 * tb) + np.sin(2 * np.pi * 3520 * tb)) * np.exp(-tb / 0.2) * 0.22).astype(np.float32), 0.15)
    B['cash'] = cash
    pg = bp(noise(0.35), 1000, 7000) * np.sin(np.pi * tt(0.35) / 0.35) ** 3 * 0.35
    B['page'] = pg.astype(np.float32)
    tw = tt(0.9)
    trill = 1 + 0.5 * (np.sin(2 * np.pi * 28 * tw) > 0)
    wh = (np.sin(2 * np.pi * 2900 * tw) * trill * 0.5 + bp(noise(0.9), 2500, 4000) * 0.3) * np.clip(np.minimum(tw / 0.02, (0.9 - tw) / 0.08), 0, 1) * 0.35
    B['whistle'] = wh.astype(np.float32)
    tc = tt(6.0)
    crowd = bp(noise(6.0), 300, 2500) * (0.5 + 0.2 * np.sin(2 * np.pi * 0.4 * tc)) * np.clip(np.minimum(tc / 0.6, (6 - tc) / 1.5), 0, 1) * 0.35
    B['crowd'] = crowd.astype(np.float32)
    bub = np.zeros(int(3.0 * SR), np.float32)
    for k in range(18):
        tb = tt(0.12)
        f0 = rng.uniform(400, 1100)
        place(bub, (np.sin(2 * np.pi * (f0 + 2500 * tb) * tb) * np.exp(-tb / 0.03) * 0.18).astype(np.float32), rng.uniform(0, 2.7))
    for i, n in enumerate([60, 64, 67, 72, 67, 64]):
        place(bub, marimba(440 * 2 ** ((n - 69) / 12), 0.5, 0.18), i * 0.4)
    B['bubbles'] = bub
    return B


# ---------------------------------------------------------------- müzik
def pluck(f, d=0.3, a=0.5):
    t = tt(d)
    tri = 2 * np.abs(2 * ((f * t) % 1) - 1) - 1
    return ((0.6 * tri + 0.6 * np.sin(2 * np.pi * f * t)) * np.exp(-t / 0.09) * a).astype(np.float32)


def bass(f, d=0.25, a=0.6):
    t = tt(d)
    sq = np.sign(np.sin(2 * np.pi * f * t))
    return (lp(sq, 500) * np.exp(-t / 0.12) * a).astype(np.float32)


def kick():
    t = tt(0.3)
    return (np.sin(2 * np.pi * (50 + 120 * np.exp(-t / 0.03)) * t) * np.exp(-t / 0.08)).astype(np.float32)


def snare():
    return (bp(noise(0.2), 800, 6000) * env_exp(0.2, 0.045) * 0.6 + np.sin(2 * np.pi * 190 * tt(0.2)) * env_exp(0.2, 0.03) * 0.4).astype(np.float32)


def hat():
    return (hp(noise(0.06), 7000) * env_exp(0.06, 0.012) * 0.35).astype(np.float32)


N = lambda m: 440 * 2 ** ((m - 69) / 12)


def theme(bars=4, bpm=132, ending=True):
    beat = 60 / bpm
    out = np.zeros(int((bars * 4 * beat + 1.5) * SR), np.float32)
    # şen, biraz tuhaf bir motif (C majör, bir kromatik geçişle)
    mel = [72, None, 76, 79, None, 78, 79, None, 81, 79, 76, None, 74, 75, 76, None]
    mel2 = [72, None, 76, 79, None, 78, 79, None, 84, 83, 81, 79, 77, 76, 74, 72]
    roots = [48, 53, 55, 48]
    for b in range(bars):
        t0 = b * 4 * beat
        m = mel if b % 2 == 0 else mel2
        for i, n in enumerate(m):
            if n is not None:
                place(out, pluck(N(n), 0.28, 0.32), t0 + i * beat / 4)
        r = roots[b % 4]
        for i, off in enumerate([0, 7, 12, 7]):
            place(out, bass(N(r + off), beat * 0.9, 0.42), t0 + i * beat)
        for i in range(4):
            place(out, kick() * 0.7, t0 + i * beat) if i % 2 == 0 else place(out, snare() * 0.55, t0 + i * beat)
            place(out, hat(), t0 + i * beat + beat / 2)
    if ending:
        te = bars * 4 * beat
        for n in [60, 64, 67, 72]:
            place(out, pluck(N(n), 1.2, 0.3), te)
        place(out, bass(N(36), 1.0, 0.5), te)
        place(out, kick(), te)
    return out


def sting():
    bpm = 150; beat = 60 / bpm
    out = np.zeros(int(2.0 * SR), np.float32)
    for i, n in enumerate([79, 76, 72]):
        place(out, pluck(N(n), 0.3, 0.32), i * beat / 2)
    place(out, pluck(N(74), 0.6, 0.3), 1.5 * beat)
    place(out, bass(N(43), 0.3, 0.5), 0); place(out, bass(N(48), 0.5, 0.5), 1.5 * beat)
    place(out, kick() * 0.6, 0); place(out, snare() * 0.4, 1.5 * beat)
    return out


# ---------------------------------------------------------------- ortam
def ambience(name, d):
    n = int(d * SR)
    if n <= 0:
        return np.zeros(0, np.float32)
    base = lp(np.cumsum(rng.standard_normal(n)) * 0.02, 300)
    base = hp(base, 30) * 0.5
    if name == 'street':
        traffic = lp(rng.standard_normal(n), 500) * 0.25
        out = (base + traffic) * 0.8
        tb = 0.5
        while tb < d - 0.5:
            f0 = rng.uniform(2600, 4200)
            chirp_t = tt(0.12)
            ch = np.sin(2 * np.pi * (f0 + 1500 * chirp_t / 0.12) * chirp_t) * np.sin(np.pi * chirp_t / 0.12) * 0.08
            for k in range(rng.integers(2, 4)):
                place(out, ch.astype(np.float32), tb + k * 0.16)
            tb += rng.uniform(1.8, 4.5)
        return out.astype(np.float32)
    if name == 'kitchen':
        sz = hp(rng.standard_normal(n), 3000) * 0.05
        pops = (rng.random(n) > 0.9993) * rng.standard_normal(n) * 0.6
        return (base + sz + hp(pops, 2000)).astype(np.float32)
    if name == 'shop':
        t = np.arange(n) / SR
        hum = (np.sin(2 * np.pi * 100 * t) * 0.012 + np.sin(2 * np.pi * 200 * t) * 0.004)
        return (base + hum + hp(rng.standard_normal(n), 5000) * 0.004).astype(np.float32)
    if name == 'hall':
        hum = np.sin(2 * np.pi * 50 * np.arange(n) / SR) * 0.01
        return (base * 1.2 + hum).astype(np.float32)
    return base.astype(np.float32)


def room_ir(rt=0.25, wet=1.0):
    t = tt(rt)
    ir = rng.standard_normal(len(t)) * np.exp(-t / (rt / 5))
    ir = lp(ir, 5000)
    ir[0] = 0
    return (ir / np.sqrt(np.sum(ir ** 2)) * wet).astype(np.float32)


def main():
    tl = json.load(open(os.path.join(BUILD, 'timeline.json')))
    dur = tl['duration'] + 1.0
    n = int(dur * SR)
    dia = np.zeros(n, np.float32)
    dia_wet = {'room': np.zeros(n, np.float32), 'hall': np.zeros(n, np.float32), 'street': np.zeros(n, np.float32)}
    fx = np.zeros(n, np.float32)
    mus = np.zeros(n, np.float32)
    amb = np.zeros(n, np.float32)

    def scene_amb(t):
        for a in tl['ambience']:
            if a['start'] <= t <= a['end']:
                return a['name']
        return 'room'

    for ln in tl['lines']:
        for aid in ln['audio']:
            x = read_wav(os.path.join(BUILD, 'audio', aid + '.wav'))
            if ln['os']:  # kapı arkasından: boğuk
                x = lp(x, 1100, 4) * 1.1
            g = 0.8 if len(ln['audio']) > 1 else 1.0
            place(dia, x, ln['start'], g)
            sa = scene_amb(ln['start'])
            key = 'hall' if sa == 'hall' else 'street' if sa == 'street' else 'room'
            place(dia_wet[key], x, ln['start'], g)
    dia = dia + fftconvolve(dia_wet['room'], room_ir(0.3, 0.16))[:n] + fftconvolve(dia_wet['hall'], room_ir(0.7, 0.3))[:n] \
        + fftconvolve(dia_wet['street'], room_ir(0.15, 0.05))[:n]

    B = sfx_bank()
    gains = {'knock': 0.8, 'slam': 0.5, 'phone': 0.5, 'van': 0.7, 'wind': 0.5}
    for s in tl['sfx']:
        if s['name'] in B:
            place(fx, B[s['name']], s['t'], gains.get(s['name'], 0.6))
        else:
            print('efekt yok:', s['name'])
    fx = fx + fftconvolve(fx, room_ir(0.35, 0.2))[:n]

    for m in tl['music']:
        if m['name'] == 'theme':
            place(mus, theme(3, 132, True) * 0.75, m['t'] - 0.1)
        elif m['name'] == 'outro':
            th = theme(7, 132, True)
            tx = np.arange(len(th)) / SR
            fade = np.clip((len(th) / SR - tx) / 2.5, 0, 1)
            place(mus, th * fade * 0.6, m['t'])
        elif m['name'] == 'sting':
            place(mus, sting() * 0.5, m['t'])

    for a in tl['ambience']:
        x = ambience(a['name'], a['end'] - a['start'])
        L = len(x)
        if L:
            tx = np.arange(L) / SR
            f = np.clip(np.minimum(tx, L / SR - tx) / 0.5, 0, 1)
            place(amb, x * f, a['start'], 0.1 if a['name'] != 'street' else 0.07)

    mix = dia * 0.95 + fx * 0.8 + mus + amb
    # yumuşak sınırlayıcı
    peak = np.max(np.abs(mix)) + 1e-9
    mix = mix / max(1.0, peak / 0.98)
    mix = np.tanh(mix * 1.15) / np.tanh(1.15)
    st = np.stack([mix, mix], 1)
    out = os.path.join(BUILD, 'episode.wav')
    with wave.open(out, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(st, -1, 1) * 32767).astype(np.int16).tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', out, '-c:a', 'aac', '-b:a', '160k',
                    os.path.join(BUILD, 'episode.m4a')], check=True)
    print(f'miks tamam: {dur:.1f} sn -> {BUILD}/episode.m4a')


if __name__ == '__main__':
    main()
