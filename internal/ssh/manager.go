package ssh

import (
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/ssh"
)

type ConnectionState string

const (
	StateConnected    ConnectionState = "connected"
	StateDisconnected ConnectionState = "disconnected"
	StateConnecting   ConnectionState = "connecting"
	StateError        ConnectionState = "error"
)

type AccountConfig struct {
	Host       string
	Port       int
	Username   string
	Password   string
	PrivateKey string
	Passphrase string
}

type ManagedConnection struct {
	ID           string
	AccountID    string
	Client       *ssh.Client
	State        ConnectionState
	ConnectedAt  time.Time
	LastActivity time.Time
	mu           sync.Mutex
}

type Manager struct {
	connections map[string]*ManagedConnection
	sessions    map[string]*TerminalSession
	mu          sync.RWMutex
	sessMu      sync.RWMutex
}

func NewManager() *Manager {
	m := &Manager{
		connections: make(map[string]*ManagedConnection),
		sessions:    make(map[string]*TerminalSession),
	}
	go m.keepAliveLoop()
	return m
}

func (m *Manager) Connect(accountID string, cfg *AccountConfig) (string, error) {
	auth := buildAuthMethods(cfg)
	if len(auth) == 0 {
		return "", fmt.Errorf("no credentials configured")
	}

	sshConfig := &ssh.ClientConfig{
		User:            cfg.Username,
		Auth:            auth,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         15 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	client, err := ssh.Dial("tcp", addr, sshConfig)
	if err != nil {
		return "", fmt.Errorf("dial failed: %w", err)
	}

	connID := uuid.New().String()
	conn := &ManagedConnection{
		ID:           connID,
		AccountID:    accountID,
		Client:       client,
		State:        StateConnected,
		ConnectedAt:  time.Now(),
		LastActivity: time.Now(),
	}

	m.mu.Lock()
	m.connections[connID] = conn
	m.mu.Unlock()

	go m.monitorConnection(conn)
	return connID, nil
}

func (m *Manager) Disconnect(connID string) error {
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
	defer conn.mu.Unlock()
	if conn.Client != nil {
		conn.Client.Close()
	}
	conn.State = StateDisconnected
	return nil
}

func (m *Manager) GetConnection(connID string) (*ManagedConnection, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	conn, ok := m.connections[connID]
	return conn, ok
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

func (m *Manager) ListConnections() []map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make([]map[string]interface{}, 0, len(m.connections))
	for _, c := range m.connections {
		result = append(result, map[string]interface{}{
			"id":            c.ID,
			"account_id":    c.AccountID,
			"state":         c.State,
			"connected_at":  c.ConnectedAt,
			"last_activity": c.LastActivity,
		})
	}
	return result
}

func (m *Manager) Status(connID string) (ConnectionState, error) {
	conn, ok := m.GetConnection(connID)
	if !ok {
		return StateDisconnected, fmt.Errorf("connection not found")
	}
	conn.mu.Lock()
	defer conn.mu.Unlock()
	return conn.State, nil
}

func (m *Manager) keepAliveLoop() {
	ticker := time.NewTicker(30 * time.Second)
	for range ticker.C {
		m.mu.RLock()
		for _, conn := range m.connections {
			if conn.State == StateConnected {
				go conn.sendKeepAlive()
			}
		}
		m.mu.RUnlock()
	}
}

func (c *ManagedConnection) sendKeepAlive() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.Client != nil {
		_, _, err := c.Client.SendRequest("keepalive@openssh.com", true, nil)
		if err != nil {
			c.State = StateDisconnected
		} else {
			c.LastActivity = time.Now()
		}
	}
}

func (m *Manager) monitorConnection(conn *ManagedConnection) {
	conn.Client.Wait()
	conn.mu.Lock()
	conn.State = StateDisconnected
	conn.mu.Unlock()
}

func (m *Manager) RegisterSession(session *TerminalSession) {
	m.sessMu.Lock()
	m.sessions[session.ID] = session
	m.sessMu.Unlock()
}

func (m *Manager) GetSession(sessionID string) (*TerminalSession, bool) {
	m.sessMu.RLock()
	defer m.sessMu.RUnlock()
	s, ok := m.sessions[sessionID]
	return s, ok
}

func (m *Manager) ListSessions() []map[string]interface{} {
	m.sessMu.RLock()
	defer m.sessMu.RUnlock()
	result := make([]map[string]interface{}, 0, len(m.sessions))
	for _, s := range m.sessions {
		result = append(result, map[string]interface{}{
			"id":         s.ID,
			"conn_id":    s.ConnID,
			"account_id": s.AccountID,
			"cols":       s.PTY.Cols,
			"rows":       s.PTY.Rows,
			"created_at": s.CreatedAt,
		})
	}
	return result
}

func (m *Manager) KillSession(sessionID string) error {
	m.sessMu.Lock()
	session, ok := m.sessions[sessionID]
	if ok {
		delete(m.sessions, sessionID)
	}
	m.sessMu.Unlock()
	if !ok {
		return fmt.Errorf("session not found")
	}
	session.Close()
	return nil
}
