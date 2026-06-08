# SPECTRE Architecture

Visual blueprint: open [spectre_architecture_diagram.html](../../../spectre_architecture_diagram.html) in browser. Live codebase map: query `graphify-out/` via [graphify.md](graphify.md).

## Data Flow

```
┌──────────────┐   WebSocket/HTTP    ┌─────────────────────┐   SSH/SFTP   ┌──────────────┐
│   Browser    │ ◀─────────────────▶ │   Go Backend :57321 │ ◀──────────▶ │ Remote Server│
│ React + Vite │                    │  (single binary)    │              │    :22       │
└──────────────┘                    └─────────────────────┘              └──────────────┘
```

**Session persistence:** Tab closed → WebSocket disconnects → **SSH stays alive** in backend goroutine. Reopen browser → reconnect WS → receive `buffer` catch-up + live `output`.

## Binary Composition

```
SPECTRE BINARY
├── Embedded React (web/dist via //go:embed)
└── Go Backend
    ├── SSH/SFTP Manager
    ├── Proxy / Tunnel
    ├── WebSocket Terminal
    ├── Config Store (SQLite encrypted)
    └── Crypto Vault (AES-256-GCM)
```

## Backend Stack

| Component | Library |
|-----------|---------|
| Language | Go 1.22+ |
| SSH/SFTP | `golang.org/x/crypto/ssh`, `github.com/pkg/sftp` |
| Router | Chi v5 |
| WebSocket | Gorilla WS |
| Database | SQLite + GORM (`CGO_ENABLED=1`) |
| Crypto | AES-256-GCM, PBKDF2 |
| Packaging | GoReleaser |

## Frontend Stack

| Component | Library |
|-----------|---------|
| Framework | React 18 + Vite |
| Styling | Tailwind CSS v4 |
| Terminal | xterm.js v5 |
| State | Zustand |
| Animation | Framer Motion |
| Drag & Drop | react-dropzone |
| Font | JetBrains Mono |
| Deploy | Embedded in Go binary |

## Feature Modules

| Module | Capabilities |
|--------|-------------|
| Connection Manager | SSH accounts, groups, tags, import/export |
| Terminal | Multi-tab, split pane, broadcast, persistent sessions |
| File Manager | SFTP dual-pane, drag-drop, parallel upload (max 10) |
| Proxy & Tunnel | SOCKS5, local/remote/dynamic forward, auto-restart |
| Key Manager | RSA 4096, Ed25519, ECDSA, import PEM |
| Vault | Master password, AES-256-GCM, zero-knowledge |

## Directory Structure

```
spectre/
├── cmd/spectre/main.go
├── internal/
│   ├── server/          # server.go, middleware.go, embed.go
│   ├── ssh/             # manager.go, session.go, terminal.go, keygen.go
│   ├── sftp/            # manager.go, upload.go, download.go, filetree.go
│   ├── proxy/           # socks5.go, portforward.go, dynamic.go
│   ├── tunnel/tunnel.go
│   ├── store/           # db.go, accounts.go, groups.go, settings.go
│   ├── crypto/          # vault.go, keystore.go
│   └── config/          # export.go, import.go
├── web/src/
│   ├── store/           # connectionStore, terminalStore, fileStore, settingsStore
│   ├── components/      # layout, terminal, filemanager, connections, proxy, shared
│   ├── pages/           # Dashboard, Connections, Terminal, FileManager, Proxy, KeyManager, Settings
│   ├── hooks/           # useWebSocket, useTerminal, useDragDrop, useUploadQueue
│   ├── api/             # client, connections, sftp, proxy
│   └── styles/          # globals.css, animations.css, terminal.css
├── build/               # Makefile, goreleaser.yaml
└── scripts/             # install.sh, install.ps1
```

## Navigation

```
Dashboard → Connections → Terminal → File Manager → Proxy & Tunnels → Key Manager → Settings
```

## Daemon Integration

| Platform | Mechanism |
|----------|-----------|
| Linux | systemd unit |
| macOS | launchd plist |
| Windows | Windows Service |

```bash
spectre start --daemon
spectre stop
spectre status
spectre open    # → localhost:57321
```

## Build Targets

Single binary for **Windows / Linux / macOS**, **ARM64 + AMD64** (skip windows/arm64).
