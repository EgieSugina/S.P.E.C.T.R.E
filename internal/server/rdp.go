package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"spectre/internal/rdp"
	"spectre/internal/store"
)

func connectionProtocol(conn *store.Connection) string {
	if conn.Protocol == "" || conn.Protocol == "ssh" {
		return "ssh"
	}
	return conn.Protocol
}

func (s *Server) buildRdpAccountConfig(conn *store.Connection) (*rdp.AccountConfig, error) {
	cfg := &rdp.AccountConfig{
		Host:     conn.Host,
		Port:     conn.Port,
		Domain:   conn.Domain,
		Username: conn.Username,
		Width:    conn.RdpWidth,
		Height:   conn.RdpHeight,
	}
	if cfg.Width <= 0 {
		cfg.Width = 1280
	}
	if cfg.Height <= 0 {
		cfg.Height = 720
	}

	if s.vault.IsLocked() {
		if conn.PasswordEnc != "" {
			return nil, fmt.Errorf("unlock vault before connecting")
		}
	} else if conn.PasswordEnc != "" {
		pw, err := s.vault.Decrypt(conn.PasswordEnc)
		if err != nil {
			return nil, err
		}
		cfg.Password = pw
	}

	if cfg.Password == "" {
		return nil, fmt.Errorf("password required for RDP")
	}
	return cfg, nil
}

func (s *Server) handleListRdpSessions(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.rdpMgr.ListSessions())
}

func (s *Server) handleCreateRdpSession(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ConnID string `json:"conn_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	session, err := s.rdpMgr.CreateSession(req.ConnID)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "not active") {
			writeError(w, http.StatusBadGateway, "CONNECTION_LOST", "RDP connection is no longer active")
		} else {
			writeError(w, http.StatusBadGateway, "HOST_UNREACHABLE", err.Error())
		}
		return
	}
	s.systemHub.Emit(map[string]interface{}{
		"type":       "rdp_session_started",
		"session_id": session.ID,
		"conn_id":    session.ConnID,
	})
	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"session_id": session.ID,
		"conn_id":    session.ConnID,
		"width":      session.Width,
		"height":     session.Height,
		"protocol":   "rdp",
	})
}

func (s *Server) handleGetRdpSession(w http.ResponseWriter, r *http.Request) {
	session, _, ok := s.rdpMgr.GetSession(chi.URLParam(r, "id"))
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Session not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"id":       session.ID,
		"conn_id":  session.ConnID,
		"width":    session.Width,
		"height":   session.Height,
		"protocol": "rdp",
	})
}

func (s *Server) handleKillRdpSession(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	if err := s.rdpMgr.KillSession(sessionID); err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", err.Error())
		return
	}
	s.systemHub.Emit(map[string]interface{}{
		"type":       "rdp_session_ended",
		"session_id": sessionID,
	})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleRdpWS(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	token := r.URL.Query().Get("token")
	if token != s.token {
		writeError(w, http.StatusUnauthorized, "AUTH_FAILED", "Invalid token")
		return
	}
	session, client, ok := s.rdpMgr.GetSession(sessionID)
	if !ok || client == nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Session not found")
		return
	}
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	session.AttachWebSocket(ws)
	defer session.DetachWebSocket()
	for {
		_, msg, err := ws.ReadMessage()
		if err != nil {
			return
		}
		_ = session.HandleMessage(client, msg)
	}
}
