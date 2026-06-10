package sftp

import "testing"

func TestNormalizeRemotePath(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"", ""},
		{"/home/alice", "/home/alice"},
		{"/home/alice/", "/home/alice"},
		{`C:\Users\bob`, "C:/Users/bob"},
		{`C:\Users\bob\`, "C:/Users/bob"},
		{"/", "/"},
	}
	for _, tt := range tests {
		if got := NormalizeRemotePath(tt.in); got != tt.want {
			t.Errorf("NormalizeRemotePath(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}
