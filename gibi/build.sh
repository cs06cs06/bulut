#!/usr/bin/env bash
# Bir bölümü baştan üretir: senaryo → seslendirme → zaman çizelgesi → miks → video
#   ./build.sh sifre          (varsayılan: yedek-anahtar)
set -euo pipefail
export EP="${1:-${EP:-yedek-anahtar}}"
cd "$(dirname "$0")"

MODEL=voices/tr_TR-dfki-medium.onnx
if [ ! -f "$MODEL" ]; then
  mkdir -p voices
  base=https://huggingface.co/rhasspy/piper-voices/resolve/main/tr/tr_TR/dfki/medium
  curl -sSL -o "$MODEL" "$base/tr_TR-dfki-medium.onnx"
  curl -sSL -o "$MODEL.json" "$base/tr_TR-dfki-medium.onnx.json"
fi

[ -d node_modules ] || npm install
node tools/export-lines.mjs      # replik listesi
python3 tools/tts.py             # piper ile seslendirme (önbellekli)
node tools/make-timeline.mjs     # zamanlama + animasyon izleri
node tools/build-script-md.mjs   # SENARYO.md
python3 tools/mix.py             # efekt + müzik + ortam sesi miksajı
node tools/render.mjs --workers "${WORKERS:-4}" --crf "${CRF:-23}"
