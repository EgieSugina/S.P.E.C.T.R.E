.PHONY: all build frontend backend clean dev install-deps

BINARY := spectre
WEB_DIR := web
DIST_SRC := $(WEB_DIR)/dist
DIST_EMBED := internal/server/dist

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

release:
	./scripts/build-release.sh
