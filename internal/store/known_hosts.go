package store

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type KnownHost struct {
	ID          string    `gorm:"primaryKey" json:"id"`
	Host        string    `gorm:"index:idx_known_host,priority:1" json:"host"`
	Port        int       `gorm:"index:idx_known_host,priority:2" json:"port"`
	KeyType     string    `json:"key_type"`
	Fingerprint string    `json:"fingerprint"`
	KeyData     string    `json:"-"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (kh *KnownHost) BeforeCreate(tx *gorm.DB) error {
	if kh.ID == "" {
		kh.ID = uuid.New().String()
	}
	return nil
}

func (db *DB) ListKnownHosts() ([]KnownHost, error) {
	var hosts []KnownHost
	err := db.Order("host asc, port asc").Find(&hosts).Error
	return hosts, err
}

func (db *DB) GetKnownHost(host string, port int) (*KnownHost, error) {
	var kh KnownHost
	if err := db.First(&kh, "host = ? AND port = ?", host, port).Error; err != nil {
		return nil, err
	}
	return &kh, nil
}

func (db *DB) UpsertKnownHost(kh *KnownHost) error {
	existing, err := db.GetKnownHost(kh.Host, kh.Port)
	if err != nil {
		return db.Create(kh).Error
	}
	existing.KeyType = kh.KeyType
	existing.Fingerprint = kh.Fingerprint
	existing.KeyData = kh.KeyData
	return db.Save(existing).Error
}

func (db *DB) DeleteKnownHost(id string) error {
	return db.Delete(&KnownHost{}, "id = ?", id).Error
}
