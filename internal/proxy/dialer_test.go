package proxy

import (
	"net"
	"strings"
	"testing"
)

func TestDialTCPUnsupportedType(t *testing.T) {
	_, err := DialTCP(&DialConfig{Type: "http", Host: "127.0.0.1", Port: 8080}, "tcp", "example.com:22")
	if err == nil {
		t.Fatal("expected error for unsupported proxy type")
	}
	if !strings.Contains(err.Error(), "unsupported proxy type") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDialTCPDirect(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	go func() {
		conn, acceptErr := ln.Accept()
		if acceptErr != nil {
			return
		}
		_ = conn.Close()
	}()

	conn, err := DialTCP(nil, "tcp", ln.Addr().String())
	if err != nil {
		t.Fatalf("direct dial: %v", err)
	}
	_ = conn.Close()
}
