package proxy

import (
	"context"
	"fmt"
	"net"
	"sync/atomic"

	gosocks5 "github.com/armon/go-socks5"
	"golang.org/x/crypto/ssh"
)

type SOCKS5Server struct {
	localHost string
	localPort int
	listener  net.Listener
	server    *gosocks5.Server
	stop      func()
	tracker   *ConnectionTracker
	active    atomic.Int64
	total     atomic.Int64
}

func StartSOCKS5(localHost string, localPort int, sshClient *ssh.Client) (*SOCKS5Server, error) {
	if localHost == "" {
		localHost = "127.0.0.1"
	}
	bindAddr := fmt.Sprintf("%s:%d", localHost, localPort)
	tracker := NewConnectionTracker(bindAddr)

	conf := &gosocks5.Config{
		Rules: &trackingRules{tracker: tracker, inner: gosocks5.PermitAll()},
		Dial: func(ctx context.Context, network, addr string) (net.Conn, error) {
			target, err := sshClient.Dial(network, addr)
			if err != nil {
				return nil, err
			}
			if pc, ok := ctx.Value(connContextKey{}).(pendingConn); ok {
				dest := pc.dest
				if dest == "" || dest == "unknown" {
					dest = addr
				}
				id := tracker.Register(pc.source, dest)
				target = tracker.Wrap(id, target)
			}
			return target, nil
		},
	}
	server, err := gosocks5.New(conf)
	if err != nil {
		return nil, err
	}

	raw, err := net.Listen("tcp", bindAddr)
	if err != nil {
		return nil, fmt.Errorf("cannot bind %s: %w", bindAddr, err)
	}

	s := &SOCKS5Server{
		localHost: localHost,
		localPort: localPort,
		server:    server,
		tracker:   tracker,
	}
	s.listener = &countingListener{Listener: raw, active: &s.active, total: &s.total}
	s.stop = func() { _ = raw.Close() }

	go server.Serve(s.listener)
	return s, nil
}

func (s *SOCKS5Server) Stop() {
	if s.stop != nil {
		s.stop()
	}
}

func (s *SOCKS5Server) Stats() (active int64, total int64) {
	return s.active.Load(), s.total.Load()
}

func (s *SOCKS5Server) BindAddr() string {
	return fmt.Sprintf("%s:%d", s.localHost, s.localPort)
}

func (s *SOCKS5Server) ConnectionSnapshot() ConnectionSnapshot {
	if s.tracker == nil {
		return ConnectionSnapshot{Graph: GraphData{Nodes: []GraphNode{{
			ID: "local", Label: s.BindAddr(), Type: "proxy",
		}}}}
	}
	return s.tracker.Snapshot()
}

type countingListener struct {
	net.Listener
	active *atomic.Int64
	total  *atomic.Int64
}

func (l *countingListener) Accept() (net.Conn, error) {
	conn, err := l.Listener.Accept()
	if err != nil {
		return nil, err
	}
	l.total.Add(1)
	l.active.Add(1)
	return &countingConn{
		Conn: conn,
		onClose: func() {
			l.active.Add(-1)
		},
	}, nil
}

type countingConn struct {
	net.Conn
	onClose func()
}

func (c *countingConn) Close() error {
	if c.onClose != nil {
		c.onClose()
	}
	return c.Conn.Close()
}
