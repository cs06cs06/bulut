"""Tileable procedural textures for the CoD2-style Normandy house.

Every texture wraps seamlessly so walls can repeat them with world-space UVs.
"""
import numpy as np
from PIL import Image, ImageFilter

SIZE = 512


def _periodic_noise(rng, size, cells):
    """Value noise that tiles: a random grid of `cells` bilinearly upsampled with wrap."""
    grid = rng.random((cells, cells))
    coords = np.arange(size) * cells / size
    i0 = np.floor(coords).astype(int)
    f = coords - i0
    f = f * f * (3 - 2 * f)
    i1 = (i0 + 1) % cells
    a = grid[i0][:, i0]
    b = grid[i0][:, i1]
    c = grid[i1][:, i0]
    d = grid[i1][:, i1]
    fy = f[:, None]
    fx = f[None, :]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(rng, size=SIZE, octaves=6, base=4):
    out = np.zeros((size, size))
    amp, total = 1.0, 0.0
    for o in range(octaves):
        cells = base * 2 ** o
        if cells > size:
            break
        out += _periodic_noise(rng, size, cells) * amp
        total += amp
        amp *= 0.5
    return out / total


def _cellular(rng, size, count):
    """Periodic Worley noise: returns (F1, F2, cell id)."""
    pts = rng.random((count, 2)) * size
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    best1 = np.full((size, size), 1e9, np.float32)
    best2 = np.full((size, size), 1e9, np.float32)
    ids = np.zeros((size, size), np.int32)
    for k, (py, px) in enumerate(pts):
        dy = np.abs(yy - py)
        dx = np.abs(xx - px)
        dy = np.minimum(dy, size - dy)
        dx = np.minimum(dx, size - dx)
        d = np.sqrt(dx * dx + dy * dy)
        closer = d < best1
        best2 = np.where(closer, best1, np.minimum(best2, d))
        ids = np.where(closer, k, ids)
        best1 = np.where(closer, d, best1)
    return best1, best2, ids


def _to_img(rgb):
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")


def _tint(base, value):
    return np.asarray(base, np.float32)[None, None, :] * value[..., None]


def plaster(rng):
    n = fbm(rng, base=4)
    grime = fbm(rng, base=2, octaves=4)
    rgb = _tint((200, 189, 164), 0.88 + 0.16 * n)
    rgb *= (0.9 + 0.12 * grime)[..., None]
    # patches where plaster has fallen off and stone shows through
    patch = fbm(rng, base=3, octaves=5)
    f1, f2, ids = _cellular(rng, SIZE, 60)
    stone_val = 0.7 + 0.3 * rng.random(60)[ids]
    stone = _tint((150, 138, 120), stone_val)
    stone *= np.clip((f2 - f1) / 6.0, 0.6, 1.0)[..., None]
    mask = np.clip((patch - 0.68) * 10, 0, 1)
    rgb = rgb * (1 - mask[..., None]) + stone * mask[..., None]
    # fine speckle so large walls do not look flat
    rgb *= (0.93 + 0.1 * fbm(rng, base=64, octaves=3))[..., None]
    return _to_img(rgb)


def brick(rng):
    rows, per_row = 16, 4
    h = SIZE // rows
    w = SIZE // per_row
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    row = yy // h
    shifted = (xx + (row % 2) * (w // 2)) % SIZE
    col = shifted // w
    brick_id = row * per_row + col
    var = rng.random(rows * per_row)[brick_id]
    n = fbm(rng, base=16, octaves=4)
    base = np.stack([
        120 + 50 * var,
        58 + 22 * var,
        42 + 14 * var,
    ], -1).astype(np.float32)
    rgb = base * (0.75 + 0.4 * n)[..., None]
    mortar = ((yy % h) < 4) | ((shifted % w) < 4)
    rgb[mortar] = np.array([150, 142, 128]) * (0.8 + 0.3 * n[mortar])[:, None]
    soot = fbm(rng, base=2, octaves=4)
    rgb *= (0.7 + 0.35 * soot)[..., None]
    return _to_img(rgb)


def stone(rng):
    f1, f2, ids = _cellular(rng, SIZE, 45)
    var = rng.random(45)[ids]
    n = fbm(rng, base=16, octaves=5)
    rgb = _tint((140, 134, 122), 0.7 + 0.35 * var)
    rgb *= (0.8 + 0.35 * n)[..., None]
    edge = np.clip((f2 - f1) / 5.0, 0, 1)
    rgb *= (0.6 + 0.4 * edge)[..., None]
    return _to_img(rgb)


def _planks(rng, base_rgb, planks=6, paint=None):
    h = SIZE // planks
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    plank = yy // h
    var = rng.random(planks)[plank]
    grain = _periodic_noise(rng, SIZE, 64)
    grain = np.roll(grain, 0, axis=0)
    # stretch grain along x by sampling a coarse-x / fine-y noise
    g = fbm(rng, base=4, octaves=6)
    streak = np.sin((yy / h * 6 + g * 8) * np.pi) * 0.5 + 0.5
    rgb = _tint(base_rgb, 0.75 + 0.25 * var + 0.15 * streak - 0.1 * grain)
    seam = (yy % h) < 3
    rgb[seam] *= 0.35
    # board ends
    ends = ((xx + (plank * 197) % SIZE) % SIZE) < 3
    rgb[ends] *= 0.45
    if paint is not None:
        peel = fbm(rng, base=4, octaves=6)
        mask = np.clip((0.6 - peel) * 10, 0, 1)
        painted = _tint(paint, 0.85 + 0.2 * fbm(rng, base=16, octaves=3))
        rgb = rgb * (1 - mask[..., None]) + painted * mask[..., None]
    return _to_img(rgb)


def wood_floor(rng):
    return _planks(rng, (128, 92, 60), planks=4)


def wood_dark(rng):
    return _planks(rng, (82, 58, 38), planks=4)


def shutter_green(rng):
    return _planks(rng, (95, 75, 55), planks=8, paint=(70, 98, 72))


def slate(rng):
    rows, per_row = 8, 8
    h = SIZE // rows
    w = SIZE // per_row
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    row = yy // h
    shifted = (xx + (row % 2) * (w // 2)) % SIZE
    col = shifted // w
    var = rng.random(rows * per_row)[row * per_row + col]
    n = fbm(rng, base=16, octaves=4)
    rgb = _tint((72, 76, 84), 0.75 + 0.35 * var)
    rgb *= (0.8 + 0.3 * n)[..., None]
    # overlap shadow at the bottom edge of each tile row
    t = (yy % h) / h
    rgb *= (0.55 + 0.45 * np.clip(t * 3, 0, 1))[..., None]
    rgb[(shifted % w) < 2] *= 0.5
    rgb *= (0.88 + 0.2 * fbm(rng, base=2, octaves=6))[..., None]
    return _to_img(rgb)


def burlap(rng):
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    weave = (np.sin(xx / SIZE * 2 * np.pi * 96) * np.sin(yy / SIZE * 2 * np.pi * 96)) * 0.5 + 0.5
    n = fbm(rng, base=8, octaves=5)
    dirt = fbm(rng, base=2, octaves=4)
    rgb = _tint((150, 132, 96), 0.75 + 0.2 * weave + 0.2 * n)
    rgb *= (0.7 + 0.35 * dirt)[..., None]
    return _to_img(rgb)


def ground(rng):
    n = fbm(rng, base=4, octaves=7)
    m = fbm(rng, base=3, octaves=5)
    mud = _tint((92, 80, 62), 0.75 + 0.4 * n)
    grass = _tint((78, 88, 52), 0.7 + 0.4 * n)
    k = np.clip((m - 0.5) * 6 + 0.5, 0, 1)[..., None]
    return _to_img(mud * (1 - k) + grass * k)


GENERATORS = {
    "plaster": plaster,
    "brick": brick,
    "stone": stone,
    "wood_floor": wood_floor,
    "wood_dark": wood_dark,
    "shutter_green": shutter_green,
    "slate": slate,
    "burlap": burlap,
    "ground": ground,
}


def make_all(seed=1944):
    out = {}
    for i, (name, fn) in enumerate(GENERATORS.items()):
        img = fn(np.random.default_rng(seed + i))
        out[name] = img.filter(ImageFilter.GaussianBlur(0.6))
    return out
