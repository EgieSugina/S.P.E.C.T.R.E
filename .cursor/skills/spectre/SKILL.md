---
name: spectre
description: Guides development of S.P.E.C.T.R.E (Secure Proxy & Encrypted Connection Tunneling Remote Environment) — a Go single-binary SSH/SFTP/proxy manager with embedded React UI. Uses graphify-out/ knowledge graph for codebase navigation. Use when building SPECTRE features, implementing modules (connections, terminal, SFTP, proxy, keys, vault), applying code patterns, brutalist dark-purple theme, REST/WebSocket API, tracing data flow via graphify, or when the user mentions SPECTRE, S.P.E.C.T.R.E, or this project plan.
---

# S.P.E.C.T.R.E Development

Tagline: *"You were never here."*

Web-based SSH/SFTP/proxy manager as a **single Go binary**. Frontend in browser; backend runs as a **persistent daemon** so SSH sessions survive tab close.

```
Browser (React) ──WebSocket/HTTP──▶ Go Backend :57321 ──SSH/SFTP──▶ Remote Server
Tab closed → WS disconnects → SSH session STAYS ALIVE in backend goroutine
```

Visual blueprint: [spectre_architecture_diagram.html](../../../spectre_architecture_diagram.html)

## Core Constraints

1. **Single binary** — embed React `dist/` into Go; no Node/Python on target machine
2. **Session persistence** — SSH runs in Go goroutines; browser only streams via WebSocket
3. **Local-first security** — default bind `127.0.0.1:57321`; `X-SPECTRE-Token` auth
4. **Encrypted vault** — AES-256-GCM for passwords/keys; master password never stored on disk
5. **SPECTRE aesthetic** — brutalist minimalist, dark purple hacker theme, full animation

## Stack

| Layer | Choice |
|-------|--------|
| Backend | Go 1.22+, Chi v5, Gorilla WebSocket, `golang.org/x/crypto/ssh`, `pkg/sftp` |
| Frontend | React 18 + Vite, Tailwind v4, Zustand, Framer Motion, xterm.js v5 |
| Storage | SQLite + GORM (`CGO_ENABLED=1`) |
| Packaging | GoReleaser |

## Project Layout

```
cmd/spectre/main.go          # CLI + daemon entry
internal/server/             # HTTP, middleware, embed.go
internal/ssh/                # Connection pool, PTY, WebSocket bridge
internal/sftp/               # File ops, parallel upload (max 10)
internal/proxy/              # SOCKS5, port forwards
internal/tunnel/             # Tunnel management
internal/store/              # SQLite CRUD
internal/crypto/             # Vault, keystore
internal/config/             # Import/export
web/src/                     # React app
build/                       # Makefile, goreleaser.yaml
```

Full tree: [architecture.md](architecture.md)

## Codebase Navigation (graphify)

SPECTRE ships a pre-built knowledge graph in `graphify-out/`. Agents should query it **before** unfamiliar exploration.

**When to use:** Before reading unknown packages; answering "how does X work?"; tracing data flow (REST → handler → manager → remote); finding callers/callees; understanding `internal/` ↔ `web/` relationships.

**Fast path:** If `graphify-out/graph.json` exists (it does in this repo), skip manual grep/search — run `graphify query "<question>"` first. Fall back to file reads only when the graph lacks vocabulary or edges.

**After code changes:** Run `graphify --update` or `graphify hook install` to keep the graph current.

**Key commands:**

```bash
graphify query "How does SSH session persistence work?"
graphify query "terminal WebSocket flow" --dfs
graphify path "ConnectionManager" "Vault"
graphify explain "TerminalSession"
```

**Outputs:** `graphify-out/graph.html` (interactive), `graphify-out/GRAPH_REPORT.md` (report), `graphify-out/graph.json` (query target).

Full SPECTRE workflow: [graphify.md](graphify.md)

## Implementation Patterns

Before coding a module, read the matching pattern in [patterns.md](patterns.md). Full code examples: [SPECTRE-SKILLS.md](../../../SPECTRE-SKILLS.md).

| Skill | Module | Target Files |
|-------|--------|--------------|
| 01 | Go embed + CLI | `cmd/spectre/main.go`, `internal/server/embed.go` |
| 02 | SSH pool + session persistence | `internal/ssh/manager.go`, `terminal.go` |
| 03 | SFTP parallel upload | `internal/sftp/upload.go` |
| 04 | SOCKS5 proxy | `internal/proxy/socks5.go` |
| 05 | Port forward | `internal/proxy/portforward.go` |
| 06 | AES vault | `internal/crypto/vault.go` |
| 07 | xterm.js terminal | `web/src/components/terminal/TerminalPane.tsx` |
| 08 | Drag-drop upload | `web/src/components/filemanager/DropZone.tsx` |
| 09 | Upload queue hook | `web/src/hooks/useUploadQueue.ts` |
| 10 | Config import/export | `internal/config/export.go`, `import.go` |
| 11 | Tailwind theme | `web/tailwind.config.ts` |
| 12 | Daemon mode | `cmd/spectre/main.go` |
| 13 | Page transitions | `web/src/App.tsx` |
| 14 | SSH key generation | `internal/ssh/keygen.go` |
| 15 | GoReleaser build | `build/goreleaser.yaml` |

## New Feature Checklist

```
- [ ] Read matching SKILL pattern in patterns.md
- [ ] Backend handler in correct internal/ package
- [ ] REST route under /api (Chi router)
- [ ] WebSocket events if real-time (terminal, SFTP, tunnels, system)
- [ ] SQLite model + migration in internal/store/
- [ ] Encrypt sensitive fields via internal/crypto/vault.go
- [ ] Frontend: Zustand store + API client + page/component
- [ ] SPECTRE theme tokens (no hardcoded colors)
- [ ] Auth header: X-SPECTRE-Token on all API calls
- [ ] Error responses use standard format (see api.md)
```

## Build Pipeline

```bash
cd web && pnpm build                 # → web/dist/
cp -r web/dist internal/server/dist  # embed path
go build -ldflags="-s -w" -o spectre ./cmd/spectre/
```

GoReleaser runs this automatically via `before.hooks`. Embed path must be relative to `embed.go`.

## Development

```bash
cd web && pnpm install && pnpm dev     # Vite :5173, proxy to :57321
air                                     # Go hot reload
```

Env vars: `SPECTRE_PORT`, `SPECTRE_BIND`, `SPECTRE_CONFIG`, `SPECTRE_LOG_LEVEL`, `SPECTRE_DEV`

## Code Conventions

- **Go**: `gofmt` + golangci-lint
- **TS**: ESLint + Prettier
- **Commits**: Conventional Commits (`feat`, `fix`, `docs`, `chore`)
- **Tests**: `go test ./...`; E2E with Playwright

## Design System

Use CSS variables + Tailwind tokens. Never substitute generic dark themes.

- Backgrounds: `--bg-void` → `--bg-active` / `void`, `deep`, `surface`
- Accent: `--purple-core`, `--purple-bright`, `--purple-glow`
- Cards: `rounded-brutal` (2px), 3px purple left border
- xterm theme: purple cursor `#A78BFA`, bg `#07070F`

Full spec: [theme.md](theme.md)

## API Quick Reference

Base: `http://localhost:57321/api` — header `X-SPECTRE-Token: <token>`

| Area | Key Routes |
|------|------------|
| Connections | `/connections`, `/connections/:id/connect`, `/connections/import` |
| Sessions | `/sessions`, `/sessions/:id/reconnect` |
| SFTP | `/sftp/:conn_id/list`, `/upload`, `/download`, `/chmod`, `/zip` |
| Tunnels | `/tunnels`, `/tunnels/:id/start`, `/tunnels/:id/stats` |
| Keys | `/keys/generate`, `/keys/import` |
| System | `/settings`, `/system/status` |

WebSockets: `/ws/terminal/:session_id`, `/ws/sftp/:conn_id`, `/ws/tunnels`, `/ws/system`

Terminal reconnect sends `{ "type": "buffer" }` catch-up. Error codes: `AUTH_FAILED`, `HOST_UNREACHABLE`, `VAULT_LOCKED`, etc.

Full spec: [api.md](api.md)

## Security Rules

1. Default bind `127.0.0.1` only; `--bind 0.0.0.0` requires explicit user intent
2. Never log or persist master password, SSH passwords, or private keys in plaintext
3. PBKDF2 (100k iter) → AES-256-GCM with per-entry nonce
4. Session token: 256-bit random, regenerated on start

## Roadmap Phases

1. **MVP**: binary, theme, connections, terminal, basic SFTP, vault
2. **Power**: parallel upload, drag-drop, SOCKS5, port forward, import/export, keys, groups
3. **Advanced**: split panes, broadcast, jump host, snippets, theme customizer
4. **Distribution**: signed binaries, auto-update, systemd/launchd/Windows Service

## Source Documents

| Doc | Purpose |
|-----|---------|
| [SPECTRE-PLAN.md](../../../SPECTRE-PLAN.md) | Full product plan |
| [SPECTRE-SKILLS.md](../../../SPECTRE-SKILLS.md) | Complete code patterns (15 skills) |
| [SPECTRE-API.md](../../../SPECTRE-API.md) | API source of truth |
| [spectre_architecture_diagram.html](../../../spectre_architecture_diagram.html) | Visual blueprint |

## Skill References

- [architecture.md](architecture.md) — System diagram, directory tree, daemon
- [graphify.md](graphify.md) — Knowledge graph queries, updates, monorepo tips
- [modules.md](modules.md) — Feature specs, data models
- [patterns.md](patterns.md) — Implementation patterns index + gotchas
- [theme.md](theme.md) — Design system, Tailwind config
- [api.md](api.md) — REST + WebSocket API
