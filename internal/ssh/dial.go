package ssh

import (
	"golang.org/x/crypto/ssh"

	"spectre/internal/proxy"
)

func dialSSH(addr string, config *ssh.ClientConfig, proxyCfg *proxy.DialConfig) (*ssh.Client, error) {
	if proxyCfg == nil {
		client, err := ssh.Dial("tcp", addr, config)
		if err != nil {
			return nil, wrapDialError("direct", err)
		}
		return client, nil
	}

	conn, err := proxy.DialTCP(proxyCfg, "tcp", addr)
	if err != nil {
		return nil, wrapDialError("proxy", err)
	}

	c, chans, reqs, err := ssh.NewClientConn(conn, addr, config)
	if err != nil {
		_ = conn.Close()
		return nil, wrapDialError("handshake", err)
	}
	return ssh.NewClient(c, chans, reqs), nil
}
