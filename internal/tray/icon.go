package tray

import _ "embed"

//go:embed icons/ghost-22.png
var iconStopped22 []byte

//go:embed icons/ghost-running-22.png
var iconRunning22 []byte

//go:embed icons/ghost-32.png
var icon32 []byte

//go:embed icons/ghost-64.png
var icon64 []byte

//go:embed icons/ghost-256.png
var icon256 []byte

// TrayIcon returns the 22px tray icon: red eye when stopped, green when running.
func TrayIcon(running bool) []byte {
	if running {
		return iconRunning22
	}
	return iconStopped22
}

func Icon32() []byte {
	return icon32
}

func Icon64() []byte {
	return icon64
}

func Icon256() []byte {
	return icon256
}
