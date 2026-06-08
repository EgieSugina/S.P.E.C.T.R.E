# SPECTRE Implementation Patterns

Condensed from [SPECTRE-SKILLS.md](../../../SPECTRE-SKILLS.md). Read the full skill for complete code before implementing.

---

## SKILL-01: Go Single Binary + Embedded Frontend

**Files:** `internal/server/embed.go`, `cmd/spectre/main.go`

```go
//go:embed all:dist
var frontendFS embed.FS
```

**Build:** `web/dist` → copy to `internal/server/dist` → `go build`

**Gotchas:**
- `//go:embed` path is relative to the `.go` file
- Use `all:` prefix to include dotfiles
- Match Vite output directory

---

## SKILL-02: SSH Connection Pool + Session Persistence

**Files:** `internal/ssh/manager.go`, `session.go`, `terminal.go`

**Pattern:** `Manager` holds `map[string]*ManagedConnection` with keep-alive loop (`keepalive@openssh.com` every 30s). `TerminalSession` buffers output (max 500KB) and supports `AttachWebSocket` / `DetachWebSocket` — SSH keeps running when browser disconnects.

**Reconnect flow:**
1. Browser opens WS → server sends `{ "type": "buffer", "data": "<base64>" }`
2. Then streams live `{ "type": "output" }`

**Gotchas:**
- `HostKeyCallback` needs known_hosts implementation (TODO in plan)
- Auth methods: password + public key, support passphrase

---

## SKILL-03: SFTP Parallel Upload

**Files:** `internal/sftp/upload.go`

**Pattern:** Buffered channel semaphore (`chan struct{}` cap = maxConcurrent). Default 3, max 10. Progress reported max 10x/sec via non-blocking channel.

```go
q.semaphore <- struct{}{}       // acquire
defer func() { <-q.semaphore }() // release
```

**Gotchas:**
- Clamp `maxConcurrent` to 1–10
- 32KB read chunks for progress tracking

---

## SKILL-04: SOCKS5 via SSH Tunnel

**Files:** `internal/proxy/socks5.go`

**Pattern:** `go-socks5` with custom `Dial` calling `sshClient.Dial(network, addr)`. Bind `127.0.0.1:PORT`.

---

## SKILL-05: Local Port Forward

**Files:** `internal/proxy/portforward.go`

**Pattern:** TCP listener on local → `sshClient.Dial` to remote → bidirectional `io.Copy` in goroutines. `Stop()` closes listener + waits on `sync.WaitGroup`.

---

## SKILL-06: AES-256-GCM Vault

**Files:** `internal/crypto/vault.go`

**Pattern:**
```
Master password + salt → PBKDF2 (100k, SHA-256) → 32-byte key
Encrypt: random nonce per entry → AES-GCM → base64
Salt generated once, stored in SQLite
```

**Gotchas:**
- Master password never on disk; hash only for verification
- Wrong password → decryption fails (by design)

---

## SKILL-07: xterm.js Terminal

**Files:** `web/src/components/terminal/TerminalPane.tsx`

**Pattern:** Terminal with SPECTRE theme colors, `FitAddon`, `WebLinksAddon`, `ResizeObserver`. WS handles `output`, `buffer`, `disconnected`. On WS close, show "session still running" message.

**Theme:** bg `#07070F`, cursor `#A78BFA`, selection `rgba(124, 58, 237, 0.3)`

---

## SKILL-08: Drag & Drop Upload

**Files:** `web/src/components/filemanager/DropZone.tsx`

**Pattern:** `dragDepth` counter for nested drag events. Framer Motion overlay with purple dashed border. On drop → `enqueue()` to upload queue.

---

## SKILL-09: Upload Queue Hook

**Files:** `web/src/hooks/useUploadQueue.ts`

**Pattern:** Zustand store with `maxConcurrent` (1–10), `activeCount`, `processQueue()` that starts pending items up to limit. On complete/error → decrement active, call `processQueue()` again.

---

## SKILL-10: Config Import/Export

**Files:** `internal/config/export.go`, `import.go`

**Formats:**
- `.json` — plain structure, **no passwords**
- `.spectre` — encrypted wrapper `{ "format": "spectre-encrypted-v1", "encrypted": "..." }`
- `~/.ssh/config` — parse `Host`/`HostName`/`User`/`Port`/`IdentityFile`

---

## SKILL-11: Tailwind Theme

**Files:** `web/tailwind.config.ts`, `web/src/styles/globals.css`

**Pattern:** Extend colors (`void`, `deep`, `surface`, `purple.*`, `term.*`), fonts (`mono`, `display`, `body`), animations (`pulse-purple`, `glitch`, `status-ping`), `borderRadius.brutal: 2px`, `boxShadow.purple-*`.

---

## SKILL-12: Daemon Mode

**Files:** `cmd/spectre/main.go`

**Pattern:** PID file at `~/.spectre/spectre.pid`, fork with `SPECTRE_DAEMON=1`. Platform services: systemd (Linux), launchd (macOS), Windows Service.

**CLI flags:** `--port`, `--bind`, `--daemon`, `--no-browser`

---

## SKILL-13: Page Transitions

**Files:** `web/src/App.tsx`

**Pattern:** Framer Motion `AnimatePresence mode="wait"` with blur + slide variants (`opacity`, `x`, `filter: blur`).

---

## SKILL-14: SSH Key Generation

**Files:** `internal/ssh/keygen.go`

**Types:** RSA 4096 (default), Ed25519, ECDSA P-256. Output PEM private + `ssh.MarshalAuthorizedKey` + `ssh.FingerprintSHA256`.

---

## SKILL-15: GoReleaser

**Files:** `build/goreleaser.yaml`

**Hooks:** `cd web && pnpm install --frozen-lockfile && pnpm build` → `cp -r web/dist internal/server/dist`

**Build:** `CGO_ENABLED=1` (SQLite), platforms linux/windows/darwin × amd64/arm64 (skip windows/arm64).
