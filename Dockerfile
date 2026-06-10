# syntax=docker/dockerfile:1

FROM golang:1.23-bookworm AS builder
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN cd web && corepack enable && pnpm install --frozen-lockfile && pnpm build \
  && cp -r dist ../internal/server/dist
RUN CGO_ENABLED=1 go build -ldflags="-s -w" -o /out/spectre ./cmd/spectre/

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /out/spectre /usr/local/bin/spectre
VOLUME ["/data"]
EXPOSE 57321
ENV SPECTRE_BIND=0.0.0.0
ENTRYPOINT ["spectre", "start", "--no-browser", "--config", "/data"]
