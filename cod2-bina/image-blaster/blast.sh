#!/usr/bin/env bash
# Feeds the procedural house render into image-blaster (github.com/neilsonnn/image-blaster):
#   1. nano-banana restyles the render into a realistic CoD2 Normandy house reference image
#   2. Hunyuan 3D (via FAL) turns that reference into a textured PBR mesh
# The result is copied to Unity/Assets/CoD2Building/Blasted/.
#
# Usage:  FAL_KEY=... ./blast.sh [reference-image] [--reference-only] [--regenerate]
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
IMG="$HERE/../previews/referans.png"
if [[ $# -gt 0 && "$1" != --* ]]; then IMG="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; shift; fi
IB="${IMAGE_BLASTER_DIR:-$HERE/.image-blaster}"
WORLD="cod2-normandy"
OBJ="normandy-house"
DEST="$HERE/../Unity/Assets/CoD2Building/Blasted"

if [[ ! -d "$IB/.git" ]]; then
  git clone --depth 1 https://github.com/neilsonnn/image-blaster "$IB"
fi
if [[ -z "${FAL_KEY:-}" ]] && ! grep -qs '^FAL_KEY=..*' "$IB/.env"; then
  echo "FAL_KEY tanimli degil: 'export FAL_KEY=...' yapin ya da $IB/.env dosyasina ekleyin." >&2
  exit 1
fi

mkdir -p "$IB/input"
cp "$IMG" "$IB/input/0-$OBJ.png"

PROMPT="Re-render this building as a realistic World War II Normandy village house from Call of Duty 2 (1944, Carentan style). \
Keep the exact same shape, proportions, window and door layout: two storey house with weathered cream lime plaster over stone, \
grey stone corner quoins and plinth, dark slate gable roof with a shell-blasted hole exposing broken wooden rafters, \
a brick chimney, faded green French wooden shutters (some hanging broken), an artillery shell hole in the upper wall with exposed red brick, \
soot and battle damage, rubble pile and sandbags at the base. Gritty desaturated WWII palette. \
Isolate the building: white background, centered, tight crop, soft studio lighting, no ground plane, no people, no vehicles, no text, no cast shadows on the ground. \
One single building only, true to the source image."

cd "$IB"
node .claude/scripts/asset-pipeline/generate-single-asset.mjs \
  --world "$WORLD" \
  --image "input/0-$OBJ.png" \
  --object-id "$OBJ" \
  --object-name "Normandy house (CoD2)" \
  --description "War damaged two storey stone and plaster Normandy house with slate roof, WWII 1944, Call of Duty 2 style" \
  --image-edit-prompt "$PROMPT" \
  --face-count "${FACE_COUNT:-150000}" \
  --enable-pbr true \
  "$@"

mkdir -p "$DEST"
find "worlds/$WORLD/output/$OBJ" -maxdepth 1 -type f ! -name '.*' \
  \( -name '*.glb' -o -name '*.obj' -o -name '*.mtl' -o -name '*.fbx' -o -name '*.png' -o -name '*.jpg' \) \
  -exec cp {} "$DEST/" \;
echo "Ciktilar: $DEST"
ls -la "$DEST"
