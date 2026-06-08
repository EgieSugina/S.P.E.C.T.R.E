package store

func (db *DB) ListTunnels() ([]Tunnel, error) {
	var tunnels []Tunnel
	err := db.Order("created_at desc").Find(&tunnels).Error
	return tunnels, err
}

func (db *DB) GetTunnel(id string) (*Tunnel, error) {
	var t Tunnel
	if err := db.First(&t, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func (db *DB) CreateTunnel(t *Tunnel) error {
	return db.Create(t).Error
}

func (db *DB) UpdateTunnel(t *Tunnel) error {
	return db.Save(t).Error
}

func (db *DB) DeleteTunnel(id string) error {
	return db.Delete(&Tunnel{}, "id = ?", id).Error
}
