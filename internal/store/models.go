package store

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Connection struct {
	ID                string     `gorm:"primaryKey" json:"id"`
	Name              string     `json:"name"`
	GroupID           *string    `json:"group_id,omitempty"`
	Host              string     `json:"host"`
	Port              int        `json:"port"`
	Username          string     `json:"username"`
	AuthType          string     `json:"auth_type"`
	Password          string     `json:"password,omitempty" gorm:"-"`
	PasswordEnc       string     `json:"-"`
	PrivateKeyID      *string    `json:"private_key_id,omitempty"`
	Passphrase        string     `json:"passphrase,omitempty" gorm:"-"`
	PassphraseEnc     string     `json:"-"`
	Tags              string     `json:"tags"`
	Notes             string     `json:"notes"`
	KeepAliveInterval int        `json:"keep_alive_interval"`
	CreatedAt         time.Time  `json:"created_at"`
	LastConnectedAt   *time.Time `json:"last_connected_at,omitempty"`
}

func (c *Connection) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	if c.Port == 0 {
		c.Port = 22
	}
	if c.KeepAliveInterval == 0 {
		c.KeepAliveInterval = 30
	}
	return nil
}

type Group struct {
	ID        string    `gorm:"primaryKey" json:"id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	SortOrder int       `json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
}

func (g *Group) BeforeCreate(tx *gorm.DB) error {
	if g.ID == "" {
		g.ID = uuid.New().String()
	}
	return nil
}

type Setting struct {
	Key   string `gorm:"primaryKey" json:"key"`
	Value string `json:"value"`
}

type SSHKey struct {
	ID            string    `gorm:"primaryKey" json:"id"`
	Name          string    `json:"name"`
	Type          string    `json:"type"`
	PublicKey     string    `json:"public_key"`
	PrivateKeyEnc string    `json:"-"`
	PassphraseEnc string    `json:"-"`
	Fingerprint   string    `json:"fingerprint"`
	CreatedAt     time.Time `json:"created_at"`
}

func (k *SSHKey) BeforeCreate(tx *gorm.DB) error {
	if k.ID == "" {
		k.ID = uuid.New().String()
	}
	return nil
}

type Tunnel struct {
	ID           string    `gorm:"primaryKey" json:"id"`
	Name         string    `json:"name"`
	ConnectionID string    `json:"connection_id"`
	Type         string    `json:"type"`
	LocalHost    string    `json:"local_host"`
	LocalPort    int       `json:"local_port"`
	RemoteHost   string    `json:"remote_host"`
	RemotePort   int       `json:"remote_port"`
	AutoStart    bool      `json:"auto_start"`
	Status       string    `json:"status" gorm:"-"`
	ErrorMessage string    `json:"error_message,omitempty" gorm:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

func (t *Tunnel) BeforeCreate(tx *gorm.DB) error {
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	if t.LocalHost == "" {
		t.LocalHost = "127.0.0.1"
	}
	if t.Type == "socks5" && t.LocalPort == 0 {
		t.LocalPort = 1080
	}
	return nil
}
