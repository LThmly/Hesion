#!/usr/bin/env bash
# Install Hesion for the current user:
#   - ~/.local/bin/hesion          (terminal: `hesion`)
#   - ~/.local/share/applications/hesion.desktop  (wofi / app launchers)
#   - icon theme entry             (Icon=hesion)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/256x256/apps"
PIXMAP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/pixmaps"

cd "$ROOT"

if ! command -v npm >/dev/null 2>&1; then
  echo "hesion: npm is required" >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "hesion: installing dependencies…"
  npm install
fi

echo "hesion: building…"
npm run build

mkdir -p "$BIN_DIR" "$APP_DIR" "$ICON_DIR" "$PIXMAP_DIR"

# Stable launcher on PATH — always points at this checkout.
cat > "$BIN_DIR/hesion" <<EOF
#!/usr/bin/env bash
exec "$ROOT/scripts/hesion" "\$@"
EOF
chmod +x "$BIN_DIR/hesion"
chmod +x "$ROOT/scripts/hesion"

# Desktop icon (PNG; 256x256 slot is fine for a small logo asset)
if [[ -f "$ROOT/assets/logo.png" ]]; then
  cp "$ROOT/assets/logo.png" "$ICON_DIR/hesion.png"
  cp "$ROOT/assets/logo.png" "$PIXMAP_DIR/hesion.png"
fi

cat > "$APP_DIR/hesion.desktop" <<EOF
[Desktop Entry]
Name=Hesion
Comment=Hyprland LLM companion — chat, screen context, voice, compact mode
Exec=$BIN_DIR/hesion
Icon=hesion
Terminal=false
Type=Application
Categories=Utility;Network;Office;
Keywords=AI;LLM;chat;hesion;
StartupWMClass=hesion
EOF

# Refresh desktop database when available (wofi / gtk)
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor" >/dev/null 2>&1 || true
fi

echo
echo "Installed:"
echo "  command : $BIN_DIR/hesion"
echo "  desktop : $APP_DIR/hesion.desktop"
echo "  icon    : $ICON_DIR/hesion.png"
echo
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo "Note: $BIN_DIR is not on your PATH."
  echo "  Add this to your shell config, then reopen the terminal:"
  echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
  echo
fi
echo "Try:  hesion"
echo "Or open Hesion from wofi / your app launcher."
echo
echo "Hyprland bind (use the full path — Hyprland often lacks ~/.local/bin):"
echo "  bind = SUPER, A, exec, $BIN_DIR/hesion"
echo
echo "Or in hyprland.lua:"
echo "  hl.bind(mainMod .. \" + A\", hl.dsp.exec_cmd(os.getenv(\"HOME\") .. \"/.local/bin/hesion\"))"