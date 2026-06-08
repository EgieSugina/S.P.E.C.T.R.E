package server

import (
	"encoding/json"
	"sync"

	"github.com/gorilla/websocket"
)

type systemWSHub struct {
	mu      sync.RWMutex
	clients map[*websocket.Conn]struct{}
}

func newSystemWSHub() *systemWSHub {
	return &systemWSHub{
		clients: make(map[*websocket.Conn]struct{}),
	}
}

func (h *systemWSHub) AddClient(ws *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[ws] = struct{}{}
}

func (h *systemWSHub) RemoveClient(ws *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, ws)
}

func (h *systemWSHub) Emit(msg map[string]interface{}) {
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
