package proxy

import (
	"fmt"
	"io"
	"net"
	"sync"
	"sync/atomic"

	"golang.org/x/crypto/ssh"
)

type PortForward struct {
	LocalHost  string
	LocalPort  int
	RemoteHost string
	RemotePort int
	SSHClient  *ssh.Client
	listener   net.Listener
	stopCh     chan struct{}
	wg         sync.WaitGroup
	active     atomic.Int64
	total      atomic.Int64
}

func (pf *PortForward) Start() error {
	if pf.LocalHost == "" {
		pf.LocalHost = "127.0.0.1"
	}
	addr := fmt.Sprintf("%s:%d", pf.LocalHost, pf.LocalPort)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("cannot listen on %s: %w", addr, err)
	}

	pf.listener = listener
	pf.stopCh = make(chan struct{})
	go pf.accept()
	return nil
}

func (pf *PortForward) accept() {
	for {
		conn, err := pf.listener.Accept()
		if err != nil {
			select {
			case <-pf.stopCh:
				return
			default:
				continue
			}
		}
		pf.wg.Add(1)
		go pf.handleConn(conn)
	}
}

func (pf *PortForward) handleConn(local net.Conn) {
	defer pf.wg.Done()
	defer local.Close()

	pf.total.Add(1)
	pf.active.Add(1)
	defer pf.active.Add(-1)

	remoteAddr := fmt.Sprintf("%s:%d", pf.RemoteHost, pf.RemotePort)
	remote, err := pf.SSHClient.Dial("tcp", remoteAddr)
	if err != nil {
		return
	}
	defer remote.Close()

	done := make(chan struct{}, 2)
	go func() { _, _ = io.Copy(local, remote); done <- struct{}{} }()
	go func() { _, _ = io.Copy(remote, local); done <- struct{}{} }()
	<-done
}

func (pf *PortForward) Stop() {
	if pf.stopCh != nil {
		close(pf.stopCh)
	}
	if pf.listener != nil {
		_ = pf.listener.Close()
	}
	pf.wg.Wait()
}

func (pf *PortForward) Stats() (active int64, total int64) {
	return pf.active.Load(), pf.total.Load()
}

func (pf *PortForward) BindAddr() string {
	return fmt.Sprintf("%s:%d", pf.LocalHost, pf.LocalPort)
}
