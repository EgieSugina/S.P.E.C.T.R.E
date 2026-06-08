//go:build !linux

package tray

func Notify(title, message string) {}
