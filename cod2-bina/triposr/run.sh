#!/usr/bin/env bash
# Usage: ./run.sh <image> [--yaw 90] [--height 10.5] [--faces 40000] [--remove-bg] [--out DIR]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/.venv/bin/activate"
export PYTHONPATH="$HERE/.TripoSR${PYTHONPATH:+:$PYTHONPATH}"
# texture baking needs an OpenGL context; use a virtual display when there is no screen
if [[ -z "${DISPLAY:-}" ]] && command -v xvfb-run >/dev/null; then
  exec xvfb-run -a -s "-screen 0 1024x768x24" python "$HERE/image_to_building.py" "$@"
fi
exec python "$HERE/image_to_building.py" "$@"
