package server

import (
	"encoding/json"
	"sync"

	"github.com/gorilla/websocket"

	"spectre/internal/sftp"
)

type sftpWSHub struct {
	mu      sync.RWMutex
	clients map[string]map[*websocket.Conn]struct{}
	jobs    map[string]string
}

func newSFTPWSHub() *sftpWSHub {
	return &sftpWSHub{
		clients: make(map[string]map[*websocket.Conn]struct{}),
		jobs:    make(map[string]string),
	}
}

func (h *sftpWSHub) AddClient(connID string, ws *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[connID] == nil {
		h.clients[connID] = make(map[*websocket.Conn]struct{})
	}
	h.clients[connID][ws] = struct{}{}
}

func (h *sftpWSHub) RemoveClient(connID string, ws *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if conns, ok := h.clients[connID]; ok {
		delete(conns, ws)
		if len(conns) == 0 {
			delete(h.clients, connID)
		}
	}
}

func (h *sftpWSHub) RegisterJob(jobID, connID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.jobs[jobID] = connID
}

func (h *sftpWSHub) UnregisterJob(jobID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.jobs, jobID)
}

func (h *sftpWSHub) HandleProgress(p sftp.UploadProgress) {
	h.mu.RLock()
	connID := h.jobs[p.JobID]
	h.mu.RUnlock()
	if connID == "" {
		return
	}

	var msg map[string]interface{}
	switch p.Status {
	case "uploading":
		msg = map[string]interface{}{
			"type":     "upload_progress",
			"job_id":   p.JobID,
			"progress": p.Progress,
			"size":     p.Size,
			"speed":    p.Speed,
			"status":   "uploading",
		}
	case "done":
		msg = map[string]interface{}{
			"type":   "upload_done",
			"job_id": p.JobID,
		}
		h.UnregisterJob(p.JobID)
	case "error":
		msg = map[string]interface{}{
			"type":   "upload_error",
			"job_id": p.JobID,
			"error":  p.Error,
		}
		h.UnregisterJob(p.JobID)
	default:
		return
	}
	h.broadcast(connID, msg)
}

func (h *sftpWSHub) broadcast(connID string, msg map[string]interface{}) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.mu.RLock()
	clients := h.clients[connID]
	targets := make([]*websocket.Conn, 0, len(clients))
	for ws := range clients {
		targets = append(targets, ws)
	}
	h.mu.RUnlock()

	for _, ws := range targets {
		if err := ws.WriteMessage(websocket.TextMessage, data); err != nil {
			h.RemoveClient(connID, ws)
		}
	}
}
