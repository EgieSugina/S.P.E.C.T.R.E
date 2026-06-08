//go:build linux

package tray

import (
	"github.com/gen2brain/beeep"
)

func Notify(title, message string) {
	_ = beeep.Notify(title, message, "")
}
