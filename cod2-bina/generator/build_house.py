"""Procedural Call of Duty 2 style building: a war-damaged two storey Normandy house.

Units are meters, Y is up, the house footprint spans X 0..10 and Z 0..8 and is
re-centred on the origin at export. The front facade faces -Z.

Outputs (in --out):
    normandy_house.obj / .mtl   Unity-native import (one submesh per material)
    Textures/*.png              tileable procedural textures
    normandy_house.glb          (in --glb-dir) for viewers / image-blaster reference renders

Run:  python3 build_house.py --out ../Unity/Assets/CoD2Building/Models --glb-dir ../glb
"""
import argparse
import math
import os
from collections import defaultdict

import numpy as np

import textures

# meters covered by one texture tile, per material
TILE = {
    "plaster": 2.0,
    "brick": 1.0,
    "stone": 1.6,
    "wood_floor": 2.0,
    "wood_dark": 1.2,
    "shutter_green": 1.0,
    "slate": 1.6,
    "burlap": 0.6,
    "ground": 6.0,
}

W, D = 10.0, 8.0          # footprint
T = 0.4                   # exterior wall thickness
FLOOR1 = 0.15             # ground floor surface
FLOOR2 = 3.25             # upper floor surface
SLAB = 0.2                # upper floor slab thickness
EAVE = 6.3                # top of exterior walls
RISE = 3.8                # roof rise from eave to ridge
OVERHANG = 0.45


def rot_matrix(rx=0.0, ry=0.0, rz=0.0):
    """Rotation in degrees, applied Z, then X, then Y."""
    rx, ry, rz = map(math.radians, (rx, ry, rz))
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Ry @ Rx @ Rz


class MeshBuilder:
    def __init__(self):
        # material -> lists of positions, normals, uvs, faces (triangles)
        self.parts = defaultdict(lambda: {"v": [], "n": [], "uv": [], "f": []})

    def _quad(self, mat, corners, normal, uvs):
        p = self.parts[mat]
        base = len(p["v"])
        p["v"].extend(corners)
        p["n"].extend([normal] * 4)
        p["uv"].extend(uvs)
        p["f"].append((base, base + 1, base + 2))
        p["f"].append((base, base + 2, base + 3))

    def box(self, mat, center, size, rot=(0, 0, 0)):
        """Oriented box with per-face box-mapped UVs scaled to world meters."""
        c = np.asarray(center, float)
        hx, hy, hz = (s / 2 for s in size)
        R = rot_matrix(*rot)
        tile = TILE[mat]
        # offset UVs by position so neighbouring boxes do not repeat identically
        ou = (c[0] + c[2]) / tile
        ov = c[1] / tile
        # (normal axis, sign, u axis, v axis)
        faces = [
            (0, 1, 2, 1), (0, -1, 2, 1),
            (1, 1, 0, 2), (1, -1, 0, 2),
            (2, 1, 0, 1), (2, -1, 0, 1),
        ]
        half = np.array([hx, hy, hz])
        for ax, sign, ua, va in faces:
            n_local = np.zeros(3)
            n_local[ax] = sign
            corners_local = []
            uvs = []
            for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                pt = np.zeros(3)
                pt[ax] = sign * half[ax]
                pt[ua] = su * half[ua]
                pt[va] = sv * half[va]
                corners_local.append(pt)
                uvs.append(((pt[ua] + half[ua]) / tile + ou, (pt[va] + half[va]) / tile + ov))
            # keep counter-clockwise winding when seen from outside
            u_vec = np.zeros(3); u_vec[ua] = 1
            v_vec = np.zeros(3); v_vec[va] = 1
            if np.dot(np.cross(u_vec, v_vec), n_local) < 0:
                corners_local = corners_local[::-1]
                uvs = uvs[::-1]
            corners = [tuple(R @ p + c) for p in corners_local]
            self._quad(mat, corners, tuple(R @ n_local), uvs)

    def aabb(self, mat, lo, hi):
        lo = np.asarray(lo, float); hi = np.asarray(hi, float)
        if np.any(hi - lo <= 1e-4):
            return
        self.box(mat, (lo + hi) / 2, hi - lo)

    def prism(self, mat, poly_zy, x0, x1):
        """Convex polygon in the ZY plane extruded along X (used for gables)."""
        tile = TILE[mat]
        pts = [np.array(p, float) for p in poly_zy]
        n = len(pts)
        for x, sign in ((x0, -1), (x1, 1)):
            p = self.parts[mat]
            base = len(p["v"])
            for z, y in pts:
                p["v"].append((x, y, z))
                p["n"].append((sign, 0, 0))
                p["uv"].append((z / tile, y / tile))
            for i in range(1, n - 1):
                tri = (base, base + i, base + i + 1)
                p["f"].append(tri if sign > 0 else tri[::-1])
        for i in range(n):
            (z0, y0), (z1, y1) = pts[i], pts[(i + 1) % n]
            edge = np.array([0, y1 - y0, z1 - z0])
            normal = np.cross(edge, [1, 0, 0])
            normal = normal / (np.linalg.norm(normal) + 1e-9)
            length = math.hypot(z1 - z0, y1 - y0) / tile
            corners = [(x0, y0, z0), (x0, y1, z1), (x1, y1, z1), (x1, y0, z0)]
            uvs = [(0, x0 / tile), (length, x0 / tile), (length, x1 / tile), (0, x1 / tile)]
            # winding: (x0,p0)->(x0,p1)->(x1,p1) must face `normal`
            a, b, cc = (np.array(v) for v in corners[:3])
            if np.dot(np.cross(b - a, cc - a), normal) < 0:
                corners = corners[::-1]
                uvs = uvs[::-1]
            self._quad(mat, corners, tuple(normal), uvs)

    def ellipsoid(self, mat, center, radii, rot=(0, 0, 0), seg=10, rings=6):
        R = rot_matrix(*rot)
        c = np.asarray(center, float)
        p = self.parts[mat]
        base = len(p["v"])
        tile = TILE[mat]
        for i in range(rings + 1):
            th = math.pi * i / rings
            for j in range(seg + 1):
                ph = 2 * math.pi * j / seg
                # flattened, slightly boxy profile reads as a filled sack
                sx = np.sign(math.sin(th) * math.cos(ph)) * abs(math.sin(th) * math.cos(ph)) ** 0.7
                sy = np.sign(math.cos(th)) * abs(math.cos(th)) ** 0.7
                sz = np.sign(math.sin(th) * math.sin(ph)) * abs(math.sin(th) * math.sin(ph)) ** 0.7
                local = np.array([sx * radii[0], sy * radii[1], sz * radii[2]])
                nrm = np.array([sx / radii[0], sy / radii[1], sz / radii[2]])
                nrm /= np.linalg.norm(nrm) + 1e-9
                p["v"].append(tuple(R @ local + c))
                p["n"].append(tuple(R @ nrm))
                p["uv"].append((j / seg * 2 * radii[0] * 3 / tile, i / rings * 2 * radii[1] * 3 / tile))
        for i in range(rings):
            for j in range(seg):
                a = base + i * (seg + 1) + j
                b = a + seg + 1
                p["f"].append((a, a + 1, b))
                p["f"].append((a + 1, b + 1, b))

    def wall(self, mat, axis, fixed0, fixed1, u0, u1, v0, v1, openings=()):
        """Thick wall along `axis` ('x' or 'z') with rectangular openings.

        openings: (ua, ub, va, vb) in wall coordinates (u along the wall, v = height).
        The wall is decomposed into a grid and merged into horizontal strips.
        """
        us = sorted({u0, u1, *[o[0] for o in openings], *[o[1] for o in openings]})
        vs = sorted({v0, v1, *[o[2] for o in openings], *[o[3] for o in openings]})
        us = [u for u in us if u0 <= u <= u1]
        vs = [v for v in vs if v0 <= v <= v1]

        def solid(um, vm):
            return not any(o[0] < um < o[1] and o[2] < vm < o[3] for o in openings)

        for vi in range(len(vs) - 1):
            va, vb = vs[vi], vs[vi + 1]
            run = None
            for ui in range(len(us) - 1):
                ua, ub = us[ui], us[ui + 1]
                if solid((ua + ub) / 2, (va + vb) / 2):
                    run = (run[0], ub) if run else (ua, ub)
                else:
                    if run:
                        self._wall_cell(mat, axis, fixed0, fixed1, run, (va, vb))
                    run = None
            if run:
                self._wall_cell(mat, axis, fixed0, fixed1, run, (va, vb))

    def _wall_cell(self, mat, axis, f0, f1, urange, vrange):
        if axis == "x":
            self.aabb(mat, (urange[0], vrange[0], f0), (urange[1], vrange[1], f1))
        else:
            self.aabb(mat, (f0, vrange[0], urange[0]), (f1, vrange[1], urange[1]))

    def slab(self, mat, x0, x1, z0, z1, y0, y1, holes=()):
        """Horizontal slab with rectangular holes (x0,x1,z0,z1)."""
        xs = sorted({x0, x1, *[h[0] for h in holes], *[h[1] for h in holes]})
        zs = sorted({z0, z1, *[h[2] for h in holes], *[h[3] for h in holes]})
        for zi in range(len(zs) - 1):
            za, zb = zs[zi], zs[zi + 1]
            run = None
            for xi in range(len(xs) - 1):
                xa, xb = xs[xi], xs[xi + 1]
                xm, zm = (xa + xb) / 2, (za + zb) / 2
                inside = any(h[0] < xm < h[1] and h[2] < zm < h[3] for h in holes)
                if not inside:
                    run = (run[0], xb) if run else (xa, xb)
                else:
                    if run:
                        self.aabb(mat, (run[0], y0, za), (run[1], y1, zb))
                    run = None
            if run:
                self.aabb(mat, (run[0], y0, za), (run[1], y1, zb))


# ---------------------------------------------------------------------------
# House layout
# ---------------------------------------------------------------------------

# Openings in wall coordinates (u along wall, v height). Front/back u = x, sides u = z.
FRONT_DOOR = (2.4, 3.5, FLOOR1, 2.45)
SHELL_HOLE = (6.6, 8.9, 3.75, 5.95)
FRONT = [
    (0.9, 1.9, 1.0, 2.35), FRONT_DOOR, (4.6, 5.6, 1.0, 2.35), (7.3, 8.4, 0.95, 2.35),
    (1.0, 2.0, 4.15, 5.55), (4.5, 5.5, 4.15, 5.55), SHELL_HOLE,
]
BACK_DOOR = (6.6, 7.6, FLOOR1, 2.45)
BACK = [
    (1.5, 2.5, 1.0, 2.35), (4.0, 5.0, 1.0, 2.35), BACK_DOOR,
    (1.5, 2.5, 4.15, 5.55), (4.4, 5.4, 4.15, 5.55), (7.4, 8.4, 4.15, 5.55),
]
LEFT = [(3.2, 4.2, 1.0, 2.35), (3.4, 4.4, 4.15, 5.55)]
RIGHT = [(1.6, 2.6, 4.15, 5.55)]

PARTITION_X = 6.0
STAIR_X0, STAIR_X1 = W - T - 1.05, W - T
STAIR_Z0, STAIR_Z1 = 1.2, 6.2
STAIRWELL = (STAIR_X0 - 0.05, STAIR_X1, 2.0, STAIR_Z1 + 0.02)  # >2.1 m headroom over the steps
CEILING_HOLE = (5.9, 8.6, T, 3.1)


def window_dressing(mb, rng, side, opening, shutters="open"):
    """Sill, lintel and green French shutters around one window opening."""
    ua, ub, va, vb = opening
    w = ub - ua
    if side in ("front", "back"):
        z_out = -0.0 if side == "front" else D
        out = -1 if side == "front" else 1
        def place(u, v, along, up, depth, rot=0, offset=0.0):
            return dict(center=(u, v, z_out + out * (depth / 2 + offset)), size=(along, up, depth), rot=(0, rot, 0))
    else:
        x_out = 0.0 if side == "left" else W
        out = -1 if side == "left" else 1
        def place(u, v, along, up, depth, rot=0, offset=0.0):
            return dict(center=(x_out + out * (depth / 2 + offset), v, u), size=(depth, up, along), rot=(0, rot, 0))

    mb.box("stone", **place((ua + ub) / 2, va - 0.05, w + 0.3, 0.1, 0.12, offset=-0.02))
    mb.box("wood_dark", **place((ua + ub) / 2, vb + 0.09, w + 0.4, 0.18, 0.1, offset=-0.04))
    if shutters == "none":
        return
    leaf = w / 2
    for k, hinge in enumerate((ua, ub)):
        sgn = -1 if k == 0 else 1
        if shutters == "broken" and k == 1:
            # one shutter hanging from its lower hinge
            p = place(hinge + sgn * 0.08, (va + vb) / 2 - 0.25, leaf, vb - va, 0.04, offset=0.1)
            p["rot"] = (0, 0, 0)
            cx, cy, cz = p["center"]
            p["center"] = (cx, cy - 0.15, cz)
            if side in ("front", "back"):
                p["rot"] = (0, sgn * 15, -sgn * 28)
            else:
                p["rot"] = (-sgn * 28, sgn * 15, 0)
            mb.box("shutter_green", **p)
            continue
        if shutters == "closed":
            p = place(hinge - sgn * leaf / 2, (va + vb) / 2, leaf, vb - va, 0.04, offset=0.02)
        else:
            # swung fully open against the facade
            p = place(hinge + sgn * (leaf / 2 + 0.04), (va + vb) / 2, leaf, vb - va, 0.04, offset=0.03)
            if rng.random() < 0.5:
                p["rot"] = (0, sgn * out * rng.uniform(5, 20), 0)
        mb.box("shutter_green", **p)


def jagged_hole(mb, rng, side_z, out, opening):
    """Shell damage: protruding broken bricks and spalled plaster around an opening."""
    ua, ub, va, vb = opening
    cu, cv = (ua + ub) / 2, (va + vb) / 2
    ru, rv = (ub - ua) / 2, (vb - va) / 2
    # broken bricks poking into the opening so it does not read as a rectangle
    for _ in range(70):
        ang = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(0.7, 1.0)
        u = cu + math.cos(ang) * ru * r
        v = cv + math.sin(ang) * rv * r
        u = min(max(u, ua + 0.05), ub - 0.05)
        v = min(max(v, va + 0.05), vb - 0.05)
        size = (rng.uniform(0.18, 0.4), rng.uniform(0.07, 0.16), rng.uniform(0.12, T * 0.95))
        z = side_z - out * (T / 2) + out * rng.uniform(-0.1, 0.1)
        mb.box("brick", (u, v, z), size, rot=(rng.uniform(-8, 8), rng.uniform(-10, 10), rng.uniform(-25, 25)))
    # exposed brickwork where the plaster has been blown off
    for _ in range(26):
        ang = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(1.0, 1.45)
        u = cu + math.cos(ang) * ru * r
        v = cv + math.sin(ang) * rv * r
        su, sv = rng.uniform(0.3, 0.8), rng.uniform(0.2, 0.55)
        for face_z, sgn in ((side_z, out), (side_z - out * T, -out)):
            mb.box("brick", (u, v, face_z + sgn * 0.006), (su, sv, 0.012), rot=(0, 0, rng.uniform(-20, 20)))


def rubble_pile(mb, rng, center, radius, count, mats=("brick", "stone", "plaster")):
    cx, cy, cz = center
    for i in range(count):
        a = rng.uniform(0, 2 * math.pi)
        r = radius * math.sqrt(rng.random())
        h = (1 - r / radius) * radius * 0.45
        s = rng.uniform(0.12, 0.45)
        mb.box(mats[i % len(mats)],
               (cx + math.cos(a) * r, cy + h * rng.random() + s * 0.2, cz + math.sin(a) * r),
               (s, s * rng.uniform(0.3, 0.8), s * rng.uniform(0.5, 1.0)),
               rot=(rng.uniform(-35, 35), rng.uniform(0, 180), rng.uniform(-35, 35)))


def sandbag_wall(mb, rng, start, end, layers=3, y0=0.0):
    sx, sz = start
    ex, ez = end
    length = math.hypot(ex - sx, ez - sz)
    heading = math.degrees(math.atan2(ex - sx, ez - sz)) - 90
    bag = 0.58
    count = max(1, int(length / bag))
    for layer in range(layers):
        off = (layer % 2) * bag / 2
        for i in range(count - (layer % 2)):
            t = (i * bag + off + bag / 2) / length
            x = sx + (ex - sx) * t + rng.uniform(-0.03, 0.03)
            z = sz + (ez - sz) * t + rng.uniform(-0.03, 0.03)
            y = y0 + 0.08 + layer * 0.15
            mb.ellipsoid("burlap", (x, y, z), (0.31, 0.085, 0.19),
                         rot=(rng.uniform(-4, 4), -heading + rng.uniform(-6, 6), rng.uniform(-4, 4)))


def crate(mb, rng, pos, size=0.6, rot=0):
    x, y, z = pos
    mb.box("wood_floor", (x, y + size / 2, z), (size, size, size), rot=(0, rot, 0))
    # darker frame slats
    for dy in (0.04, size - 0.04):
        mb.box("wood_dark", (x, y + dy, z), (size + 0.02, 0.07, size + 0.02), rot=(0, rot, 0))


def table(mb, pos, rot=0, tipped=False):
    x, y, z = pos
    R = rot_matrix(0, rot, 90 if tipped else 0)
    def part(center, size):
        c = R @ np.array(center) + np.array([x, y + (0.45 if tipped else 0), z])
        mb.box("wood_dark", tuple(c), size, rot=(0, rot, 90 if tipped else 0))
    part((0, 0.76, 0), (1.6, 0.06, 0.9))
    for lx in (-0.72, 0.72):
        for lz in (-0.38, 0.38):
            part((lx, 0.37, lz), (0.07, 0.74, 0.07))


def build(seed=1944):
    rng = np.random.default_rng(seed)
    mb = MeshBuilder()

    # -- terrain pad and foundation -------------------------------------------------
    mb.aabb("ground", (-6, -0.3, -7), (W + 6, -0.02, D + 6))
    mb.aabb("stone", (-0.05, -0.3, -0.05), (W + 0.05, FLOOR1, D + 0.05))
    mb.aabb("stone", (FRONT_DOOR[0] - 0.1, -0.02, -0.45), (FRONT_DOOR[1] + 0.1, FLOOR1 - 0.02, -0.05))

    # -- exterior walls ------------------------------------------------------------
    mb.wall("plaster", "x", 0, T, 0, W, FLOOR1, EAVE, FRONT)
    mb.wall("plaster", "x", D - T, D, 0, W, FLOOR1, EAVE, BACK)
    mb.wall("plaster", "z", 0, T, T, D - T, FLOOR1, EAVE, LEFT)
    mb.wall("plaster", "z", W - T, W, T, D - T, FLOOR1, EAVE, RIGHT)

    # stone plinth and corner quoins (proud of the plaster)
    for (x0, x1, z0, z1, ops) in (
        (-0.03, W + 0.03, -0.03, 0.0, FRONT), (-0.03, W + 0.03, D, D + 0.03, BACK),
    ):
        u = x0
        cuts = sorted([(o[0], o[1]) for o in ops if o[2] <= FLOOR1 + 0.01])
        for a, b in cuts + [(x1, x1)]:
            mb.aabb("stone", (u, FLOOR1, z0), (a, 0.7, z1))
            u = b
    mb.aabb("stone", (-0.03, FLOOR1, 0), (0, 0.7, D))
    mb.aabb("stone", (W, FLOOR1, 0), (W + 0.03, 0.7, D))
    for cx, cz in ((0, 0), (W, 0), (0, D), (W, D)):
        y = 0.7
        k = 0
        while y < EAVE - 0.3:
            h = 0.32
            long_x = k % 2 == 0
            sx = 0.55 if long_x else 0.3
            sz = 0.3 if long_x else 0.55
            px = cx + (sx / 2 - 0.03 if cx == 0 else -sx / 2 + 0.03)
            pz = cz + (sz / 2 - 0.03 if cz == 0 else -sz / 2 + 0.03)
            mb.box("stone", (px, y + h / 2, pz), (sx, h - 0.02, sz))
            y += h
            k += 1

    # string course between floors
    mb.aabb("stone", (-0.05, FLOOR2 - 0.12, -0.06), (SHELL_HOLE[0], FLOOR2 + 0.05, 0.0))
    mb.aabb("stone", (SHELL_HOLE[1], FLOOR2 - 0.12, -0.06), (W + 0.05, FLOOR2 + 0.05, 0.0))
    mb.aabb("stone", (-0.05, FLOOR2 - 0.12, D), (W + 0.05, FLOOR2 + 0.05, D + 0.06))

    # -- floors and ceilings ---------------------------------------------------------
    mb.aabb("stone", (T, FLOOR1 - 0.01, T), (W - T, FLOOR1, D - T))
    mb.slab("wood_floor", T, W - T, T, D - T, FLOOR2 - SLAB, FLOOR2, holes=[STAIRWELL])
    # attic floor / upper ceiling, blown through below the roof damage
    mb.slab("wood_floor", T, W - T, T, D - T, EAVE - 0.15, EAVE, holes=[CEILING_HOLE])
    # exposed ceiling beams on the ground floor
    for x in np.arange(1.2, W - 0.5, 1.3):
        if STAIRWELL[0] - 0.1 < x < STAIRWELL[1] + 0.1:
            continue
        mb.aabb("wood_dark", (x - 0.1, FLOOR2 - SLAB - 0.22, T), (x + 0.1, FLOOR2 - SLAB, D - T))
    # broken, splintered joists hanging through the ceiling hole
    for i, x in enumerate(np.arange(CEILING_HOLE[0] + 0.4, CEILING_HOLE[1], 0.7)):
        tilt = rng.uniform(18, 40) * (1 if i % 2 else -1)
        mb.box("wood_dark", (x, EAVE - 0.6, T + 1.0 + rng.uniform(-0.2, 0.2)), (0.14, 0.18, 2.2), rot=(tilt, rng.uniform(-8, 8), 0))

    # -- interior --------------------------------------------------------------------
    # ground floor partition with doorway
    mb.wall("plaster", "z", PARTITION_X - 0.1, PARTITION_X + 0.1, T, D - T, FLOOR1, FLOOR2 - SLAB, [(3.0, 4.0, FLOOR1, 2.3)])
    # upper floor partial partition (blown half away)
    mb.wall("plaster", "z", PARTITION_X - 0.1, PARTITION_X + 0.1, 4.6, D - T, FLOOR2, EAVE - 0.15, [(5.4, 6.4, FLOOR2, FLOOR2 + 2.2)])
    rubble_pile(mb, rng, (PARTITION_X, FLOOR2, 3.8), 0.9, 22, mats=("brick", "plaster"))

    # staircase along the right wall, rising towards the back
    steps = 16
    rise = (FLOOR2 - FLOOR1) / steps
    run = (STAIR_Z1 - STAIR_Z0) / steps
    for i in range(steps):
        z0 = STAIR_Z0 + i * run
        y1 = FLOOR1 + (i + 1) * rise
        mb.aabb("wood_dark", (STAIR_X0, y1 - 0.06, z0), (STAIR_X1, y1, z0 + run + 0.03))
        mb.aabb("wood_floor", (STAIR_X0, FLOOR1, z0), (STAIR_X1, y1 - 0.06, z0 + run))
    # stair stringer + railing
    ang = math.degrees(math.atan2(FLOOR2 - FLOOR1, STAIR_Z1 - STAIR_Z0))
    slope_len = math.hypot(FLOOR2 - FLOOR1, STAIR_Z1 - STAIR_Z0)
    mid_y = (FLOOR1 + FLOOR2) / 2 + 0.9
    mb.box("wood_dark", (STAIR_X0 - 0.03, mid_y, (STAIR_Z0 + STAIR_Z1) / 2), (0.06, 0.08, slope_len), rot=(-ang, 0, 0))
    for i in range(0, steps, 3):
        z = STAIR_Z0 + (i + 0.5) * run
        y = FLOOR1 + (i + 1) * rise
        mb.aabb("wood_dark", (STAIR_X0 - 0.06, y, z - 0.03), (STAIR_X0, y + 0.9, z + 0.03))
    # upper landing railing around the stairwell
    mb.aabb("wood_dark", (STAIRWELL[0] - 0.06, FLOOR2, STAIRWELL[2]), (STAIRWELL[0], FLOOR2 + 0.95, STAIRWELL[2] + 0.06))
    mb.aabb("wood_dark", (STAIRWELL[0] - 0.06, FLOOR2 + 0.9, STAIRWELL[2]), (STAIRWELL[0], FLOOR2 + 0.96, STAIRWELL[3] - 1.2))
    mb.aabb("wood_dark", (STAIRWELL[0], FLOOR2 + 0.9, STAIRWELL[2]), (STAIRWELL[1], FLOOR2 + 0.96, STAIRWELL[2] + 0.06))

    # front door hanging open on its hinge, back door blown off and lying outside
    mb.box("wood_dark", (FRONT_DOOR[0] + 0.08, FLOOR1 + 1.14, T + 0.52), (0.07, 2.25, 1.0), rot=(0, 18, 0))
    mb.box("wood_dark", (BACK_DOOR[0] + 0.7, 0.04, D + 1.4), (1.0, 0.07, 2.2), rot=(3, 27, 0))
    for op, z in ((FRONT_DOOR, 0.0), (BACK_DOOR, D)):
        mb.aabb("wood_dark", (op[0] - 0.08, op[3], z - 0.05), (op[1] + 0.08, op[3] + 0.18, z + 0.05))

    # MG nest behind the right ground floor front window
    sandbag_wall(mb, rng, (7.0, T + 0.35), (8.8, T + 0.35), layers=6, y0=FLOOR1)
    crate(mb, rng, (8.6, FLOOR1, 1.6), 0.55, rot=12)
    crate(mb, rng, (8.4, FLOOR1 + 0.55, 1.65), 0.45, rot=-20)
    table(mb, (3.0, FLOOR1, 5.2), rot=8, tipped=True)
    table(mb, (2.6, FLOOR2, 5.6), rot=-6)
    crate(mb, rng, (1.2, FLOOR1, 6.8), 0.6, rot=4)
    crate(mb, rng, (1.25, FLOOR1 + 0.6, 6.85), 0.5, rot=-11)
    crate(mb, rng, (7.5, FLOOR2, 6.6), 0.6, rot=30)

    # -- facade dressing -------------------------------------------------------------
    styles = ["open", "open", "broken", "closed", "open", "none"]
    for side, ops in (("front", FRONT), ("back", BACK), ("left", LEFT), ("right", RIGHT)):
        for i, op in enumerate(ops):
            if op in (FRONT_DOOR, BACK_DOOR, SHELL_HOLE):
                continue
            style = styles[(i + len(side)) % len(styles)]
            window_dressing(mb, rng, side, op, shutters=style)

    jagged_hole(mb, rng, 0.0, -1, SHELL_HOLE)
    rubble_pile(mb, rng, ((SHELL_HOLE[0] + SHELL_HOLE[1]) / 2, -0.02, -1.4), 1.5, 70)
    rubble_pile(mb, rng, ((SHELL_HOLE[0] + SHELL_HOLE[1]) / 2, FLOOR2, 1.2), 0.9, 26)

    # sandbag barricade outside the front door
    sandbag_wall(mb, rng, (1.4, -1.6), (4.6, -1.6), layers=4)
    sandbag_wall(mb, rng, (4.7, -1.5), (5.4, -0.6), layers=4)

    # -- roof --------------------------------------------------------------------------
    # gables (left and right walls)
    gable = [(0, EAVE), (D, EAVE), (D / 2, EAVE + RISE)]
    mb.prism("plaster", gable, 0, T)
    mb.prism("plaster", gable, W - T, W)

    pitch = math.degrees(math.atan2(RISE, D / 2))
    slope = math.hypot(RISE, D / 2) + OVERHANG
    thick = 0.12
    rafters_x = np.arange(0.15, W, 0.6)

    def slope_point(t, side):
        """Point on the roof plane at slope fraction t (0 eave, 1 ridge) for side -1 front / +1 back."""
        z_eave = -OVERHANG * math.cos(math.radians(pitch)) if side < 0 else D + OVERHANG * math.cos(math.radians(pitch))
        y_eave = EAVE - OVERHANG * math.sin(math.radians(pitch))
        z = z_eave + (D / 2 - z_eave) * t
        y = y_eave + (EAVE + RISE - y_eave) * t
        return z, y

    def roof_segment(mat, side, x0, x1, t0, t1, th, lift):
        z0, y0 = slope_point(t0, side)
        z1, y1 = slope_point(t1, side)
        n_z = -math.sin(math.radians(pitch)) * (1 if side < 0 else -1)
        n_y = math.cos(math.radians(pitch))
        cz = (z0 + z1) / 2 + n_z * lift
        cy = (y0 + y1) / 2 + n_y * lift
        rx = pitch if side < 0 else -pitch
        mb.box(mat, ((x0 + x1) / 2, cy, cz), (x1 - x0, th, slope * (t1 - t0)), rot=(-rx, 0, 0))

    hole_x0, hole_x1 = CEILING_HOLE[0] - 0.3, CEILING_HOLE[1] + 0.2
    for side in (-1, 1):
        # rafters below the slate
        for x in rafters_x:
            broken = side < 0 and hole_x0 < x < hole_x1
            t1 = rng.uniform(0.35, 0.6) if broken else 1.0
            roof_segment("wood_dark", side, x - 0.06, x + 0.06, 0.0, t1, 0.16, 0.0)
        # battens
        for t in np.arange(0.05, 1.0, 0.12):
            if side < 0 and t > 0.4:
                roof_segment("wood_dark", side, -OVERHANG, hole_x0, t, t + 0.025, 0.04, 0.1)
                roof_segment("wood_dark", side, hole_x1, W + OVERHANG, t, t + 0.025, 0.04, 0.1)
            else:
                roof_segment("wood_dark", side, -OVERHANG, W + OVERHANG, t, t + 0.025, 0.04, 0.1)
        # slate covering, front slope blown open above the shell hole
        if side < 0:
            roof_segment("slate", side, -OVERHANG, hole_x0, 0.0, 1.0, thick, 0.16)
            roof_segment("slate", side, hole_x1, W + OVERHANG, 0.0, 1.0, thick, 0.16)
            roof_segment("slate", side, hole_x0, hole_x1, 0.0, 0.32, thick, 0.16)
            # ragged edge: loose slates around the gap
            for _ in range(28):
                x = rng.uniform(hole_x0 - 0.2, hole_x1 + 0.2)
                t = rng.uniform(0.3, 0.95)
                if hole_x0 + 0.25 < x < hole_x1 - 0.25 and t > 0.36:
                    continue
                z, y = slope_point(t, side)
                mb.box("slate", (x, y + 0.2, z), (0.3, 0.02, 0.4),
                       rot=(pitch + rng.uniform(-15, 15), rng.uniform(-30, 30), rng.uniform(-15, 15)))
        else:
            roof_segment("slate", side, -OVERHANG, W + OVERHANG, 0.0, 1.0, thick, 0.16)
    # ridge cap
    mb.box("slate", (W / 2, EAVE + RISE + 0.22, D / 2), (W + 2 * OVERHANG, 0.12, 0.35))
    # fallen slates in the rubble
    for _ in range(18):
        mb.box("slate", (rng.uniform(5.8, 9.4), rng.uniform(0.02, 0.4), rng.uniform(-2.6, -0.6)), (0.3, 0.02, 0.4),
               rot=(rng.uniform(-40, 40), rng.uniform(0, 180), rng.uniform(-40, 40)))

    # chimney
    mb.aabb("brick", (0.7, EAVE - 0.4, 4.6), (1.5, EAVE + RISE + 1.1, 5.4))
    mb.aabb("stone", (0.62, EAVE + RISE + 1.1, 4.52), (1.58, EAVE + RISE + 1.22, 5.48))

    return mb


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def center_offset():
    return np.array([-W / 2, 0.0, -D / 2])


def write_obj(mb, out_dir, name):
    off = center_offset()
    obj_path = os.path.join(out_dir, name + ".obj")
    mtl_path = os.path.join(out_dir, name + ".mtl")
    with open(mtl_path, "w") as f:
        f.write("# CoD2 Normandy house materials\n")
        for mat in mb.parts:
            f.write(f"\nnewmtl {mat}\nKa 1 1 1\nKd 1 1 1\nKs 0.04 0.04 0.04\nNs 10\nd 1\nillum 2\nmap_Kd Textures/{mat}.png\n")
    vi = 1
    with open(obj_path, "w") as f:
        f.write(f"# CoD2-style war damaged Normandy house, meters, Y up\nmtllib {name}.mtl\n")
        for mat, p in mb.parts.items():
            f.write(f"\no {mat}\ng {mat}\nusemtl {mat}\n")
            for v in p["v"]:
                v = np.asarray(v) + off
                f.write(f"v {v[0]:.4f} {v[1]:.4f} {v[2]:.4f}\n")
            for n in p["n"]:
                f.write(f"vn {n[0]:.4f} {n[1]:.4f} {n[2]:.4f}\n")
            for uv in p["uv"]:
                f.write(f"vt {uv[0]:.4f} {uv[1]:.4f}\n")
            for a, b, c in p["f"]:
                a, b, c = a + vi, b + vi, c + vi
                f.write(f"f {a}/{a}/{a} {b}/{b}/{b} {c}/{c}/{c}\n")
            vi += len(p["v"])
    return obj_path


def write_glb(mb, out_dir, name, tex_dir):
    import trimesh
    from PIL import Image

    off = center_offset()
    scene = trimesh.Scene()
    for mat, p in mb.parts.items():
        img = Image.open(os.path.join(tex_dir, mat + ".png"))
        material = trimesh.visual.material.PBRMaterial(
            name=mat, baseColorTexture=img, metallicFactor=0.0, roughnessFactor=0.92)
        mesh = trimesh.Trimesh(
            vertices=np.asarray(p["v"]) + off,
            faces=np.asarray(p["f"]),
            vertex_normals=np.asarray(p["n"]),
            visual=trimesh.visual.TextureVisuals(uv=np.asarray(p["uv"]), material=material),
            process=False)
        scene.add_geometry(mesh, node_name=mat, geom_name=mat)
    path = os.path.join(out_dir, name + ".glb")
    scene.export(path)
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="out")
    ap.add_argument("--name", default="normandy_house")
    ap.add_argument("--seed", type=int, default=1944)
    ap.add_argument("--glb-dir", default=None, help="where to write the .glb (defaults to --out)")
    ap.add_argument("--no-glb", action="store_true")
    args = ap.parse_args()

    tex_dir = os.path.join(args.out, "Textures")
    os.makedirs(tex_dir, exist_ok=True)
    for name, img in textures.make_all(args.seed).items():
        img.save(os.path.join(tex_dir, name + ".png"))

    mb = build(args.seed)
    obj = write_obj(mb, args.out, args.name)
    tris = sum(len(p["f"]) for p in mb.parts.values())
    print(f"wrote {obj}  ({tris} triangles, {len(mb.parts)} materials)")
    if not args.no_glb:
        glb_dir = args.glb_dir or args.out
        os.makedirs(glb_dir, exist_ok=True)
        print("wrote", write_glb(mb, glb_dir, args.name, tex_dir))


if __name__ == "__main__":
    main()
