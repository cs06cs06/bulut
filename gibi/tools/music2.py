"""Motor 2 müzikleri: swing'li küçük bir caz kombosu (numpy ile sentez).

- kontrbas: Karplus-Strong tel modeli (walking bass)
- Rhodes elektrik piyano: çan benzeri ataklı toplamsal sentez, stereo tremolo
- klarnet: tek harmonikli (odd) dalga, vibrato ve nefes sesi
- davul: fırça (brush) trampet, ride zil, yumuşak bas davul
Çıktılar stereo (N×2) numpy dizileridir.
"""
import numpy as np
from scipy.signal import lfilter, butter, sosfilt

SR = 44100
rng = np.random.default_rng(11)
N = lambda m: 440.0 * 2 ** ((m - 69) / 12)


def _t(d):
    return np.arange(int(d * SR)) / SR


def lp(x, f, o=2):
    return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)


def hp(x, f, o=2):
    return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)


def bp(x, a, b, o=2):
    return sosfilt(butter(o, [a, b], 'band', fs=SR, output='sos'), x)


def ks_pluck(f, d, bright=0.5, decay=0.996):
    """Karplus-Strong tel: geri beslemeli tarak süzgeci (lfilter ile hızlı)."""
    n = int(d * SR)
    P = max(2, int(round(SR / f)))
    exc = rng.uniform(-1, 1, P) * np.hanning(P) ** 0.3
    exc = lp(np.concatenate([exc, np.zeros(4)]), 800 + 5000 * bright)[:P]
    x = np.zeros(n); x[:P] = exc
    a = np.zeros(P + 2); a[0] = 1; a[P] = -0.5 * decay; a[P + 1] = -0.5 * decay
    y = lfilter([1.0], a, x)
    env = np.minimum(1, _t(d) / 0.004) * np.exp(-_t(d) / (d * 0.9 + 0.2))
    return (y * env).astype(np.float32)


def rhodes(f, d, vel=0.6):
    t = _t(d)
    env = np.exp(-t / (0.9 + 200 / f))
    tine = np.sin(2 * np.pi * f * t + 0.8 * np.exp(-t / 0.08) * np.sin(2 * np.pi * f * 7 * t))
    body = 0.4 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.4) + 0.15 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t / 0.2)
    rel = np.clip((d - t) / 0.05, 0, 1)
    return ((tine + body) * env * rel * vel).astype(np.float32)


def clarinet(f, d, vel=0.5):
    t = _t(d)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.2 * t) * np.clip(t / 0.25, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    w = sum(np.sin(k * ph) / k ** 1.3 for k in (1, 3, 5, 7, 9))
    breath = bp(rng.standard_normal(len(t)), f * 1.5, min(f * 6, 15000)) * 0.04
    env = np.clip(t / 0.035, 0, 1) * np.clip((d - t) / 0.06, 0, 1) * (1 - 0.15 * np.clip(t / d, 0, 1))
    return (lp(w + breath, 3200) * env * vel).astype(np.float32)


def ride(d=1.2, vel=0.25):
    t = _t(d)
    parts = sum(np.sin(2 * np.pi * f * t) for f in (3125, 4420, 5310, 6870, 8115))
    x = (parts * 0.15 + hp(rng.standard_normal(len(t)), 6000) * 0.6) * np.exp(-t / 0.35)
    return (x * vel).astype(np.float32)


def brush(d=0.25, vel=0.3):
    t = _t(d)
    x = bp(rng.standard_normal(len(t)), 1500, 9000) * np.exp(-t / 0.07) * np.clip(t / 0.01, 0, 1)
    return (x * vel).astype(np.float32)


def kick(vel=0.5):
    t = _t(0.35)
    return (np.sin(2 * np.pi * (48 + 70 * np.exp(-t / 0.025)) * t) * np.exp(-t / 0.12) * vel).astype(np.float32)


def put(buf, x, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(x))
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[i:j, 0] += x[:j - i] * gain * l * 1.41
    buf[i:j, 1] += x[:j - i] * gain * r * 1.41


# F majör, ii–V–I–VI dönüşü (Gm7 C7 Fmaj7 D7)
CHORDS = [
    (55, [58, 62, 65, 69]), (48, [58, 60, 64, 67]), (53, [57, 60, 64, 65]), (50, [54, 57, 60, 63]),
    (55, [58, 62, 65, 69]), (48, [58, 60, 64, 67]), (53, [57, 60, 64, 69]), (48, [55, 58, 64, 67]),
]
# klarnet motifi: (vuruş, süre, nota)
MELODY = [
    (0, 0.66, 74), (0.66, 0.34, 72), (1, 1, 70), (2.66, 0.34, 69), (3, 1, 70),
    (4, 0.66, 72), (4.66, 0.34, 70), (5, 0.66, 69), (5.66, 0.34, 67), (6, 2, 65),
    (8, 0.66, 69), (8.66, 0.34, 70), (9, 0.66, 72), (9.66, 0.34, 74), (10, 1.5, 77), (11.66, 0.34, 76),
    (12, 0.66, 74), (12.66, 0.34, 72), (13, 0.66, 70), (13.66, 0.34, 69), (14, 1, 70), (15, 1, 67),
    (16, 0.66, 74), (16.66, 0.34, 72), (17, 1, 70), (18.66, 0.34, 69), (19, 1, 70),
    (20, 0.66, 72), (20.66, 0.34, 74), (21, 0.66, 76), (21.66, 0.34, 77), (22, 2, 81),
    (24, 0.66, 79), (24.66, 0.34, 77), (25, 0.66, 76), (25.66, 0.34, 74), (26, 1, 72), (27, 1, 70),
    (28, 0.66, 69), (28.66, 0.34, 67), (29, 1, 65), (31, 1, 77),
]


def combo(bars, bpm=116, melody=True, ending=True, start_bar=0, intensity=1.0):
    beat = 60 / bpm
    sw = lambda b: (np.floor(b) + (0.62 if abs((b % 1) - 0.5) < 0.01 else (b % 1))) * beat  # swing sekizlikler
    total = (bars * 4 + (3 if ending else 0.5)) * beat
    out = np.zeros((int(total * SR) + SR, 2), np.float32)
    for bi in range(bars):
        root, voicing = CHORDS[(start_bar + bi) % len(CHORDS)]
        b0 = bi * 4
        # walking bass: kök, 3'lü, 5'li, kromatik yaklaşım
        nxt = CHORDS[(start_bar + bi + 1) % len(CHORDS)][0]
        walk = [root, root + (3 if voicing[1] - root in (3, 15) else 4), root + 7, nxt + (1 if (bi % 2) else -1)]
        for k, m in enumerate(walk):
            put(out, ks_pluck(N(m - 12), beat * 1.05, 0.35, 0.993), b0 * beat + k * beat, 0.9 * intensity, -0.05)
        # Rhodes: 2 ve 4'te, ara sıra öne kayan vuruş (comping)
        for cb in ([1.62, 3.0] if bi % 2 else [0.62, 2.0, 3.62]):
            for v in voicing:
                put(out, rhodes(N(v), beat * 1.3, 0.13), sw(b0 + cb), 1.0 * intensity, -0.35)
        # davul
        for k in range(4):
            put(out, ride(1.1, 0.22), b0 * beat + k * beat, intensity, 0.45)
            if k in (1, 3):
                put(out, brush(0.3, 0.45), b0 * beat + k * beat, intensity, 0.1)
                put(out, ride(0.6, 0.14), sw(b0 + k + 0.5), intensity, 0.45)
            if k in (0, 2):
                put(out, kick(0.35), b0 * beat + k * beat, intensity, 0)
    if melody:
        for (b, d, m) in MELODY:
            if b >= bars * 4:
                break
            put(out, clarinet(N(m), d * beat * 0.98 + 0.05, 0.42), sw(b), intensity, 0.3)
    if ending:
        te = bars * 4 * beat
        for v in [53, 57, 60, 64, 67]:
            put(out, rhodes(N(v), 2.5, 0.16), te, 1.0, -0.3)
        put(out, ks_pluck(N(41), 2.0, 0.3, 0.996), te, 1.0)
        put(out, ride(2.0, 0.3), te, 1.0, 0.45)
        put(out, clarinet(N(77), beat * 2.5, 0.4), te + beat * 0.02, 1.0, 0.3)
    # hafif oda yankısı (stereo genişlik)
    d1, d2 = int(0.023 * SR), int(0.031 * SR)
    wet = np.zeros_like(out)
    wet[d1:, 0] += out[:-d1, 1] * 0.25
    wet[d2:, 1] += out[:-d2, 0] * 0.25
    return out + lp(wet.T, 5000).T.astype(np.float32)


def theme2():
    return combo(3, 116, True, True)


def outro2():
    return combo(7, 116, True, True, start_bar=0, intensity=0.9)


def sting2(k=0):
    """Sahne geçişi: iki ölçülük kısa bir dönüş, her geçişte farklı akorla."""
    bpm = 116; beat = 60 / bpm
    out = np.zeros((int(5 * beat * SR) + SR, 2), np.float32)
    shift = [0, 5, -2, 3][k % 4]
    root, voicing = CHORDS[(k * 3) % len(CHORDS)]
    for i, m in enumerate([root, root + 7, root + 12 if k % 2 else root + 10]):
        put(out, ks_pluck(N(m - 12 + shift), beat, 0.4, 0.993), i * beat * 0.66, 0.9)
    for v in voicing:
        put(out, rhodes(N(v + shift), beat * 3, 0.13), 2 * beat * 0.66, 1.0, -0.3)
    mot = [(0, 74), (0.5, 72), (1.0, 77)] if k % 2 == 0 else [(0, 69), (0.5, 72), (1.0, 76)]
    for b, m in mot:
        put(out, clarinet(N(m + shift), beat * (0.5 if b < 1 else 1.4), 0.38), b * beat * 1.3, 1.0, 0.3)
    put(out, brush(0.3, 0.4), 0, 1.0, 0.1)
    put(out, ride(1.5, 0.25), 2 * beat * 0.66, 1.0, 0.45)
    return out
