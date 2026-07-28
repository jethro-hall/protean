#!/usr/bin/env bash
# Start the Protean Vite GUI. Used by protean-gui.service — not an IDE terminal.
set -euo pipefail
cd "$(dirname "$0")/../APP/GUI"
export PROTEAN_ENGINE_ORIGIN="${PROTEAN_ENGINE_ORIGIN:-http://127.0.0.1:8787}"
# Vite Host check — public edge hostname (override via env; Law 2).
export PROTEAN_GUI_ALLOWED_HOSTS="${PROTEAN_GUI_ALLOWED_HOSTS:-protean.rideai.com.au,.rideai.com.au,localhost,127.0.0.1}"
# Public HTTPS origin when Caddy terminates TLS in front of Vite (HMR / asset URLs).
export PROTEAN_GUI_PUBLIC_ORIGIN="${PROTEAN_GUI_PUBLIC_ORIGIN:-https://protean.rideai.com.au}"
exec npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
