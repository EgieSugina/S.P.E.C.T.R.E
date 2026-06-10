package server

import (
	"fmt"
	"net"
	"strconv"

	"spectre/internal/proxy"
	"spectre/internal/store"
)

func (s *Server) resolveProxyConfig(conn *store.Connection) (*proxy.DialConfig, []proxy.DialConfig, error) {
	if conn.ProxyChainID != nil && *conn.ProxyChainID != "" {
		chain, err := s.resolveProxyChain(*conn.ProxyChainID, conn.ID)
		if err != nil {
			return nil, nil, err
		}
		return nil, chain, nil
	}

	if conn.ProxyTunnelID != nil && *conn.ProxyTunnelID != "" {
		tunnelID := *conn.ProxyTunnelID
		t, err := s.db.GetTunnel(tunnelID)
		if err != nil {
			return nil, nil, fmt.Errorf("proxy tunnel not found")
		}
		if t.ConnectionID == conn.ID {
			return nil, nil, fmt.Errorf("connection cannot use a tunnel backed by itself as proxy")
		}
		if t.Type != "socks5" && t.Type != "dynamic" {
			return nil, nil, fmt.Errorf("proxy tunnel must be SOCKS5 or dynamic type")
		}
		bindAddr, err := s.tunnelMgr.BindAddr(tunnelID)
		if err != nil {
			return nil, nil, fmt.Errorf("proxy tunnel %q is not running — start it before connecting", t.Name)
		}
		host, portStr, err := net.SplitHostPort(bindAddr)
		if err != nil {
			return nil, nil, fmt.Errorf("invalid proxy bind address: %w", err)
		}
		port, err := strconv.Atoi(portStr)
		if err != nil {
			return nil, nil, fmt.Errorf("invalid proxy port: %w", err)
		}
		return &proxy.DialConfig{Type: "socks5", Host: host, Port: port}, nil, nil
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
		}, nil, nil
	}

	return nil, nil, nil
}

func (s *Server) validateProxyConfig(conn *store.Connection) error {
	if conn.ProxyChainID != nil && *conn.ProxyChainID != "" {
		if conn.ProxyTunnelID != nil && *conn.ProxyTunnelID != "" {
			return fmt.Errorf("use either proxy_chain_id or proxy_tunnel_id, not both")
		}
		if conn.ProxyHost != "" || conn.ProxyPort > 0 {
			return fmt.Errorf("use either proxy_chain_id or proxy_host/proxy_port, not both")
		}
		chain, err := s.db.GetProxyChain(*conn.ProxyChainID)
		if err != nil {
			return fmt.Errorf("proxy chain not found")
		}
		if err := validateProxyChainHops(chain.Hops); err != nil {
			return err
		}
		if conn.ID != "" {
			for _, hop := range chain.Hops {
				if hop.Type == "tunnel" && hop.TunnelID != "" {
					t, err := s.db.GetTunnel(hop.TunnelID)
					if err == nil && t.ConnectionID == conn.ID {
						return fmt.Errorf("connection cannot use a chain containing its own tunnel")
					}
				}
			}
		}
		return nil
	}

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
