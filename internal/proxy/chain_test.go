package proxy

import (
	"net"
	"testing"
)

func TestDialTCPChainEmptyUsesDirect(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go func() {
		c, _ := ln.Accept()
		if c != nil {
			_ = c.Close()
		}
	}()
	conn, err := DialTCPChain(nil, "tcp", ln.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	_ = conn.Close()
}

func TestDialTCPChainUnsupportedType(t *testing.T) {
	_, err := DialTCPChain([]DialConfig{{Type: "http", Host: "127.0.0.1", Port: 8080}}, "tcp", "example.com:22")
	if err == nil {
		t.Fatal("expected error")
	}
}
