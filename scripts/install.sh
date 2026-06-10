#!/usr/bin/env bash
# Install SPECTRE from the latest GitHub release.
set -euo pipefail

REPO="${SPECTRE_INSTALL_REPO:-EgieSugina/S.P.E.C.T.R.E}"
INSTALL_DIR="${SPECTRE_INSTALL_DIR:-${HOME}/.local/bin}"

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"
case "$arch" in
  x86_64|amd64) arch="x86_64" ;;
  aarch64|arm64) arch="arm64" ;;
  *) echo "unsupported architecture: $arch" >&2; exit 1 ;;
esac

case "$os" in
  linux) archive="spectre_linux_${arch}.tar.gz" ;;
  darwin) archive="spectre_darwin_${arch}.tar.gz" ;;
  *) echo "unsupported OS: $os (use release assets manually)" >&2; exit 1 ;;
esac

api="https://api.github.com/repos/${REPO}/releases/latest"
url="$(curl -fsSL -H 'Accept: application/vnd.github+json' "$api" \
  | grep -o "\"browser_download_url\": \"[^\"]*${archive}\"" \
  | head -1 \
  | cut -d'"' -f4)"

if [[ -z "$url" ]]; then
  echo "release asset ${archive} not found" >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$url" -o "${tmp}/${archive}"
tar -xzf "${tmp}/${archive}" -C "$tmp"

mkdir -p "$INSTALL_DIR"
install -m 0755 "${tmp}/spectre" "${INSTALL_DIR}/spectre"
echo "Installed ${INSTALL_DIR}/spectre"
echo "Run: spectre start"
