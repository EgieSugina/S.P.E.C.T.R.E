#!/usr/bin/env bash
# Install Zig into .tools/ for CGO cross-compilation (GoReleaser + SQLite).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="${ZIG_VERSION:-0.14.0}"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="x86_64" ;;
  aarch64|arm64) ARCH="aarch64" ;;
  *) echo "unsupported arch: $ARCH" >&2; exit 1 ;;
esac

case "$OS" in
  linux) PLATFORM="linux-${ARCH}" ;;
  darwin) PLATFORM="macos-${ARCH}" ;;
  *) echo "unsupported OS: $OS" >&2; exit 1 ;;
esac

DEST=".tools/zig-${PLATFORM}-${VERSION}"
if [[ -x "${DEST}/zig" ]]; then
  echo "[SPECTRE] Zig already installed: ${DEST}/zig"
  "${DEST}/zig" version
  exit 0
fi

mkdir -p .tools
archive="zig-${PLATFORM}-${VERSION}.tar.xz"
url="https://ziglang.org/download/${VERSION}/${archive}"
echo "[SPECTRE] Downloading ${url}"
curl -fsSL "$url" -o ".tools/${archive}"
tar -xf ".tools/${archive}" -C .tools
rm -f ".tools/${archive}"
echo "[SPECTRE] Installed ${DEST}/zig"
"${DEST}/zig" version
