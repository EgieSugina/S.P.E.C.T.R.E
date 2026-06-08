package config

import (
	"encoding/json"
	"fmt"
	"time"

	"spectre/internal/crypto"
	"spectre/internal/store"
)

type ExportData struct {
	Version     string                   `json:"version"`
	ExportedAt  time.Time                `json:"exported_at"`
	Connections []map[string]interface{} `json:"connections"`
	Groups      []store.Group            `json:"groups"`
}

type EncryptedExport struct {
	Format    string `json:"format"`
	Encrypted string `json:"encrypted"`
}

func ExportJSON(db *store.DB, format string, masterPassword string, salt []byte) ([]byte, string, error) {
	conns, err := db.ListConnections()
	if err != nil {
		return nil, "", err
	}
	groups, err := db.ListGroups()
	if err != nil {
		return nil, "", err
	}

	connExports := make([]map[string]interface{}, 0, len(conns))
	for _, c := range conns {
		connExports = append(connExports, db.ConnectionToExport(c))
	}

	data := ExportData{
		Version:     "1.0",
		ExportedAt:  time.Now(),
		Connections: connExports,
		Groups:      groups,
	}

	switch format {
	case "spectre":
		raw, err := json.Marshal(data)
		if err != nil {
			return nil, "", err
		}
		if masterPassword == "" {
			return nil, "", fmt.Errorf("master password required for spectre format")
		}
		encrypted, err := crypto.EncryptWithPassword(string(raw), masterPassword, salt)
		if err != nil {
			return nil, "", err
		}
		wrapped := EncryptedExport{Format: "spectre-encrypted-v1", Encrypted: encrypted}
		out, err := json.MarshalIndent(wrapped, "", "  ")
		return out, "application/json", err
	default:
		out, err := json.MarshalIndent(data, "", "  ")
		return out, "application/json", err
	}
}
