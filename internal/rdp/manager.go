package rdp

import (
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
)

type ConnectionState string

const (
	StateConnected    ConnectionState = "connected"
	StateDisconnected ConnectionState = "disconnected"
	StateConnecting   ConnectionState = "connecting"
	StateError        ConnectionState = "error"
)

type ManagedConnection struct {
	ID           string
	AccountID    string
	Client       *Client
	State        ConnectionState
	ConnectedAt  time.Time
	LastActivity time.Time
	Width        int
	Height       int
	mu           sync.Mutex
}

type ConnectionLostHandler func(accountID, connID, reason string)

type Manager struct {
	connections      map[string]*ManagedConnection
	sessions         map[string]*DesktopSession
	sessionByConn    map[string]string
	onConnectionLost ConnectionLostHandler
	mu               sync.RWMutex
	sessMu           sync.RWMutex
}

func NewManager() *Manager {
	return &Manager{
		connections:   make(map[string]*ManagedConnection),
		sessions:      make(map[string]*DesktopSession),
		sessionByConn: make(map[string]string),
	}
}

func (m *Manager) SetConnectionLostHandler(h ConnectionLostHandler) {
	m.onConnectionLost = h
}

func (m *Manager) Connect(accountID string, cfg *AccountConfig) (string, error) {
	if cfg.Password == "" {
		return "", fmt.Errorf("password required for RDP")
	}

	client, err := dialAndLogin(cfg)
	if err != nil {
		return "", err
	}

	connID := uuid.New().String()
	conn := &ManagedConnection{
		ID:           connID,
		AccountID:    accountID,
		Client:       client,
		State:        StateConnected,
		ConnectedAt:  time.Now(),
		LastActivity: time.Now(),
		Width:        cfg.Width,
		Height:       cfg.Height,
	}

	m.mu.Lock()
	m.connections[connID] = conn
	m.mu.Unlock()

	return connID, nil
}

func (m *Manager) Disconnect(connID string) error {
	m.sessMu.Lock()
	if sid, ok := m.sessionByConn[connID]; ok {
		if sess, ok := m.sessions[sid]; ok {
			sess.Close()
			delete(m.sessions, sid)
		}
		delete(m.sessionByConn, connID)
	}
	m.sessMu.Unlock()

	m.mu.Lock()
	conn, ok := m.connections[connID]
	if ok {
		delete(m.connections, connID)
	}
	m.mu.Unlock()
	if !ok {
		return fmt.Errorf("connection not found")
	}
	conn.mu.Lock()
	conn.State = StateDisconnected
	client := conn.Client
	conn.Client = nil
	conn.mu.Unlock()
	if client != nil {
		client.Close()
	}
	return nil
}

func (m *Manager) GetConnection(connID string) (*ManagedConnection, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	conn, ok := m.connections[connID]
	if !ok || conn.State != StateConnected {
		return nil, false
	}
	return conn, true
}

func (m *Manager) GetByAccountID(accountID string) (*ManagedConnection, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, conn := range m.connections {
		if conn.AccountID == accountID && conn.State == StateConnected {
			return conn, true
		}
	}
	return nil, false
}

func (m *Manager) CreateSession(connID string) (*DesktopSession, error) {
	conn, ok := m.GetConnection(connID)
	if !ok {
		return nil, fmt.Errorf("connection not active")
	}

	m.sessMu.Lock()
	if sid, exists := m.sessionByConn[connID]; exists {
		if sess, ok := m.sessions[sid]; ok {
			m.sessMu.Unlock()
			return sess, nil
		}
	}
	m.sessMu.Unlock()

	sess := newDesktopSession(connID, conn.AccountID, conn.Width, conn.Height)
	accountID := conn.AccountID
	wireClientUpdates(conn.Client, sess, func() {
		m.handleClientClosed(connID, accountID, "rdp session ended")
	})

	m.sessMu.Lock()
	m.sessions[sess.ID] = sess
	m.sessionByConn[connID] = sess.ID
	m.sessMu.Unlock()

	return sess, nil
}

func (m *Manager) handleClientClosed(connID, accountID, reason string) {
	_ = m.Disconnect(connID)
	if m.onConnectionLost != nil {
		m.onConnectionLost(accountID, connID, reason)
	}
}

func (m *Manager) GetSession(sessionID string) (*DesktopSession, *Client, bool) {
	m.sessMu.RLock()
	sess, ok := m.sessions[sessionID]
	m.sessMu.RUnlock()
	if !ok {
		return nil, nil, false
	}
	conn, ok := m.GetConnection(sess.ConnID)
	if !ok {
		return sess, nil, false
	}
	return sess, conn.Client, true
}

func (m *Manager) KillSession(sessionID string) error {
	m.sessMu.Lock()
	sess, ok := m.sessions[sessionID]
	if !ok {
		m.sessMu.Unlock()
		return fmt.Errorf("session not found")
	}
	connID := sess.ConnID
	delete(m.sessions, sessionID)
	delete(m.sessionByConn, connID)
	m.sessMu.Unlock()

	sess.Close()
	return m.Disconnect(connID)
}

func (m *Manager) ListSessions() []map[string]interface{} {
	m.sessMu.RLock()
	defer m.sessMu.RUnlock()
	out := make([]map[string]interface{}, 0, len(m.sessions))
	for _, s := range m.sessions {
		out = append(out, map[string]interface{}{
			"id":         s.ID,
			"conn_id":    s.ConnID,
			"account_id": s.AccountID,
			"width":      s.Width,
			"height":     s.Height,
			"protocol":   "rdp",
		})
	}
	return out
}
