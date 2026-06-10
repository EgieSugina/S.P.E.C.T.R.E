package trace

import (
	"context"
	"fmt"
	"net"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

type HopStatus string

const (
	HopAlive   HopStatus = "alive"
	HopTimeout HopStatus = "timeout"
	HopGateway HopStatus = "gateway"
	HopLocal   HopStatus = "local"
	HopTarget  HopStatus = "target"
)

type Hop struct {
	Hop    int       `json:"hop"`
	Host   string    `json:"host"`
	IP     string    `json:"ip,omitempty"`
	RTTMs  float64   `json:"rtt_ms,omitempty"`
	Status HopStatus `json:"status"`
}

type Result struct {
	Target     string  `json:"target"`
	ResolvedIP string  `json:"resolved_ip,omitempty"`
	Hops       []Hop   `json:"hops"`
	Via        string  `json:"via"`
	Tool       string  `json:"tool"`
	DurationMs int64   `json:"duration_ms"`
	Error      string  `json:"error,omitempty"`
}

type Gateway struct {
	Host string
	Port int
	Label string
}

// RunLocal traces route from the SPECTRE host to target.
func RunLocal(ctx context.Context, target string) (*Result, error) {
	start := time.Now()
	resolved := resolveHost(target)

	tool, args := findLocalTracer(target)
	if tool == "" {
		return pingFallback(ctx, target, resolved, start)
	}

	cmd := exec.CommandContext(ctx, tool, args...)
	out, err := cmd.CombinedOutput()
	if err != nil && len(out) == 0 {
		return pingFallback(ctx, target, resolved, start)
	}

	hops := parseOutput(string(out), tool)
	if len(hops) == 0 {
		return pingFallback(ctx, target, resolved, start)
	}

	markTarget(hops, target, resolved)
	return &Result{
		Target:     target,
		ResolvedIP: resolved,
		Hops:       prependLocal(hops),
		Via:        "local",
		Tool:       baseName(tool),
		DurationMs: time.Since(start).Milliseconds(),
	}, nil
}

// RunViaSSH runs traceroute on a remote host through an active SSH session.
func RunViaSSH(ctx context.Context, client *ssh.Client, target string, gateway *Gateway) (*Result, error) {
	start := time.Now()
	resolved := resolveHost(target)

	hops := []Hop{{
		Hop:    0,
		Host:   "localhost",
		Status: HopLocal,
	}}

	if gateway != nil {
		gw := Hop{
			Hop:    1,
			Host:   gateway.Label,
			IP:     gateway.Host,
			Status: HopGateway,
			RTTMs:  measureRTT(gateway.Host, gateway.Port),
		}
		hops = append(hops, gw)
	}

	remoteHops, tool, err := execRemoteTrace(ctx, client, target)
	if err != nil {
		return &Result{
			Target:     target,
			ResolvedIP: resolved,
			Hops:       hops,
			Via:        "ssh",
			Tool:       tool,
			DurationMs: time.Since(start).Milliseconds(),
			Error:      err.Error(),
		}, nil
	}

	offset := len(hops)
	for i, h := range remoteHops {
		h.Hop = offset + i
		hops = append(hops, h)
	}
	markTarget(hops, target, resolved)

	return &Result{
		Target:     target,
		ResolvedIP: resolved,
		Hops:       hops,
		Via:        "ssh",
		Tool:       tool,
		DurationMs: time.Since(start).Milliseconds(),
	}, nil
}

func execRemoteTrace(ctx context.Context, client *ssh.Client, target string) ([]Hop, string, error) {
	shell := `if command -v traceroute >/dev/null 2>&1; then traceroute -n -q 1 -w 2 -m 30 ` + shellQuote(target) + `; elif command -v tracepath >/dev/null 2>&1; then tracepath -n ` + shellQuote(target) + `; else echo "SPECTRE_TRACE_NO_TOOL"; fi`

	session, err := client.NewSession()
	if err != nil {
		return nil, "", fmt.Errorf("ssh session: %w", err)
	}
	defer session.Close()

	done := make(chan struct{})
	var out []byte
	var runErr error
	go func() {
		out, runErr = session.CombinedOutput(shell)
		close(done)
	}()

	select {
	case <-ctx.Done():
		_ = session.Close()
		return nil, "", ctx.Err()
	case <-done:
	}

	output := string(out)
	if strings.Contains(output, "SPECTRE_TRACE_NO_TOOL") {
		return nil, "", fmt.Errorf("traceroute/tracepath not installed on remote host")
	}
	if runErr != nil && len(out) == 0 {
		return nil, "", runErr
	}

	tool := "traceroute"
	if strings.Contains(output, "pmtu") {
		tool = "tracepath"
	}
	hops := parseOutput(output, tool)
	if len(hops) == 0 {
		return nil, tool, fmt.Errorf("could not parse remote traceroute output")
	}
	return hops, tool, nil
}

func findLocalTracer(target string) (string, []string) {
	if path, err := exec.LookPath("traceroute"); err == nil {
		return path, []string{"-n", "-q", "1", "-w", "2", "-m", "30", target}
	}
	if path, err := exec.LookPath("tracepath"); err == nil {
		return path, []string{"-n", target}
	}
	return "", nil
}

func pingFallback(_ context.Context, target, resolved string, start time.Time) (*Result, error) {
	hops := []Hop{{
		Hop:    0,
		Host:   "localhost",
		Status: HopLocal,
	}}

	rtt := measureRTT(target, 0)
	status := HopAlive
	if rtt < 0 {
		status = HopTimeout
	}

	hops = append(hops, Hop{
		Hop:    1,
		Host:   target,
		IP:     resolved,
		RTTMs:  rtt,
		Status: status,
	})
	if status == HopAlive {
		hops[len(hops)-1].Status = HopTarget
	}

	return &Result{
		Target:     target,
		ResolvedIP: resolved,
		Hops:       hops,
		Via:        "local",
		Tool:       "ping",
		DurationMs: time.Since(start).Milliseconds(),
		Error:      "traceroute/tracepath not found; used single-hop ping",
	}, nil
}

func prependLocal(hops []Hop) []Hop {
	local := Hop{Hop: 0, Host: "localhost", Status: HopLocal}
	shifted := make([]Hop, 0, len(hops)+1)
	shifted = append(shifted, local)
	for _, h := range hops {
		h.Hop++
		shifted = append(shifted, h)
	}
	return shifted
}

func parseOutput(output, tool string) []Hop {
	if strings.Contains(tool, "tracepath") || strings.Contains(output, "pmtu") {
		return parseTracepath(output)
	}
	return parseTraceroute(output)
}

var (
	reTraceHop = regexp.MustCompile(`^\s*(\d+)\s+(.+)$`)
	reTraceRTT = regexp.MustCompile(`([\d.]+)\s*ms`)
	reTraceIP  = regexp.MustCompile(`\b(\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:]+)\b`)
	rePathHop  = regexp.MustCompile(`^\s*(\d+):\s+(.+)$`)
)

func parseTraceroute(output string) []Hop {
	var hops []Hop
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "traceroute") {
			continue
		}
		m := reTraceHop.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		hopNum, _ := strconv.Atoi(m[1])
		rest := m[2]

		if strings.Contains(rest, "*") && !reTraceIP.MatchString(rest) {
			hops = append(hops, Hop{Hop: hopNum, Host: "*", Status: HopTimeout})
			continue
		}

		host, ip := extractHostIP(rest)
		rtt := firstRTT(rest)
		status := HopAlive
		if rtt < 0 {
			status = HopTimeout
		}
		hops = append(hops, Hop{
			Hop: hopNum, Host: host, IP: ip, RTTMs: rtt, Status: status,
		})
	}
	return hops
}

func parseTracepath(output string) []Hop {
	var hops []Hop
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.Contains(line, "pmtu") || strings.Contains(line, "[LOCALHOST]") {
			continue
		}
		m := rePathHop.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		hopNum, _ := strconv.Atoi(m[1])
		rest := strings.TrimSpace(m[2])

		if strings.HasPrefix(rest, "[") || rest == "" {
			continue
		}

		parts := strings.Fields(rest)
		if len(parts) == 0 {
			continue
		}

		host := parts[0]
		ip := host
		if net.ParseIP(host) == nil {
			ip = resolveHost(host)
		}

		rtt := firstRTT(rest)
		status := HopAlive
		if strings.Contains(rest, "reached") {
			status = HopTarget
		} else if rtt < 0 {
			status = HopTimeout
		}

		hops = append(hops, Hop{
			Hop: hopNum, Host: host, IP: ip, RTTMs: rtt, Status: status,
		})
	}
	return hops
}

func extractHostIP(rest string) (host, ip string) {
	if idx := strings.Index(rest, "("); idx >= 0 {
		host = strings.TrimSpace(rest[:idx])
		if end := strings.Index(rest, ")"); end > idx {
			ip = strings.TrimSpace(rest[idx+1 : end])
		}
	} else {
		fields := strings.Fields(rest)
		if len(fields) > 0 {
			host = fields[0]
			ip = host
		}
	}
	if host == "" {
		host = "unknown"
	}
	return host, ip
}

func firstRTT(s string) float64 {
	m := reTraceRTT.FindStringSubmatch(s)
	if m == nil {
		return -1
	}
	v, _ := strconv.ParseFloat(m[1], 64)
	return v
}

func markTarget(hops []Hop, target, resolved string) {
	if len(hops) == 0 {
		return
	}
	last := &hops[len(hops)-1]
	if last.Status == HopAlive || last.Status == HopGateway {
		last.Status = HopTarget
	}
	_ = target
	_ = resolved
}

func resolveHost(host string) string {
	host = stripPort(host)
	ips, err := net.LookupIP(host)
	if err != nil || len(ips) == 0 {
		return ""
	}
	for _, ip := range ips {
		if v4 := ip.To4(); v4 != nil {
			return v4.String()
		}
	}
	return ips[0].String()
}

func stripPort(host string) string {
	if h, _, err := net.SplitHostPort(host); err == nil {
		return h
	}
	return host
}

func measureRTT(host string, port int) float64 {
	addr := host
	if port > 0 {
		addr = net.JoinHostPort(host, strconv.Itoa(port))
	} else if !strings.Contains(host, ":") && net.ParseIP(host) == nil {
		// ICMP not available without root; try default port for TCP probe
		addr = net.JoinHostPort(host, "80")
	}

	start := time.Now()
	conn, err := net.DialTimeout("tcp", addr, 2*time.Second)
	if err != nil {
		return -1
	}
	_ = conn.Close()
	return float64(time.Since(start).Microseconds()) / 1000.0
}

func baseName(path string) string {
	if i := strings.LastIndex(path, "/"); i >= 0 {
		return path[i+1:]
	}
	return path
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}
