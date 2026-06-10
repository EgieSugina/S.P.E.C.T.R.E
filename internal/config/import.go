package config

import (
	"encoding/json"
	"fmt"

	"spectre/internal/crypto"
	"spectre/internal/store"
)

func ImportJSON(db *store.DB, data []byte, masterPassword string, salt []byte) (int, error) {
	var wrapped EncryptedExport
	if err := json.Unmarshal(data, &wrapped); err == nil && wrapped.Format == "spectre-encrypted-v1" {
		if masterPassword == "" {
			return 0, fmt.Errorf("master password required")
		}
		decrypted, err := crypto.DecryptWithPassword(wrapped.Encrypted, masterPassword, salt)
		if err != nil {
			return 0, err
		}
		data = []byte(decrypted)
	}

	var export ExportData
	if err := json.Unmarshal(data, &export); err != nil {
		return 0, err
	}

	count := 0
	for _, g := range export.Groups {
		existing, err := db.GetGroup(g.ID)
		if err != nil {
			if err := db.CreateGroup(&g); err != nil {
				return count, err
			}
			count++
		} else {
			existing.Name = g.Name
			existing.Color = g.Color
			existing.SortOrder = g.SortOrder
			if err := db.UpdateGroup(existing); err != nil {
				return count, err
			}
		}
	}

	for _, raw := range export.Connections {
		conn := store.Connection{}
		rawBytes, _ := json.Marshal(raw)
		if err := json.Unmarshal(rawBytes, &conn); err != nil {
			continue
		}
		if conn.ID == "" {
			continue
		}
		existing, err := db.GetConnection(conn.ID)
		if err != nil {
			if err := db.CreateConnection(&conn); err != nil {
				return count, err
			}
			count++
		} else {
			existing.Name = conn.Name
			existing.Host = conn.Host
			existing.Port = conn.Port
			existing.Username = conn.Username
			existing.AuthType = conn.AuthType
			existing.GroupID = conn.GroupID
			existing.Tags = conn.Tags
			existing.Notes = conn.Notes
			existing.ProxyTunnelID = conn.ProxyTunnelID
			existing.ProxyType = conn.ProxyType
			existing.ProxyHost = conn.ProxyHost
			existing.ProxyPort = conn.ProxyPort
			if err := db.UpdateConnection(existing); err != nil {
				return count, err
			}
		}
	}

	return count, nil
}
