<p align="center">
  <img src="https://raw.githubusercontent.com/EgieSugina/S.P.E.C.T.R.E/main/ghost-svgrepo-com.svg" alt="S.P.E.C.T.R.E logo" width="128">
</p>

# S.P.E.C.T.R.E

**Secure Proxy & Encrypted Connection Tunneling Remote Environment**

> *You were never here.*

SPECTRE is a local-first SSH/SFTP manager that runs as a **single Go binary** with an embedded React web UI. SSH sessions persist in the backend daemon — close your browser tab and the connection stays alive.

## Features

### Core
- **Connection Manager** — CRUD for SSH accounts, sidebar groups/folders, encrypted credential storage
- **Terminal** — Multi-tab xterm.js terminals over WebSocket with session persistence
- **SFTP File Manager** — Browse, upload, download, mkdir, delete, rename; drag-and-drop with parallel upload queue
- **Encrypted Vault** — AES-256-GCM password encryption with PBKDF2 master password
- **Config Import/Export** — JSON and encrypted `.spectre` format
- **Themes** — Default SPECTRE dark purple, plus Pure Dark (neutral grays), pink, and green variants; selectable in Settings

### Power (Phase 2)
- **SOCKS5 & Port Forwarding** — Proxy manager with connection graph visualization and traceroute-style route trace
- **SSH Key Manager** — Generate (Ed25519/RSA), import PEM keys, assign to connections
- **Connection Groups** — Sidebar grouping, create/edit/delete groups, assign connections
- **Known Host Verification** — Trust-on-first-use with host key store; mismatch prompts before connect
- **Live SFTP Progress** — WebSocket upload progress and queue panel
- **System Log Panel** — Captured API and process logs in the UI
- **Dashboard** — Active connections, sessions, tunnels at a glance
- **Global Vault Unlock Modal** — Unlock vault from anywhere in the app

### Platform
- **Background Daemon** — SSH sessions survive browser tab close (`spectre start --daemon`)
- **Linux System Tray** — KDE status-area ghost icon to start/stop daemon, open UI, desktop notifications
- **Tray Autostart** — `spectre tray --install-autostart` for login startup

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SPECTRE BINARY                           │
│  ┌─────────────────┐    ┌──────────────────────────────┐   │
│  │  Embedded React │    │        Go Backend            │   │
│  │  (dist/*)       │    │  SSH/SFTP · WebSocket · SQLite│   │
│  └────────┬────────┘    └──────────────────────────────┘   │
│           │                                                  │
│  Browser ─┴─ localhost:57321                                │
└─────────────────────────────────────────────────────────────┘
         │ SSH/SFTP
         ▼
  [ Remote Servers ]
```

See [spectre_architecture_diagram.html](spectre_architecture_diagram.html) for the interactive blueprint.

## Stack

| Layer | Technology |
|-------|------------|
| Backend | Go 1.22+, Chi v5, Gorilla WebSocket, `golang.org/x/crypto/ssh`, `pkg/sftp` |
| Frontend | React 18, Vite, Tailwind CSS v4, Zustand, Framer Motion, xterm.js v5 |
| Storage | SQLite + GORM (`CGO_ENABLED=1`) |
| Crypto | AES-256-GCM, PBKDF2 (100k iterations) |

## Prerequisites

- **Go 1.23+** with CGO enabled (requires a C compiler for SQLite)
- **Node.js 20+** and **pnpm 9+** (development/build only — not needed to run the binary)
- Linux: `gcc` / `base-devel`; system tray requires KDE/Plasma (status notifier area)
- macOS: Xcode Command Line Tools

## Quick Start

```bash
# Install dependencies
make install-deps

# Production build (frontend → embed → binary)
make build

# Run (opens browser by default)
./spectre start

# Or without browser
./spectre start --no-browser
```

Open **http://127.0.0.1:57321** — the binary serves the embedded production UI from this port.

> **Important:** After changing frontend code, run `make build` (or at minimum `make embed`) before `./spectre start` or `go run ./cmd/spectre/ start`. The Go binary embeds `internal/server/dist/` at compile time; skipping the embed step leaves stale or missing asset hashes.

## Development

Use the Vite dev server for frontend work — do **not** open `:57321` directly during development unless you have just run a production build.

| Mode | URL | UI source |
|------|-----|-----------|
| **Development** | http://localhost:5173 | Vite dev server (hot reload) |
| **Production** | http://127.0.0.1:57321 | Embedded `web/dist` in the Go binary |

### Frontend (Vite dev server on :5173)

```bash
cd web && pnpm install && pnpm dev
```

Vite proxies `/api` and `/ws` to the backend at `127.0.0.1:57321`.

### Backend (with hot reload via air)

```bash
# Install air (optional)
go install github.com/air-verse/air@latest

# Start backend
go run ./cmd/spectre/ start --no-browser
# or: make dev-backend
```

If you use `go run` and need the embedded UI on `:57321`, run `make embed` first so `internal/server/dist/` matches `web/dist/`.

### Full dev workflow

1. Terminal 1: `make dev-backend`
2. Terminal 2: `make dev-frontend`
3. Open http://localhost:5173

## CLI Usage

```bash
spectre                          # Start server (default)
spectre start                    # Start server explicitly
spectre start --daemon           # Background daemon
spectre start --port 8080        # Custom port
spectre start --bind 0.0.0.0     # Bind all interfaces (use with caution)
spectre start --no-browser       # Don't auto-open browser
spectre start --config ~/.spectre  # Custom config directory
spectre stop                     # Stop daemon
spectre status                   # Check daemon status
spectre open                     # Open browser to UI
spectre tray                     # Run system tray icon (Linux/KDE)
spectre tray --install-autostart # Autostart tray icon at login
spectre tray --uninstall-autostart  # Remove tray autostart entry
```

### Daemon mode

Background daemon keeps SSH sessions alive after the browser closes. State is stored under the config directory (`~/.spectre` by default):

- `spectre.pid` — running process ID
- `runtime.json` — bind address, port, and PID

Start in the background, then check or stop from the CLI or tray:

```bash
spectre start --daemon
spectre status
spectre open
spectre stop
```

### Linux system tray

On Linux (KDE/Plasma), `spectre tray` shows a ghost icon in the status area. The icon is embedded from transparent PNGs (22/32/64/256 px) derived from `ghost-svgrepo-com.svg` in `internal/tray/icons/`.

Tray menu actions:

- **Open SPECTRE** — open the web UI (daemon must be running)
- **Start Daemon** / **Stop Daemon** — control the background server
- **Quit Tray** — remove the tray icon (does not stop the daemon)

Tray flags mirror server options where relevant (`--port`, `--bind`, `--config`). Browser auto-open is off by default for tray-driven starts (`--no-browser`).

Install autostart so the tray icon appears after login:

```bash
spectre tray --install-autostart
```

This writes `~/.config/autostart/spectre-tray.desktop` and installs the app icon to `~/.local/share/icons/hicolor/256x256/apps/spectre.png`. A reference desktop entry ships at `packaging/linux/spectre-tray.desktop`. Remove with `spectre tray --uninstall-autostart`.

On non-Linux platforms, `spectre tray` returns an error (stub build).

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SPECTRE_PORT` | `57321` | HTTP port |
| `SPECTRE_BIND` | `127.0.0.1` | Bind address |
| `SPECTRE_CONFIG` | `~/.spectre` | Config/data directory |
| `SPECTRE_NO_BROWSER` | `false` | Skip auto-open browser |

## Security Notes

1. **Local-only by default** — Binds to `127.0.0.1:57321`. Use `--bind 0.0.0.0` only if you understand the risk.
2. **Session token** — 256-bit random token generated on start, stored in `~/.spectre/session.token`. All API requests require `X-SPECTRE-Token` header.
3. **Encrypted vault** — SSH passwords encrypted with AES-256-GCM. Master password is never stored on disk (only a PBKDF2 hash for verification).
4. **Host key verification** — Trust-on-first-use: unknown keys are stored automatically on first connect. If a host key changes, connection is blocked and a trust prompt is shown. Manage stored keys via the known-hosts API.

### First-time setup

1. Start SPECTRE
2. Go to **Settings** → set up the master vault password
3. Add connections in **Connections**
4. Connect and open terminal or file manager

## Project Structure

```
spectre/
├── cmd/spectre/main.go          # CLI entry point
├── internal/
│   ├── server/                  # HTTP server, auth, embed, handlers
│   ├── daemon/                  # Background daemon (PID, runtime state)
│   ├── tray/                    # Linux system tray icon and autostart
│   ├── ssh/                     # Connection pool, PTY, WebSocket bridge
│   ├── sftp/                    # File operations, upload queue
│   ├── store/                   # SQLite models and CRUD
│   ├── crypto/                  # Vault and key utilities
│   └── config/                  # Import/export
├── packaging/linux/             # Desktop entry for tray autostart
├── web/                         # React frontend
│   ├── src/
│   │   ├── api/                 # API client
│   │   ├── components/          # UI components
│   │   ├── pages/               # Route pages
│   │   ├── store/               # Zustand stores
│   │   └── styles/              # SPECTRE theme CSS
│   └── package.json
├── Makefile
├── SPECTRE-PLAN.md              # Full product plan
├── SPECTRE-API.md               # API documentation
└── README.md
```

## API

Base URL: `http://localhost:57321/api`

All requests require header: `X-SPECTRE-Token: <token>`

Key endpoints:
- `GET /connections` — List SSH accounts
- `POST /connections/:id/connect` — Open SSH connection
- `GET /groups` — List connection groups
- `POST /groups` — Create group
- `GET /keys` — List SSH keypairs
- `POST /keys/generate` — Generate new keypair
- `GET /known-hosts` — List trusted host keys
- `POST /known-hosts/trust` — Accept a new/changed host key
- `POST /sessions` — Create terminal session
- `GET /sftp/:conn_id/list?path=/` — List remote directory
- `GET /tunnels` — List proxy/tunnel configs
- `WS /ws/terminal/:session_id` — Terminal I/O

Full API docs: [SPECTRE-API.md](SPECTRE-API.md)

## Roadmap

| Phase | Status | Features |
|-------|--------|----------|
| **1 — MVP** | ✅ Done | Single binary, SPECTRE theme, connection CRUD, multi-tab terminal, SFTP browse/upload/download, encrypted vault, config import/export |
| **2 — Power** | ✅ Done | SOCKS5 proxy, local port forward, proxy connection graph + route trace (traceroute), parallel uploads + drag-and-drop, live SFTP progress (WebSocket), system log panel, global vault unlock modal, enriched dashboard, SSH key manager, connection groups UI, known-host verification (TOFU + mismatch prompts) |
| **3 — Advanced** | Planned | Split terminal panes, broadcast commands, jump host / bastion, snippet manager, theme customizer |
| **4 — Distribution** | 🚧 In progress | Signed release binaries (GoReleaser scaffolded), auto-update, Linux KDE tray + autostart (**done**), systemd / launchd / Windows Service, Docker image, Homebrew / WinGet / APT |

## License

MIT License (placeholder — see LICENSE file)

---

*The best tool is the one you trust with your secrets.*
