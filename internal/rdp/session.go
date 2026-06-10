package rdp

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/tomatome/grdp/protocol/pdu"
)

// DesktopSession is a view into an RDP connection streamed over WebSocket.
type DesktopSession struct {
	ID        string
	ConnID    string
	AccountID string
	CreatedAt time.Time
	Width     int
	Height    int

	wsConn *websocket.Conn
	wsMu   sync.Mutex

	closed  bool
	closeMu sync.Mutex
}

func (s *DesktopSession) AttachWebSocket(ws *websocket.Conn) {
	s.wsMu.Lock()
	s.wsConn = ws
	s.wsMu.Unlock()
	_ = ws.WriteJSON(map[string]interface{}{
		"type":       "connected",
		"session_id": s.ID,
		"width":      s.Width,
		"height":     s.Height,
	})
}

func (s *DesktopSession) DetachWebSocket() {
	s.wsMu.Lock()
	s.wsConn = nil
	s.wsMu.Unlock()
}

func (s *DesktopSession) emitFrames(bitmaps []FrameBitmap) {
	if len(bitmaps) == 0 {
		return
	}
	s.wsMu.Lock()
	defer s.wsMu.Unlock()
	if s.wsConn == nil {
		return
	}
	_ = s.wsConn.WriteJSON(map[string]interface{}{
		"type":    "frame",
		"bitmaps": bitmaps,
	})
}

func (s *DesktopSession) notifyDisconnected(reason string) {
	s.wsMu.Lock()
	ws := s.wsConn
	s.wsMu.Unlock()
	if ws == nil {
		return
	}
	_ = ws.WriteJSON(map[string]interface{}{
		"type":   "disconnected",
		"reason": reason,
	})
	_ = ws.WriteMessage(
		websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseGoingAway, reason),
	)
}

func (s *DesktopSession) HandleMessage(client *Client, msg []byte) error {
	var payload struct {
		Type     string `json:"type"`
		Button   int    `json:"button"`
		X        int    `json:"x"`
		Y        int    `json:"y"`
		Pressed  bool   `json:"pressed"`
		Scancode uint16 `json:"scancode"`
		Width    int    `json:"width"`
		Height   int    `json:"height"`
	}
	if err := json.Unmarshal(msg, &payload); err != nil {
		return err
	}
	if client == nil {
		return fmt.Errorf("rdp client not available")
	}

	switch payload.Type {
	case "mouse":
		if payload.Pressed {
			client.SendMouse(payload.Button, payload.X, payload.Y, true)
		} else if payload.Button < 0 {
			client.SendMouseMove(payload.X, payload.Y)
		} else {
			client.SendMouse(payload.Button, payload.X, payload.Y, false)
		}
	case "keydown":
		client.SendKey(payload.Scancode, true)
	case "keyup":
		client.SendKey(payload.Scancode, false)
	case "ping":
		s.wsMu.Lock()
		defer s.wsMu.Unlock()
		if s.wsConn != nil {
			_ = s.wsConn.WriteJSON(map[string]string{"type": "pong"})
		}
	case "resize":
		// MVP: display resize deferred; acknowledge only
		s.Width = payload.Width
		s.Height = payload.Height
	}
	return nil
}

func (s *DesktopSession) Close() {
	s.closeMu.Lock()
	defer s.closeMu.Unlock()
	if s.closed {
		return
	}
	s.closed = true
	s.DetachWebSocket()
}

func newDesktopSession(connID, accountID string, width, height int) *DesktopSession {
	return &DesktopSession{
		ID:        uuid.New().String(),
		ConnID:    connID,
		AccountID: accountID,
		CreatedAt: time.Now(),
		Width:     width,
		Height:    height,
	}
}

func wireClientUpdates(client *Client, session *DesktopSession, onClose func()) {
	client.On("update", func(rectangles []pdu.BitmapData) {
		session.emitFrames(bitmapsFromPDU(rectangles))
	})
	client.On("close", func() {
		session.notifyDisconnected("session closed")
		if onClose != nil {
			onClose()
		}
	})
	client.On("error", func(e error) {
		session.notifyDisconnected(e.Error())
		if onClose != nil {
			onClose()
		}
	})
}
