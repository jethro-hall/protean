#!/usr/bin/env bash
# Install + enable Protean GUI/engine as systemd --user units (no Cursor terminal).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_DIR="${HOME}/.config/systemd/user"
LOG_DIR="${ROOT}/APP/LLMBUILD_DATA/logs"

mkdir -p "${UNIT_DIR}" "${LOG_DIR}"
chmod +x "${ROOT}/scripts/run-engine.sh" "${ROOT}/scripts/run-gui.sh"

# Copy (not symlink): some hosts refuse user-unit symlinks under SELinux.
cp -f "${ROOT}/infra/systemd/protean-engine.service" "${UNIT_DIR}/protean-engine.service"
cp -f "${ROOT}/infra/systemd/protean-gui.service" "${UNIT_DIR}/protean-gui.service"

# Linger so user units keep running after SSH/IDE disconnect
loginctl enable-linger "$(id -un)" 2>/dev/null || true

systemctl --user daemon-reload
systemctl --user enable --now protean-engine.service
systemctl --user enable --now protean-gui.service
systemctl --user --no-pager --full status protean-engine.service protean-gui.service || true

echo
echo "Protean services (systemd --user):"
echo "  Engine:  http://127.0.0.1:8787/healthz"
echo "  GUI:     http://127.0.0.1:5173/"
echo "  Style:   http://127.0.0.1:5173/design/protean-style-guide.html"
echo "  Proto:   http://127.0.0.1:5173/design/protean-shell-prototype.html"
echo "Logs: ${LOG_DIR}/protean-{engine,gui}.log"
echo "Control: systemctl --user {status|restart|stop} protean-gui.service"