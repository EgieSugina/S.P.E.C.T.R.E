package store

func (db *DB) ListGroups() ([]Group, error) {
	var groups []Group
	err := db.Order("sort_order asc, name asc").Find(&groups).Error
	return groups, err
}

func (db *DB) GetGroup(id string) (*Group, error) {
	var g Group
	if err := db.First(&g, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &g, nil
}

func (db *DB) CreateGroup(g *Group) error {
	return db.Create(g).Error
}

func (db *DB) UpdateGroup(g *Group) error {
	return db.Save(g).Error
}

func (db *DB) DeleteGroup(id string) error {
	return db.Delete(&Group{}, "id = ?", id).Error
}
