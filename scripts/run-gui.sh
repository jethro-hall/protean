#!/usr/bin/env bash
# Start the Protean Vite GUI. Used by protean-gui.service — not an IDE terminal.
set -euo pipefail
cd "$(dirname "$0")/../APP/GUI"
export PROTEAN_ENGINE_ORIGIN="${PROTEAN_ENGINE_ORIGIN:-http://127.0.0.1:8787}"
exec npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
