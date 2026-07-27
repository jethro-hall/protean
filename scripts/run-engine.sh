#!/usr/bin/env bash
# Start the Protean engine (on-host Phase 0–3). Used by protean-engine.service.
set -euo pipefail
cd "$(dirname "$0")/../APP/CODE"
exec npm start
