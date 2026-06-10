package server

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	pkgsftp "github.com/pkg/sftp"

	"spectre/internal/config"
	"spectre/internal/crypto"
	"spectre/internal/rdp"
	"spectre/internal/sftp"
	"spectre/internal/ssh"
	"spectre/internal/store"
	"spectre/internal/tunnel"
	"spectre/internal/version"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Server struct {
	bind      string
	port      int
	token     string
	configDir string
	db        *store.DB
	vault     *crypto.Vault
	sshMgr    *ssh.Manager
	rdpMgr    *rdp.Manager
	sftpMgr   *sftp.Manager
	tunnelMgr *tunnel.Manager
	uploadQ   *sftp.UploadQueue
	sftpHub    *sftpWSHub
	systemHub  *systemWSHub
	tunnelsHub *tunnelsWSHub
	httpSrv    *http.Server
}

func New(bind string, port int, configDir string) (*Server, error) {
	if configDir == "" {
		home, _ := os.UserHomeDir()
		configDir = filepath.Join(home, ".spectre")
	}
	db, err := store.New(configDir)
	if err != nil {
		return nil, err
	}
	token, err := loadOrGenerateToken(configDir)
	if err != nil {
		return nil, err
	}
	maxConc := 3
	if v, err := db.GetSetting("upload_max_concurrent"); err == nil {
		if n, e := strconv.Atoi(v); e == nil && n >= 1 && n <= 10 {
			maxConc = n
		}
	}
	srv := &Server{
		bind:      bind,
		port:      port,
		token:     token,
		configDir: configDir,
		db:        db,
		vault:     crypto.NewVault(),
		sshMgr:    ssh.NewManager(),
		rdpMgr:    rdp.NewManager(),
		sftpMgr:   sftp.NewManager(),
		uploadQ:   sftp.NewUploadQueue(maxConc),
		sftpHub:    newSFTPWSHub(),
		systemHub:  newSystemWSHub(),
		tunnelsHub: newTunnelsWSHub(),
	}
	srv.sshMgr.SetHostKeyCallback(ssh.NewHostKeyCallback(db))
	srv.sshMgr.SetConnectionLostHandler(func(accountID, connID, reason string) {
		srv.sftpMgr.Remove(connID)
		srv.systemHub.Emit(map[string]interface{}{
			"type":          "connection_down",
			"connection_id": accountID,
			"conn_id":       connID,
			"reason":        reason,
			"protocol":      "ssh",
		})
	})
	srv.rdpMgr.SetConnectionLostHandler(func(accountID, connID, reason string) {
		srv.systemHub.Emit(map[string]interface{}{
			"type":          "connection_down",
			"connection_id": accountID,
			"conn_id":       connID,
			"reason":        reason,
			"protocol":      "rdp",
		})
	})
	srv.tunnelMgr = tunnel.NewManager(srv.ensureSSHForTunnel)
	return srv, nil
}

func loadOrGenerateToken(configDir string) (string, error) {
	tokenPath := filepath.Join(configDir, "session.token")
	if data, err := os.ReadFile(tokenPath); err == nil && len(data) > 0 {
		return strings.TrimSpace(string(data)), nil
	}
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	token := base64.URLEncoding.EncodeToString(buf)
	if err := os.WriteFile(tokenPath, []byte(token), 0o600); err != nil {
		return "", err
	}
	return token, nil
}

func (s *Server) Token() string { return s.token }

func (s *Server) Start(ctx context.Context) error {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Logger)

	r.Get("/api/auth/token", s.handleAuthToken)
	r.Get("/api/auth/session", s.handleAuthToken)

	r.Group(func(r chi.Router) {
		r.Use(s.authMiddleware)
		r.Route("/api", func(r chi.Router) {
			r.Get("/connections", s.handleListConnections)
			r.Post("/connections", s.handleCreateConnection)
			r.Get("/connections/{id}", s.handleGetConnection)
			r.Put("/connections/{id}", s.handleUpdateConnection)
			r.Delete("/connections/{id}", s.handleDeleteConnection)
			r.Post("/connections/{id}/connect", s.handleConnect)
			r.Post("/connections/{id}/disconnect", s.handleDisconnect)
			r.Get("/connections/{id}/status", s.handleConnectionStatus)
			r.Post("/connections/{id}/trace", s.handleConnectionTrace)
			r.Get("/trace", s.handleTraceHost)
			r.Post("/connections/import", s.handleImportConnections)
			r.Get("/connections/export", s.handleExportConnections)

			r.Get("/groups", s.handleListGroups)
			r.Post("/groups", s.handleCreateGroup)
			r.Put("/groups/{id}", s.handleUpdateGroup)
			r.Delete("/groups/{id}", s.handleDeleteGroup)

			r.Get("/known-hosts", s.handleListKnownHosts)
			r.Post("/known-hosts/trust", s.handleTrustKnownHost)
			r.Delete("/known-hosts/{id}", s.handleDeleteKnownHost)

			r.Get("/keys", s.handleListKeys)
			r.Post("/keys/generate", s.handleGenerateKey)
			r.Post("/keys/import", s.handleImportKey)
			r.Get("/keys/{id}/public", s.handleGetKeyPublic)
			r.Delete("/keys/{id}", s.handleDeleteKey)

			r.Get("/sessions", s.handleListSessions)
			r.Post("/sessions", s.handleCreateSession)
			r.Get("/sessions/{id}", s.handleGetSession)
			r.Delete("/sessions/{id}", s.handleKillSession)

			r.Get("/rdp/sessions", s.handleListRdpSessions)
			r.Post("/rdp/sessions", s.handleCreateRdpSession)
			r.Get("/rdp/sessions/{id}", s.handleGetRdpSession)
			r.Delete("/rdp/sessions/{id}", s.handleKillRdpSession)

			r.Get("/sftp/{connID}/list", s.handleSFTPList)
			r.Get("/sftp/{connID}/home", s.handleSFTPHome)
			r.Get("/sftp/{connID}/stat", s.handleSFTPStat)
			r.Post("/sftp/{connID}/upload", s.handleSFTPUpload)
			r.Get("/sftp/{connID}/download", s.handleSFTPDownload)
			r.Post("/sftp/{connID}/mkdir", s.handleSFTPMkdir)
			r.Delete("/sftp/{connID}/delete", s.handleSFTPDelete)
			r.Post("/sftp/{connID}/rename", s.handleSFTPRename)

			r.Get("/tunnels", s.handleListTunnels)
			r.Post("/tunnels", s.handleCreateTunnel)
			r.Get("/tunnels/{id}", s.handleGetTunnel)
			r.Put("/tunnels/{id}", s.handleUpdateTunnel)
			r.Delete("/tunnels/{id}", s.handleDeleteTunnel)
			r.Post("/tunnels/{id}/start", s.handleStartTunnel)
			r.Post("/tunnels/{id}/stop", s.handleStopTunnel)
			r.Get("/tunnels/{id}/stats", s.handleTunnelStats)

			r.Get("/proxy-chains", s.handleListProxyChains)
			r.Post("/proxy-chains", s.handleCreateProxyChain)
			r.Get("/proxy-chains/{id}", s.handleGetProxyChain)
			r.Put("/proxy-chains/{id}", s.handleUpdateProxyChain)
			r.Delete("/proxy-chains/{id}", s.handleDeleteProxyChain)

			r.Get("/settings", s.handleGetSettings)
			r.Put("/settings", s.handleUpdateSettings)

			r.Post("/vault/unlock", s.handleVaultUnlock)
			r.Post("/vault/lock", s.handleVaultLock)
			r.Get("/vault/status", s.handleVaultStatus)
			r.Post("/vault/setup", s.handleVaultSetup)

			r.Get("/system/status", s.handleSystemStatus)
			r.Get("/system/version", s.handleSystemVersion)
		})
	})

	r.Get("/ws/terminal/{sessionID}", s.handleTerminalWS)
	r.Get("/ws/rdp/{sessionID}", s.handleRdpWS)
	r.Get("/ws/sftp/{connID}", s.handleSFTPWS)
	r.Get("/ws/tunnels", s.handleTunnelsWS)
	r.Get("/ws/system", s.handleSystemWS)

	go s.runUploadProgressBroadcast()
	go s.runTunnelStatsBroadcast()

	r.Handle("/*", ServeFrontend())

	addr := fmt.Sprintf("%s:%d", s.bind, s.port)
	s.httpSrv = &http.Server{Addr: addr, Handler: r}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = s.httpSrv.Shutdown(shutdownCtx)
	}()
	fmt.Printf("[SPECTRE] Listening on http://%s\n", addr)
	fmt.Printf("[SPECTRE] Session token: %s\n", s.token)
	return s.httpSrv.ListenAndServe()
}

func (s *Server) handleAuthToken(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"token": s.token})
}

func (s *Server) sanitizeConnection(c *store.Connection) {
	c.Password = ""
	c.Passphrase = ""
	c.PasswordEnc = ""
	c.PassphraseEnc = ""
}

func (s *Server) handleListConnections(w http.ResponseWriter, r *http.Request) {
	conns, err := s.db.ListConnections()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	for i := range conns {
		s.sanitizeConnection(&conns[i])
	}
	writeJSON(w, http.StatusOK, conns)
}

func (s *Server) handleCreateConnection(w http.ResponseWriter, r *http.Request) {
	var conn store.Connection
	if err := json.NewDecoder(r.Body).Decode(&conn); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	if conn.AuthType == "" {
		conn.AuthType = "password"
	}
	if conn.Protocol == "" {
		conn.Protocol = "ssh"
	}
	if err := s.validateConnectionCredentials(&conn); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	if err := s.validateProxyConfig(&conn); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	if err := s.encryptConnectionSecrets(&conn); err != nil {
		writeError(w, http.StatusForbidden, "VAULT_LOCKED", "Unlock vault before saving credentials")
		return
	}
	if err := s.db.CreateConnection(&conn); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	s.sanitizeConnection(&conn)
	writeJSON(w, http.StatusCreated, conn)
}

func (s *Server) handleGetConnection(w http.ResponseWriter, r *http.Request) {
	conn, err := s.db.GetConnection(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Connection not found")
		return
	}
	s.sanitizeConnection(conn)
	writeJSON(w, http.StatusOK, conn)
}

func (s *Server) handleUpdateConnection(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	existing, err := s.db.GetConnection(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Connection not found")
		return
	}
	var input store.Connection
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	existing.Name = input.Name
	if input.Protocol != "" {
		existing.Protocol = input.Protocol
	}
	existing.Host = input.Host
	existing.Port = input.Port
	existing.Username = input.Username
	existing.Domain = input.Domain
	existing.AuthType = input.AuthType
	existing.RdpWidth = input.RdpWidth
	existing.RdpHeight = input.RdpHeight
	existing.GroupID = input.GroupID
	existing.Tags = input.Tags
	existing.Notes = input.Notes
	existing.KeepAliveInterval = input.KeepAliveInterval
	existing.PrivateKeyID = input.PrivateKeyID
	existing.ProxyTunnelID = input.ProxyTunnelID
	existing.ProxyChainID = input.ProxyChainID
	existing.ProxyType = input.ProxyType
	existing.ProxyHost = input.ProxyHost
	existing.ProxyPort = input.ProxyPort
	if err := s.validateProxyConfig(existing); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	if input.Password != "" {
		existing.Password = input.Password
	}
	if input.Passphrase != "" {
		existing.Passphrase = input.Passphrase
	}
	if err := s.encryptConnectionSecrets(existing); err != nil {
		writeError(w, http.StatusForbidden, "VAULT_LOCKED", err.Error())
		return
	}
	if err := s.db.UpdateConnection(existing); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	s.sanitizeConnection(existing)
	writeJSON(w, http.StatusOK, existing)
}

func (s *Server) handleDeleteConnection(w http.ResponseWriter, r *http.Request) {
	if err := s.db.DeleteConnection(chi.URLParam(r, "id")); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) connectionHasEncryptedSecrets(conn *store.Connection) bool {
	if conn.PasswordEnc != "" || conn.PassphraseEnc != "" {
		return true
	}
	return conn.PrivateKeyID != nil && *conn.PrivateKeyID != ""
}

func (s *Server) validateConnectionCredentials(conn *store.Connection) error {
	if connectionProtocol(conn) == "rdp" {
		if conn.Password == "" && conn.PasswordEnc == "" {
			return fmt.Errorf("password is required for RDP")
		}
		return nil
	}
	authType := conn.AuthType
	if authType == "" {
		authType = "password"
	}
	switch authType {
	case "password":
		if conn.Password == "" {
			return fmt.Errorf("password is required for password authentication")
		}
	case "key", "private_key":
		if conn.PrivateKeyID == nil || *conn.PrivateKeyID == "" {
			return fmt.Errorf("private key is required for key authentication")
		}
	}
	return nil
}

func (s *Server) buildAccountConfig(conn *store.Connection) (*ssh.AccountConfig, error) {
	cfg := &ssh.AccountConfig{
		Host:     conn.Host,
		Port:     conn.Port,
		Username: conn.Username,
	}

	if s.vault.IsLocked() {
		if s.connectionHasEncryptedSecrets(conn) {
			return nil, fmt.Errorf("unlock vault before connecting")
		}
	} else {
		if conn.PasswordEnc != "" {
			pw, err := s.vault.Decrypt(conn.PasswordEnc)
			if err != nil {
				return nil, err
			}
			cfg.Password = pw
		}
		if conn.PassphraseEnc != "" {
			pp, err := s.vault.Decrypt(conn.PassphraseEnc)
			if err != nil {
				return nil, err
			}
			cfg.Passphrase = pp
		}
		if conn.PrivateKeyID != nil && *conn.PrivateKeyID != "" {
			var key store.SSHKey
			if err := s.db.First(&key, "id = ?", *conn.PrivateKeyID).Error; err != nil {
				return nil, fmt.Errorf("private key not found")
			}
			if key.PrivateKeyEnc == "" {
				return nil, fmt.Errorf("no private key configured")
			}
			pk, err := s.vault.Decrypt(key.PrivateKeyEnc)
			if err != nil {
				return nil, err
			}
			cfg.PrivateKey = pk
			if key.PassphraseEnc != "" {
				pp, err := s.vault.Decrypt(key.PassphraseEnc)
				if err != nil {
					return nil, err
				}
				cfg.Passphrase = pp
			}
		}
	}

	if !ssh.HasAuthMethods(cfg) {
		return nil, fmt.Errorf("no credentials configured")
	}
	proxyCfg, proxyChain, err := s.resolveProxyConfig(conn)
	if err != nil {
		return nil, err
	}
	cfg.Proxy = proxyCfg
	cfg.ProxyChain = proxyChain
	return cfg, nil
}

func (s *Server) handleConnect(w http.ResponseWriter, r *http.Request) {
	conn, err := s.db.GetConnection(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Connection not found")
		return
	}

	var connID string
	proto := connectionProtocol(conn)

	switch proto {
	case "rdp":
		cfg, err := s.buildRdpAccountConfig(conn)
		if err != nil {
			code, status := "AUTH_FAILED", http.StatusUnauthorized
			if strings.Contains(strings.ToLower(err.Error()), "vault") {
				code, status = "VAULT_LOCKED", http.StatusForbidden
			}
			writeError(w, status, code, err.Error())
			return
		}
		connID, err = s.rdpMgr.Connect(conn.ID, cfg)
		if err != nil {
			writeErrorWithDetails(w, http.StatusBadGateway, "HOST_UNREACHABLE", err.Error(), map[string]interface{}{
				"detail":   err.Error(),
				"protocol": "rdp",
			})
			return
		}
	default:
		cfg, err := s.buildAccountConfig(conn)
		if err != nil {
			code, status := "AUTH_FAILED", http.StatusUnauthorized
			errMsg := strings.ToLower(err.Error())
			switch {
			case strings.Contains(errMsg, "vault"):
				code, status = "VAULT_LOCKED", http.StatusForbidden
			case strings.Contains(errMsg, "proxy"), strings.Contains(errMsg, "tunnel"):
				code, status = "PROXY_FAILED", http.StatusBadGateway
			}
			writeError(w, status, code, err.Error())
			return
		}
		connID, err = s.sshMgr.Connect(conn.ID, cfg)
		if err != nil {
			var mismatch *ssh.HostKeyMismatchError
			if errors.As(err, &mismatch) {
				writeErrorWithDetails(w, http.StatusConflict, "HOST_KEY_MISMATCH", err.Error(), map[string]interface{}{
					"host":                  mismatch.Host,
					"port":                  mismatch.Port,
					"expected_fingerprint":  mismatch.Expected,
					"received_fingerprint":  mismatch.Received,
					"received_key":          mismatch.ReceivedKey,
					"key_type":              mismatch.KeyType,
				})
				return
			}
			code, message := ssh.ClassifyConnectError(err)
			writeErrorWithDetails(w, httpStatusForConnectCode(code), code, message, map[string]interface{}{
				"detail": err.Error(),
			})
			return
		}
	}

	_ = s.db.TouchLastConnected(conn.ID)
	s.systemHub.Emit(map[string]interface{}{
		"type":          "connection_up",
		"connection_id": conn.ID,
		"name":          conn.Name,
		"protocol":      proto,
	})
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"conn_id":  connID,
		"status":   "connected",
		"protocol": proto,
	})
}

func (s *Server) handleDisconnect(w http.ResponseWriter, r *http.Request) {
	accountID := chi.URLParam(r, "id")
	dbConn, dbErr := s.db.GetConnection(accountID)
	proto := "ssh"
	if dbErr == nil {
		proto = connectionProtocol(dbConn)
	}

	if proto == "rdp" {
		conn, ok := s.rdpMgr.GetByAccountID(accountID)
		if !ok {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "No active connection")
			return
		}
		if err := s.rdpMgr.Disconnect(conn.ID); err != nil {
			writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
			return
		}
	} else {
		conn, ok := s.sshMgr.GetByAccountID(accountID)
		if !ok {
			writeError(w, http.StatusNotFound, "NOT_FOUND", "No active connection")
			return
		}
		s.sftpMgr.Remove(conn.ID)
		if err := s.sshMgr.Disconnect(conn.ID); err != nil {
			writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
			return
		}
	}
	s.systemHub.Emit(map[string]interface{}{
		"type":          "connection_down",
		"connection_id": accountID,
		"reason":        "user_disconnect",
		"protocol":      proto,
	})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleConnectionStatus(w http.ResponseWriter, r *http.Request) {
	accountID := chi.URLParam(r, "id")
	dbConn, err := s.db.GetConnection(accountID)
	proto := "ssh"
	if err == nil {
		proto = connectionProtocol(dbConn)
	}

	if proto == "rdp" {
		conn, ok := s.rdpMgr.GetByAccountID(accountID)
		if !ok {
			writeJSON(w, http.StatusOK, map[string]string{"status": "disconnected", "protocol": "rdp"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":   conn.State,
			"conn_id":  conn.ID,
			"since":    conn.ConnectedAt,
			"protocol": "rdp",
		})
		return
	}

	conn, ok := s.sshMgr.GetByAccountID(accountID)
	if !ok {
		writeJSON(w, http.StatusOK, map[string]string{"status": "disconnected", "protocol": "ssh"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":   conn.State,
		"conn_id":  conn.ID,
		"since":    conn.ConnectedAt,
		"protocol": "ssh",
	})
}

func (s *Server) handleImportConnections(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	salt, _ := s.db.GetVaultSalt()
	masterPw := r.Header.Get("X-SPECTRE-Master")
	count, err := config.ImportJSON(s.db, body, masterPw, salt)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"imported": count})
}

func (s *Server) handleExportConnections(w http.ResponseWriter, r *http.Request) {
	format := r.URL.Query().Get("format")
	if format == "" {
		format = "json"
	}
	salt, _ := s.db.GetVaultSalt()
	masterPw := r.Header.Get("X-SPECTRE-Master")
	data, contentType, err := config.ExportJSON(s.db, format, masterPw, salt)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=spectre-export.%s", format))
	w.Write(data)
}

func httpStatusForConnectCode(code string) int {
	switch code {
	case "AUTH_FAILED":
		return http.StatusUnauthorized
	case "VAULT_LOCKED":
		return http.StatusForbidden
	case "HOST_KEY_MISMATCH":
		return http.StatusConflict
	default:
		return http.StatusBadGateway
	}
}

func (s *Server) encryptConnectionSecrets(conn *store.Connection) error {
	if conn.Password != "" {
		if s.vault.IsLocked() {
			return fmt.Errorf("vault locked")
		}
		enc, err := s.vault.Encrypt(conn.Password)
		if err != nil {
			return err
		}
		conn.PasswordEnc = enc
		conn.Password = ""
	}
	if conn.Passphrase != "" {
		if s.vault.IsLocked() {
			return fmt.Errorf("vault locked")
		}
		enc, err := s.vault.Encrypt(conn.Passphrase)
		if err != nil {
			return err
		}
		conn.PassphraseEnc = enc
		conn.Passphrase = ""
	}
	return nil
}

func (s *Server) handleListGroups(w http.ResponseWriter, r *http.Request) {
	groups, err := s.db.ListGroups()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, groups)
}

func (s *Server) handleCreateGroup(w http.ResponseWriter, r *http.Request) {
	var g store.Group
	if err := json.NewDecoder(r.Body).Decode(&g); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	if err := s.db.CreateGroup(&g); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, g)
}

func (s *Server) handleUpdateGroup(w http.ResponseWriter, r *http.Request) {
	g, err := s.db.GetGroup(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Group not found")
		return
	}
	if err := json.NewDecoder(r.Body).Decode(g); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	if err := s.db.UpdateGroup(g); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, g)
}

func (s *Server) handleDeleteGroup(w http.ResponseWriter, r *http.Request) {
	if err := s.db.DeleteGroup(chi.URLParam(r, "id")); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.sshMgr.ListSessions())
}

func (s *Server) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ConnID string `json:"conn_id"`
		Cols   int    `json:"cols"`
		Rows   int    `json:"rows"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	session, err := s.sshMgr.CreateTerminalSession(req.ConnID, req.Cols, req.Rows)
	if err != nil {
		code, message := "CONNECTION_LOST", "SSH connection is no longer active"
		if strings.Contains(strings.ToLower(err.Error()), "not active") {
			writeError(w, http.StatusBadGateway, code, message)
		} else {
			writeError(w, http.StatusBadGateway, "HOST_UNREACHABLE", err.Error())
		}
		return
	}
	s.systemHub.Emit(map[string]interface{}{
		"type":       "session_created",
		"session_id": session.ID,
		"conn_id":    session.ConnID,
	})
	writeJSON(w, http.StatusCreated, map[string]string{"session_id": session.ID, "conn_id": session.ConnID})
}

func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request) {
	session, ok := s.sshMgr.GetSession(chi.URLParam(r, "id"))
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Session not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"id":      session.ID,
		"conn_id": session.ConnID,
	})
}

func (s *Server) handleKillSession(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	if err := s.sshMgr.KillSession(sessionID); err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", err.Error())
		return
	}
	s.systemHub.Emit(map[string]interface{}{
		"type":       "session_destroyed",
		"session_id": sessionID,
	})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) getSFTPClient(w http.ResponseWriter, r *http.Request) (*pkgsftp.Client, string, bool) {
	connID := chi.URLParam(r, "connID")
	conn, ok := s.sshMgr.GetConnection(connID)
	if !ok {
		writeError(w, http.StatusBadGateway, "CONNECTION_LOST", "SSH connection is no longer active")
		return nil, "", false
	}
	client, err := s.sftpMgr.GetOrCreate(connID, conn.Client)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return nil, "", false
	}
	return client, connID, true
}

func (s *Server) handleSFTPHome(w http.ResponseWriter, r *http.Request) {
	connID := chi.URLParam(r, "connID")
	conn, ok := s.sshMgr.GetConnection(connID)
	if !ok {
		writeError(w, http.StatusBadGateway, "CONNECTION_LOST", "SSH connection is no longer active")
		return
	}
	client, err := s.sftpMgr.GetOrCreate(connID, conn.Client)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"path": sftp.ResolveHomeDir(client, conn.Client),
	})
}

func (s *Server) handleSFTPList(w http.ResponseWriter, r *http.Request) {
	client, _, ok := s.getSFTPClient(w, r)
	if !ok {
		return
	}
	path := r.URL.Query().Get("path")
	if path == "" {
		path = "/"
	}
	entries, err := sftp.ListDirectory(client, path)
	if err != nil {
		writeError(w, http.StatusBadGateway, "SFTP_PERMISSION", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, entries)
}

func (s *Server) handleSFTPStat(w http.ResponseWriter, r *http.Request) {
	client, _, ok := s.getSFTPClient(w, r)
	if !ok {
		return
	}
	entry, err := sftp.StatFile(client, r.URL.Query().Get("path"))
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, entry)
}

func (s *Server) handleSFTPUpload(w http.ResponseWriter, r *http.Request) {
	client, connID, ok := s.getSFTPClient(w, r)
	if !ok {
		return
	}
	if err := r.ParseMultipartForm(64 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	remotePath := r.FormValue("path")
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	defer file.Close()
	if remotePath == "" {
		remotePath = "/" + header.Filename
	}
	jobID := r.FormValue("job_id")
	if jobID == "" {
		jobID = uuid.New().String()
	}
	if err := sftp.EnsureRemoteDir(client, remotePath); err != nil {
		writeError(w, http.StatusBadGateway, "SFTP_PERMISSION", err.Error())
		return
	}
	s.sftpHub.RegisterJob(jobID, connID)
	job := &sftp.UploadJob{
		ID:         jobID,
		RemotePath: remotePath,
		Size:       header.Size,
	}
	if err := s.uploadQ.Upload(client, job, file); err != nil {
		writeError(w, http.StatusBadGateway, "SFTP_PERMISSION", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"bytes": job.Progress, "path": remotePath, "job_id": jobID})
}

func (s *Server) handleSFTPDownload(w http.ResponseWriter, r *http.Request) {
	client, _, ok := s.getSFTPClient(w, r)
	if !ok {
		return
	}
	path := r.URL.Query().Get("path")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filepath.Base(path)))
	if err := sftp.DownloadFile(client, path, w); err != nil {
		writeError(w, http.StatusBadGateway, "SFTP_PERMISSION", err.Error())
	}
}

func (s *Server) handleSFTPMkdir(w http.ResponseWriter, r *http.Request) {
	client, _, ok := s.getSFTPClient(w, r)
	if !ok {
		return
	}
	var req struct{ Path string `json:"path"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	if err := sftp.Mkdir(client, req.Path); err != nil {
		writeError(w, http.StatusBadGateway, "SFTP_PERMISSION", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleSFTPDelete(w http.ResponseWriter, r *http.Request) {
	client, _, ok := s.getSFTPClient(w, r)
	if !ok {
		return
	}
	var req struct{ Path string `json:"path"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	if err := sftp.Delete(client, req.Path); err != nil {
		writeError(w, http.StatusBadGateway, "SFTP_PERMISSION", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleSFTPRename(w http.ResponseWriter, r *http.Request) {
	client, _, ok := s.getSFTPClient(w, r)
	if !ok {
		return
	}
	var req struct {
		From string `json:"from"`
		To   string `json:"to"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	if err := sftp.Rename(client, req.From, req.To); err != nil {
		writeError(w, http.StatusBadGateway, "SFTP_PERMISSION", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := s.db.GetAllSettings()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

func (s *Server) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	var settings map[string]string
	if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	for k, v := range settings {
		if err := s.db.SetSetting(k, v); err != nil {
			writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
			return
		}
	}
	if v, ok := settings["upload_max_concurrent"]; ok {
		if n, err := strconv.Atoi(v); err == nil {
			s.uploadQ.SetMaxConcurrent(n)
		}
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleVaultUnlock(w http.ResponseWriter, r *http.Request) {
	var req struct{ Password string `json:"password"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	salt, err := s.db.GetVaultSalt()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	hash, _ := s.db.GetVaultHash()
	if hash != "" && !crypto.VerifyMasterPassword(req.Password, salt, hash) {
		writeError(w, http.StatusUnauthorized, "AUTH_FAILED", "Invalid master password")
		return
	}
	if err := s.vault.Unlock(req.Password, salt); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"unlocked": true})
}

func (s *Server) handleVaultLock(w http.ResponseWriter, r *http.Request) {
	s.vault.Lock()
	writeJSON(w, http.StatusOK, map[string]bool{"locked": true})
}

func (s *Server) handleVaultStatus(w http.ResponseWriter, r *http.Request) {
	hash, _ := s.db.GetVaultHash()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"locked":    s.vault.IsLocked(),
		"configured": hash != "",
	})
}

func (s *Server) handleVaultSetup(w http.ResponseWriter, r *http.Request) {
	var req struct{ Password string `json:"password"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "Invalid request body")
		return
	}
	if req.Password == "" {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "Password is required")
		return
	}
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "Password must be at least 8 characters")
		return
	}
	existingHash, _ := s.db.GetVaultHash()
	if existingHash != "" {
		writeError(w, http.StatusConflict, "ALREADY_CONFIGURED", "Vault already configured — use unlock instead")
		return
	}
	salt, err := s.db.GetVaultSalt()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	hash := crypto.HashMasterPassword(req.Password, salt)
	if err := s.db.SetVaultHash(hash); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	if err := s.vault.Unlock(req.Password, salt); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"configured": true})
}

func (s *Server) handleSystemStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"version":     version.Version,
		"connections": len(s.sshMgr.ListConnections()),
		"sessions":    len(s.sshMgr.ListSessions()),
		"uptime":      time.Now().Format(time.RFC3339),
	})
}

func (s *Server) handleSystemVersion(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"version": version.Version})
}

func (s *Server) runUploadProgressBroadcast() {
	for p := range s.uploadQ.ProgressChannel() {
		s.sftpHub.HandleProgress(p)
	}
}

func (s *Server) handleSFTPWS(w http.ResponseWriter, r *http.Request) {
	connID := chi.URLParam(r, "connID")
	token := r.URL.Query().Get("token")
	if token != s.token {
		writeError(w, http.StatusUnauthorized, "AUTH_FAILED", "Invalid token")
		return
	}
	if _, ok := s.sshMgr.GetConnection(connID); !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Connection not active")
		return
	}
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	s.sftpHub.AddClient(connID, ws)
	defer s.sftpHub.RemoveClient(connID, ws)
	for {
		if _, _, err := ws.ReadMessage(); err != nil {
			return
		}
	}
}

func (s *Server) handleSystemWS(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token != s.token {
		writeError(w, http.StatusUnauthorized, "AUTH_FAILED", "Invalid token")
		return
	}
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	s.systemHub.AddClient(ws)
	defer s.systemHub.RemoveClient(ws)
	for {
		if _, _, err := ws.ReadMessage(); err != nil {
			return
		}
	}
}

func (s *Server) handleTerminalWS(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	token := r.URL.Query().Get("token")
	if token != s.token {
		writeError(w, http.StatusUnauthorized, "AUTH_FAILED", "Invalid token")
		return
	}
	session, ok := s.sshMgr.GetSession(sessionID)
	if !ok {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Session not found")
		return
	}
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	session.AttachWebSocket(ws)
	defer session.DetachWebSocket()
	for {
		_, msg, err := ws.ReadMessage()
		if err != nil {
			return
		}
		_ = session.HandleMessage(msg)
	}
}
