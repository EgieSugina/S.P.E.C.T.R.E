package server

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed all:dist
var frontendFS embed.FS

func ServeFrontend() http.Handler {
	fsys, err := fs.Sub(frontendFS, "dist")
	if err != nil {
		panic(err)
	}
	fileServer := http.FileServer(http.FS(fsys))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cleanPath := strings.TrimPrefix(path.Clean(r.URL.Path), "/")

		if cleanPath != "" {
			if _, err := fsys.Open(cleanPath); err != nil {
				// Static assets must not fall back to index.html (breaks MIME types).
				if strings.HasPrefix(cleanPath, "assets/") {
					http.NotFound(w, r)
					return
				}
				// SPA client route — serve index.html.
				r.URL.Path = "/"
			}
		}
		fileServer.ServeHTTP(w, r)
	})
}
