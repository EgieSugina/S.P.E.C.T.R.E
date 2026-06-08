//go:build !linux

package tray

import "fmt"

type Config struct {
	Port      int
	Bind      string
	ConfigDir string
}

func Run(cfg Config) error {
	return fmt.Errorf("system tray is only supported on Linux (KDE/Plasma)")
}

func InstallAutostart(executable string) error {
	return fmt.Errorf("autostart install is only supported on Linux")
}

func UninstallAutostart() error {
	return fmt.Errorf("autostart uninstall is only supported on Linux")
}

func AutostartInstalled() bool {
	return false
}
