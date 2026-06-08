package server

import (
	"encoding/json"
	"net/http"
)

func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/auth/token" || r.URL.Path == "/api/auth/session" {
			next.ServeHTTP(w, r)
			return
		}
		token := r.Header.Get("X-SPECTRE-Token")
		if token == "" {
			token = r.URL.Query().Get("token")
		}
		if token != s.token {
			writeError(w, http.StatusUnauthorized, "AUTH_FAILED", "Invalid session token")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]interface{}{
		"error":   true,
		"code":    code,
		"message": message,
	})
}
