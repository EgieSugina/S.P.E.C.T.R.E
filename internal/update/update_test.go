package update

import "testing"

func TestVersionLess(t *testing.T) {
	tests := []struct {
		a, b   string
		older  bool
	}{
		{"0.1.0", "0.2.0", true},
		{"0.2.0", "0.1.0", false},
		{"1.0.0", "1.0.0", false},
		{"dev", "1.0.0", true},
		{"v0.1.0", "v0.2.0", true},
	}
	for _, tc := range tests {
		if got := versionLess(tc.a, tc.b); got != tc.older {
			t.Errorf("versionLess(%q, %q) = %v, want %v", tc.a, tc.b, got, tc.older)
		}
	}
}
