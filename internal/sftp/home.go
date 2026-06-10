package sftp

import (
	"bytes"
	"strings"

	pkgsftp "github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

const defaultRoot = "/"

// ResolveHomeDir returns the remote user's home directory, or "/" if unknown.
func ResolveHomeDir(sftpClient *pkgsftp.Client, sshClient *ssh.Client) string {
	if sftpClient != nil {
		if wd, err := sftpClient.Getwd(); err == nil {
			if p := NormalizeRemotePath(wd); p != "" {
				return p
			}
		}
	}
	if sshClient != nil {
		if p := homeViaSSH(sshClient); p != "" {
			return p
		}
	}
	return defaultRoot
}

func homeViaSSH(client *ssh.Client) string {
	commands := []string{
		`sh -c 'cd ~ && pwd'`,
		`powershell -NoProfile -NonInteractive -Command "[Environment]::GetFolderPath('UserProfile')"`,
	}
	for _, cmd := range commands {
		if p := runSSHCommand(client, cmd); p != "" {
			return p
		}
	}
	return ""
}

func runSSHCommand(client *ssh.Client, command string) string {
	session, err := client.NewSession()
	if err != nil {
		return ""
	}
	defer session.Close()

	var buf bytes.Buffer
	session.Stdout = &buf
	if err := session.Run(command); err != nil {
		return ""
	}
	return NormalizeRemotePath(strings.TrimSpace(buf.String()))
}

// NormalizeRemotePath converts remote paths to forward-slash form.
func NormalizeRemotePath(p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return ""
	}
	p = strings.ReplaceAll(p, "\\", "/")
	if len(p) > 1 {
		p = strings.TrimRight(p, "/")
	}
	return p
}
