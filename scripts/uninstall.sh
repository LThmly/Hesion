#!/usr/bin/env bash
# Remove user-level Hesion launcher + desktop entry installed by install.sh.
set -euo pipefail

BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/256x256/apps"
PIXMAP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/pixmaps"

rm -f "$BIN_DIR/hesion"
rm -f "$APP_DIR/hesion.desktop"
rm -f "$ICON_DIR/hesion.png"
rm -f "$PIXMAP_DIR/hesion.png"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
fi

echo "Hesion launcher and desktop entry removed."
echo "The project checkout was left in place."
