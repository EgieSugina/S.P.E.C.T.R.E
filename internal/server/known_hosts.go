package server

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"spectre/internal/ssh"
)

func (s *Server) handleListKnownHosts(w http.ResponseWriter, r *http.Request) {
	hosts, err := s.db.ListKnownHosts()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, hosts)
}

func (s *Server) handleTrustKnownHost(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Host        string `json:"host"`
		Port        int    `json:"port"`
		KeyType     string `json:"key_type"`
		Fingerprint string `json:"fingerprint"`
		KeyData     string `json:"key_data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	if req.Host == "" || req.Fingerprint == "" || req.KeyData == "" {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "host, fingerprint, and key_data are required")
		return
	}
	if req.Port == 0 {
		req.Port = 22
	}
	if err := ssh.TrustHostKey(s.db, req.Host, req.Port, req.KeyType, req.Fingerprint, req.KeyData); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleDeleteKnownHost(w http.ResponseWriter, r *http.Request) {
	if err := s.db.DeleteKnownHost(chi.URLParam(r, "id")); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
