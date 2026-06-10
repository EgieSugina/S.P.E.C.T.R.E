//go:build !linux && !darwin && !windows

package service

import "fmt"

func install(opts Options) error {
	return fmt.Errorf("service install not supported on this platform")
}

func uninstall(user bool) error {
	return fmt.Errorf("service uninstall not supported on this platform")
}

func status(user bool) (string, error) {
	return "", fmt.Errorf("service status not supported on this platform")
}
