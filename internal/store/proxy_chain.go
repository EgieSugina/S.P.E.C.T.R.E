package store

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ProxyChainHop is one step in a SOCKS5 proxy chain.
type ProxyChainHop struct {
	Type     string `json:"type"` // "tunnel" | "socks5"
	TunnelID string `json:"tunnel_id,omitempty"`
	Host     string `json:"host,omitempty"`
	Port     int    `json:"port,omitempty"`
}

type ProxyChain struct {
	ID        string          `gorm:"primaryKey" json:"id"`
	Name      string          `json:"name"`
	HopsJSON  string          `json:"-" gorm:"not null;default:'[]'"`
	Hops      []ProxyChainHop `json:"hops" gorm:"-"`
	CreatedAt time.Time       `json:"created_at"`
}

func (c *ProxyChain) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	return c.syncHopsToJSON()
}

func (c *ProxyChain) BeforeSave(tx *gorm.DB) error {
	return c.syncHopsToJSON()
}

func (c *ProxyChain) AfterFind(tx *gorm.DB) error {
	return c.syncJSONToHops()
}

func (c *ProxyChain) syncHopsToJSON() error {
	if len(c.Hops) == 0 {
		c.HopsJSON = "[]"
		return nil
	}
	raw, err := json.Marshal(c.Hops)
	if err != nil {
		return err
	}
	c.HopsJSON = string(raw)
	return nil
}

func (c *ProxyChain) syncJSONToHops() error {
	if c.HopsJSON == "" {
		c.Hops = nil
		return nil
	}
	return json.Unmarshal([]byte(c.HopsJSON), &c.Hops)
}

func (db *DB) ListProxyChains() ([]ProxyChain, error) {
	var chains []ProxyChain
	err := db.Order("name asc").Find(&chains).Error
	if err != nil {
		return nil, err
	}
	for i := range chains {
		_ = chains[i].syncJSONToHops()
	}
	return chains, nil
}

func (db *DB) GetProxyChain(id string) (*ProxyChain, error) {
	var c ProxyChain
	if err := db.First(&c, "id = ?", id).Error; err != nil {
		return nil, err
	}
	_ = c.syncJSONToHops()
	return &c, nil
}

func (db *DB) CreateProxyChain(c *ProxyChain) error {
	return db.Create(c).Error
}

func (db *DB) UpdateProxyChain(c *ProxyChain) error {
	return db.Save(c).Error
}

func (db *DB) DeleteProxyChain(id string) error {
	return db.Delete(&ProxyChain{}, "id = ?", id).Error
}
