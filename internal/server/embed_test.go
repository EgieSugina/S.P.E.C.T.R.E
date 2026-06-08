package server

import (
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
)

func embeddedAssetPaths(t *testing.T) (jsPath, cssPath string) {
	t.Helper()
	data, err := frontendFS.ReadFile("dist/index.html")
	if err != nil {
		t.Fatalf("read index.html: %v", err)
	}
	jsRe := regexp.MustCompile(`/assets/index-[^"]+\.js`)
	cssRe := regexp.MustCompile(`/assets/index-[^"]+\.css`)
	jsPath = jsRe.FindString(string(data))
	cssPath = cssRe.FindString(string(data))
	if jsPath == "" || cssPath == "" {
		t.Fatal("could not parse asset paths from index.html")
	}
	return jsPath, cssPath
}

func TestServeFrontend_assets(t *testing.T) {
	handler := ServeFrontend()
	jsPath, cssPath := embeddedAssetPaths(t)

	t.Run("existing JS asset", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, jsPath, nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", rec.Code)
		}
		ct := rec.Header().Get("Content-Type")
		if !strings.Contains(ct, "javascript") {
			t.Fatalf("Content-Type = %q, want javascript", ct)
		}
		if strings.HasPrefix(rec.Body.String(), "<!DOCTYPE") {
			t.Fatal("got HTML instead of JavaScript")
		}
	})

	t.Run("existing CSS asset", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, cssPath, nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", rec.Code)
		}
		ct := rec.Header().Get("Content-Type")
		if !strings.Contains(ct, "css") {
			t.Fatalf("Content-Type = %q, want css", ct)
		}
	})

	t.Run("missing asset returns 404 not HTML", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/assets/missing-deadbeef.js", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want 404", rec.Code)
		}
		if strings.HasPrefix(rec.Body.String(), "<!DOCTYPE") {
			t.Fatal("missing asset must not return index.html")
		}
	})

	t.Run("SPA route falls back to index.html", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/connections", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", rec.Code)
		}
		if !strings.HasPrefix(rec.Body.String(), "<!DOCTYPE") {
			t.Fatal("SPA route should serve index.html")
		}
	})
}
