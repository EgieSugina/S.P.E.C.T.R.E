package ssh

import (
	"net"

	"golang.org/x/crypto/ssh"

	"spectre/internal/proxy"
)

func dialSSH(addr string, config *ssh.ClientConfig, proxyCfg *proxy.DialConfig, proxyChain []proxy.DialConfig) (*ssh.Client, error) {
	var conn net.Conn
	var err error
	phase := "direct"

	switch {
	case len(proxyChain) > 0:
		phase = "proxy"
		conn, err = proxy.DialTCPChain(proxyChain, "tcp", addr)
	case proxyCfg != nil:
		phase = "proxy"
		conn, err = proxy.DialTCP(proxyCfg, "tcp", addr)
	default:
		client, dialErr := ssh.Dial("tcp", addr, config)
		if dialErr != nil {
			return nil, wrapDialError("direct", dialErr)
		}
		return client, nil
	}

	if err != nil {
		return nil, wrapDialError(phase, err)
	}

	c, chans, reqs, err := ssh.NewClientConn(conn, addr, config)
	if err != nil {
		_ = conn.Close()
		return nil, wrapDialError("handshake", err)
	}
	return ssh.NewClient(c, chans, reqs), nil
}
