package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"spectre/internal/trace"
)

type traceRequestBody struct {
	Host string `json:"host"`
}

func (s *Server) handleTraceHost(w http.ResponseWriter, r *http.Request) {
	host := r.URL.Query().Get("host")
	if host == "" {
		writeError(w, http.StatusBadRequest, "INVALID_INPUT", "host query parameter required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()

	result, err := trace.RunLocal(ctx, host)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "TRACE_FAILED", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleConnectionTrace(w http.ResponseWriter, r *http.Request) {
	accountID := chi.URLParam(r, "id")
	conn, err := s.db.GetConnection(accountID)
	if err != nil {
		writeError(w, http.StatusNotFound, "NOT_FOUND", "Connection not found")
		return
	}

	target := conn.Host
	if r.Body != nil {
		var body traceRequestBody
		if decErr := json.NewDecoder(r.Body).Decode(&body); decErr == nil && body.Host != "" {
			target = body.Host
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	gateway := &trace.Gateway{
		Host:  conn.Host,
		Port:  conn.Port,
		Label: conn.Name + " (" + conn.Host + ":" + strconv.Itoa(conn.Port) + ")",
	}

	if sshConn, ok := s.sshMgr.GetByAccountID(accountID); ok && sshConn.Client != nil {
		result, err := trace.RunViaSSH(ctx, sshConn.Client, target, gateway)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "TRACE_FAILED", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, result)
		return
	}

	result, err := trace.RunLocal(ctx, target)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "TRACE_FAILED", err.Error())
		return
	}
	// Annotate that SSH was not active — trace ran locally to target.
	if len(result.Hops) > 0 {
		result.Via = "local"
	}
	writeJSON(w, http.StatusOK, result)
}
