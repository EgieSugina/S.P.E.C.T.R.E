# SPECTRE Module Specifications

## Connections

**Features:** CRUD SSH accounts, groups/folders, quick connect, import/export (JSON, YAML, `.spectre`), tags, search, health check, last-connected timestamp.

**Data model:**
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

**Endpoints:** `GET/POST /connections`, `GET/PUT/DELETE /connections/:id`, `POST /connections/:id/test`, `POST /connections/import`, `GET /connections/export`

---

## Terminal

**Features:** Multi-tab per connection, split pane (H/V), grid layout (max 4), broadcast input, scroll buffer, search, snippets, copy-paste, auto-reconnect.

**WebSocket:** `ws://localhost:57321/ws/terminal/:session_id`

```json
// Client → Server
{ "type": "input", "data": "ls -la\r" }
{ "type": "resize", "cols": 120, "rows": 40 }
{ "type": "ping" }

// Server → Client
{ "type": "output", "data": "BASE64_ENCODED_OUTPUT" }
{ "type": "buffer", "data": "BASE64_CATCH_UP_ON_RECONNECT" }
{ "type": "connected", "session_id": "...", "info": {} }
{ "type": "disconnected", "reason": "..." }
{ "type": "pong" }
```

---

## SFTP

**Features:** Dual-pane (local left, remote right), drag-drop upload, parallel upload (1-10, default 3), download/zip folders, progress bars, resume (chunked), mkdir/rename/delete/copy/move, chmod, preview, symlink display.

**Upload queue:**
```
UploadQueue {
  maxConcurrent: 1-10 (default: 3)
  queue: [{ id, localPath, remotePath, size, progress, status, speed }]
  active: File[]      // ≤ maxConcurrent
  pending: File[]
  completed: File[]
  failed: File[]      // retryable
}
```

**Endpoints:** `GET /sftp/:conn_id/list`, `POST /upload`, `GET /download`, `POST /mkdir`, `DELETE /delete`, `POST /rename`, `GET /stat`, `POST /chmod`, `POST /zip`

---

## Proxy

**Types:**

| Type | Description |
|------|-------------|
| SOCKS5 | SSH tunnel, bind local port (default 1080) |
| Local forward | `localhost:PORT → remote:HOST:PORT` via SSH |
| Remote forward | `remote:PORT → local:HOST:PORT` via SSH |
| Dynamic | SSH `-D` (SOCKS5 over SSH) |

**Tunnel model:**
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

## Keys

- Generate: RSA 4096, Ed25519, ECDSA
- Import PEM, view/copy public key, download keys
- Attach to multiple connections
- Passphrase encrypted in DB, fingerprint display

---

## Vault

```
Master Password → PBKDF2 (100k iter, SHA-256) → 256-bit key
Stored passwords → AES-256-GCM (nonce per entry)
Master password NOT stored on disk; hash only for verification
Forgotten master password → data unrecoverable (by design)
```

**Local auth:** 256-bit session token on binary start, stored in `~/.spectre/session.token` + browser localStorage. Optional PIN/password for UI.

---

## Config Import/Export

| Format | Direction |
|--------|-----------|
| `.spectre` | Export/import (encrypted JSON) |
| `.json` / `.yaml` | Export/import (structure only, no passwords) |
| `~/.ssh/config` | Import only |
| Termius export | Import (if available) |
| PuTTY sessions | Import (Windows registry export) |
