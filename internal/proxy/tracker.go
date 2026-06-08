package proxy

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	gosocks5 "github.com/armon/go-socks5"
)

type ProxyConnection struct {
	ID          string    `json:"id"`
	Source      string    `json:"source"`
	Destination string    `json:"destination"`
	StartedAt   time.Time `json:"started_at"`
	BytesIn     int64     `json:"bytes_in"`
	BytesOut    int64     `json:"bytes_out"`
}

type GraphNode struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Type  string `json:"type"`
}

type GraphEdge struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Count  int    `json:"count"`
	Active int    `json:"active"`
}

type GraphData struct {
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
}

type ConnectionSnapshot struct {
	ActiveConnections int64             `json:"active_connections"`
	TotalConnections  int64             `json:"total_connections"`
	Connections       []ProxyConnection `json:"connections"`
	Graph             GraphData         `json:"graph"`
}

type destAgg struct {
	total  int
	active int
}

type trackedConn struct {
	id          string
	source      string
	destination string
	startedAt   time.Time
	bytesIn     atomic.Int64
	bytesOut    atomic.Int64
}

type ConnectionTracker struct {
	mu          sync.RWMutex
	bindAddr    string
	connections map[string]*trackedConn
	destStats   map[string]*destAgg
	total       int64
}

func NewConnectionTracker(bindAddr string) *ConnectionTracker {
	return &ConnectionTracker{
		bindAddr:    bindAddr,
		connections: make(map[string]*trackedConn),
		destStats:   make(map[string]*destAgg),
	}
}

func (t *ConnectionTracker) Register(source, destination string) string {
	id := newConnID()
	tc := &trackedConn{
		id:          id,
		source:      source,
		destination: destination,
		startedAt:   time.Now(),
	}

	t.mu.Lock()
	t.connections[id] = tc
	t.total++
	agg := t.destStats[destination]
	if agg == nil {
		agg = &destAgg{}
		t.destStats[destination] = agg
	}
	agg.total++
	agg.active++
	t.mu.Unlock()
	return id
}

func (t *ConnectionTracker) Unregister(id string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	tc, ok := t.connections[id]
	if !ok {
		return
	}
	delete(t.connections, id)
	if agg, ok := t.destStats[tc.destination]; ok {
		agg.active--
	}
}

func (t *ConnectionTracker) Wrap(id string, conn net.Conn) net.Conn {
	t.mu.RLock()
	tc, ok := t.connections[id]
	t.mu.RUnlock()
	if !ok {
		return conn
	}
	return &trackedNetConn{
		Conn:    conn,
		bytesIn: &tc.bytesIn,
		onClose: func() { t.Unregister(id) },
	}
}

func (t *ConnectionTracker) Snapshot() ConnectionSnapshot {
	t.mu.RLock()
	defer t.mu.RUnlock()

	conns := make([]ProxyConnection, 0, len(t.connections))
	for _, tc := range t.connections {
		conns = append(conns, ProxyConnection{
			ID:          tc.id,
			Source:      tc.source,
			Destination: tc.destination,
			StartedAt:   tc.startedAt,
			BytesIn:     tc.bytesIn.Load(),
			BytesOut:    tc.bytesOut.Load(),
		})
	}

	return ConnectionSnapshot{
		ActiveConnections: int64(len(t.connections)),
		TotalConnections:  t.total,
		Connections:       conns,
		Graph:             t.buildGraphLocked(),
	}
}

func (t *ConnectionTracker) buildGraphLocked() GraphData {
	const proxyID = "local"
	nodes := []GraphNode{{
		ID:    proxyID,
		Label: t.bindAddr,
		Type:  "proxy",
	}}
	edges := make([]GraphEdge, 0, len(t.destStats))

	for dest, agg := range t.destStats {
		nodeID := destNodeID(dest)
		nodes = append(nodes, GraphNode{
			ID:    nodeID,
			Label: dest,
			Type:  "destination",
		})
		edges = append(edges, GraphEdge{
			Source: proxyID,
			Target: nodeID,
			Count:  agg.total,
			Active: agg.active,
		})
	}

	return GraphData{Nodes: nodes, Edges: edges}
}

func destNodeID(dest string) string {
	safe := strings.NewReplacer(":", "-", ".", "-", "[", "", "]", "").Replace(dest)
	return "dest-" + safe
}

func newConnID() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

type trackedNetConn struct {
	net.Conn
	bytesIn *atomic.Int64
	onClose func()
}

func (c *trackedNetConn) Read(b []byte) (int, error) {
	n, err := c.Conn.Read(b)
	if n > 0 {
		c.bytesIn.Add(int64(n))
	}
	return n, err
}

func (c *trackedNetConn) Close() error {
	if c.onClose != nil {
		c.onClose()
		c.onClose = nil
	}
	return c.Conn.Close()
}

type pendingConn struct {
	source string
	dest   string
}

type connContextKey struct{}

type trackingRules struct {
	tracker *ConnectionTracker
	inner   gosocks5.RuleSet
}

func (r *trackingRules) Allow(ctx context.Context, req *gosocks5.Request) (context.Context, bool) {
	ctx, ok := r.inner.Allow(ctx, req)
	if !ok {
		return ctx, false
	}
	source := formatSource(req)
	dest := formatDest(req)
	return context.WithValue(ctx, connContextKey{}, pendingConn{source: source, dest: dest}), true
}

func formatSource(req *gosocks5.Request) string {
	if req.RemoteAddr == nil {
		return "unknown"
	}
	return req.RemoteAddr.Address()
}

func formatDest(req *gosocks5.Request) string {
	dest := req.DestAddr
	if dest == nil {
		return "unknown"
	}
	if dest.FQDN != "" {
		return net.JoinHostPort(dest.FQDN, strconv.Itoa(dest.Port))
	}
	return dest.Address()
}
