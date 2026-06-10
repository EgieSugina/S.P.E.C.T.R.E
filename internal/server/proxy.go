package server

import (
	"fmt"
	"net"
	"strconv"

	"spectre/internal/proxy"
	"spectre/internal/store"
)

func (s *Server) resolveProxyConfig(conn *store.Connection) (*proxy.DialConfig, error) {
	if conn.ProxyTunnelID != nil && *conn.ProxyTunnelID != "" {
		tunnelID := *conn.ProxyTunnelID
		t, err := s.db.GetTunnel(tunnelID)
		if err != nil {
			return nil, fmt.Errorf("proxy tunnel not found")
		}
		if t.ConnectionID == conn.ID {
			return nil, fmt.Errorf("connection cannot use a tunnel backed by itself as proxy")
		}
		if t.Type != "socks5" && t.Type != "dynamic" {
			return nil, fmt.Errorf("proxy tunnel must be SOCKS5 or dynamic type")
		}
		bindAddr, err := s.tunnelMgr.BindAddr(tunnelID)
		if err != nil {
			return nil, fmt.Errorf("proxy tunnel %q is not running — start it before connecting", t.Name)
		}
		host, portStr, err := net.SplitHostPort(bindAddr)
		if err != nil {
			return nil, fmt.Errorf("invalid proxy bind address: %w", err)
		}
		port, err := strconv.Atoi(portStr)
		if err != nil {
			return nil, fmt.Errorf("invalid proxy port: %w", err)
		}
		return &proxy.DialConfig{Type: "socks5", Host: host, Port: port}, nil
	}

	if conn.ProxyHost != "" && conn.ProxyPort > 0 {
		proxyType := conn.ProxyType
		if proxyType == "" {
			proxyType = "socks5"
		}
		return &proxy.DialConfig{
			Type: proxyType,
			Host: conn.ProxyHost,
			Port: conn.ProxyPort,
		}, nil
	}

	return nil, nil
}

func (s *Server) validateProxyConfig(conn *store.Connection) error {
	if conn.ProxyTunnelID != nil && *conn.ProxyTunnelID != "" {
		if conn.ProxyHost != "" || conn.ProxyPort > 0 {
			return fmt.Errorf("use either proxy_tunnel_id or proxy_host/proxy_port, not both")
		}
		t, err := s.db.GetTunnel(*conn.ProxyTunnelID)
		if err != nil {
			return fmt.Errorf("proxy tunnel not found")
		}
		if t.ConnectionID == conn.ID {
			return fmt.Errorf("connection cannot use a tunnel backed by itself as proxy")
		}
		if t.Type != "socks5" && t.Type != "dynamic" {
			return fmt.Errorf("proxy tunnel must be SOCKS5 or dynamic type")
		}
		return nil
	}

	if conn.ProxyHost != "" || conn.ProxyPort > 0 {
		if conn.ProxyHost == "" || conn.ProxyPort <= 0 {
			return fmt.Errorf("proxy_host and proxy_port are required for manual proxy")
		}
		proxyType := conn.ProxyType
		if proxyType == "" {
			proxyType = "socks5"
		}
		if proxyType != "socks5" && proxyType != "dynamic" {
			return fmt.Errorf("unsupported proxy type %q (only socks5 supported for SSH)", proxyType)
		}
	}

	return nil
}
