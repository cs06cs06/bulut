# Rocketbox doku hazırlığı: TGA -> PNG, Female_Adult_06 için renk varyantları.
# Entari (haki) takım rengine boyanır, ince kutnu çizgileri eklenir; beyaz yemeni ve oyalı saçak
# kişiye özel renge ve çiçek baskısına çevrilir; ten tonu hafifçe değişir.
# Kullanım: python3 rocketbox-textures.py <rocketbox/Assets/Avatars> <çıktı klasörü>
import sys, os, colorsys
import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

AVATARS = {
    'f06': 'Adults/Female_Adult_06', 'f10': 'Adults/Female_Adult_10',
    'bm01': 'Professions/Business_Male_01', 'bm02': 'Professions/Business_Male_02', 'bm03': 'Professions/Business_Male_03',
    'bm04': 'Professions/Business_Male_04', 'bm05': 'Professions/Business_Male_05', 'bm06': 'Professions/Business_Male_06',
    'm15': 'Adults/Male_Adult_15',
}

def hexrgb(h): return np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255], np.float32) / 255

def rgb_to_hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1); d = mx - mn + 1e-6
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = np.where(mx > 0, (mx - mn) / (mx + 1e-6), 0)
    return h, s, mx

def save(a, name, size):
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8) if a.dtype != np.uint8 else a)
    if size: im = im.resize((size, size) if im.size[0] == im.size[1] else (size, size * im.size[1] // im.size[0]), Image.LANCZOS)
    im.save(os.path.join(OUT, name + '.png'))

# --- tüm avatarların ham dokuları ---
for key, rel in AVATARS.items():
    tdir = os.path.join(SRC, rel, 'Textures')
    for f in sorted(os.listdir(tdir)):
        if not f.endswith('.tga'): continue
        part = f.rsplit('.', 1)[0].split('_', 1)[1]          # body_color, head_normal, opacity_color...
        if 'specular' in part or 'wrinkle' in part: continue
        im = Image.open(os.path.join(tdir, f))
        im = im.convert('RGBA' if 'opacity' in part else 'RGB')
        size = 512 if 'normal' in part else 1024
        if 'opacity' in part: size = 512
        im.resize((size, size * im.size[1] // im.size[0]), Image.LANCZOS).save(os.path.join(OUT, f'{key}_{part}.png'))
    print('dokular:', key)

# --- f06 varyantları ---
d = os.path.join(SRC, AVATARS['f06'], 'Textures')
body = np.asarray(Image.open(os.path.join(d, 'f202_body_color.tga')).convert('RGB'), np.float32) / 255
head = np.asarray(Image.open(os.path.join(d, 'f202_head_color.tga')).convert('RGB'), np.float32) / 255
lace = np.asarray(Image.open(os.path.join(d, 'f202_opacity_color.tga')).convert('RGBA'), np.float32) / 255
H, W = body.shape[:2]
yy, xx = np.mgrid[0:H, 0:W] / np.array([H, W])[:, None, None]

hb, sb, vb = rgb_to_hsv(body)
dress = ((hb > 38) & (hb < 85) & (sb > 0.12)).astype(np.float32)          # haki entari ve şalvar
lumB = body.mean(-1); refB = lumB[dress > 0].mean()

hh, sh, vh = rgb_to_hsv(head)
excl = ((xx < 0.56) & (yy > 0.74)) | ((xx < 0.13) & (yy > 0.6))           # ağız içi, dişler, göz küresi
scarf = ((sh < 0.16) & (vh > 0.42) & ~excl).astype(np.float32)
skin = ((hh > 8) & (hh < 40) & (sh > 0.25) & ~excl).astype(np.float32)
lumH = head.mean(-1); refH = lumH[scarf > 0].mean()
ls = lace[..., :3].mean(-1); laceMask = ((ls > 0.55) & (lace[..., 3] > 0.05)).astype(np.float32)

def flowers(h, w, scale, col, seed):
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32)
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cell = scale
    cy, cx = (y // cell), (x // cell)
    jy = rng.random((int(h // cell) + 2, int(w // cell) + 2)) * 0.5 + 0.25
    jx = rng.random((int(h // cell) + 2, int(w // cell) + 2)) * 0.5 + 0.25
    py = (cy + jy[cy.astype(int), cx.astype(int)]) * cell; px = (cx + jx[cy.astype(int), cx.astype(int)]) * cell
    r = np.hypot(y - py, x - px) / cell
    ang = np.arctan2(y - py, x - px)
    petal = 0.16 + 0.07 * np.cos(5 * ang)
    out = np.clip((petal - r) * 40, 0, 1)
    centre = np.clip((0.06 - r) * 60, 0, 1)
    return out, centre

def variant(name, dressHex, scarfHex, trimHex, tone=1.0, stripes=True, size=1024):
    dc, sc, tc = hexrgb(dressHex), hexrgb(scarfHex), hexrgb(trimHex)
    # entari: ışık-gölgeyi koruyarak yeni renk
    shade = (lumB / refB)[..., None]
    nb = dc[None, None, :] * shade
    if stripes:
        st = (np.abs(((xx * 64) % 1) - 0.5) < 0.06).astype(np.float32)[..., None]
        nb = nb * (1 - st * 0.35) + tc[None, None, :] * shade * st * 0.35
    b2 = body * (1 - dress[..., None]) + np.clip(nb, 0, 1) * dress[..., None]
    save(b2, f'{name}_body_color', size)
    # yemeni: renk + çiçek baskısı, ten tonu
    shadeH = (lumH / refH)[..., None]
    fl, ce = flowers(H, W, 46, tc, hash(name) & 0xffff)
    ns = sc[None, None, :] * shadeH
    ns = ns * (1 - fl[..., None] * 0.8) + tc[None, None, :] * shadeH * fl[..., None] * 0.8
    ns = ns * (1 - ce[..., None]) + np.array([0.95, 0.9, 0.7])[None, None, :] * shadeH * ce[..., None]
    h2 = head * (1 - scarf[..., None]) + np.clip(ns, 0, 1) * scarf[..., None]
    h2 = h2 * (1 - skin[..., None]) + np.clip(h2 * tone, 0, 1) * skin[..., None]
    save(h2, f'{name}_head_color', size)
    # oyalı saçak: rengini trim'e çevir
    l2 = lace.copy()
    l2[..., :3] = lace[..., :3] * (1 - laceMask[..., None]) + (tc[None, None, :] * (ls[..., None] / 0.85)) * laceMask[..., None]
    save(np.clip(l2, 0, 1), f'{name}_opacity_color', 512)
    print('varyant:', name)

V = [
    ('adile', 0x7a1424, 0xf2ead7, 0xc0392b, 1.0), ('zekiye', 0xb3263a, 0xe94e3c, 0xf6d36b, 1.05), ('hatice', 0x9c4a2f, 0xf3d9a4, 0x8f1d21, 0.97),
    ('rukiye', 0x1f4e79, 0x2e86c1, 0xf4f6f7, 1.0), ('nazire', 0x1e6b4f, 0x7fb3a0, 0xffffff, 1.06), ('fitnat', 0x4b2c6f, 0x6c3483, 0xf5cba7, 0.95),
    ('leyla', 0x8e1b4d, 0xfdf2e9, 0xd4ac0d, 1.06),
]
for n, dcol, scol, tcol, tone in V: variant(n, dcol, scol, tcol, tone)
for i, (dcol, scol, tcol) in enumerate([(0x6b4a2f, 0xece3d0, 0x8a3b2b), (0x3b5a3a, 0xd9c7a0, 0x5a2a2a), (0x8a6a3a, 0xf0e6d6, 0x2e4a6b), (0x5a2a2a, 0xe8d8c0, 0xb07a2a)]):
    variant(f'crowd{i}', dcol, scol, tcol, 1.0, stripes=False, size=512)
