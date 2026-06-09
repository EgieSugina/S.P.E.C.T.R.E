package server

import (
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"spectre/internal/crypto"
	"spectre/internal/ssh"
	"spectre/internal/store"
)

func (s *Server) handleListKeys(w http.ResponseWriter, r *http.Request) {
	keys, err := s.db.ListKeys()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, keys)
}

func (s *Server) handleGenerateKey(w http.ResponseWriter, r *http.Request) {
	if s.vault.IsLocked() {
		writeError(w, http.StatusForbidden, "VAULT_LOCKED", "Unlock vault before managing keys")
		return
	}

	var req struct {
		Name       string `json:"name"`
		Type       string `json:"type"`
		Bits       int    `json:"bits"`
		Passphrase string `json:"passphrase"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "name is required")
		return
	}

	keyType := normalizeKeyType(req.Type)
	bits := req.Bits
	if bits == 0 {
		bits = 4096
	}

	privatePEM, publicSSH, fingerprint, err := ssh.GenerateKey(keyType, bits)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}

	if req.Passphrase != "" {
		signer, err := crypto.ParsePrivateKey(privatePEM, "")
		if err != nil {
			writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
			return
		}
		encrypted, err := crypto.MarshalPrivateKeyWithPassphrase(signer, req.Passphrase)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
			return
		}
		privatePEM = encrypted
	}

	privEnc, err := s.vault.Encrypt(privatePEM)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}

	key := store.SSHKey{
		Name:          req.Name,
		Type:          keyType,
		PublicKey:     publicSSH,
		PrivateKeyEnc: privEnc,
		Fingerprint:   fingerprint,
	}
	if req.Passphrase != "" {
		ppEnc, err := s.vault.Encrypt(req.Passphrase)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
			return
		}
		key.PassphraseEnc = ppEnc
	}

	if err := s.db.CreateKey(&key); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, key)
}

func (s *Server) handleImportKey(w http.ResponseWriter, r *http.Request) {
	if s.vault.IsLocked() {
		writeError(w, http.StatusForbidden, "VAULT_LOCKED", "Unlock vault before managing keys")
		return
	}

	name, pemData, passphrase, err := parseKeyImport(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}

	publicSSH, fingerprint, keyType, err := crypto.InspectPrivateKey(pemData, passphrase)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "invalid private key: "+err.Error())
		return
	}

	privEnc, err := s.vault.Encrypt(pemData)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}

	key := store.SSHKey{
		Name:          name,
		Type:          keyType,
		PublicKey:     publicSSH,
		PrivateKeyEnc: privEnc,
		Fingerprint:   fingerprint,
	}
	if passphrase != "" {
		ppEnc, err := s.vault.Encrypt(passphrase)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
			return
		}
		key.PassphraseEnc = ppEnc
	}

	if err := s.db.CreateKey(&key); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, key)
}

func parseKeyImport(r *http.Request) (name, pemData, passphrase string, err error) {
	ct := r.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "multipart/form-data") {
		return parseKeyImportMultipart(r)
	}

	var req struct {
		Name       string `json:"name"`
		PEM        string `json:"pem"`
		Passphrase string `json:"passphrase"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return "", "", "", err
	}
	name = strings.TrimSpace(req.Name)
	pemData = strings.TrimSpace(req.PEM)
	passphrase = req.Passphrase
	if name == "" {
		return "", "", "", fmt.Errorf("name is required")
	}
	if pemData == "" {
		return "", "", "", fmt.Errorf("pem is required")
	}
	return name, pemData, passphrase, nil
}

func parseKeyImportMultipart(r *http.Request) (name, pemData, passphrase string, err error) {
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		return "", "", "", err
	}
	name = strings.TrimSpace(r.FormValue("name"))
	passphrase = r.FormValue("passphrase")
	if name == "" {
		return "", "", "", fmt.Errorf("name is required")
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		return "", "", "", fmt.Errorf("file is required")
	}
	defer file.Close()
	data, err := readMultipartFile(file)
	if err != nil {
		return "", "", "", err
	}
	return name, string(data), passphrase, nil
}

func readMultipartFile(f multipart.File) ([]byte, error) {
	const maxSize = 64 << 10
	return io.ReadAll(io.LimitReader(f, maxSize))
}

func (s *Server) handleGetKeyPublic(w http.ResponseWriter, r *http.Request) {
	key, err := s.db.GetKey(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Key not found")
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.pub"`, sanitizeFilename(key.Name)))
	_, _ = w.Write([]byte(strings.TrimSpace(key.PublicKey) + "\n"))
}

func (s *Server) handleDeleteKey(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	count, err := s.db.CountConnectionsUsingKey(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	if count > 0 {
		writeError(w, http.StatusConflict, "KEY_IN_USE", fmt.Sprintf("key is used by %d connection(s)", count))
		return
	}
	if err := s.db.DeleteKey(id); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func normalizeKeyType(t string) string {
	switch strings.ToLower(strings.TrimSpace(t)) {
	case "ed25519":
		return "ed25519"
	case "rsa2048", "rsa-2048":
		return "rsa2048"
	case "rsa", "rsa4096", "rsa-4096", "":
		return "rsa4096"
	default:
		return "rsa4096"
	}
}

func sanitizeFilename(name string) string {
	name = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return '_'
	}, name)
	if name == "" {
		return "key"
	}
	return name
}
