package store

import (
	"encoding/json"
	"time"
)

func (db *DB) ListConnections() ([]Connection, error) {
	var conns []Connection
	err := db.Order("name asc").Find(&conns).Error
	return conns, err
}

func (db *DB) GetConnection(id string) (*Connection, error) {
	var conn Connection
	if err := db.First(&conn, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &conn, nil
}

func (db *DB) CreateConnection(conn *Connection) error {
	return db.Create(conn).Error
}

func (db *DB) UpdateConnection(conn *Connection) error {
	return db.Save(conn).Error
}

func (db *DB) DeleteConnection(id string) error {
	return db.Delete(&Connection{}, "id = ?", id).Error
}

func (db *DB) TouchLastConnected(id string) error {
	now := time.Now()
	return db.Model(&Connection{}).Where("id = ?", id).Update("last_connected_at", now).Error
}

func (db *DB) ConnectionToExport(conn Connection) map[string]interface{} {
	var tags []string
	if conn.Tags != "" {
		_ = json.Unmarshal([]byte(conn.Tags), &tags)
	}
	return map[string]interface{}{
		"id":                  conn.ID,
		"name":                conn.Name,
		"group_id":            conn.GroupID,
		"host":                conn.Host,
		"port":                conn.Port,
		"username":            conn.Username,
		"auth_type":           conn.AuthType,
		"private_key_id":      conn.PrivateKeyID,
		"tags":                tags,
		"notes":               conn.Notes,
		"keep_alive_interval": conn.KeepAliveInterval,
		"proxy_tunnel_id":     conn.ProxyTunnelID,
		"proxy_chain_id":      conn.ProxyChainID,
		"proxy_type":          conn.ProxyType,
		"proxy_host":          conn.ProxyHost,
		"proxy_port":          conn.ProxyPort,
	}
}
