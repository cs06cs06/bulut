# tree-bake.mjs'in ürettiği ağaç görüntülerini (her ağaç için 3 açı) tek bir doku atlasına dizer.
# Saydam piksellerin rengi komşulardan doldurulur (mipmap'te koyu hale oluşmasın), zemindeki kum
# tümseği kesilir. Kullanım: python3 tools/tree-atlas.py <bake klasörü> <çıktı.webp> <çıktı.json> id...
import json, sys
import numpy as np
from PIL import Image

src, out_img, out_json, *ids = sys.argv[1:]
T = 512
rows = []
atlas = np.zeros((T * len(ids), T * 3, 4), np.float32)


def bleed(a):
    rgb, al = a[..., :3], a[..., 3:] > 0.02
    rgb = rgb * al
    w = al.astype(np.float32)
    for _ in range(24):
        s = np.zeros_like(rgb); n = np.zeros_like(w)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            s += np.roll(rgb * w, (dy, dx), (0, 1)); n += np.roll(w, (dy, dx), (0, 1))
        fill = (w[..., 0] == 0) & (n[..., 0] > 0)
        rgb[fill] = s[fill] / n[fill]
        w[fill] = 1
    a[..., :3] = rgb
    return a


for r, tid in enumerate(ids):
    meta = json.load(open(f'{src}/{tid}.json'))
    cy, half = meta['center'][1], meta['half']
    ground = int(round(T / 2 + cy / half * T / 2))          # y=0'ın görüntüdeki satırı
    cut = ground - int(round(0.07 / half * T / 2))          # zeminin 7 cm üstüne kadar (kum tümseği)
    crops = []
    for k in range(3):
        a = np.asarray(Image.open(f'{src}/{tid}_{k}.png').convert('RGBA'), np.float32) / 255
        a = a.copy()
        a[cut:, :, 3] = 0
        ys, xs = np.nonzero(a[..., 3] > 0.1)
        crops.append([int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1])
        atlas[r * T:(r + 1) * T, k * T:(k + 1) * T] = bleed(a)
    rows.append({'id': tid, 'row': r, 'crop': crops, **meta})

img = Image.fromarray((np.clip(atlas, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
img.save(out_img, 'WEBP', quality=84, method=6, alpha_quality=90)
json.dump({'tile': T, 'cols': 3, 'rowsN': len(ids), 'trees': rows}, open(out_json, 'w'), indent=1)
print(out_img, img.size)
