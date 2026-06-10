package ssh

import (
	"errors"
	"fmt"
	"strings"
	"testing"
)

func TestClassifyConnectError(t *testing.T) {
	tests := []struct {
		err      error
		wantCode string
		wantMsg  string
	}{
		{fmt.Errorf("no credentials configured"), "AUTH_FAILED", "No SSH credentials"},
		{fmt.Errorf("ssh: unable to authenticate"), "AUTH_FAILED", "SSH authentication failed"},
		{fmt.Errorf("proxy connect to 10.0.0.1:22: connection refused"), "PROXY_FAILED", "Could not reach host through proxy"},
		{fmt.Errorf("dial tcp: i/o timeout"), "TIMEOUT", "Connection timed out"},
		{fmt.Errorf("dial tcp 10.0.0.1:22: connection refused"), "HOST_UNREACHABLE", "Connection refused"},
		{fmt.Errorf("dial failed: no route to host"), "HOST_UNREACHABLE", "Network unreachable"},
	}

	for _, tc := range tests {
		code, msg := ClassifyConnectError(tc.err)
		if code != tc.wantCode {
			t.Errorf("ClassifyConnectError(%q) code = %q, want %q", tc.err, code, tc.wantCode)
		}
		if !strings.Contains(msg, tc.wantMsg) {
			t.Errorf("ClassifyConnectError(%q) message = %q, want substring %q", tc.err, msg, tc.wantMsg)
		}
	}
}

func TestConnectErrorUnwrap(t *testing.T) {
	cause := errors.New("root cause")
	err := &ConnectError{Code: "TIMEOUT", Message: "timed out", Cause: cause}
	if !errors.Is(err, cause) {
		t.Fatal("ConnectError should unwrap cause")
	}
}
