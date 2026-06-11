# SPECTRE API Reference

Base URL: `http://localhost:57321/api`

All requests require: `X-SPECTRE-Token: <token>`

Token generated on binary start → `~/.spectre/session.token` + browser localStorage.

---

## Connections

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/connections` | List all |
| POST | `/connections` | Create |
| GET | `/connections/:id` | Get one |
| PUT | `/connections/:id` | Update |
| DELETE | `/connections/:id` | Delete |
| POST | `/connections/:id/connect` | Initiate SSH |
| POST | `/connections/:id/disconnect` | Close connection |
| GET | `/connections/:id/status` | Health check |
| POST | `/connections/import` | Bulk import |
| GET | `/connections/export` | Export (`?format=spectre\|json\|yaml`) |

**Create body:**
```json
{
  "name": "Prod Server",
  "host": "10.0.0.1",
  "port": 22,
  "username": "admin",
  "auth_type": "password",
  "password": "secret",
  "group_id": "optional-uuid",
  "tags": ["prod"],
  "notes": "",
  "keep_alive_interval": 30
}
```

---

## Groups

| Method | Endpoint |
|--------|----------|
| GET | `/groups` |
| POST | `/groups` |
| PUT | `/groups/:id` |
| DELETE | `/groups/:id` |

---

## Sessions (Active SSH)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sessions` | List active |
| GET | `/sessions/:id` | Session detail |
| DELETE | `/sessions/:id` | Kill session |
| POST | `/sessions/:id/reconnect` | Force reconnect |

---

## SFTP

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sftp/:conn_id/list` | `?path=/` list directory |
| GET | `/sftp/:conn_id/stat` | `?path=/file` file info |
| POST | `/sftp/:conn_id/upload` | Multipart upload |
| GET | `/sftp/:conn_id/download` | `?path=/file` download |
| POST | `/sftp/:conn_id/mkdir` | `{ "path": "/new/dir" }` |
| DELETE | `/sftp/:conn_id/delete` | `{ "path": "/file" }` |
| POST | `/sftp/:conn_id/rename` | `{ "from": "/a", "to": "/b" }` |
| POST | `/sftp/:conn_id/chmod` | `{ "path": "/f", "mode": "0644" }` |
| POST | `/sftp/:conn_id/zip` | `{ "paths": [...], "output": "/archive.zip" }` |

---

## Tunnels & Proxy

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tunnels` | List all |
| POST | `/tunnels` | Create config |
| PUT | `/tunnels/:id` | Update |
| DELETE | `/tunnels/:id` | Delete |
| POST | `/tunnels/:id/start` | Start tunnel |
| POST | `/tunnels/:id/stop` | Stop tunnel |
| GET | `/tunnels/:id/stats` | Live connection count |

**Tunnel types:** `local`, `remote`, `dynamic`, `socks5`

---

## Keys

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/keys` | List keys |
| POST | `/keys/generate` | Generate keypair |
| POST | `/keys/import` | Import PEM |
| GET | `/keys/:id/public` | Download `.pub` |
| DELETE | `/keys/:id` | Remove |

**Generate body:**
```json
{
  "name": "my-ed25519-key",
  "type": "ed25519",
  "passphrase": "optional"
}
```

---

## Settings & System

| Method | Endpoint |
|--------|----------|
| GET | `/settings` |
| PUT | `/settings` |
| GET | `/system/status` |
| GET | `/system/version` |
| POST | `/system/shutdown` |

---

## WebSocket: Terminal

`ws://localhost:57321/ws/terminal/:session_id`

**Client → Server:**
```json
{ "type": "input",  "data": "ls -la\r" }
{ "type": "resize", "cols": 220, "rows": 50 }
{ "type": "ping" }
```

**Server → Client:**
```json
{ "type": "output",       "data": "<base64>" }
{ "type": "buffer",       "data": "<base64 catch-up on reconnect>" }
{ "type": "connected",    "session_id": "uuid", "info": {} }
{ "type": "disconnected", "reason": "timeout" }
{ "type": "pong" }
```

---

## WebSocket: SFTP Progress

`ws://localhost:57321/ws/sftp/:conn_id`

```json
{ "type": "upload_progress",   "job_id": "uuid", "progress": 1048576, "size": 5242880, "speed": 524288, "status": "uploading" }
{ "type": "upload_done",       "job_id": "uuid" }
{ "type": "upload_error",      "job_id": "uuid", "error": "permission denied" }
{ "type": "download_progress", "path": "/file.zip", "progress": 2097152, "size": 10485760 }
```

---

## WebSocket: Tunnels

`ws://localhost:57321/ws/tunnels` — tunnel status and live stats (auth via `?token=`)

```json
{ "type": "tunnel_snapshot", "tunnels": [{ "id": "uuid", "status": "running", ... }] }
{ "type": "tunnel_started",  "tunnel_id": "uuid", "port": 1080, "status": "running" }
{ "type": "tunnel_stopped",  "tunnel_id": "uuid", "status": "stopped" }
{ "type": "tunnel_error",    "tunnel_id": "uuid", "status": "error", "error": "port busy" }
{ "type": "tunnel_stats",    "tunnel_id": "uuid", "stats": { "active_connections": 2, "total_connections": 5, "bind_addr": "127.0.0.1:1080" } }
```

Stats events are pushed every ~2.5s while tunnels are running. Lifecycle events also appear on `/ws/system`.

---

## WebSocket: System Events

`ws://localhost:57321/ws/system`

```json
{ "type": "connection_up",     "connection_id": "uuid", "name": "Prod" }
{ "type": "connection_down",   "connection_id": "uuid", "reason": "timeout" }
{ "type": "tunnel_started",    "tunnel_id": "uuid", "port": 1080 }
{ "type": "tunnel_stopped",    "tunnel_id": "uuid" }
{ "type": "session_created",   "session_id": "uuid" }
{ "type": "session_destroyed", "session_id": "uuid" }
```

**Phase 3 (push notifications; REST unchanged):**

```json
{ "type": "broadcast_started",   "batch_id": "uuid", "session_ids": ["..."], "command": "uptime" }
{ "type": "broadcast_completed", "batch_id": "uuid", "session_ids": ["..."], "succeeded": 3, "failed": 0 }
{ "type": "broadcast_failed",    "batch_id": "uuid", "session_id": "uuid", "error": "session closed" }
{ "type": "jump_connecting",     "connection_id": "uuid", "jump_host_id": "uuid", "target_host": "10.0.0.5" }
{ "type": "jump_connected",      "connection_id": "uuid", "jump_host_id": "uuid", "hop_count": 2 }
{ "type": "jump_failed",         "connection_id": "uuid", "jump_host_id": "uuid", "reason": "auth failed" }
```

---

## Error Response Format

```json
{
  "error": true,
  "code": "AUTH_FAILED",
  "message": "Invalid credentials for host 10.0.0.1",
  "detail": "ssh: handshake failed: ssh: unable to authenticate"
}
```

**Error codes:**

| Code | Meaning |
|------|---------|
| `AUTH_FAILED` | SSH authentication failed |
| `HOST_UNREACHABLE` | Cannot connect to host |
| `SFTP_PERMISSION` | SFTP permission denied |
| `TUNNEL_PORT_BUSY` | Local port already in use |
| `VAULT_LOCKED` | Master password required |
| `INVALID_INPUT` | Request validation failed |
| `NOT_FOUND` | Resource not found |
