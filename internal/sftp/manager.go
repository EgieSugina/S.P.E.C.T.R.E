package sftp

import (
	"fmt"
	"sync"

	pkgsftp "github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type Manager struct {
	clients map[string]*pkgsftp.Client
	mu      sync.RWMutex
}

func NewManager() *Manager {
	return &Manager{clients: make(map[string]*pkgsftp.Client)}
}

func (m *Manager) GetOrCreate(connID string, sshClient *ssh.Client) (*pkgsftp.Client, error) {
	m.mu.RLock()
	client, ok := m.clients[connID]
	m.mu.RUnlock()
	if ok {
		return client, nil
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if client, ok = m.clients[connID]; ok {
		return client, nil
	}

	sftpClient, err := pkgsftp.NewClient(sshClient)
	if err != nil {
		return nil, fmt.Errorf("sftp client: %w", err)
	}
	m.clients[connID] = sftpClient
	return sftpClient, nil
}

func (m *Manager) Remove(connID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if client, ok := m.clients[connID]; ok {
		client.Close()
		delete(m.clients, connID)
	}
}
