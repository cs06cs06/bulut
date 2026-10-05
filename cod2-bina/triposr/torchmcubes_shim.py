"""CPU shim for torchmcubes backed by PyMCubes (no CUDA / no compilation needed)."""
import mcubes
import numpy as np
import torch


def marching_cubes(level, threshold):
    verts, faces = mcubes.marching_cubes(level.detach().cpu().numpy().astype(np.float64), threshold)
    # torchmcubes returns vertices as (x, y, z) = (axis2, axis1, axis0)
    verts = np.ascontiguousarray(verts[:, ::-1])
    return torch.from_numpy(verts.astype(np.float32)), torch.from_numpy(faces.astype(np.int64))
