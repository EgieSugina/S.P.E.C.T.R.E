//go:build darwin

package service

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
)

const label = "com.spectre.daemon"

func plistPath(user bool) (string, error) {
	if !user {
		return "", fmt.Errorf("system-wide launchd install is not supported; use --user")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "Library/LaunchAgents", label+".plist"), nil
}

func plistContent(opts Options) string {
	args := []string{opts.Executable, "start", "--no-browser",
		"--bind", opts.Bind, "--port", strconv.Itoa(opts.Port)}
	if opts.ConfigDir != "" {
		args = append(args, "--config", opts.ConfigDir)
	}
	home, _ := os.UserHomeDir()
	logPath := filepath.Join(home, ".spectre", "spectre.log")
	plist := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>%s</string>
	<key>ProgramArguments</key>
	<array>
`, label)
	for _, a := range args {
		plist += fmt.Sprintf("\t\t<string>%s</string>\n", a)
	}
	plist += fmt.Sprintf(`	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>StandardOutPath</key>
	<string>%s</string>
	<key>StandardErrorPath</key>
	<string>%s</string>
</dict>
</plist>
`, logPath, logPath)
	return plist
}

func install(opts Options) error {
	path, err := plistPath(opts.User)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(path, []byte(plistContent(opts)), 0o644); err != nil {
		return err
	}
	return exec.Command("launchctl", "load", "-w", path).Run()
}

func uninstall(user bool) error {
	path, err := plistPath(user)
	if err != nil {
		return err
	}
	_ = exec.Command("launchctl", "unload", "-w", path).Run()
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func status(user bool) (string, error) {
	path, err := plistPath(user)
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return "not installed", nil
		}
		return "", err
	}
	out, err := exec.Command("launchctl", "list", label).CombinedOutput()
	if err != nil {
		return "installed (not loaded)", nil
	}
	if len(out) > 0 {
		return "installed (loaded)", nil
	}
	return "installed", nil
}
