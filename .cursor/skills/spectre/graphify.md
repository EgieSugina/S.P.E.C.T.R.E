# SPECTRE + graphify

graphify turns the SPECTRE codebase into a **queryable knowledge graph** — entities, call chains, imports, and cross-module relationships extracted from Go and TypeScript sources plus project docs. Use it instead of blind grep when exploring unfamiliar code or tracing data flow.

## What SPECTRE Gets

| Output | Path | Use |
|--------|------|-----|
| Interactive graph | `graphify-out/graph.html` | Browse communities, zoom nodes, spot cross-module bridges |
| Audit report | `graphify-out/GRAPH_REPORT.md` | God nodes, surprising connections, suggested questions |
| Graph data | `graphify-out/graph.json` | CLI queries, MCP, incremental `--update` |

The project already has a built graph at the repo root. Agents should **query first**, not rebuild, unless the graph is missing or stale after large changes.

## Fast Path (Required)

Before manual `grep`, semantic search, or file-by-file reads:

1. Check that `graphify-out/graph.json` exists at the SPECTRE repo root.
2. If it exists and the task is a codebase question ("how does X work?", "what calls Y?", "trace flow from A to B"), run **`graphify query "<question>"`** immediately.
3. Only fall back to direct file reads when the query returns insufficient vocabulary or edges.

Do **not** re-run full extraction when `graph.json` is present unless the user explicitly asks to rebuild.

## Example Queries (SPECTRE)

Broad context (BFS, default):

```bash
graphify query "How does SSH session persistence work?"
graphify query "SFTP parallel upload flow"
graphify query "vault encryption and master password"
graphify query "WebSocket terminal bridge"
graphify query "SOCKS5 proxy and port forward"
graphify query "Go embed React dist single binary"
```

Trace a specific chain (DFS):

```bash
graphify query "terminal WebSocket flow" --dfs
graphify query "connection connect to SSH session" --dfs
graphify query "upload queue to SFTP backend" --dfs
```

Shortest path between concepts:

```bash
graphify path "ConnectionManager" "Vault"
graphify path "TerminalPane" "TerminalSession"
graphify path "useWebSocket" "manager"
```

Explain one node:

```bash
graphify explain "TerminalSession"
graphify explain "vault"
graphify explain "embed"
```

Cap answer length when needed: `graphify query "..." --budget 1500`

## Monorepo Layout

SPECTRE is a Go + React monorepo. Default: query the **whole-project** graph at repo root (`graphify-out/graph.json`).

For targeted rebuilds (not routine queries), extract subfolders separately then merge — running the full skill pipeline on each subfolder from root would clobber the same `graphify-out/`:

```bash
graphify extract ./internal/    # → internal/graphify-out/graph.json
graphify extract ./web/         # → web/graphify-out/graph.json
graphify merge-graphs \
  ./internal/graphify-out/graph.json \
  ./web/graphify-out/graph.json \
  --out graphify-out/graph.json
```

| Scope | When |
|-------|------|
| Repo root (default) | Most questions — backend ↔ frontend bridges |
| `internal/` only | Deep Go-only work (SSH, SFTP, proxy, vault, store) |
| `web/` only | React components, hooks, Zustand, xterm.js |

After merge, the fast path applies to the merged `graphify-out/graph.json`.

## Keeping the Graph Current

| Trigger | Command |
|---------|---------|
| After implementing a feature | `graphify --update` (incremental; code-only changes skip LLM) |
| After `git commit` (optional) | `graphify hook install` — AST rebuild on committed code files |
| Active dev session (optional) | `graphify --watch` — auto-rebuild on file changes (code = instant; docs need `--update`) |
| Persistent agent integration | `graphify claude install` — writes graphify instructions into project `CLAUDE.md` |

Run `--update` from the SPECTRE repo root after adding routes, handlers, stores, or cross-package wiring so new nodes and edges appear in queries.

## Query Tips for This Codebase

- **Backend entry**: Chi router in `internal/server/`, handlers fan out to `internal/ssh`, `internal/sftp`, `internal/proxy`, `internal/crypto`.
- **Persistence story**: `ConnectionManager` / session goroutines in `internal/ssh/` — query "session persistence" before reading `manager.go` cold.
- **Real-time paths**: WebSocket routes (`/ws/terminal`, `/ws/sftp`) bridge to the same managers REST uses.
- **Frontend**: `web/src/hooks/useWebSocket.ts`, `useTerminal.ts`, `useUploadQueue.ts` connect to backend events.
- **Security**: `internal/crypto/vault.go` and `X-SPECTRE-Token` middleware — use `path` to connect API handlers to vault.

If a query returns no hits, expand against graph vocabulary (see full graphify skill) or grep for exact symbol names, then retry with graph labels.

## Full graphify Reference

Install, extraction pipeline, MCP server, Neo4j export, and query expansion rules:

`~/.claude/skills/graphify/SKILL.md`
