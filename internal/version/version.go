package version

// Set at link time via -ldflags (see build/goreleaser.yaml and scripts/build-release.sh).
var (
	Version   = "dev"
	BuildDate = "unknown"
	Commit    = "unknown"
)
