package store

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"

	"spectre/internal/crypto"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type DB struct {
	*gorm.DB
	configDir string
}

func New(configDir string) (*DB, error) {
	if err := os.MkdirAll(configDir, 0o700); err != nil {
		return nil, fmt.Errorf("create config dir: %w", err)
	}
	dbPath := filepath.Join(configDir, "spectre.db")
	gdb, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	db := &DB{DB: gdb, configDir: configDir}
	if err := db.migrate(); err != nil {
		return nil, err
	}
	if err := db.seedDefaults(); err != nil {
		return nil, err
	}
	return db, nil
}

func (db *DB) ConfigDir() string {
	return db.configDir
}

func (db *DB) migrate() error {
	return db.AutoMigrate(
		&Connection{},
		&Group{},
		&Setting{},
		&SSHKey{},
		&Tunnel{},
	)
}

func (db *DB) seedDefaults() error {
	var count int64
	db.Model(&Setting{}).Count(&count)
	if count > 0 {
		return nil
	}
	salt, err := generateSalt()
	if err != nil {
		return err
	}
	defaults := []Setting{
		{Key: "vault_salt", Value: base64.StdEncoding.EncodeToString(salt)},
		{Key: "vault_hash", Value: ""},
		{Key: "upload_max_concurrent", Value: "3"},
		{Key: "terminal_font_size", Value: "13"},
		{Key: "theme", Value: "spectre"},
	}
	for _, s := range defaults {
		if err := db.Create(&s).Error; err != nil {
			return err
		}
	}
	return nil
}

func generateSalt() ([]byte, error) {
	return crypto.GenerateSalt()
}
