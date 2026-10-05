#!/usr/bin/env bash
# Installs TripoSR (github.com/VAST-AI-Research/TripoSR, MIT) for CPU use. No API key needed:
# the model weights (stabilityai/TripoSR) download anonymously from Hugging Face on first run.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
[[ -d "$HERE/.TripoSR/.git" ]] || git clone --depth 1 https://github.com/VAST-AI-Research/TripoSR "$HERE/.TripoSR"
python3 -m venv "$HERE/.venv"
. "$HERE/.venv/bin/activate"
pip install -q --upgrade pip
pip install -q torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -q omegaconf==2.3.0 einops==0.7.0 transformers==4.35.0 trimesh "rembg[cpu]" \
  huggingface-hub xatlas==0.0.9 moderngl==5.10.0 pillow PyMCubes fast-simplification
# torchmcubes needs a CUDA/C++ build; a PyMCubes-backed drop-in works on any CPU
cp "$HERE/torchmcubes_shim.py" "$(python -c 'import site; print(site.getsitepackages()[0])')/torchmcubes.py"
echo "Hazir. Calistirmak icin: ./run.sh <gorsel.png> [secenekler]"
