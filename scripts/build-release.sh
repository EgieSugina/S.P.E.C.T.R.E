#!/usr/bin/env bash
# Build a single SPECTRE binary with embedded frontend assets.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="${VERSION:-dev}"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
OUTPUT="${OUTPUT:-spectre}"
GOOS="${GOOS:-$(go env GOOS)}"
GOARCH="${GOARCH:-$(go env GOARCH)}"

LDFLAGS="-s -w"
LDFLAGS+=" -X spectre/internal/version.Version=${VERSION}"
LDFLAGS+=" -X spectre/internal/version.BuildDate=${BUILD_DATE}"
LDFLAGS+=" -X spectre/internal/version.Commit=${COMMIT}"

echo "[SPECTRE] Building frontend..."
(cd web && pnpm install --frozen-lockfile && pnpm build)

echo "[SPECTRE] Embedding dist → internal/server/dist"
rm -rf internal/server/dist
cp -r web/dist internal/server/dist

echo "[SPECTRE] Compiling ${OUTPUT} (${GOOS}/${GOARCH})..."
CGO_ENABLED=1 GOOS="$GOOS" GOARCH="$GOARCH" \
  go build -ldflags="$LDFLAGS" -o "$OUTPUT" ./cmd/spectre/

echo "[SPECTRE] Done: ${ROOT}/${OUTPUT}"
