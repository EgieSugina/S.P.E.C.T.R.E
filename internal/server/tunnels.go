package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/ssh"

	"spectre/internal/store"
	"spectre/internal/tunnel"
)

func (s *Server) handleListTunnels(w http.ResponseWriter, r *http.Request) {
	tunnels, err := s.db.ListTunnels()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	for i := range tunnels {
		s.tunnelMgr.Enrich(&tunnels[i])
	}
	writeJSON(w, http.StatusOK, tunnels)
}

func (s *Server) handleCreateTunnel(w http.ResponseWriter, r *http.Request) {
	var t store.Tunnel
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	if t.Name == "" || t.ConnectionID == "" || t.Type == "" {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "name, connection_id, and type are required")
		return
	}
	if _, err := s.db.GetConnection(t.ConnectionID); err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Connection not found")
		return
	}
	if err := s.db.CreateTunnel(&t); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	t.Status = "stopped"
	writeJSON(w, http.StatusCreated, t)
}

func (s *Server) handleGetTunnel(w http.ResponseWriter, r *http.Request) {
	t, err := s.db.GetTunnel(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Tunnel not found")
		return
	}
	s.tunnelMgr.Enrich(t)
	writeJSON(w, http.StatusOK, t)
}

func (s *Server) handleUpdateTunnel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	existing, err := s.db.GetTunnel(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Tunnel not found")
		return
	}
	if status, _ := s.tunnelMgr.Status(id); status == "running" {
		writeError(w, http.StatusConflict, "TUNNEL_RUNNING", "Stop the tunnel before editing")
		return
	}
	var input store.Tunnel
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	if input.Name != "" {
		existing.Name = input.Name
	}
	if input.ConnectionID != "" {
		if _, err := s.db.GetConnection(input.ConnectionID); err != nil {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Connection not found")
			return
		}
		existing.ConnectionID = input.ConnectionID
	}
	if input.Type != "" {
		existing.Type = input.Type
	}
	if input.LocalHost != "" {
		existing.LocalHost = input.LocalHost
	}
	if input.LocalPort != 0 {
		existing.LocalPort = input.LocalPort
	}
	if input.RemoteHost != "" {
		existing.RemoteHost = input.RemoteHost
	}
	if input.RemotePort != 0 {
		existing.RemotePort = input.RemotePort
	}
	existing.AutoStart = input.AutoStart
	if err := s.db.UpdateTunnel(existing); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	s.tunnelMgr.Enrich(existing)
	writeJSON(w, http.StatusOK, existing)
}

func (s *Server) handleDeleteTunnel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_ = s.tunnelMgr.Stop(id)
	if err := s.db.DeleteTunnel(id); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleStartTunnel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	t, err := s.db.GetTunnel(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Tunnel not found")
		return
	}
	if err := s.tunnelMgr.Start(t); err != nil {
		if errors.Is(err, tunnel.ErrPortBusy) {
			writeError(w, http.StatusConflict, "TUNNEL_PORT_BUSY", err.Error())
			return
		}
		writeError(w, http.StatusBadGateway, "TUNNEL_START_FAILED", err.Error())
		return
	}
	s.tunnelMgr.Enrich(t)
	s.systemHub.Emit(map[string]interface{}{
		"type":      "tunnel_started",
		"tunnel_id": t.ID,
		"port":      t.LocalPort,
	})
	writeJSON(w, http.StatusOK, t)
}

func (s *Server) handleStopTunnel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := s.tunnelMgr.Stop(id); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	t, err := s.db.GetTunnel(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Tunnel not found")
		return
	}
	s.tunnelMgr.Enrich(t)
	s.systemHub.Emit(map[string]interface{}{
		"type":      "tunnel_stopped",
		"tunnel_id": t.ID,
	})
	writeJSON(w, http.StatusOK, t)
}

func (s *Server) handleTunnelStats(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	stats, err := s.tunnelMgr.Stats(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func (s *Server) ensureSSHForTunnel(connectionID string) (*ssh.Client, error) {
	if conn, ok := s.sshMgr.GetByAccountID(connectionID); ok {
		return conn.Client, nil
	}
	dbConn, err := s.db.GetConnection(connectionID)
	if err != nil {
		return nil, err
	}
	cfg, err := s.buildAccountConfig(dbConn)
	if err != nil {
		return nil, err
	}
	connID, err := s.sshMgr.Connect(connectionID, cfg)
	if err != nil {
		return nil, err
	}
	_ = s.db.TouchLastConnected(connectionID)
	managed, ok := s.sshMgr.GetConnection(connID)
	if !ok {
		return nil, fmt.Errorf("failed to obtain SSH connection")
	}
	return managed.Client, nil
}
