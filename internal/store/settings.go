package store

import "encoding/base64"

func (db *DB) GetSetting(key string) (string, error) {
	var s Setting
	if err := db.First(&s, "key = ?", key).Error; err != nil {
		return "", err
	}
	return s.Value, nil
}

func (db *DB) SetSetting(key, value string) error {
	s := Setting{Key: key, Value: value}
	return db.Save(&s).Error
}

func (db *DB) GetAllSettings() (map[string]string, error) {
	var settings []Setting
	if err := db.Find(&settings).Error; err != nil {
		return nil, err
	}
	result := make(map[string]string, len(settings))
	for _, s := range settings {
		if s.Key == "vault_salt" || s.Key == "vault_hash" {
			continue
		}
		result[s.Key] = s.Value
	}
	return result, nil
}

func (db *DB) GetVaultSalt() ([]byte, error) {
	val, err := db.GetSetting("vault_salt")
	if err != nil {
		return nil, err
	}
	return decodeBase64(val)
}

func (db *DB) GetVaultHash() (string, error) {
	return db.GetSetting("vault_hash")
}

func (db *DB) SetVaultHash(hash string) error {
	return db.SetSetting("vault_hash", hash)
}

func decodeBase64(s string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(s)
}
