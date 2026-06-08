package sftp

import (
	"io"

	pkgsftp "github.com/pkg/sftp"
)

func DownloadFile(client *pkgsftp.Client, remotePath string, w io.Writer) error {
	f, err := client.Open(remotePath)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(w, f)
	return err
}
