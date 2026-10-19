#!/usr/bin/env python3
"""Derinlik (parallax) efekti: tek bir fotoğraftan "3D fotoğraf" hissi veren kısa bir klip üretir.

Görselin derinlik haritası açık kaynak Depth Anything V2 (small, ONNX) modeliyle bilgisayarda çıkarılır; kamera
hafifçe kayarken ya da yaklaşırken yakın nesneler uzaktakilerden daha fazla hareket eder. Yeni nesne türemez,
bu yüzden kalabalık sahnelerde de güvenlidir. API çağrısı yoktur.

Kullanım: parallax.py MODEL GÖRSEL ÇIKTI.mp4 --mode push|pull|left|right --seconds 6 --fps 25 --size 1920x1080
Gerekenler: numpy, opencv-python-headless, onnxruntime, ffmpeg.
"""

import argparse
import subprocess

import cv2
import numpy as np
import onnxruntime as ort


def depth_map(sess: ort.InferenceSession, img: np.ndarray) -> np.ndarray:
    """0 (uzak) … 1 (yakın) arası, görselle aynı boyutta, yumuşatılmış derinlik."""
    h, w = img.shape[:2]
    ih = 518
    iw = max(14, int(round(ih * w / h / 14)) * 14)
    x = cv2.resize(img, (iw, ih), interpolation=cv2.INTER_AREA)[:, :, ::-1].astype(np.float32) / 255
    x = (x - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
    d = sess.run(None, {sess.get_inputs()[0].name: x.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
    lo, hi = np.percentile(d, 2), np.percentile(d, 98)
    d = np.clip((d - lo) / (hi - lo + 1e-6), 0, 1).astype(np.float32)
    d = cv2.resize(d, (w, h), interpolation=cv2.INTER_CUBIC)
    return cv2.GaussianBlur(d, (0, 0), max(2.0, w / 320))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('model')
    ap.add_argument('image')
    ap.add_argument('out')
    ap.add_argument('--mode', default='push', choices=['push', 'pull', 'left', 'right'])
    ap.add_argument('--seconds', type=float, default=6)
    ap.add_argument('--fps', type=int, default=25)
    ap.add_argument('--size', default='1920x1080')
    ap.add_argument('--strength', type=float, default=0.022, help='yakın–uzak arası en fazla kayma (genişliğe oran)')
    a = ap.parse_args()
    W, H = (int(v) for v in a.size.split('x'))

    img = cv2.imread(a.image)
    if img is None:
        raise SystemExit(f'görsel okunamadı: {a.image}')
    # Çıktı oranında, kenarlar görünmesin diye biraz büyük çalışma alanı
    m = 1.10
    bw, bh = int(W * m), int(H * m)
    s = max(bw / img.shape[1], bh / img.shape[0])
    big = cv2.resize(img, (round(img.shape[1] * s), round(img.shape[0] * s)), interpolation=cv2.INTER_LANCZOS4)
    y0, x0 = (big.shape[0] - bh) // 2, (big.shape[1] - bw) // 2
    base = np.ascontiguousarray(big[y0:y0 + bh, x0:x0 + bw])

    sess = ort.InferenceSession(a.model, providers=['CPUExecutionProvider'])
    d = depth_map(sess, base)
    rel = d - float(np.median(d))
    gx, gy = np.meshgrid(np.arange(bw, dtype=np.float32), np.arange(bh, dtype=np.float32))
    cx, cy = bw / 2, bh / 2
    amp = a.strength * bw
    oy, ox = (bh - H) // 2, (bw - W) // 2

    enc = subprocess.Popen(
        ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(a.fps), '-i', '-',
         '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', a.out],
        stdin=subprocess.PIPE,
    )
    n = max(2, round(a.seconds * a.fps))
    for i in range(n):
        t = i / (n - 1)
        e = t * t * (3 - 2 * t)  # yumuşak başla / yumuşak bitir
        if a.mode in ('left', 'right'):
            dirx = 1 if a.mode == 'right' else -1
            sx = gx + dirx * (e - 0.5) * amp * rel
            sy = gy + (e - 0.5) * amp * 0.2 * rel
            z = 1.0 + 0.02 * e
        else:
            p = e if a.mode == 'push' else 1 - e
            k = 1 + 0.05 * p * rel  # yakın nesneler daha çok büyür
            sx = cx + (gx - cx) / k
            sy = cy + (gy - cy) / k
            z = 1.0 + 0.035 * p
        sx = cx + (sx - cx) / z
        sy = cy + (sy - cy) / z
        frame = cv2.remap(base, sx, sy, interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        enc.stdin.write(np.ascontiguousarray(frame[oy:oy + H, ox:ox + W]).tobytes())
    enc.stdin.close()
    if enc.wait() != 0:
        raise SystemExit('ffmpeg hata verdi')


if __name__ == '__main__':
    main()
