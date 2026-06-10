package update

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"spectre/internal/version"
)

const defaultRepo = "EgieSugina/S.P.E.C.T.R.E"

// Result describes an update check or apply outcome.
type Result struct {
	Current     string `json:"current"`
	Latest      string `json:"latest"`
	UpdateAvail bool   `json:"update_available"`
	Applied     bool   `json:"applied"`
	Message     string `json:"message,omitempty"`
}

type releaseInfo struct {
	TagName string `json:"tag_name"`
	Assets  []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

// Check queries GitHub releases for a newer version without applying it.
func Check(repo string) (Result, error) {
	if repo == "" {
		repo = defaultRepo
	}
	latest, err := fetchLatestTag(repo)
	if err != nil {
		return Result{}, err
	}
	current := strings.TrimPrefix(version.Version, "v")
	latest = strings.TrimPrefix(latest, "v")
	avail := versionLess(current, latest)
	return Result{
		Current:     version.Version,
		Latest:      latest,
		UpdateAvail: avail,
		Message:     updateMessage(avail, latest),
	}, nil
}

// Apply downloads and installs the latest release when newer than the running binary.
func Apply(repo string) (Result, error) {
	res, err := Check(repo)
	if err != nil {
		return res, err
	}
	if !res.UpdateAvail {
		res.Message = "already up to date"
		return res, nil
	}
	if version.Version == "dev" {
		return res, fmt.Errorf("cannot auto-update a dev build; install a release binary first")
	}

	assetName, err := assetNameForPlatform()
	if err != nil {
		return res, err
	}
	url, err := assetURL(repo, res.Latest, assetName)
	if err != nil {
		return res, err
	}

	exe, err := os.Executable()
	if err != nil {
		return res, err
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return res, err
	}

	tmpDir, err := os.MkdirTemp("", "spectre-update-*")
	if err != nil {
		return res, err
	}
	defer os.RemoveAll(tmpDir)

	archivePath := filepath.Join(tmpDir, assetName)
	if err := downloadFile(url, archivePath); err != nil {
		return res, err
	}

	binaryPath, err := extractBinary(archivePath, tmpDir)
	if err != nil {
		return res, err
	}

	newPath := exe + ".new"
	if err := copyFile(binaryPath, newPath); err != nil {
		return res, err
	}
	if err := os.Chmod(newPath, 0o755); err != nil {
		return res, err
	}
	if err := os.Rename(newPath, exe); err != nil {
		return res, fmt.Errorf("replace binary: %w (try running with appropriate permissions)", err)
	}

	res.Applied = true
	res.Message = fmt.Sprintf("updated to %s — restart SPECTRE to use the new binary", res.Latest)
	return res, nil
}

func updateMessage(avail bool, latest string) string {
	if !avail {
		return "already up to date"
	}
	return fmt.Sprintf("update available: %s", latest)
}

func fetchLatestTag(repo string) (string, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest(http.MethodGet, fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", repo), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "spectre-updater")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("github API: %s", resp.Status)
	}

	var info releaseInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return "", err
	}
	if info.TagName == "" {
		return "", fmt.Errorf("release has no tag")
	}
	return info.TagName, nil
}

func assetURL(repo, tag, assetName string) (string, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/tags/%s", repo, tag)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "spectre-updater")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("github API: %s", resp.Status)
	}

	var info releaseInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return "", err
	}
	for _, a := range info.Assets {
		if a.Name == assetName {
			return a.BrowserDownloadURL, nil
		}
	}
	return "", fmt.Errorf("asset %q not found in release %s", assetName, tag)
}

func assetNameForPlatform() (string, error) {
	arch := runtime.GOARCH
	switch arch {
	case "amd64":
		arch = "x86_64"
	case "arm64":
		arch = "arm64"
	default:
		return "", fmt.Errorf("unsupported arch: %s", runtime.GOARCH)
	}
	switch runtime.GOOS {
	case "linux":
		return fmt.Sprintf("spectre_linux_%s.tar.gz", arch), nil
	case "darwin":
		return fmt.Sprintf("spectre_darwin_%s.tar.gz", arch), nil
	case "windows":
		if runtime.GOARCH != "amd64" {
			return "", fmt.Errorf("windows/arm64 releases are not published")
		}
		return "spectre_windows_x86_64.zip", nil
	default:
		return "", fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}
}

func downloadFile(url, dest string) error {
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download: %s", resp.Status)
	}
	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, resp.Body)
	return err
}

func extractBinary(archivePath, destDir string) (string, error) {
	switch {
	case strings.HasSuffix(archivePath, ".tar.gz"):
		return extractTarGz(archivePath, destDir)
	case strings.HasSuffix(archivePath, ".zip"):
		return extractZip(archivePath, destDir)
	default:
		return "", fmt.Errorf("unsupported archive: %s", archivePath)
	}
}

func extractTarGz(path, destDir string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return "", err
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", err
		}
		name := filepath.Base(hdr.Name)
		if hdr.Typeflag != tar.TypeReg || (name != "spectre" && name != "spectre.exe") {
			continue
		}
		out := filepath.Join(destDir, name)
		w, err := os.OpenFile(out, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
		if err != nil {
			return "", err
		}
		if _, err := io.Copy(w, tr); err != nil {
			w.Close()
			return "", err
		}
		w.Close()
		return out, nil
	}
	return "", fmt.Errorf("spectre binary not found in archive")
}

func extractZip(path, destDir string) (string, error) {
	r, err := zip.OpenReader(path)
	if err != nil {
		return "", err
	}
	defer r.Close()
	for _, f := range r.File {
		name := filepath.Base(f.Name)
		if name != "spectre.exe" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return "", err
		}
		out := filepath.Join(destDir, name)
		w, err := os.OpenFile(out, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
		if err != nil {
			rc.Close()
			return "", err
		}
		_, copyErr := io.Copy(w, rc)
		rc.Close()
		w.Close()
		if copyErr != nil {
			return "", copyErr
		}
		return out, nil
	}
	return "", fmt.Errorf("spectre.exe not found in archive")
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

// versionLess returns true if a is older than b (semver-ish, strips leading v).
func versionLess(a, b string) bool {
	a = strings.TrimPrefix(strings.TrimSpace(a), "v")
	b = strings.TrimPrefix(strings.TrimSpace(b), "v")
	if a == b {
		return false
	}
	// Dev builds are always considered older than any release tag.
	if a == "dev" || a == "" {
		return b != ""
	}
	return a < b
}
