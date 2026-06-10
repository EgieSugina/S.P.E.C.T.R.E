package proxy

import (
	"fmt"
	"net"
	"strconv"

	"golang.org/x/net/proxy"
)

// DialConfig describes an outbound proxy used to reach SSH targets.
type DialConfig struct {
	Type string
	Host string
	Port int
}

func (c *DialConfig) Addr() string {
	return net.JoinHostPort(c.Host, strconv.Itoa(c.Port))
}

// DialTCP connects to addr through the configured proxy. When cfg is nil, dials directly.
func DialTCP(cfg *DialConfig, network, addr string) (net.Conn, error) {
	if cfg == nil {
		return net.Dial(network, addr)
	}

	switch cfg.Type {
	case "", "socks5", "dynamic":
		d, err := proxy.SOCKS5("tcp", cfg.Addr(), nil, proxy.Direct)
		if err != nil {
			return nil, fmt.Errorf("socks5 dialer: %w", err)
		}
		conn, err := d.Dial(network, addr)
		if err != nil {
			return nil, fmt.Errorf("proxy connect to %s: %w", addr, err)
		}
		return conn, nil
	default:
		return nil, fmt.Errorf("unsupported proxy type %q for SSH (only socks5 supported)", cfg.Type)
	}
}
