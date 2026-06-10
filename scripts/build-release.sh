#!/usr/bin/env bash
# Build a single SPECTRE binary with embedded frontend assets.
# Cross-compilation uses Zig as CC/CXX (CGO + SQLite). macOS is not supported here.
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

zig_cc() {
  local os="$1" arch="$2"
  case "${os}/${arch}" in
    linux/amd64)   echo "zig cc -target x86_64-linux-gnu" ;;
    linux/arm64)   echo "zig cc -target aarch64-linux-gnu" ;;
    windows/amd64) echo "zig cc -target x86_64-windows-gnu" ;;
    *)             return 1 ;;
  esac
}

zig_cxx() {
  local os="$1" arch="$2"
  case "${os}/${arch}" in
    linux/amd64)   echo "zig c++ -target x86_64-linux-gnu" ;;
    linux/arm64)   echo "zig c++ -target aarch64-linux-gnu" ;;
    windows/amd64) echo "zig c++ -target x86_64-windows-gnu" ;;
    *)             return 1 ;;
  esac
}

setup_cgo() {
  local host_os host_arch
  host_os="$(go env GOHOSTOS)"
  host_arch="$(go env GOHOSTARCH)"

  if [[ "$GOOS" == "darwin" ]]; then
    echo "[SPECTRE] macOS release builds are not published; use linux or windows targets" >&2
    exit 1
  fi

  export CGO_ENABLED=1

  if [[ "$GOOS" != "$host_os" || "$GOARCH" != "$host_arch" ]]; then
    if ! command -v zig >/dev/null 2>&1; then
      echo "[SPECTRE] zig required for cross-compile (${GOOS}/${GOARCH}); install zig or run scripts/setup-zig.sh" >&2
      exit 1
    fi
    export CC
    export CXX
    CC="$(zig_cc "$GOOS" "$GOARCH")"
    CXX="$(zig_cxx "$GOOS" "$GOARCH")"
    echo "[SPECTRE] Cross-compile via Zig: CC=${CC}"
  fi
}

echo "[SPECTRE] Building frontend..."
(cd web && pnpm install --frozen-lockfile && pnpm build)

echo "[SPECTRE] Embedding dist → internal/server/dist"
rm -rf internal/server/dist
cp -r web/dist internal/server/dist

setup_cgo

if [[ "$GOOS" == "windows" ]]; then
  OUTPUT="${OUTPUT%.exe}.exe"
fi

echo "[SPECTRE] Compiling ${OUTPUT} (${GOOS}/${GOARCH})..."
GOOS="$GOOS" GOARCH="$GOARCH" \
  go build -ldflags="$LDFLAGS" -o "$OUTPUT" ./cmd/spectre/

echo "[SPECTRE] Done: ${ROOT}/${OUTPUT}"
