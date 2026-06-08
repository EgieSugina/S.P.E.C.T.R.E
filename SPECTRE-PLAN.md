# S.P.E.C.T.R.E
## Secure Proxy & Encrypted Connection Tunneling Remote Environment

> **Brutalist Minimalist · Dark Purple Hacker Aesthetic · Full Animation**
> SSH Manager · SFTP File Manager · Proxy & Tunnel Manager · Config Import/Export

---

## 0. Vision & Filosofi Produk

SPECTRE adalah **SSH/SFTP/Proxy manager** berbasis web yang berjalan sebagai **single binary** di lokal mesin. Frontend diakses lewat browser, backend berjalan sebagai **persistent background daemon** — sehingga koneksi tidak terputus walau tab browser ditutup.

Tagline: *"You were never here."*

---

## 1. Stack Teknologi

### 1.1 Rekomendasi Stack (Final)

| Layer | Pilihan Utama | Alternatif | Alasan |
|---|---|---|---|
| **Frontend** | React 18 + Vite | Vue 3 + Vite | Ekosistem lebih luas, library SSH terminal tersedia |
| **Styling** | Tailwind CSS v4 + custom CSS vars | UnoCSS | Utility-first, mudah custom brutal theme |
| **Terminal UI** | xterm.js | xterminal | De-facto standar, support WebSocket |
| **State** | Zustand | Pinia (Vue) | Ringan, tidak boilerplate-heavy |
| **Animations** | Framer Motion + CSS keyframes | GSAP | Declarative animation di React |
| **Backend** | Go (Golang) | Rust | **Single binary**, SSH library matang (`crypto/ssh`), cross-compile mudah |
| **SSH Library** | `golang.org/x/crypto/ssh` | — | Native Go, battle-tested |
| **SFTP Library** | `github.com/pkg/sftp` | — | Built on golang crypto/ssh |
| **WebSocket** | Gorilla WebSocket | — | Stream terminal output real-time |
| **HTTP Server** | Go `net/http` + Chi router | Gin | Ringan, cukup untuk embedded server |
| **Config Storage** | SQLite (embedded) via `gorm` | BoltDB | Relational, mudah query, zero external deps |
| **Encryption** | AES-256-GCM (passwords) | — | Enkripsi password SSH sebelum disimpan |
| **Packaging** | GoReleaser | — | Build single binary multi-platform |
| **Installer** | GoReleaser + NSIS (Win) / .deb/.rpm | — | Cross-platform installer |

### 1.2 Kenapa Go untuk Backend?

```
✓ Single binary — tidak perlu Node.js, Python, dll di mesin target
✓ Cross-compile: Windows / macOS / Linux dari satu codebase
✓ crypto/ssh native — tidak perlu OpenSSH binary
✓ Goroutine — concurrency native untuk parallel SFTP uploads
✓ Embed static files — frontend React di-embed ke dalam binary Go
✓ Memory footprint kecil (~15-30MB idle)
✓ Startup time < 100ms
```

### 1.3 Alternatif Stack Jika Prefer Node.js

```
Backend: Node.js + Fastify + ssh2 library
Packaging: pkg atau nexe (single binary Node)
Kekurangan: binary lebih besar (>80MB), startup lebih lambat
```

---

## 2. Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────┐
│                    SPECTRE BINARY (.exe / ELF)              │
│                                                             │
│  ┌─────────────────┐    ┌──────────────────────────────┐   │
│  │  Embedded React │    │        Go Backend            │   │
│  │  Static Files   │    │                              │   │
│  │  (dist/*)       │    │  ┌──────────┐ ┌──────────┐  │   │
│  └────────┬────────┘    │  │SSH/SFTP  │ │ Proxy /  │  │   │
│           │ serve       │  │ Manager  │ │ Tunnel   │  │   │
│           │             │  └──────────┘ └──────────┘  │   │
│  Browser  │             │  ┌──────────┐ ┌──────────┐  │   │
│  localhost│:57321       │  │WebSocket │ │ Config   │  │   │
│           │             │  │ Terminal │ │  Store   │  │   │
│           └─────────────│  └──────────┘ └──────────┘  │   │
│                         │  ┌──────────────────────┐   │   │
│                         │  │  SQLite (encrypted)  │   │   │
│                         │  └──────────────────────┘   │   │
│                         └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │
         │ SSH/SFTP/SOCKS5 connections keluar ke server
         ▼
  [ Remote Servers ]
```

### 2.1 Background Daemon Mode

```
spectre start --daemon        # Jalankan sebagai background service
spectre stop                  # Hentikan daemon
spectre status                # Cek status
spectre open                  # Buka browser ke localhost:57321

# Windows: Register sebagai Windows Service
# macOS: launchd plist
# Linux: systemd unit file
```

### 2.2 Session Persistence

```
Koneksi SSH berjalan di BACKEND (Go goroutine)
Browser hanya menampilkan output via WebSocket
Tab ditutup → WebSocket putus → KONEKSI SSH TETAP HIDUP
Browser dibuka lagi → Reconnect WebSocket → Resume terminal output
```

---

## 3. Struktur Direktori Project

```
spectre/
├── cmd/
│   └── spectre/
│       └── main.go               # Entry point, flag parsing, daemon logic
├── internal/
│   ├── server/
│   │   ├── server.go             # HTTP server, routing
│   │   ├── middleware.go         # Auth middleware (local token)
│   │   └── embed.go              # Embed React build
│   ├── ssh/
│   │   ├── manager.go            # SSH connection pool
│   │   ├── session.go            # SSH session management
│   │   ├── terminal.go           # PTY + WebSocket bridge
│   │   └── keygen.go             # SSH key generation
│   ├── sftp/
│   │   ├── manager.go            # SFTP client
│   │   ├── upload.go             # Parallel upload (max 10)
│   │   ├── download.go           # File download
│   │   └── filetree.go           # Remote file listing
│   ├── proxy/
│   │   ├── socks5.go             # SOCKS5 proxy server
│   │   ├── portforward.go        # Local/Remote port forward
│   │   └── dynamic.go            # Dynamic port forwarding
│   ├── tunnel/
│   │   └── tunnel.go             # SSH tunnel management
│   ├── store/
│   │   ├── db.go                 # SQLite init + migrations
│   │   ├── accounts.go           # SSH account CRUD
│   │   ├── groups.go             # Connection groups
│   │   └── settings.go           # App settings
│   ├── crypto/
│   │   ├── vault.go              # Master password + AES-256-GCM
│   │   └── keystore.go           # SSH private key storage
│   └── config/
│       ├── export.go             # Export config ke JSON/YAML
│       └── import.go             # Import config + validasi
├── web/                          # React frontend
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── store/                # Zustand stores
│   │   │   ├── connectionStore.ts
│   │   │   ├── terminalStore.ts
│   │   │   ├── fileStore.ts
│   │   │   └── settingsStore.ts
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Navbar.tsx
│   │   │   │   └── StatusBar.tsx
│   │   │   ├── terminal/
│   │   │   │   ├── TerminalPane.tsx
│   │   │   │   ├── TerminalTab.tsx
│   │   │   │   └── TerminalGrid.tsx
│   │   │   ├── filemanager/
│   │   │   │   ├── FileManager.tsx
│   │   │   │   ├── FileTree.tsx
│   │   │   │   ├── DropZone.tsx
│   │   │   │   ├── UploadQueue.tsx
│   │   │   │   └── FileContextMenu.tsx
│   │   │   ├── connections/
│   │   │   │   ├── ConnectionList.tsx
│   │   │   │   ├── ConnectionCard.tsx
│   │   │   │   ├── AddConnectionModal.tsx
│   │   │   │   └── GroupManager.tsx
│   │   │   ├── proxy/
│   │   │   │   ├── ProxyManager.tsx
│   │   │   │   ├── PortForwardList.tsx
│   │   │   │   └── Socks5Config.tsx
│   │   │   └── shared/
│   │   │       ├── Modal.tsx
│   │   │       ├── Button.tsx
│   │   │       ├── Input.tsx
│   │   │       └── Badge.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx     # Overview + quick connect
│   │   │   ├── Connections.tsx   # Manage SSH accounts
│   │   │   ├── Terminal.tsx      # Multi-tab terminal
│   │   │   ├── FileManager.tsx   # SFTP file manager
│   │   │   ├── Proxy.tsx         # Proxy & tunnels
│   │   │   ├── KeyManager.tsx    # SSH key management
│   │   │   └── Settings.tsx      # App settings
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   ├── useTerminal.ts
│   │   │   ├── useDragDrop.ts
│   │   │   └── useUploadQueue.ts
│   │   ├── api/
│   │   │   ├── client.ts         # Axios/fetch wrapper
│   │   │   ├── connections.ts
│   │   │   ├── sftp.ts
│   │   │   └── proxy.ts
│   │   └── styles/
│   │       ├── globals.css       # SPECTRE theme variables
│   │       ├── animations.css    # Keyframe animations
│   │       └── terminal.css      # xterm.js overrides
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.ts
├── build/
│   ├── Makefile                  # Build commands
│   └── goreleaser.yaml           # Multi-platform release
├── scripts/
│   ├── install.sh                # Linux/macOS installer
│   └── install.ps1               # Windows PowerShell installer
├── docs/
│   ├── SPECTRE-PLAN.md           # File ini
│   ├── API.md                    # REST + WebSocket API docs
│   ├── SKILLS.md                 # Skill reference
│   └── THEME.md                  # Design system docs
└── README.md
```

---

## 4. Fitur Detail per Modul

### 4.1 Module: Connection Manager

**Fungsi:**
- Simpan SSH account (host, port, user, password/key)
- Organisir dalam folder/grup
- Quick connect dari dashboard
- Duplicate, edit, delete connection
- Import/Export config (JSON, YAML, `.spectre` format terenkripsi)
- Tag dan search/filter koneksi
- Connection health check (ping)
- Last connected timestamp

**Data Model:**
```json
{
  "id": "uuid",
  "name": "Production Web Server",
  "group_id": "uuid",
  "host": "192.168.1.100",
  "port": 22,
  "username": "ubuntu",
  "auth_type": "password|key|key+passphrase",
  "password": "AES256GCM_ENCRYPTED",
  "private_key_id": "uuid",
  "passphrase": "AES256GCM_ENCRYPTED",
  "jump_host_id": "uuid",
  "tags": ["production", "web"],
  "notes": "...",
  "keep_alive_interval": 30,
  "created_at": "...",
  "last_connected_at": "..."
}
```

**API Endpoints:**
```
GET    /api/connections          List all
POST   /api/connections          Create
GET    /api/connections/:id      Get one
PUT    /api/connections/:id      Update
DELETE /api/connections/:id      Delete
POST   /api/connections/:id/test Test connectivity
POST   /api/connections/import   Import config
GET    /api/connections/export   Export config
```

---

### 4.2 Module: Terminal

**Fungsi:**
- Multi-tab terminal per koneksi
- Split pane (horizontal/vertical)
- Terminal tiled/grid layout (max 4)
- Kirim command ke multiple terminal sekaligus (broadcast)
- Scroll buffer, search in output
- Snippet/command palette
- Copy-paste dengan keyboard shortcut
- Reconnect otomatis jika koneksi putus

**WebSocket Protocol:**
```
ws://localhost:57321/ws/terminal/:session_id

Client → Server:
{ "type": "input", "data": "ls -la\r" }
{ "type": "resize", "cols": 120, "rows": 40 }
{ "type": "ping" }

Server → Client:
{ "type": "output", "data": "BASE64_ENCODED_OUTPUT" }
{ "type": "connected", "session_id": "..." }
{ "type": "disconnected", "reason": "..." }
{ "type": "pong" }
```

---

### 4.3 Module: SFTP File Manager

**Fungsi:**
- Dual-pane explorer (lokal kiri, remote kanan)
- Navigate direktori remote
- Upload file: **drag & drop** dari browser
- Upload paralel: max 10 file simultaneous (configurable)
- Download file/folder (zip otomatis untuk folder)
- Progress bar per file + overall progress
- Resume upload (chunked transfer)
- Create folder, rename, delete, copy, move
- Permission viewer/editor (chmod)
- File preview (text, image, code)
- Symlink display

**Upload Queue Design:**
```
UploadQueue {
  maxConcurrent: 1-10 (default: 3)
  queue: [
    { id, localPath, remotePath, size, progress, status, speed }
  ]
  active: File[]        // Currently uploading (≤ maxConcurrent)
  pending: File[]       // Waiting
  completed: File[]     // Done
  failed: File[]        // Error (dapat di-retry)
}
```

**API Endpoints:**
```
GET    /api/sftp/:conn_id/list?path=/   List directory
POST   /api/sftp/:conn_id/upload        Upload file (multipart)
GET    /api/sftp/:conn_id/download?path= Download file
POST   /api/sftp/:conn_id/mkdir         Create directory
DELETE /api/sftp/:conn_id/delete        Delete file/dir
POST   /api/sftp/:conn_id/rename        Rename/move
GET    /api/sftp/:conn_id/stat?path=    File info/permissions
POST   /api/sftp/:conn_id/chmod         Change permissions
```

---

### 4.4 Module: Proxy & Tunnel Manager

**Fungsi:**

#### SOCKS5 Proxy
```
- Buat SOCKS5 proxy melalui SSH tunnel
- Bind ke port lokal (default: 1080)
- Multiple SOCKS5 proxy dari koneksi berbeda
- Status: running/stopped
- Connection count monitor
- Auto-restart jika terputus
```

#### Local Port Forward
```
Lokal:PORT → Remote:HOST:PORT via SSH
Contoh: localhost:3306 → db.internal:3306 via bastion
```

#### Remote Port Forward
```
Remote:PORT → Lokal:HOST:PORT via SSH  
Contoh: remote:8080 → localhost:3000 (expose local dev)
```

#### Dynamic Port Forward
```
SSH -D PORT (SOCKS5 over SSH)
Full application-level proxy
```

#### Tunnel Config Model:
```json
{
  "id": "uuid",
  "name": "DB Tunnel Dev",
  "connection_id": "uuid",
  "type": "local|remote|dynamic|socks5",
  "local_host": "127.0.0.1",
  "local_port": 3306,
  "remote_host": "db.internal",
  "remote_port": 3306,
  "auto_start": true,
  "status": "running|stopped|error"
}
```

---

### 4.5 Module: Key Manager

**Fungsi:**
- Generate SSH keypair (RSA 4096, Ed25519, ECDSA)
- Import existing key (PEM format)
- View public key (copy to clipboard)
- Download private/public key
- Attach key ke multiple connections
- Key passphrase (encrypted di database)
- Fingerprint display

---

### 4.6 Module: Config Import/Export

**Format yang Didukung:**
```
Export:
  .spectre    → Format native (JSON terenkripsi dengan master password)
  .json       → Plain JSON (tanpa password, untuk backup struktur)
  .yaml       → YAML format
  SSH Config  → ~/.ssh/config format (import saja)

Import:
  .spectre    → Native SPECTRE config
  .json/.yaml → SPECTRE format
  ~/.ssh/config → Parse SSH config standard
  Termius     → Import dari Termius export (jika ada)
  PuTTY       → Import dari PuTTY sessions (Windows registry export)
```

---

### 4.7 Module: Security & Vault

**Password Encryption:**
```
Master Password → PBKDF2 (100k iter, SHA-256) → 256-bit key
Stored passwords → AES-256-GCM encryption
Nonce per-entry → mencegah ciphertext comparison

Master password TIDAK disimpan di disk.
Hash disimpan untuk verifikasi.
Jika lupa master password → data tidak bisa di-decrypt (by design)
```

**Local Auth:**
```
Akses web UI dilindungi dengan:
- Token di localStorage (session token)  
- Token digenerate saat binary start
- Optional: PIN / password untuk buka UI
- Optional: bind ke 127.0.0.1 saja (default) 
```

---

## 5. Design System & Theme: SPECTRE

### 5.1 Visual Identity

```
Nama: S.P.E.C.T.R.E
Vibe: Ghost / Shadow Agent / Dark Ops
Aesthetic: Brutalist Minimalist + Full Animation
Base: Dark background, purple accent
Nuansa: Terminal green → diganti purple
Feel: "Hacker tool yang dibuat dengan presisi"
```

### 5.2 Color Palette

```css
:root {
  /* Background layers */
  --bg-void:      #030305;   /* Paling gelap — outer shell */
  --bg-deep:      #07070F;   /* Main app background */
  --bg-surface:   #0D0D1A;   /* Cards, panels */
  --bg-elevated:  #121224;   /* Modals, dropdowns */
  --bg-hover:     #1A1A2E;   /* Hover states */
  --bg-active:    #1E1E35;   /* Active/selected */

  /* Purple spectrum */
  --purple-dim:   #2D1B69;   /* Deep purple, subtle accent */
  --purple-mid:   #5B21B6;   /* Medium purple */
  --purple-core:  #7C3AED;   /* Primary accent */
  --purple-bright:#A78BFA;   /* Bright accent, text */
  --purple-glow:  #C4B5FD;   /* Glow, highlights */

  /* Utility colors */
  --green-term:   #39FF14;   /* Terminal green (sparingly) */
  --cyan-data:    #00FFFF;   /* Data/IP addresses */
  --red-alert:    #FF2D55;   /* Error, disconnect */
  --amber-warn:   #FFB700;   /* Warning */
  --blue-info:    #3B82F6;   /* Info */

  /* Text */
  --text-primary:   #E2E8F0;
  --text-secondary: #94A3B8;
  --text-muted:     #4A5568;
  --text-accent:    var(--purple-bright);

  /* Borders */
  --border-default: rgba(124, 58, 237, 0.15);
  --border-hover:   rgba(124, 58, 237, 0.35);
  --border-active:  rgba(124, 58, 237, 0.6);
  --border-glow:    rgba(167, 139, 250, 0.4);
}
```

### 5.3 Typography

```css
/* Primary: Monospace feel, technical */
--font-primary: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;

/* Display: Logo, headings */
--font-display: 'Space Grotesk', 'DM Mono', sans-serif;

/* Body: Readable text */
--font-body: 'Inter', system-ui, sans-serif;

/* Sizing */
--text-xs:  11px;
--text-sm:  13px;
--text-md:  15px;
--text-lg:  18px;
--text-xl:  24px;
--text-2xl: 32px;
```

### 5.4 Animation Catalog

```css
/* 1. Scanline effect — background overlay */
@keyframes scanlines {
  0%   { background-position: 0 0; }
  100% { background-position: 0 4px; }
}

/* 2. Terminal cursor blink */
@keyframes cursor-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

/* 3. Glitch text effect */
@keyframes glitch {
  0%   { clip-path: inset(40% 0 61% 0); transform: translate(-2px, 0); }
  20%  { clip-path: inset(92% 0 1% 0);  transform: translate(2px, 0); }
  40%  { clip-path: inset(43% 0 1% 0);  transform: translate(0, 0); }
  60%  { clip-path: inset(25% 0 58% 0); transform: translate(1px, 0); }
  80%  { clip-path: inset(54% 0 7% 0);  transform: translate(-1px, 0); }
  100% { clip-path: inset(58% 0 43% 0); transform: translate(2px, 0); }
}

/* 4. Purple pulse — active connections */
@keyframes pulse-purple {
  0%, 100% { box-shadow: 0 0 4px rgba(124, 58, 237, 0.4); }
  50%       { box-shadow: 0 0 20px rgba(124, 58, 237, 0.9), 0 0 40px rgba(124, 58, 237, 0.3); }
}

/* 5. Data stream — sidebar decoration */
@keyframes data-stream {
  0%   { transform: translateY(-100%); opacity: 0; }
  10%  { opacity: 0.6; }
  90%  { opacity: 0.6; }
  100% { transform: translateY(100vh); opacity: 0; }
}

/* 6. Connection established — success flash */
@keyframes connect-flash {
  0%   { background: rgba(124, 58, 237, 0); }
  30%  { background: rgba(124, 58, 237, 0.3); }
  100% { background: rgba(124, 58, 237, 0); }
}

/* 7. Upload progress — bar animation */
@keyframes upload-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* 8. Sidebar icon hover */
@keyframes icon-ping {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.15); }
  100% { transform: scale(1); }
}

/* 9. Modal entrance */
@keyframes modal-in {
  0%   { transform: translateY(-20px) scale(0.97); opacity: 0; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}

/* 10. Status indicator pulse */
@keyframes status-online {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(1.3); }
}
```

### 5.5 Component Aesthetics

```
Card         → sharp corners (radius: 2px), purple left-border accent (3px)
Button       → borderless atau thin 1px border, uppercase mono font
Input        → bottom-border only, dark background, purple focus
Modal        → dark overlay, card modal dengan scanline background
Scrollbar    → thin (4px), purple thumb
Table rows   → alternate bg, hover highlight purple dim
Badge/Tag    → mono font, outlined, purple atau color-coded
```

---

## 6. Menu Struktur (Navigation)

```
SPECTRE
│
├── [⌘] Dashboard
│       Quick stats, active connections, recent, quick connect
│
├── [⊞] Connections
│       List semua SSH accounts
│       ├── Groups/Folders
│       ├── Add / Edit / Delete
│       ├── Import / Export
│       └── Test Connection
│
├── [>_] Terminal
│       Multi-tab SSH terminal
│       ├── Open tabs (per koneksi)
│       ├── Split pane
│       ├── Broadcast input
│       └── Snippets/Commands
│
├── [📁] File Manager
│       SFTP dual-pane explorer
│       ├── Remote file tree
│       ├── Upload (drag & drop)
│       ├── Download
│       ├── Upload Queue (parallel)
│       └── Permissions
│
├── [⟳] Proxy & Tunnels
│       ├── SOCKS5 Proxies
│       ├── Local Port Forwards
│       ├── Remote Port Forwards
│       └── Dynamic Tunnels
│
├── [🔑] Key Manager
│       SSH keypair management
│       ├── Generate Key
│       ├── Import Key
│       └── Assigned Connections
│
└── [⚙] Settings
        ├── General (port, startup, theme)
        ├── Security (master password, session)
        ├── Upload (max concurrent, chunk size)
        ├── Terminal (font, colors, scrollback)
        └── About / Update check
```

---

## 7. API Reference Lengkap

### 7.1 REST API Base: `http://localhost:57321/api`

```yaml
# Authentication
headers:
  X-SPECTRE-Token: <session_token>

# Connections
GET    /connections
POST   /connections
GET    /connections/:id
PUT    /connections/:id  
DELETE /connections/:id
POST   /connections/:id/connect
POST   /connections/:id/disconnect
GET    /connections/:id/status
POST   /connections/import
GET    /connections/export?format=spectre|json|yaml

# Groups
GET    /groups
POST   /groups
PUT    /groups/:id
DELETE /groups/:id

# SSH Sessions
GET    /sessions              # Active sessions
DELETE /sessions/:id          # Kill session

# SFTP
GET    /sftp/:conn_id/list?path=/home
GET    /sftp/:conn_id/stat?path=/home/user
POST   /sftp/:conn_id/upload  # multipart/form-data
GET    /sftp/:conn_id/download?path=/home/file.txt
POST   /sftp/:conn_id/mkdir   # { path }
DELETE /sftp/:conn_id/delete  # { path }
POST   /sftp/:conn_id/rename  # { from, to }
POST   /sftp/:conn_id/chmod   # { path, mode }
POST   /sftp/:conn_id/zip     # { paths[], output }

# Proxy & Tunnels
GET    /tunnels
POST   /tunnels
PUT    /tunnels/:id
DELETE /tunnels/:id
POST   /tunnels/:id/start
POST   /tunnels/:id/stop
GET    /tunnels/:id/stats

# Keys
GET    /keys
POST   /keys/generate         # { type: rsa|ed25519|ecdsa, bits, passphrase }
POST   /keys/import           # multipart PEM
GET    /keys/:id/public       # Download public key
DELETE /keys/:id

# Settings
GET    /settings
PUT    /settings

# System
GET    /system/status
GET    /system/version
POST   /system/shutdown
```

### 7.2 WebSocket API

```
ws://localhost:57321/ws/terminal/:session_id   # Terminal I/O
ws://localhost:57321/ws/sftp/:conn_id          # SFTP progress events
ws://localhost:57321/ws/tunnels                 # Tunnel status events
ws://localhost:57321/ws/system                  # System events (conn/disconn)
```

---

## 8. Build & Distribution

### 8.1 Development

```bash
# Prerequisites: Go 1.22+, Node.js 20+

# Clone & setup
git clone https://github.com/yourname/spectre
cd spectre

# Frontend dev server
cd web && pnpm install && pnpm dev     # Vite dev server :5173

# Backend (dengan hot reload)
go install github.com/cosmtrek/air@latest
air   # watches *.go files

# Full dev mode: backend serves pada :57321
# Frontend proxy ke :57321 via vite.config.ts
```

### 8.2 Production Build

```bash
# Build frontend
cd web && pnpm build       # output: web/dist/

# Build binary (embed frontend)
go build -o spectre ./cmd/spectre/

# atau via Makefile:
make build-all       # semua platform
make build-linux
make build-windows
make build-macos
```

### 8.3 Cross-Platform Release (GoReleaser)

```yaml
# goreleaser.yaml
builds:
  - main: ./cmd/spectre
    goos: [linux, windows, darwin]
    goarch: [amd64, arm64]
    binary: spectre
    ldflags:
      - -s -w
      - -X main.Version={{.Version}}
      - -X main.BuildDate={{.Date}}

archives:
  - format: tar.gz
    format_overrides:
      - goos: windows
        format: zip

# Output:
# spectre_linux_amd64.tar.gz
# spectre_linux_arm64.tar.gz  
# spectre_darwin_amd64.tar.gz
# spectre_darwin_arm64.tar.gz (Apple Silicon)
# spectre_windows_amd64.zip
```

### 8.4 Installer

```bash
# Linux: Install script
curl -fsSL https://spectre.sh/install.sh | bash

# macOS: Homebrew tap
brew install yourname/tap/spectre

# Windows: 
# - NSIS installer (.exe)
# - WinGet manifest
# - atau Scoop bucket

# Docker (optional):
docker run -d -p 57321:57321 -v ~/.spectre:/data yourname/spectre
```

### 8.5 Single Binary Execution

```bash
# Jalankan langsung tanpa install
./spectre                    # Start di foreground, buka browser
./spectre --daemon           # Background daemon
./spectre --port 8080        # Custom port
./spectre --no-browser       # Jangan auto-open browser
./spectre --bind 0.0.0.0     # Bind ke semua interface (hati-hati!)
./spectre --config ~/.spectre/config.db  # Custom config path
```

---

## 9. Security Considerations

```
1. LOCAL ONLY by default
   - Default bind: 127.0.0.1 (lokal only)
   - Perlu flag eksplisit --bind 0.0.0.0 untuk expose ke network

2. Session Token
   - Random 256-bit token digenerate tiap start
   - Disimpan di file lokal: ~/.spectre/session.token
   - Browser menyimpan di localStorage
   - Token expire setelah idle (configurable)

3. Password Encryption
   - Semua password SSH dienkripsi dengan AES-256-GCM
   - Key derivasi dari master password user
   - Master password tidak pernah disimpan di disk

4. Private Key Storage
   - Private key dienkripsi sebelum disimpan di SQLite
   - Optional: tidak simpan key, minta path file saja

5. TLS Support (optional)
   - Self-signed cert untuk HTTPS lokal
   - Atau custom cert untuk deployment di server

6. Audit Log
   - Semua koneksi dicatat (waktu, user, host)
   - Command history optional (privacy setting)
```

---

## 10. Roadmap Pengembangan

### Phase 1 — Core (MVP)
```
✓ Binary packaging (Go)
✓ React frontend dengan SPECTRE theme
✓ Connection manager (CRUD + SQLite)
✓ SSH terminal (xterm.js + WebSocket)
✓ Basic SFTP (browse, upload, download)
✓ Master password + encryption
```

### Phase 2 — Power Features
```
✓ Parallel upload (max 10)
✓ Drag & drop upload
✓ SOCKS5 proxy
✓ Local/Remote port forward
✓ Import/Export config
✓ SSH key manager
✓ Connection groups
```

### Phase 3 — Advanced
```
✓ Split terminal panes
✓ Broadcast commands
✓ Jump host / bastion support
✓ Session persistence (reconnect)
✓ Snippet manager
✓ Theme customizer
✓ Plugin system (?)
```

### Phase 4 — Distribution
```
✓ Signed binaries
✓ Auto-update
✓ Windows Service / macOS launchd / systemd
✓ Docker image
✓ Homebrew / WinGet / APT repository
```

---

## 11. Dependencies Lengkap

### Backend (Go)
```go
require (
    // SSH & SFTP
    golang.org/x/crypto v0.x          // SSH client
    github.com/pkg/sftp v1.x           // SFTP client

    // Web server
    github.com/go-chi/chi/v5 v5.x     // HTTP router
    github.com/gorilla/websocket v1.x  // WebSocket

    // Database
    gorm.io/gorm v1.x                  // ORM
    gorm.io/driver/sqlite v1.x         // SQLite driver

    // Crypto
    golang.org/x/crypto v0.x           // AES, PBKDF2

    // Utilities
    github.com/google/uuid v1.x        // UUID generation
    github.com/spf13/cobra v1.x        // CLI flags
    github.com/spf13/viper v1.x        // Config management
)
```

### Frontend (Node.js)
```json
{
  "dependencies": {
    "react": "^18.x",
    "react-dom": "^18.x",
    "react-router-dom": "^6.x",
    "@xterm/xterm": "^5.x",
    "@xterm/addon-fit": "^0.x",
    "@xterm/addon-web-links": "^0.x",
    "zustand": "^4.x",
    "axios": "^1.x",
    "framer-motion": "^11.x",
    "react-dropzone": "^14.x",
    "react-virtual": "^2.x",
    "lucide-react": "^0.x",
    "clsx": "^2.x",
    "tailwind-merge": "^2.x"
  },
  "devDependencies": {
    "vite": "^5.x",
    "@vitejs/plugin-react": "^4.x",
    "tailwindcss": "^4.x",
    "typescript": "^5.x"
  }
}
```

---

## 12. Kontribusi & Development Notes

### Code Style
```
Go:  gofmt + golangci-lint
TS:  ESLint + Prettier
Commit: Conventional Commits (feat/fix/docs/chore)
```

### Testing
```
Go:   go test ./... (unit + integration)
E2E:  Playwright (browser automation)
```

### Environment Variables
```bash
SPECTRE_PORT=57321         # HTTP port
SPECTRE_BIND=127.0.0.1    # Bind address
SPECTRE_CONFIG=~/.spectre  # Config directory
SPECTRE_LOG_LEVEL=info     # Logging level
SPECTRE_NO_BROWSER=false   # Auto-open browser
SPECTRE_DEV=false          # Development mode
```

---

*Document version: 1.0.0 | Last updated: 2026*
*"The best tool is the one you trust with your secrets."*
