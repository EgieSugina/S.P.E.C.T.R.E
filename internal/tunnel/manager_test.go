package tunnel

import (
	"crypto/rand"
	"crypto/rsa"
	"errors"
	"io"
	"net"
	"strconv"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"

	"spectre/internal/proxy"
	"spectre/internal/store"
)

func startTestSSHServer(t *testing.T) (string, func()) {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromKey(key)
	if err != nil {
		t.Fatal(err)
	}

	config := &ssh.ServerConfig{NoClientAuth: true}
	config.AddHostKey(signer)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}

	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go handleTestSSHConn(conn, config)
		}
	}()

	return ln.Addr().String(), func() {
		_ = ln.Close()
		<-done
	}
}

func handleTestSSHConn(conn net.Conn, config *ssh.ServerConfig) {
	serverConn, chans, reqs, err := ssh.NewServerConn(conn, config)
	if err != nil {
		_ = conn.Close()
		return
	}
	go ssh.DiscardRequests(reqs)

	for newChannel := range chans {
		if newChannel.ChannelType() != "direct-tcpip" {
			_ = newChannel.Reject(ssh.UnknownChannelType, "unknown channel type")
			continue
		}
		var payload struct {
			Raddr string
			Rport uint32
			Laddr string
			Lport uint32
		}
		if err := ssh.Unmarshal(newChannel.ExtraData(), &payload); err != nil {
			_ = newChannel.Reject(ssh.ConnectionFailed, "bad payload")
			continue
		}
		target, err := net.Dial("tcp", net.JoinHostPort(payload.Raddr, strconv.Itoa(int(payload.Rport))))
		if err != nil {
			_ = newChannel.Reject(ssh.ConnectionFailed, err.Error())
			continue
		}
		channel, reqs, err := newChannel.Accept()
		if err != nil {
			_ = target.Close()
			continue
		}
		go ssh.DiscardRequests(reqs)
		go func() {
			defer channel.Close()
			defer target.Close()
			done := make(chan struct{}, 2)
			go func() { _, _ = io.Copy(channel, target); done <- struct{}{} }()
			go func() { _, _ = io.Copy(target, channel); done <- struct{}{} }()
			<-done
		}()
	}
	_ = serverConn.Close()
}

func dialTestSSH(t *testing.T, addr string) *ssh.Client {
	t.Helper()
	client, err := ssh.Dial("tcp", addr, &ssh.ClientConfig{
		User:            "test",
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         5 * time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	return client
}

func TestManagerTwoSOCKS5DifferentPorts(t *testing.T) {
	sshAddr, stopSSH := startTestSSHServer(t)
	defer stopSSH()

	client := dialTestSSH(t, sshAddr)
	defer client.Close()

	mgr := NewManager(func(string) (*ssh.Client, error) { return client, nil })

	t1 := &store.Tunnel{ID: "t1", Type: "socks5", LocalHost: "127.0.0.1", LocalPort: 19081}
	t2 := &store.Tunnel{ID: "t2", Type: "socks5", LocalHost: "127.0.0.1", LocalPort: 19082}

	if err := mgr.Start(t1); err != nil {
		t.Fatalf("start t1: %v", err)
	}
	defer mgr.Stop(t1.ID)

	if err := mgr.Start(t2); err != nil {
		t.Fatalf("start t2: %v", err)
	}
	defer mgr.Stop(t2.ID)

	echo1, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer echo1.Close()
	go acceptEcho(echo1)

	echo2, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer echo2.Close()
	go acceptEcho(echo2)

	if err := socks5Ping(t, "127.0.0.1:19081", echo1.Addr().String()); err != nil {
		t.Fatalf("proxy 1: %v", err)
	}
	if err := socks5Ping(t, "127.0.0.1:19082", echo2.Addr().String()); err != nil {
		t.Fatalf("proxy 2: %v", err)
	}
}

func TestManagerFirstSOCKS5StillWorksAfterSecondStarts(t *testing.T) {
	sshAddr, stopSSH := startTestSSHServer(t)
	defer stopSSH()

	client := dialTestSSH(t, sshAddr)
	defer client.Close()

	mgr := NewManager(func(string) (*ssh.Client, error) { return client, nil })

	t1 := &store.Tunnel{ID: "t1", Type: "socks5", LocalHost: "127.0.0.1", LocalPort: 19071}
	t2 := &store.Tunnel{ID: "t2", Type: "socks5", LocalHost: "127.0.0.1", LocalPort: 19072}

	if err := mgr.Start(t1); err != nil {
		t.Fatalf("start t1: %v", err)
	}
	defer mgr.Stop(t1.ID)

	echo, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer echo.Close()
	go acceptEcho(echo)

	if err := socks5Ping(t, "127.0.0.1:19071", echo.Addr().String()); err != nil {
		t.Fatalf("proxy 1 before t2: %v", err)
	}

	if err := mgr.Start(t2); err != nil {
		t.Fatalf("start t2: %v", err)
	}
	defer mgr.Stop(t2.ID)

	if err := socks5Ping(t, "127.0.0.1:19071", echo.Addr().String()); err != nil {
		t.Fatalf("proxy 1 after t2 started: %v", err)
	}
}

func TestManagerSecondSOCKS5SamePortFails(t *testing.T) {
	sshAddr, stopSSH := startTestSSHServer(t)
	defer stopSSH()

	client := dialTestSSH(t, sshAddr)
	defer client.Close()

	mgr := NewManager(func(string) (*ssh.Client, error) { return client, nil })

	t1 := &store.Tunnel{ID: "t1", Type: "socks5", LocalHost: "127.0.0.1", LocalPort: 19091}
	t2 := &store.Tunnel{ID: "t2", Type: "socks5", LocalHost: "127.0.0.1", LocalPort: 19091}

	if err := mgr.Start(t1); err != nil {
		t.Fatalf("start t1: %v", err)
	}
	defer mgr.Stop(t1.ID)

	err := mgr.Start(t2)
	if err == nil {
		defer mgr.Stop(t2.ID)
		t.Fatal("expected second proxy on same port to fail")
	}
	if !errors.Is(err, ErrPortBusy) {
		t.Fatalf("expected ErrPortBusy, got: %v", err)
	}
}

func acceptEcho(ln net.Listener) {
	for {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		go func(c net.Conn) {
			defer c.Close()
			buf := make([]byte, 64)
			n, _ := c.Read(buf)
			if n > 0 {
				_, _ = c.Write(buf[:n])
			}
		}(conn)
	}
}

func socks5Ping(t *testing.T, proxyAddr, targetAddr string) error {
	t.Helper()
	d, err := proxy.DialTCP(&proxy.DialConfig{Type: "socks5", Host: "127.0.0.1", Port: mustPort(proxyAddr)}, "tcp", targetAddr)
	if err != nil {
		return err
	}
	defer d.Close()

	if err := d.SetDeadline(time.Now().Add(3 * time.Second)); err != nil {
		return err
	}
	if _, err := d.Write([]byte("ping")); err != nil {
		return err
	}
	buf := make([]byte, 4)
	if _, err := io.ReadFull(d, buf); err != nil {
		return err
	}
	if string(buf) != "ping" {
		t.Fatalf("echo mismatch: %q", buf)
	}
	return nil
}

func mustPort(addr string) int {
	_, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		panic(err)
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		panic(err)
	}
	return port
}
