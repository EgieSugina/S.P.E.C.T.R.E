.PHONY: all build frontend backend clean dev install-deps \
	release release-local release-github release-snapshot \
	goreleaser distclean check-zig

BINARY := spectre
WEB_DIR := web
DIST_SRC := $(WEB_DIR)/dist
DIST_EMBED := internal/server/dist
GORELEASER_CONFIG := build/goreleaser.yaml
GORELEASER := $(firstword $(shell command -v goreleaser 2>/dev/null) $(wildcard $(shell go env GOPATH 2>/dev/null)/bin/goreleaser))
ZIG_BIN := $(wildcard .tools/zig-*/zig)
export PATH := $(HOME)/go/bin:/usr/bin:$(dir $(ZIG_BIN))$(PATH)

all: build

install-deps:
	cd $(WEB_DIR) && pnpm install
	go mod download

frontend:
	cd $(WEB_DIR) && pnpm build

embed: frontend
	rm -rf $(DIST_EMBED)
	cp -r $(DIST_SRC) $(DIST_EMBED)

backend: embed
	CGO_ENABLED=1 go build -ldflags="-s -w" -o $(BINARY) ./cmd/spectre/

build: backend

clean:
	rm -f $(BINARY)
	rm -rf $(DIST_EMBED)
	rm -rf $(DIST_SRC)

dev-backend:
	go run ./cmd/spectre/ start --no-browser

dev-frontend:
	cd $(WEB_DIR) && pnpm dev

run: build
	./$(BINARY) start

# Single-platform release binary for the current (or GOOS/GOARCH) host.
release-local:
	./scripts/build-release.sh

# Cross-platform archives in dist/ (linux amd64/arm64, windows amd64). No git tag required.
release release-snapshot: check-zig
	$(GORELEASER) release --snapshot --clean --config $(GORELEASER_CONFIG)

# Publish a tagged release to GitHub (requires git tag + GITHUB_TOKEN).
release-github goreleaser: check-zig
	$(GORELEASER) release --clean --config $(GORELEASER_CONFIG)

check-zig:
	@command -v zig >/dev/null 2>&1 || test -n "$(ZIG_BIN)" || (echo "zig required for CGO cross-compile: install zig or run scripts/setup-zig.sh" >&2; exit 1)

distclean:
	rm -rf dist/
