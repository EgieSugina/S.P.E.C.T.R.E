//go:build linux

package service

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

const unitName = "spectre.service"

func unitPath(user bool) (string, error) {
	if user {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, ".config/systemd/user", unitName), nil
	}
	return filepath.Join("/etc/systemd/system", unitName), nil
}

func unitContent(opts Options) string {
	args := []string{opts.Executable, "start", "--no-browser",
		"--bind", opts.Bind, "--port", strconv.Itoa(opts.Port)}
	if opts.ConfigDir != "" {
		args = append(args, "--config", opts.ConfigDir)
	}
	quoted := make([]string, len(args))
	for i, a := range args {
		quoted[i] = strconv.Quote(a)
	}
	execStart := strings.Join(quoted, " ")

	return fmt.Sprintf(`[Unit]
Description=SPECTRE — Secure SSH Manager
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=%s
Restart=on-failure
RestartSec=5

[Install]
WantedBy=%s
`, execStart, wantedBy(opts.User))
}

func wantedBy(user bool) string {
	if user {
		return "default.target"
	}
	return "multi-user.target"
}

func install(opts Options) error {
	path, err := unitPath(opts.User)
	if err != nil {
		return err
	}
	if !opts.User {
		return fmt.Errorf("system-wide install requires root; use --user for a user service")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(path, []byte(unitContent(opts)), 0o644); err != nil {
		return err
	}
	_ = exec.Command("systemctl", "--user", "daemon-reload").Run()
	_ = exec.Command("systemctl", "--user", "enable", unitName).Run()
	return exec.Command("systemctl", "--user", "start", unitName).Run()
}

func uninstall(user bool) error {
	path, err := unitPath(user)
	if err != nil {
		return err
	}
	if user {
		_ = exec.Command("systemctl", "--user", "stop", unitName).Run()
		_ = exec.Command("systemctl", "--user", "disable", unitName).Run()
		_ = exec.Command("systemctl", "--user", "daemon-reload").Run()
	} else {
		_ = exec.Command("systemctl", "stop", unitName).Run()
		_ = exec.Command("systemctl", "disable", unitName).Run()
		_ = exec.Command("systemctl", "daemon-reload").Run()
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func status(user bool) (string, error) {
	path, err := unitPath(user)
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return "not installed", nil
		}
		return "", err
	}
	args := []string{"is-active", unitName}
	if user {
		args = append([]string{"--user"}, args...)
	}
	out, err := exec.Command("systemctl", args...).CombinedOutput()
	state := strings.TrimSpace(string(out))
	if err != nil && state == "" {
		return "installed (unknown)", nil
	}
	return fmt.Sprintf("installed (%s)", state), nil
}
