# SPECTRE — API & WebSocket Documentation

## REST API

Base URL: `http://localhost:57321/api`

All requests require header: `X-SPECTRE-Token: <token>`

---

### Connections

| Method | Endpoint | Description |
|---|---|---|
| GET | `/connections` | List all connections |
| POST | `/connections` | Create connection |
| GET | `/connections/:id` | Get single connection |
| PUT | `/connections/:id` | Update connection |
| DELETE | `/connections/:id` | Delete connection |
| POST | `/connections/:id/connect` | Initiate SSH connection |
| POST | `/connections/:id/disconnect` | Close connection |
| GET | `/connections/:id/status` | Connection health |
| POST | `/connections/import` | Bulk import |
| GET | `/connections/export` | Export (`?format=spectre\|json\|yaml`) |

**Create Connection Body:**
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

### Sessions (Active SSH)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/sessions` | List active sessions |
| GET | `/sessions/:id` | Session detail |
| DELETE | `/sessions/:id` | Kill session |
| POST | `/sessions/:id/reconnect` | Force reconnect |

---

### SFTP

| Method | Endpoint | Description |
|---|---|---|
| GET | `/sftp/:conn_id/list` | `?path=/` list directory |
| GET | `/sftp/:conn_id/stat` | `?path=/file` file info |
| POST | `/sftp/:conn_id/upload` | Multipart file upload |
| GET | `/sftp/:conn_id/download` | `?path=/file` download |
| POST | `/sftp/:conn_id/mkdir` | `{ "path": "/new/dir" }` |
| DELETE | `/sftp/:conn_id/delete` | `{ "path": "/file" }` |
| POST | `/sftp/:conn_id/rename` | `{ "from": "/a", "to": "/b" }` |
| POST | `/sftp/:conn_id/chmod` | `{ "path": "/f", "mode": "0644" }` |
| POST | `/sftp/:conn_id/zip` | `{ "paths": [...], "output": "/archive.zip" }` |

---

### Tunnels & Proxy

| Method | Endpoint | Description |
|---|---|---|
| GET | `/tunnels` | List all tunnels |
| POST | `/tunnels` | Create tunnel config |
| PUT | `/tunnels/:id` | Update config |
| DELETE | `/tunnels/:id` | Delete config |
| POST | `/tunnels/:id/start` | Start tunnel |
| POST | `/tunnels/:id/stop` | Stop tunnel |
| GET | `/tunnels/:id/stats` | Live connection count |

**Tunnel Types:**
- `local` — Local port forward
- `remote` — Remote port forward
- `dynamic` — SSH -D (SOCKS5 via SSH)
- `socks5` — Standalone SOCKS5 listener

---

### Keys

| Method | Endpoint | Description |
|---|---|---|
| GET | `/keys` | List keys |
| POST | `/keys/generate` | Generate new keypair |
| POST | `/keys/import` | Import PEM file |
| GET | `/keys/:id/public` | Download `.pub` file |
| DELETE | `/keys/:id` | Remove key |

**Generate Key Body:**
```json
{
  "name": "my-ed25519-key",
  "type": "ed25519",
  "passphrase": "optional"
}
```

---

## WebSocket API

### Terminal Stream

```
ws://localhost:57321/ws/terminal/:session_id
```

**Client → Server:**
```json
{ "type": "input",  "data": "ls -la\r" }
{ "type": "resize", "cols": 220, "rows": 50 }
{ "type": "ping" }
```

**Server → Client:**
```json
{ "type": "output",      "data": "<base64 encoded terminal output>" }
{ "type": "buffer",      "data": "<base64 catch-up buffer on reconnect>" }
{ "type": "connected",   "session_id": "uuid", "info": {...} }
{ "type": "disconnected","reason": "timeout" }
{ "type": "pong" }
```

---

### SFTP Progress Events

```
ws://localhost:57321/ws/sftp/:conn_id
```

```json
{ "type": "upload_progress", "job_id": "uuid", "progress": 1048576, "size": 5242880, "speed": 524288, "status": "uploading" }
{ "type": "upload_done",     "job_id": "uuid" }
{ "type": "upload_error",    "job_id": "uuid", "error": "permission denied" }
{ "type": "download_progress", "path": "/file.zip", "progress": 2097152, "size": 10485760 }
```

---

### System Events

```
ws://localhost:57321/ws/system
```

```json
{ "type": "connection_up",    "connection_id": "uuid", "name": "Prod" }
{ "type": "connection_down",  "connection_id": "uuid", "reason": "timeout" }
{ "type": "tunnel_started",   "tunnel_id": "uuid", "port": 1080 }
{ "type": "tunnel_stopped",   "tunnel_id": "uuid" }
{ "type": "session_created",  "session_id": "uuid" }
{ "type": "session_destroyed","session_id": "uuid" }
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

**Error Codes:**
- `AUTH_FAILED` — SSH authentication failed
- `HOST_UNREACHABLE` — Cannot connect to host
- `SFTP_PERMISSION` — SFTP permission denied
- `TUNNEL_PORT_BUSY` — Local port already in use
- `VAULT_LOCKED` — Master password required
- `INVALID_INPUT` — Request validation failed
- `NOT_FOUND` — Resource not found

---

*SPECTRE API Docs v1.0*
