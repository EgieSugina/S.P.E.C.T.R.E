package sftp

import (
	"path"
	"sort"
	"strings"

	pkgsftp "github.com/pkg/sftp"
)

type FileEntry struct {
	Name       string `json:"name"`
	Path       string `json:"path"`
	Size       int64  `json:"size"`
	IsDir      bool   `json:"is_dir"`
	Mode       string `json:"mode"`
	ModifiedAt int64  `json:"modified_at"`
}

func ListDirectory(client *pkgsftp.Client, dirPath string) ([]FileEntry, error) {
	if dirPath == "" {
		dirPath = "/"
	}
	entries, err := client.ReadDir(dirPath)
	if err != nil {
		return nil, err
	}

	result := make([]FileEntry, 0, len(entries))
	for _, e := range entries {
		fullPath := path.Join(dirPath, e.Name())
		if !strings.HasPrefix(fullPath, "/") {
			fullPath = "/" + fullPath
		}
		result = append(result, FileEntry{
			Name:       e.Name(),
			Path:       fullPath,
			Size:       e.Size(),
			IsDir:      e.IsDir(),
			Mode:       e.Mode().String(),
			ModifiedAt: e.ModTime().Unix(),
		})
	}

	sort.Slice(result, func(i, j int) bool {
		if result[i].IsDir != result[j].IsDir {
			return result[i].IsDir
		}
		return result[i].Name < result[j].Name
	})

	return result, nil
}

func StatFile(client *pkgsftp.Client, filePath string) (*FileEntry, error) {
	info, err := client.Stat(filePath)
	if err != nil {
		return nil, err
	}
	return &FileEntry{
		Name:       info.Name(),
		Path:       filePath,
		Size:       info.Size(),
		IsDir:      info.IsDir(),
		Mode:       info.Mode().String(),
		ModifiedAt: info.ModTime().Unix(),
	}, nil
}

func Mkdir(client *pkgsftp.Client, dirPath string) error {
	return client.MkdirAll(dirPath)
}

func Delete(client *pkgsftp.Client, filePath string) error {
	info, err := client.Stat(filePath)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return client.RemoveDirectory(filePath)
	}
	return client.Remove(filePath)
}

func Rename(client *pkgsftp.Client, from, to string) error {
	return client.Rename(from, to)
}

