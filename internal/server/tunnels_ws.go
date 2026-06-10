package server

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"spectre/internal/store"
)

type tunnelsWSHub struct {
	mu      sync.RWMutex
	clients map[*websocket.Conn]struct{}
}

func newTunnelsWSHub() *tunnelsWSHub {
	return &tunnelsWSHub{
		clients: make(map[*websocket.Conn]struct{}),
	}
}

func (h *tunnelsWSHub) AddClient(ws *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[ws] = struct{}{}
}

func (h *tunnelsWSHub) RemoveClient(ws *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, ws)
}

func (h *tunnelsWSHub) HasClients() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients) > 0
}

func (h *tunnelsWSHub) Emit(msg map[string]interface{}) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.mu.RLock()
	targets := make([]*websocket.Conn, 0, len(h.clients))
	for ws := range h.clients {
		targets = append(targets, ws)
	}
	h.mu.RUnlock()

	for _, ws := range targets {
		if err := ws.WriteMessage(websocket.TextMessage, data); err != nil {
			h.RemoveClient(ws)
		}
	}
}

func (s *Server) emitTunnelEvent(msg map[string]interface{}) {
	s.tunnelsHub.Emit(msg)
}

func (s *Server) handleTunnelsWS(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token != s.token {
		writeError(w, http.StatusUnauthorized, "AUTH_FAILED", "Invalid token")
		return
	}
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	s.tunnelsHub.AddClient(ws)
	defer s.tunnelsHub.RemoveClient(ws)

	s.sendTunnelSnapshot()

	for {
		if _, _, err := ws.ReadMessage(); err != nil {
			return
		}
	}
}

func (s *Server) sendTunnelSnapshot() {
	tunnels, err := s.db.ListTunnels()
	if err != nil {
		return
	}
	for i := range tunnels {
		s.tunnelMgr.Enrich(&tunnels[i])
	}
	s.emitTunnelEvent(map[string]interface{}{
		"type":    "tunnel_snapshot",
		"tunnels": tunnels,
	})
}

func (s *Server) runTunnelStatsBroadcast() {
	ticker := time.NewTicker(2500 * time.Millisecond)
	defer ticker.Stop()
	for range ticker.C {
		if !s.tunnelsHub.HasClients() {
			continue
		}
		for _, id := range s.tunnelMgr.RunningIDs() {
			stats, err := s.tunnelMgr.Stats(id)
			if err != nil {
				continue
			}
			s.emitTunnelEvent(map[string]interface{}{
				"type":      "tunnel_stats",
				"tunnel_id": id,
				"stats":     stats,
			})
		}
	}
}

func (s *Server) emitTunnelLifecycle(t *store.Tunnel, eventType string) {
	msg := map[string]interface{}{
		"type":      eventType,
		"tunnel_id": t.ID,
		"status":    t.Status,
	}
	if t.LocalPort > 0 {
		msg["port"] = t.LocalPort
	}
	if t.ErrorMessage != "" {
		msg["error"] = t.ErrorMessage
	}
	s.emitTunnelEvent(msg)
}
