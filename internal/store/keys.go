package store

func (db *DB) ListKeys() ([]SSHKey, error) {
	var keys []SSHKey
	err := db.Order("created_at desc").Find(&keys).Error
	return keys, err
}

func (db *DB) GetKey(id string) (*SSHKey, error) {
	var k SSHKey
	if err := db.First(&k, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &k, nil
}

func (db *DB) CreateKey(k *SSHKey) error {
	return db.Create(k).Error
}

func (db *DB) DeleteKey(id string) error {
	return db.Delete(&SSHKey{}, "id = ?", id).Error
}

func (db *DB) CountConnectionsUsingKey(keyID string) (int64, error) {
	var count int64
	err := db.Model(&Connection{}).Where("private_key_id = ?", keyID).Count(&count).Error
	return count, err
}
