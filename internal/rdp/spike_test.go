package rdp

import (
	"os"
	"testing"
)

// Integration spike: set RDP_HOST, RDP_USER, RDP_PASS to test against a real Windows host.
func TestSpikeDialRDP(t *testing.T) {
	host := os.Getenv("RDP_HOST")
	user := os.Getenv("RDP_USER")
	pass := os.Getenv("RDP_PASS")
	if host == "" {
		t.Skip("set RDP_HOST, RDP_USER, RDP_PASS for live spike")
	}
	cfg := &AccountConfig{
		Host:     host,
		Port:     3389,
		Username: user,
		Password: pass,
		Width:    1024,
		Height:   768,
	}
	client, err := dialAndLogin(cfg)
	if err != nil {
		t.Fatalf("dialAndLogin: %v", err)
	}
	defer client.Close()
}
