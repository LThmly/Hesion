# Hesion

Desktop LLM companion for Linux (Hyprland-friendly): chat, screen context, voice input, study tools, and a compact HUD mode.

Built with Electron, Vite, React, and TypeScript. Cloud providers only (OpenAI, Anthropic, OpenRouter, Gemini) — API keys are entered in Settings and stored locally under your XDG config directory.

## Features

- Streaming chat with markdown, KaTeX, and syntax highlighting
- **Compact mode** — thin HUD bar with ask / answer / explain-more
- Screen context via `grim` / `hyprshot` / `slurp` (optional)
- Voice input via OpenAI Whisper (optional; needs an OpenAI key)
- Study mode: auto flashcards + quiz generation
- Sessions sidebar, export to Markdown
- Light / dark themes

## Requirements

| Need | Notes |
|------|--------|
| Linux | Wayland + Hyprland recommended for compact resize + capture |
| Node.js 20+ and npm | |
| Electron | System package (`pacman -S electron`) **or** `npm install -D electron` |
| Optional capture tools | `grim`, `slurp`, and/or `hyprshot` |
| Optional clipboard | `wl-paste` |

Config, sessions, and API keys are **never** stored in the repo. They live at:

```text
~/.config/hesion/config.json      # keys + preferences (mode 0600)
~/.config/hesion/sessions.json
~/.config/hesion/usage.json
```

Do not copy those files into the project or commit them.

## Quick start

```bash
git clone <your-repo-url> hesion
cd hesion
npm install
```

Install Electron if it is not already on your PATH:

```bash
# Arch example
sudo pacman -S electron

# or project-local
npm install -D electron
```

### User install (launcher + desktop entry)

```bash
./scripts/install.sh
hesion
```

This builds the app and installs for **your user only**:

| What | Where |
|------|--------|
| Command | `~/.local/bin/hesion` |
| Desktop entry | `~/.local/share/applications/hesion.desktop` |
| Icon | `~/.local/share/icons/.../hesion.png` |

If `hesion` is not found, add `~/.local/bin` to your `PATH`.

Uninstall the launcher (keeps the checkout):

```bash
./scripts/uninstall.sh
```

### Development

```bash
npm install
npm run dev      # Vite + Electron (--dev)
npm start        # production build + run once
npm run build    # vite + electron main/preload
npm run typecheck
```

Open **Settings** in the app and paste provider API keys. Keys stay on disk under `~/.config/hesion/` only.

## Hyprland

Hyprland’s `exec` PATH often omits `~/.local/bin`, so use a full path in binds:

```conf
bind = SUPER, A, exec, ~/.local/bin/hesion
bind = ALT SHIFT, SPACE, exec, ~/.local/bin/hesion --compact
```

Or in `hyprland.lua`:

```lua
hl.bind(mainMod .. " + A", hl.dsp.exec_cmd(os.getenv("HOME") .. "/.local/bin/hesion"))
```

See `hyprland-hesion.conf` for notes. Compact mode uses `hyprctl` for relative tiled resize when available; on other environments the UI still toggles.

## Project layout

```text
assets/           # logos / empty-state art
electron/         # main process, IPC, providers, Hyprland helpers
scripts/          # build, launcher, install/uninstall
shared/           # types + shared prompts shared by main + renderer
src/              # React UI
hesion.desktop    # template desktop entry (install.sh writes the live one)
```

## Security notes

- API keys are written with file mode `0600` under `~/.config/hesion/`.
- Image attachments are stripped from persisted session history (screenshots are not kept on disk in chat logs).
- This repository should not contain `.env` files or real keys. Placeholders like `sk-…` in Settings are UI hints only.

## License

MIT — see [LICENSE](LICENSE).
