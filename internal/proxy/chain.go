package proxy

import (
	"fmt"
	"net"

	"golang.org/x/net/proxy"
)

// DialTCPChain connects through an ordered list of SOCKS5 proxies (first hop = outermost).
func DialTCPChain(hops []DialConfig, network, addr string) (net.Conn, error) {
	if len(hops) == 0 {
		return DialTCP(nil, network, addr)
	}
	var forward proxy.Dialer = proxy.Direct
	for i, hop := range hops {
		switch hop.Type {
		case "", "socks5", "dynamic":
			d, err := proxy.SOCKS5("tcp", hop.Addr(), nil, forward)
			if err != nil {
				return nil, fmt.Errorf("socks5 hop %d (%s): %w", i+1, hop.Addr(), err)
			}
			forward = d
		default:
			return nil, fmt.Errorf("unsupported proxy type %q at hop %d", hop.Type, i+1)
		}
	}
	conn, err := forward.Dial(network, addr)
	if err != nil {
		return nil, fmt.Errorf("proxy chain connect to %s: %w", addr, err)
	}
	return conn, nil
}
