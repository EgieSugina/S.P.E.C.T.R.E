//go:build windows

package service

import (
	"fmt"
	"os/exec"
	"strings"
)

const serviceName = "SPECTRE"

func install(opts Options) error {
	if opts.User {
		return fmt.Errorf("Windows services require administrator; omit --user and run as admin")
	}
	binPath := fmt.Sprintf(`"%s" start --no-browser --bind %s --port %d`, opts.Executable, opts.Bind, opts.Port)
	if opts.ConfigDir != "" {
		binPath = fmt.Sprintf(`"%s" start --no-browser --bind %s --port %d --config %s`,
			opts.Executable, opts.Bind, opts.Port, opts.ConfigDir)
	}
	out, err := exec.Command("sc", "create", serviceName,
		"binPath=", binPath,
		"start=", "auto",
		"DisplayName=", "SPECTRE SSH Manager",
	).CombinedOutput()
	if err != nil {
		return fmt.Errorf("sc create: %s: %w", strings.TrimSpace(string(out)), err)
	}
	return exec.Command("sc", "start", serviceName).Run()
}

func uninstall(user bool) error {
	_ = exec.Command("sc", "stop", serviceName).Run()
	out, err := exec.Command("sc", "delete", serviceName).CombinedOutput()
	if err != nil {
		return fmt.Errorf("sc delete: %s: %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}

func status(user bool) (string, error) {
	out, err := exec.Command("sc", "query", serviceName).CombinedOutput()
	if err != nil {
		if strings.Contains(string(out), "1060") {
			return "not installed", nil
		}
		return "", fmt.Errorf("sc query: %s", strings.TrimSpace(string(out)))
	}
	text := string(out)
	switch {
	case strings.Contains(text, "RUNNING"):
		return "installed (running)", nil
	case strings.Contains(text, "STOPPED"):
		return "installed (stopped)", nil
	default:
		return "installed", nil
	}
}
