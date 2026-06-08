package tunnel

import (
	"fmt"
	"sync"

	"golang.org/x/crypto/ssh"

	"spectre/internal/proxy"
	"spectre/internal/store"
)

type Status string

const (
	StatusRunning Status = "running"
	StatusStopped Status = "stopped"
	StatusError   Status = "error"
)

type Stats struct {
	ActiveConnections int64                  `json:"active_connections"`
	TotalConnections  int64                  `json:"total_connections"`
	BindAddr          string                 `json:"bind_addr"`
	Connections       []proxy.ProxyConnection `json:"connections,omitempty"`
	Graph             *proxy.GraphData        `json:"graph,omitempty"`
}

type runtimeTunnel struct {
	status Status
	errMsg string
	socks5 *proxy.SOCKS5Server
	forward *proxy.PortForward
}

type SSHConnector func(connectionID string) (*ssh.Client, error)

type Manager struct {
	mu       sync.RWMutex
	running  map[string]*runtimeTunnel
	connect  SSHConnector
}

func NewManager(connect SSHConnector) *Manager {
	return &Manager{
		running: make(map[string]*runtimeTunnel),
		connect: connect,
	}
}

func (m *Manager) Status(id string) (Status, string) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	rt, ok := m.running[id]
	if !ok {
		return StatusStopped, ""
	}
	return rt.status, rt.errMsg
}

func (m *Manager) Start(t *store.Tunnel) error {
	m.mu.Lock()
	if rt, ok := m.running[t.ID]; ok && rt.status == StatusRunning {
		m.mu.Unlock()
		return fmt.Errorf("tunnel already running")
	}
	m.mu.Unlock()

	client, err := m.connect(t.ConnectionID)
	if err != nil {
		m.setError(t.ID, err.Error())
		return err
	}

	rt := &runtimeTunnel{status: StatusRunning}

	switch t.Type {
	case "socks5", "dynamic":
		srv, err := proxy.StartSOCKS5(t.LocalHost, t.LocalPort, client)
		if err != nil {
			m.setError(t.ID, err.Error())
			return err
		}
		rt.socks5 = srv
	case "local":
		pf := &proxy.PortForward{
			LocalHost:  t.LocalHost,
			LocalPort:  t.LocalPort,
			RemoteHost: t.RemoteHost,
			RemotePort: t.RemotePort,
			SSHClient:  client,
		}
		if err := pf.Start(); err != nil {
			m.setError(t.ID, err.Error())
			return err
		}
		rt.forward = pf
	case "remote":
		return fmt.Errorf("remote port forward not yet supported")
	default:
		return fmt.Errorf("unknown tunnel type: %s", t.Type)
	}

	m.mu.Lock()
	m.running[t.ID] = rt
	m.mu.Unlock()
	return nil
}

func (m *Manager) Stop(id string) error {
	m.mu.Lock()
	rt, ok := m.running[id]
	if !ok {
		m.mu.Unlock()
		return nil
	}
	delete(m.running, id)
	m.mu.Unlock()

	if rt.socks5 != nil {
		rt.socks5.Stop()
	}
	if rt.forward != nil {
		rt.forward.Stop()
	}
	return nil
}

func (m *Manager) Stats(id string) (Stats, error) {
	m.mu.RLock()
	rt, ok := m.running[id]
	m.mu.RUnlock()
	if !ok || rt.status != StatusRunning {
		return Stats{}, fmt.Errorf("tunnel not running")
	}
	if rt.socks5 != nil {
		snap := rt.socks5.ConnectionSnapshot()
		return Stats{
			ActiveConnections: snap.ActiveConnections,
			TotalConnections:  snap.TotalConnections,
			BindAddr:          rt.socks5.BindAddr(),
			Connections:       snap.Connections,
			Graph:             &snap.Graph,
		}, nil
	}
	if rt.forward != nil {
		active, total := rt.forward.Stats()
		return Stats{
			ActiveConnections: active,
			TotalConnections:  total,
			BindAddr:          rt.forward.BindAddr(),
		}, nil
	}
	return Stats{}, fmt.Errorf("tunnel has no runtime backend")
}

func (m *Manager) setError(id, msg string) {
	m.mu.Lock()
	m.running[id] = &runtimeTunnel{status: StatusError, errMsg: msg}
	m.mu.Unlock()
}

func (m *Manager) Enrich(t *store.Tunnel) {
	status, errMsg := m.Status(t.ID)
	t.Status = string(status)
	if status == StatusError {
		t.ErrorMessage = errMsg
	}
}
