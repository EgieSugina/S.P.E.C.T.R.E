package server

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"spectre/internal/proxy"
	"spectre/internal/store"
)

func (s *Server) handleListProxyChains(w http.ResponseWriter, r *http.Request) {
	chains, err := s.db.ListProxyChains()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, chains)
}

func (s *Server) handleCreateProxyChain(w http.ResponseWriter, r *http.Request) {
	var c store.ProxyChain
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	if c.Name == "" {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "name is required")
		return
	}
	if err := validateProxyChainHops(c.Hops); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	if err := s.db.CreateProxyChain(&c); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, c)
}

func (s *Server) handleGetProxyChain(w http.ResponseWriter, r *http.Request) {
	c, err := s.db.GetProxyChain(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Proxy chain not found")
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) handleUpdateProxyChain(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	existing, err := s.db.GetProxyChain(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Proxy chain not found")
		return
	}
	var input store.ProxyChain
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	if input.Name != "" {
		existing.Name = input.Name
	}
	if input.Hops != nil {
		if err := validateProxyChainHops(input.Hops); err != nil {
			writeError(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
			return
		}
		existing.Hops = input.Hops
	}
	if err := s.db.UpdateProxyChain(existing); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, existing)
}

func (s *Server) handleDeleteProxyChain(w http.ResponseWriter, r *http.Request) {
	if err := s.db.DeleteProxyChain(chi.URLParam(r, "id")); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func validateProxyChainHops(hops []store.ProxyChainHop) error {
	if len(hops) < 2 {
		return fmt.Errorf("proxy chain requires at least 2 hops")
	}
	for i, hop := range hops {
		switch hop.Type {
		case "tunnel":
			if hop.TunnelID == "" {
				return fmt.Errorf("hop %d: tunnel_id is required", i+1)
			}
		case "socks5":
			if hop.Host == "" || hop.Port <= 0 {
				return fmt.Errorf("hop %d: host and port are required", i+1)
			}
		default:
			return fmt.Errorf("hop %d: unsupported type %q (use tunnel or socks5)", i+1, hop.Type)
		}
	}
	return nil
}

func (s *Server) resolveProxyChain(chainID string, connAccountID string) ([]proxy.DialConfig, error) {
	chain, err := s.db.GetProxyChain(chainID)
	if err != nil {
		return nil, fmt.Errorf("proxy chain not found")
	}
	out := make([]proxy.DialConfig, 0, len(chain.Hops))
	for i, hop := range chain.Hops {
		switch hop.Type {
		case "tunnel":
			t, err := s.db.GetTunnel(hop.TunnelID)
			if err != nil {
				return nil, fmt.Errorf("hop %d: tunnel not found", i+1)
			}
			if t.ConnectionID == connAccountID {
				return nil, fmt.Errorf("hop %d: connection cannot use a chain containing its own tunnel", i+1)
			}
			if t.Type != "socks5" && t.Type != "dynamic" {
				return nil, fmt.Errorf("hop %d: tunnel must be SOCKS5 or dynamic", i+1)
			}
			bindAddr, err := s.tunnelMgr.BindAddr(hop.TunnelID)
			if err != nil {
				return nil, fmt.Errorf("hop %d: tunnel %q is not running", i+1, t.Name)
			}
			host, portStr, err := net.SplitHostPort(bindAddr)
			if err != nil {
				return nil, fmt.Errorf("hop %d: invalid bind address", i+1)
			}
			port, err := strconv.Atoi(portStr)
			if err != nil {
				return nil, fmt.Errorf("hop %d: invalid bind port", i+1)
			}
			out = append(out, proxy.DialConfig{Type: "socks5", Host: host, Port: port})
		case "socks5":
			out = append(out, proxy.DialConfig{Type: "socks5", Host: hop.Host, Port: hop.Port})
		default:
			return nil, fmt.Errorf("hop %d: unsupported type %q", i+1, hop.Type)
		}
	}
	return out, nil
}
