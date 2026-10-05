"""Single image -> game-ready building mesh with TripoSR (local, no API key).

TripoSR (github.com/VAST-AI-Research/TripoSR, MIT) reconstructs a textured mesh from
one image. This wrapper makes its output usable in a Unity FPS:
  - works on CPU (see torchmcubes_shim.py), white or transparent background input
  - drops floating fragments, decimates to a target triangle budget
  - re-bakes the texture from TripoSR's neural field onto the decimated mesh
  - rotates to Y-up, scales to real-world meters, puts the base on y=0
  - writes OBJ + MTL + PNG (Unity-native) and a GLB

Usage (from a checkout of TripoSR, see README):
  xvfb-run -a python image_to_building.py ../previews/referans.png --out out --height 10.5
"""
import argparse
import os
import sys
import time

import numpy as np
import torch
import trimesh
from PIL import Image


def log(msg, t0=[time.time()]):
    print(f"[{time.time() - t0[0]:6.1f}s] {msg}", flush=True)


def prepare_image(path, foreground_ratio, remove_bg):
    from tsr.utils import remove_background, resize_foreground

    img = Image.open(path)
    if remove_bg:
        import rembg
        rgba = remove_background(img, rembg.new_session())
    elif img.mode == "RGBA" and np.asarray(img)[..., 3].min() < 250:
        rgba = img
    else:
        # renders on a plain white background: alpha from distance to white
        rgb = np.asarray(img.convert("RGB")).astype(np.int16)
        alpha = ((255 - rgb).max(-1) > 6).astype(np.uint8) * 255
        rgba = Image.fromarray(np.dstack([rgb.astype(np.uint8), alpha]), "RGBA")
    rgba = resize_foreground(rgba, foreground_ratio)
    a = np.asarray(rgba).astype(np.float32) / 255.0
    rgb = a[..., :3] * a[..., 3:] + 0.5 * (1 - a[..., 3:])
    return Image.fromarray((rgb * 255).astype(np.uint8))


def clean_and_decimate(mesh, target_faces, min_component=0.004):
    mesh = trimesh.Trimesh(mesh.vertices, mesh.faces, process=True)
    parts = mesh.split(only_watertight=False)
    keep = [p for p in parts if len(p.faces) >= min_component * len(mesh.faces)]
    log(f"components: {len(parts)} -> kept {len(keep)}")
    mesh = trimesh.util.concatenate(keep)
    if len(mesh.faces) > target_faces:
        import fast_simplification
        v, f = fast_simplification.simplify(
            mesh.vertices.astype(np.float32), mesh.faces.astype(np.int64),
            target_reduction=1 - target_faces / len(mesh.faces))
        mesh = trimesh.Trimesh(v, f, process=True)
    trimesh.repair.fix_normals(mesh, multibody=True)
    return mesh


def _rot_x(deg):
    c, s = np.cos(np.radians(deg)), np.sin(np.radians(deg))
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def _rot_y(deg):
    c, s = np.cos(np.radians(deg)), np.sin(np.radians(deg))
    return np.array([[c, 0, -s], [0, 1, 0], [s, 0, c]])


def _rot_z(deg):
    c, s = np.cos(np.radians(deg)), np.sin(np.radians(deg))
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def _robust_volume(v, flat=False):
    """Bounding box volume (footprint area if flat) ignoring the outer 1% so rubble does not count."""
    ext = np.percentile(v, 99, axis=0) - np.percentile(v, 1, axis=0)
    return ext[0] * ext[2] * (1 if flat else ext[1])


def to_game_space(vertices, height, up_axis, yaw):
    """TripoSR space -> Unity-style Y-up meters with the base on y=0."""
    v = vertices.copy()
    if up_axis == "z":
        v = v[:, [0, 2, 1]] * np.array([1, 1, -1])  # (x, y, z) -> (x, z, -y)
    # TripoSR bakes the input camera's elevation into the result: stand the building
    # upright, square its footprint up with the X/Z axes, then apply --yaw
    sample = v[np.random.default_rng(0).choice(len(v), min(len(v), 6000), replace=False)]
    R = np.eye(3)
    for _ in range(2):
        a = min(np.arange(0, 90, 0.5), key=lambda a: _robust_volume(sample @ (_rot_y(a) @ R).T, flat=True))
        R = _rot_y(a) @ R
        tilt = min(((p, r) for p in np.arange(-20, 20.5, 0.5) for r in np.arange(-20, 20.5, 0.5)),
                   key=lambda pr: _robust_volume(sample @ (_rot_x(pr[0]) @ _rot_z(pr[1]) @ R).T))
        R = _rot_x(tilt[0]) @ _rot_z(tilt[1]) @ R
    v = v @ (_rot_y(yaw) @ R).T
    scale = height / (v[:, 1].max() - v[:, 1].min())
    v *= scale
    lo, hi = v.min(0), v.max(0)
    v -= np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])
    return v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--out", default="out")
    ap.add_argument("--name", default="normandy_house_triposr")
    ap.add_argument("--height", type=float, default=10.5, help="real height of the object in meters")
    ap.add_argument("--faces", type=int, default=40000, help="triangle budget after decimation")
    ap.add_argument("--mc-resolution", type=int, default=256)
    ap.add_argument("--texture-resolution", type=int, default=2048)
    ap.add_argument("--foreground-ratio", type=float, default=0.85)
    ap.add_argument("--remove-bg", action="store_true", help="use rembg for photos / screenshots")
    ap.add_argument("--up-axis", default="z", choices=["y", "z"])
    ap.add_argument("--yaw", type=float, default=0.0, help="extra rotation around the up axis (degrees)")
    ap.add_argument("--chunk-size", type=int, default=8192)
    args = ap.parse_args()

    from tsr.system import TSR
    from tsr.bake_texture import bake_texture

    os.makedirs(args.out, exist_ok=True)
    image = prepare_image(args.image, args.foreground_ratio, args.remove_bg)
    image.save(os.path.join(args.out, f"{args.name}_input.png"))

    log("loading TripoSR (stabilityai/TripoSR)")
    model = TSR.from_pretrained("stabilityai/TripoSR", config_name="config.yaml", weight_name="model.ckpt")
    model.renderer.set_chunk_size(args.chunk_size)
    model.to("cpu")

    log("reconstructing")
    with torch.no_grad():
        scene_codes = model([image], device="cpu")
        raw = model.extract_mesh(scene_codes, False, resolution=args.mc_resolution)[0]
    log(f"raw mesh: {len(raw.faces)} triangles")

    mesh = clean_and_decimate(raw, args.faces)
    log(f"decimated: {len(mesh.faces)} triangles")

    log("baking texture from the neural field")
    with torch.no_grad():
        bake = bake_texture(mesh, model, scene_codes[0], args.texture_resolution)
    colors = (np.clip(bake["colors"], 0, 1) * 255).astype(np.uint8)
    rgb = colors[..., :3]
    # dilate colour into empty texels so mip-maps do not bleed grey into seams
    mask = colors[..., 3] > 0
    for _ in range(8):
        grown = rgb.copy()
        filled = mask.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            shifted_mask = np.roll(mask, (dy, dx), (0, 1))
            take = shifted_mask & ~filled
            grown[take] = np.roll(rgb, (dy, dx), (0, 1))[take]
            filled |= take
        rgb, mask = grown, filled
    texture = Image.fromarray(rgb).transpose(Image.FLIP_TOP_BOTTOM)

    verts = to_game_space(mesh.vertices[bake["vmapping"]], args.height, args.up_axis, args.yaw)
    faces = bake["indices"].astype(np.int64)
    uvs = bake["uvs"]

    material = trimesh.visual.material.PBRMaterial(
        name=args.name, baseColorTexture=texture, metallicFactor=0.0, roughnessFactor=0.9)
    out = trimesh.Trimesh(verts, faces, visual=trimesh.visual.TextureVisuals(uv=uvs, material=material), process=False)

    tex_name = f"{args.name}.png"
    texture.save(os.path.join(args.out, tex_name))
    with open(os.path.join(args.out, f"{args.name}.mtl"), "w") as f:
        f.write(f"newmtl {args.name}\nKa 1 1 1\nKd 1 1 1\nKs 0.03 0.03 0.03\nNs 8\nd 1\nillum 2\nmap_Kd {tex_name}\n")
    with open(os.path.join(args.out, f"{args.name}.obj"), "w") as f:
        f.write(f"# TripoSR reconstruction, meters, Y up\nmtllib {args.name}.mtl\no {args.name}\nusemtl {args.name}\n")
        f.write("".join(f"v {x:.4f} {y:.4f} {z:.4f}\n" for x, y, z in verts))
        f.write("".join(f"vt {u:.5f} {v:.5f}\n" for u, v in uvs))
        f.write("".join(f"f {a+1}/{a+1} {b+1}/{b+1} {c+1}/{c+1}\n" for a, b, c in faces))
    out.export(os.path.join(args.out, f"{args.name}.glb"))
    ext = verts.max(0) - verts.min(0)
    log(f"wrote {args.out}/{args.name}.(obj|mtl|png|glb)  {len(faces)} tris, size {ext.round(2).tolist()} m")


if __name__ == "__main__":
    sys.exit(main())
