package service

import "fmt"

// Options configures a platform background service for the SPECTRE daemon.
type Options struct {
	Executable string
	Port       int
	Bind       string
	ConfigDir  string
	User       bool // user-level service (systemd --user, LaunchAgent) vs system-wide
}

// Install registers the SPECTRE daemon as a platform service.
func Install(opts Options) error {
	if opts.Executable == "" {
		return fmt.Errorf("executable path required")
	}
	return install(opts)
}

// Uninstall removes the platform service registration.
func Uninstall(user bool) error {
	return uninstall(user)
}

// Status reports whether the service unit is installed and its runtime state.
func Status(user bool) (string, error) {
	return status(user)
}
