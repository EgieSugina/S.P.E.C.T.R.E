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
  "keep_alive_interval": 30,
  "proxy_tunnel_id": "optional-tunnel-uuid",
  "proxy_type": "socks5",
  "proxy_host": "127.0.0.1",
  "proxy_port": 1080
}
```

**Proxy fields (optional):** SSH connections can route through a SOCKS5 proxy.

| Field | Description |
|---|---|
| `proxy_tunnel_id` | Reference a running SPECTRE SOCKS5/dynamic tunnel (preferred) |
| `proxy_host` / `proxy_port` | External SOCKS5 endpoint when not using a tunnel |
| `proxy_type` | `socks5` (default for manual proxy; only type supported for SSH dial today) |

Use either `proxy_tunnel_id` **or** `proxy_host`+`proxy_port`, not both. The referenced tunnel must be **running** before connect. Terminal and SFTP reuse the same SSH dial path.

Connect errors involving the proxy return code `PROXY_FAILED`.

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

### Route Trace

Traceroute-style hop chain from SPECTRE (or via an active SSH session). Requires `traceroute` or `tracepath` on the host running the trace; falls back to a single-hop TCP probe if neither is installed.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/trace` | `?host=example.com` — trace from local SPECTRE host |
| POST | `/connections/:id/trace` | Trace to connection host (or override below) |

**Connection Trace Body (optional):**
```json
{ "host": "10.0.0.50" }
```

**Response:**
```json
{
  "target": "example.com",
  "resolved_ip": "93.184.216.34",
  "hops": [
    { "hop": 0, "host": "localhost", "status": "local" },
    { "hop": 1, "host": "192.168.1.1", "ip": "192.168.1.1", "rtt_ms": 0.45, "status": "alive" },
    { "hop": 2, "host": "*", "status": "timeout" }
  ],
  "via": "local",
  "tool": "traceroute",
  "duration_ms": 1234,
  "error": "optional warning when using fallback"
}
```

Hop `status` values: `local`, `gateway`, `alive`, `timeout`, `target`. When SSH is connected, trace runs on the remote host and prepends a gateway hop for the SSH endpoint.

---

### Groups

| Method | Endpoint | Description |
|---|---|---|
| GET | `/groups` | List connection groups |
| POST | `/groups` | Create group |
| PUT | `/groups/:id` | Update group |
| DELETE | `/groups/:id` | Delete group (connections become ungrouped) |

**Create Group Body:**
```json
{
  "name": "Production",
  "color": "#7c3aed",
  "sort_order": 0
}
```

---

### Known Hosts

| Method | Endpoint | Description |
|---|---|---|
| GET | `/known-hosts` | List trusted host keys |
| POST | `/known-hosts/trust` | Trust a host key (after mismatch prompt) |
| DELETE | `/known-hosts/:id` | Remove trusted host |

**Trust Host Key Body:**
```json
{
  "host": "10.0.0.1",
  "port": 22,
  "key_type": "ssh-ed25519",
  "fingerprint": "SHA256:…",
  "key_data": "<base64-marshaled-key>"
}
```

Connect errors with code `HOST_KEY_MISMATCH` include `expected_fingerprint`, `received_fingerprint`, and `received_key` in the response body.

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

### Tunnel Events

```
ws://localhost:57321/ws/tunnels
```

Dedicated tunnel channel for status and live stats. On connect, server sends a `tunnel_snapshot`. Running tunnels emit `tunnel_stats` every ~2.5s.

```json
{ "type": "tunnel_snapshot", "tunnels": [{ "id": "uuid", "status": "running", "local_port": 1080, ... }] }
{ "type": "tunnel_started",  "tunnel_id": "uuid", "port": 1080, "status": "running" }
{ "type": "tunnel_stopped",  "tunnel_id": "uuid", "status": "stopped" }
{ "type": "tunnel_error",    "tunnel_id": "uuid", "status": "error", "error": "local port already in use" }
{ "type": "tunnel_stats",    "tunnel_id": "uuid", "stats": { "active_connections": 2, "total_connections": 5, "bind_addr": "127.0.0.1:1080" } }
```

`tunnel_started` / `tunnel_stopped` are also mirrored on `/ws/system`.

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

**Phase 3 push notifications** (broadcast commands, jump host — REST endpoints unchanged):

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

**Error Codes:**
- `AUTH_FAILED` — SSH authentication failed
- `HOST_UNREACHABLE` — Cannot connect to host
- `PROXY_FAILED` — SOCKS5/proxy dial failed (SSH-over-proxy)
- `TIMEOUT` — SSH dial timed out
- `CONNECTION_LOST` — Active SSH session dropped (SFTP/terminal)
- `SFTP_PERMISSION` — SFTP permission denied
- `TUNNEL_PORT_BUSY` — Local port already in use
- `VAULT_LOCKED` — Master password required
- `INVALID_INPUT` — Request validation failed
- `NOT_FOUND` — Resource not found

---

*SPECTRE API Docs v1.0*
