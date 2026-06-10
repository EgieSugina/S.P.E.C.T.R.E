package ssh

import (
	"errors"
	"fmt"
	"strings"
)

// ConnectError carries a stable API code and a user-facing message.
type ConnectError struct {
	Code    string
	Message string
	Cause   error
}

func (e *ConnectError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Cause)
	}
	return e.Message
}

func (e *ConnectError) Unwrap() error { return e.Cause }

// ClassifyConnectError maps dial/handshake failures to API error codes and messages.
func ClassifyConnectError(err error) (code, message string) {
	if err == nil {
		return "INTERNAL", "unknown error"
	}

	var connectErr *ConnectError
	if errors.As(err, &connectErr) {
		return connectErr.Code, connectErr.Message
	}

	msg := strings.ToLower(err.Error())
	switch {
	case strings.Contains(msg, "no credentials"):
		return "AUTH_FAILED", "No SSH credentials configured for this connection"
	case strings.Contains(msg, "unable to authenticate"),
		strings.Contains(msg, "no supported methods remain"),
		strings.Contains(msg, "permission denied"):
		return "AUTH_FAILED", "SSH authentication failed — check username, password, or key"
	case strings.Contains(msg, "proxy"), strings.Contains(msg, "socks5"):
		return "PROXY_FAILED", "Could not reach host through proxy — verify proxy/tunnel is running"
	case strings.Contains(msg, "timeout"), strings.Contains(msg, "deadline exceeded"),
		strings.Contains(msg, "i/o timeout"):
		return "TIMEOUT", "Connection timed out — host may be down or unreachable"
	case strings.Contains(msg, "connection refused"):
		return "HOST_UNREACHABLE", "Connection refused — SSH service may not be running on that port"
	case strings.Contains(msg, "no route to host"), strings.Contains(msg, "network is unreachable"):
		return "HOST_UNREACHABLE", "Network unreachable — check host address and routing"
	case strings.Contains(msg, "ssh handshake failed"):
		return "HOST_UNREACHABLE", "SSH handshake failed — host may be unreachable or not an SSH server"
	case strings.Contains(msg, "dial failed"):
		return "HOST_UNREACHABLE", "Could not reach host — verify address, port, and network path"
	default:
		return "HOST_UNREACHABLE", "Could not connect to host"
	}
}

func classifyDisconnectReason(err error) string {
	if err == nil {
		return "connection closed"
	}
	msg := strings.ToLower(err.Error())
	switch {
	case strings.Contains(msg, "timeout"), strings.Contains(msg, "deadline exceeded"):
		return "connection timed out"
	case strings.Contains(msg, "connection reset"), strings.Contains(msg, "broken pipe"):
		return "connection reset by remote host"
	case strings.Contains(msg, "eof"):
		return "connection closed by remote host"
	default:
		return "connection lost"
	}
}

func wrapDialError(stage string, err error) error {
	code, message := ClassifyConnectError(err)
	prefix := message
	switch stage {
	case "proxy":
		code = "PROXY_FAILED"
		prefix = "Could not reach host through proxy"
	case "direct":
		if code == "HOST_UNREACHABLE" {
			prefix = "Could not reach host"
		}
	case "handshake":
		if strings.Contains(strings.ToLower(err.Error()), "unable to authenticate") {
			code = "AUTH_FAILED"
			prefix = "SSH authentication failed"
		} else {
			prefix = "SSH handshake failed"
		}
	}
	return &ConnectError{Code: code, Message: prefix, Cause: err}
}

