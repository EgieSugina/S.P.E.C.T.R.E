package ssh

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

type TerminalSession struct {
	ID         string
	ConnID     string
	AccountID  string
	SSHSession *ssh.Session
	stdin      io.WriteCloser
	PTY        struct{ Cols, Rows int }
	CreatedAt  time.Time

	outputBuf []byte
	bufMu     sync.Mutex

	wsConn *websocket.Conn
	wsMu   sync.Mutex

	done   chan struct{}
	closed bool
	closeMu sync.Mutex
}

func (m *Manager) CreateTerminalSession(connID string, cols, rows int) (*TerminalSession, error) {
	conn, ok := m.GetConnection(connID)
	if !ok || conn.State != StateConnected {
		return nil, fmt.Errorf("connection not active")
	}

	session, err := conn.Client.NewSession()
	if err != nil {
		return nil, err
	}

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}

	if cols == 0 {
		cols = 80
	}
	if rows == 0 {
		rows = 24
	}

	if err := session.RequestPty("xterm-256color", rows, cols, modes); err != nil {
		session.Close()
		return nil, err
	}

	stdout, err := session.StdoutPipe()
	if err != nil {
		session.Close()
		return nil, err
	}
	stdin, err := session.StdinPipe()
	if err != nil {
		session.Close()
		return nil, err
	}

	if err := session.Shell(); err != nil {
		session.Close()
		return nil, err
	}

	ts := &TerminalSession{
		ID:         uuid.New().String(),
		ConnID:     connID,
		AccountID:  conn.AccountID,
		SSHSession: session,
		stdin:      stdin,
		CreatedAt:  time.Now(),
		done:       make(chan struct{}),
	}
	ts.PTY.Cols = cols
	ts.PTY.Rows = rows

	go ts.pumpOutput(stdout)
	go ts.waitClose()

	m.RegisterSession(ts)
	return ts, nil
}

func (s *TerminalSession) pumpOutput(stdout io.Reader) {
	buf := make([]byte, 4096)
	for {
		select {
		case <-s.done:
			return
		default:
		}
		n, err := stdout.Read(buf)
		if n > 0 {
			s.writeToClient(buf[:n])
		}
		if err != nil {
			s.notifyDisconnected("session ended")
			return
		}
	}
}

func (s *TerminalSession) waitClose() {
	s.SSHSession.Wait()
	s.notifyDisconnected("session closed")
}

func (s *TerminalSession) AttachWebSocket(ws *websocket.Conn) {
	s.wsMu.Lock()
	if len(s.outputBuf) > 0 {
		_ = ws.WriteJSON(map[string]interface{}{
			"type": "buffer",
			"data": base64.StdEncoding.EncodeToString(s.outputBuf),
		})
	}
	s.wsConn = ws
	s.wsMu.Unlock()

	_ = ws.WriteJSON(map[string]interface{}{
		"type":       "connected",
		"session_id": s.ID,
	})
}

func (s *TerminalSession) DetachWebSocket() {
	s.wsMu.Lock()
	s.wsConn = nil
	s.wsMu.Unlock()
}

func (s *TerminalSession) writeToClient(data []byte) {
	s.bufMu.Lock()
	s.outputBuf = append(s.outputBuf, data...)
	if len(s.outputBuf) > 500*1024 {
		s.outputBuf = s.outputBuf[len(s.outputBuf)-500*1024:]
	}
	s.bufMu.Unlock()

	s.wsMu.Lock()
	defer s.wsMu.Unlock()
	if s.wsConn != nil {
		_ = s.wsConn.WriteJSON(map[string]interface{}{
			"type": "output",
			"data": base64.StdEncoding.EncodeToString(data),
		})
	}
}

func (s *TerminalSession) notifyDisconnected(reason string) {
	s.wsMu.Lock()
	defer s.wsMu.Unlock()
	if s.wsConn != nil {
		_ = s.wsConn.WriteJSON(map[string]interface{}{
			"type":   "disconnected",
			"reason": reason,
		})
	}
}

func (s *TerminalSession) HandleMessage(msg []byte) error {
	var payload struct {
		Type string `json:"type"`
		Data string `json:"data"`
		Cols int    `json:"cols"`
		Rows int    `json:"rows"`
	}
	if err := json.Unmarshal(msg, &payload); err != nil {
		return err
	}

	switch payload.Type {
	case "input":
		if s.stdin == nil {
			return fmt.Errorf("stdin not available")
		}
		_, err := s.stdin.Write([]byte(payload.Data))
		return err
	case "resize":
		s.PTY.Cols = payload.Cols
		s.PTY.Rows = payload.Rows
		return s.SSHSession.WindowChange(payload.Rows, payload.Cols)
	case "ping":
		s.wsMu.Lock()
		defer s.wsMu.Unlock()
		if s.wsConn != nil {
			_ = s.wsConn.WriteJSON(map[string]string{"type": "pong"})
		}
	}
	return nil
}

func (s *TerminalSession) Close() {
	s.closeMu.Lock()
	defer s.closeMu.Unlock()
	if s.closed {
		return
	}
	s.closed = true
	close(s.done)
	s.DetachWebSocket()
	if s.SSHSession != nil {
		s.SSHSession.Close()
	}
}
