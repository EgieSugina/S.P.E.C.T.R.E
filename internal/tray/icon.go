package tray

import _ "embed"

//go:embed icons/ghost-22.png
var icon22 []byte

//go:embed icons/ghost-32.png
var icon32 []byte

//go:embed icons/ghost-64.png
var icon64 []byte

//go:embed icons/ghost-256.png
var icon256 []byte

func TrayIcon() []byte {
	return icon22
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
