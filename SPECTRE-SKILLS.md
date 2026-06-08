# SPECTRE — Skills Reference
## Daftar Skill Implementasi per Modul

> File ini berisi skill-skill yang dibutuhkan developer untuk membangun setiap bagian dari SPECTRE.
> Setiap skill dilengkapi dengan konteks implementasi, code pattern, dan gotcha penting.

---

## SKILL-01: Go Single Binary dengan Embedded Frontend

**Relevan untuk:** `cmd/spectre/main.go`, `internal/server/embed.go`

### Konsep
Go `embed` package memungkinkan file statis (hasil build React) di-bundle langsung ke dalam binary Go — sehingga tidak perlu distribusi file terpisah.

### Pattern Implementasi

```go
// internal/server/embed.go
package server

import (
    "embed"
    "io/fs"
    "net/http"
)

//go:embed all:dist
var frontendFS embed.FS

func ServeFrontend() http.Handler {
    fsys, err := fs.Sub(frontendFS, "dist")
    if err != nil {
        panic(err)
    }
    return http.FileServer(http.FS(fsys))
}
```

```go
// cmd/spectre/main.go
package main

import (
    "context"
    "fmt"
    "os"
    "os/exec"
    "runtime"

    "github.com/spf13/cobra"
    "spectre/internal/server"
)

var rootCmd = &cobra.Command{
    Use:   "spectre",
    Short: "SPECTRE - Secure Proxy & Encrypted Connection Tunneling",
    RunE:  runServer,
}

func init() {
    rootCmd.Flags().IntP("port", "p", 57321, "HTTP port")
    rootCmd.Flags().String("bind", "127.0.0.1", "Bind address")
    rootCmd.Flags().Bool("daemon", false, "Run as background daemon")
    rootCmd.Flags().Bool("no-browser", false, "Don't open browser")
}

func runServer(cmd *cobra.Command, args []string) error {
    port, _ := cmd.Flags().GetInt("port")
    bind, _ := cmd.Flags().GetString("bind")
    daemon, _ := cmd.Flags().GetBool("daemon")
    noBrowser, _ := cmd.Flags().GetBool("no-browser")

    if daemon {
        return runAsDaemon()
    }

    srv := server.New(bind, port)
    
    if !noBrowser {
        go openBrowser(fmt.Sprintf("http://%s:%d", bind, port))
    }
    
    return srv.Start(context.Background())
}

func openBrowser(url string) {
    var cmd string
    var args []string
    switch runtime.GOOS {
    case "windows":
        cmd = "cmd"
        args = []string{"/c", "start", url}
    case "darwin":
        cmd = "open"
        args = []string{url}
    default:
        cmd = "xdg-open"
        args = []string{url}
    }
    exec.Command(cmd, args...).Start()
}
```

### Build Command
```bash
# Step 1: Build frontend
cd web && pnpm build      # Outputs to web/dist/

# Step 2: Copy dist ke embed path
cp -r web/dist internal/server/dist

# Step 3: Build Go binary
go build -ldflags="-s -w" -o spectre ./cmd/spectre/

# Single binary yang mengandung semua assets React!
```

### Gotcha
- Path di `//go:embed all:dist` harus relatif terhadap file `.go` yang menggunakannya
- Gunakan `all:` prefix agar include hidden files (dotfiles)
- Jika Vite output directory berbeda, sesuaikan path embed

---

## SKILL-02: SSH Connection Pool & Session Management

**Relevan untuk:** `internal/ssh/manager.go`, `internal/ssh/session.go`

### Konsep
Maintain pool of SSH connections yang tetap hidup di backend, independent dari WebSocket browser.

### Pattern Implementasi

```go
// internal/ssh/manager.go
package ssh

import (
    "fmt"
    "sync"
    "time"

    "golang.org/x/crypto/ssh"
)

type ConnectionState string

const (
    StateConnected    ConnectionState = "connected"
    StateDisconnected ConnectionState = "disconnected"
    StateConnecting   ConnectionState = "connecting"
    StateError        ConnectionState = "error"
)

type ManagedConnection struct {
    ID         string
    AccountID  string
    Client     *ssh.Client
    State      ConnectionState
    ConnectedAt time.Time
    LastActivity time.Time
    mu         sync.Mutex
}

type Manager struct {
    connections map[string]*ManagedConnection
    mu          sync.RWMutex
}

func NewManager() *Manager {
    m := &Manager{
        connections: make(map[string]*ManagedConnection),
    }
    go m.keepAliveLoop()
    return m
}

func (m *Manager) Connect(accountID string, cfg *AccountConfig) (string, error) {
    sshConfig := &ssh.ClientConfig{
        User:            cfg.Username,
        Auth:            buildAuthMethods(cfg),
        HostKeyCallback: ssh.InsecureIgnoreHostKey(), // TODO: known_hosts
        Timeout:         15 * time.Second,
    }

    addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
    client, err := ssh.Dial("tcp", addr, sshConfig)
    if err != nil {
        return "", fmt.Errorf("dial failed: %w", err)
    }

    connID := generateUUID()
    conn := &ManagedConnection{
        ID:          connID,
        AccountID:   accountID,
        Client:      client,
        State:       StateConnected,
        ConnectedAt: time.Now(),
        LastActivity: time.Now(),
    }

    m.mu.Lock()
    m.connections[connID] = conn
    m.mu.Unlock()

    // Monitor connection health
    go m.monitorConnection(conn)

    return connID, nil
}

func (m *Manager) keepAliveLoop() {
    ticker := time.NewTicker(30 * time.Second)
    for range ticker.C {
        m.mu.RLock()
        for _, conn := range m.connections {
            if conn.State == StateConnected {
                go conn.sendKeepAlive()
            }
        }
        m.mu.RUnlock()
    }
}

func (c *ManagedConnection) sendKeepAlive() {
    c.mu.Lock()
    defer c.mu.Unlock()
    if c.Client != nil {
        _, _, err := c.Client.SendRequest("keepalive@openssh.com", true, nil)
        if err != nil {
            c.State = StateDisconnected
        }
    }
}

func buildAuthMethods(cfg *AccountConfig) []ssh.AuthMethod {
    var methods []ssh.AuthMethod
    
    if cfg.Password != "" {
        methods = append(methods, ssh.Password(cfg.Password))
    }
    
    if cfg.PrivateKey != "" {
        signer, err := parsePrivateKey(cfg.PrivateKey, cfg.Passphrase)
        if err == nil {
            methods = append(methods, ssh.PublicKeys(signer))
        }
    }
    
    return methods
}
```

### Session Persistence: WebSocket Reconnect

```go
// internal/ssh/terminal.go
package ssh

import (
    "encoding/base64"
    "sync"

    "github.com/gorilla/websocket"
    "golang.org/x/crypto/ssh"
)

type TerminalSession struct {
    ID         string
    ConnID     string
    SSHSession *ssh.Session
    PTY        struct{ Cols, Rows int }
    
    // Buffer output untuk reconnect
    outputBuf  []byte
    bufMu      sync.Mutex
    
    // Active WebSocket (nil jika tidak ada client)
    wsConn     *websocket.Conn
    wsMu       sync.Mutex
}

// AttachWebSocket: browser reconnect ke session yang sudah ada
func (s *TerminalSession) AttachWebSocket(ws *websocket.Conn) {
    s.wsMu.Lock()
    // Kirim buffer output yang terlewat
    if len(s.outputBuf) > 0 {
        ws.WriteJSON(map[string]interface{}{
            "type": "buffer",
            "data": base64.StdEncoding.EncodeToString(s.outputBuf),
        })
    }
    s.wsConn = ws
    s.wsMu.Unlock()
}

// DetachWebSocket: tab ditutup, tapi SSH session tetap jalan
func (s *TerminalSession) DetachWebSocket() {
    s.wsMu.Lock()
    s.wsConn = nil
    s.wsMu.Unlock()
    // SSH session terus berjalan di background!
}

func (s *TerminalSession) writeToClient(data []byte) {
    // Selalu buffer output
    s.bufMu.Lock()
    s.outputBuf = append(s.outputBuf, data...)
    if len(s.outputBuf) > 500*1024 { // Max 500KB buffer
        s.outputBuf = s.outputBuf[len(s.outputBuf)-500*1024:]
    }
    s.bufMu.Unlock()
    
    // Kirim ke WebSocket jika ada client
    s.wsMu.Lock()
    defer s.wsMu.Unlock()
    if s.wsConn != nil {
        s.wsConn.WriteJSON(map[string]interface{}{
            "type": "output",
            "data": base64.StdEncoding.EncodeToString(data),
        })
    }
}
```

---

## SKILL-03: SFTP Parallel Upload (Max 10 Concurrent)

**Relevan untuk:** `internal/sftp/upload.go`

### Konsep
Gunakan Go semaphore pattern dengan `buffered channel` untuk limit concurrent uploads.

### Pattern Implementasi

```go
// internal/sftp/upload.go
package sftp

import (
    "fmt"
    "io"
    "path/filepath"
    "sync"
    "time"

    "github.com/pkg/sftp"
)

type UploadJob struct {
    ID         string
    LocalPath  string
    RemotePath string
    Size       int64
    Progress   int64
    Status     string // pending, uploading, done, error
    Error      string
    Speed      int64  // bytes/sec
    StartedAt  time.Time
}

type UploadQueue struct {
    MaxConcurrent int
    jobs          map[string]*UploadJob
    mu            sync.RWMutex
    semaphore     chan struct{}
    progressCh    chan UploadProgress
}

type UploadProgress struct {
    JobID    string
    Progress int64
    Speed    int64
    Status   string
    Error    string
}

func NewUploadQueue(maxConcurrent int) *UploadQueue {
    if maxConcurrent < 1 || maxConcurrent > 10 {
        maxConcurrent = 3 // default
    }
    return &UploadQueue{
        MaxConcurrent: maxConcurrent,
        jobs:          make(map[string]*UploadJob),
        semaphore:     make(chan struct{}, maxConcurrent),
        progressCh:    make(chan UploadProgress, 100),
    }
}

func (q *UploadQueue) Enqueue(job *UploadJob) {
    q.mu.Lock()
    q.jobs[job.ID] = job
    q.mu.Unlock()
    
    go q.processJob(job)
}

func (q *UploadQueue) processJob(job *UploadJob, client *sftp.Client, localReader io.Reader) {
    // Acquire semaphore slot (blocks if maxConcurrent reached)
    q.semaphore <- struct{}{}
    defer func() { <-q.semaphore }() // Release on done
    
    job.Status = "uploading"
    job.StartedAt = time.Now()
    q.notify(job.ID, 0, 0, "uploading", "")
    
    // Create remote file
    remoteFile, err := client.Create(job.RemotePath)
    if err != nil {
        job.Status = "error"
        job.Error = err.Error()
        q.notify(job.ID, job.Progress, 0, "error", err.Error())
        return
    }
    defer remoteFile.Close()
    
    // Copy with progress tracking
    buf := make([]byte, 32*1024) // 32KB chunks
    var written int64
    lastReport := time.Now()
    var lastBytes int64
    
    for {
        nr, readErr := localReader.Read(buf)
        if nr > 0 {
            nw, writeErr := remoteFile.Write(buf[:nr])
            written += int64(nw)
            job.Progress = written
            
            // Report progress max 10x/second
            if time.Since(lastReport) > 100*time.Millisecond {
                elapsed := time.Since(lastReport).Seconds()
                speed := int64(float64(written-lastBytes) / elapsed)
                q.notify(job.ID, written, speed, "uploading", "")
                lastReport = time.Now()
                lastBytes = written
            }
            
            if writeErr != nil {
                job.Status = "error"
                job.Error = writeErr.Error()
                q.notify(job.ID, written, 0, "error", writeErr.Error())
                return
            }
        }
        if readErr == io.EOF {
            break
        }
        if readErr != nil {
            job.Status = "error"
            job.Error = readErr.Error()
            q.notify(job.ID, written, 0, "error", readErr.Error())
            return
        }
    }
    
    job.Status = "done"
    job.Progress = job.Size
    q.notify(job.ID, job.Size, 0, "done", "")
}

func (q *UploadQueue) notify(jobID string, progress, speed int64, status, errMsg string) {
    select {
    case q.progressCh <- UploadProgress{
        JobID: jobID, Progress: progress,
        Speed: speed, Status: status, Error: errMsg,
    }:
    default: // non-blocking
    }
}
```

---

## SKILL-04: SOCKS5 Proxy via SSH Tunnel

**Relevan untuk:** `internal/proxy/socks5.go`

### Konsep
Buat local TCP listener. Setiap koneksi masuk di-dial via SSH connection ke target host.

```go
// internal/proxy/socks5.go
package proxy

import (
    "fmt"
    "io"
    "net"

    "golang.org/x/crypto/ssh"
    gosocks5 "github.com/armon/go-socks5"
)

type SSHDialer struct {
    sshClient *ssh.Client
}

// Implementasi interface Dialer untuk go-socks5
func (d *SSHDialer) Dial(network, addr string) (net.Conn, error) {
    return d.sshClient.Dial(network, addr)
}

func StartSOCKS5(localPort int, sshClient *ssh.Client) (func(), error) {
    conf := &gosocks5.Config{
        Dial: func(ctx context.Context, network, addr string) (net.Conn, error) {
            return sshClient.Dial(network, addr)
        },
    }
    
    server, err := gosocks5.New(conf)
    if err != nil {
        return nil, err
    }
    
    listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", localPort))
    if err != nil {
        return nil, fmt.Errorf("cannot bind port %d: %w", localPort, err)
    }
    
    go server.Serve(listener)
    
    stop := func() { listener.Close() }
    return stop, nil
}
```

---

## SKILL-05: Local Port Forward

**Relevan untuk:** `internal/proxy/portforward.go`

```go
// internal/proxy/portforward.go
package proxy

import (
    "fmt"
    "io"
    "net"
    "sync"

    "golang.org/x/crypto/ssh"
)

type PortForward struct {
    LocalHost  string
    LocalPort  int
    RemoteHost string
    RemotePort int
    SSHClient  *ssh.Client
    listener   net.Listener
    stopCh     chan struct{}
    wg         sync.WaitGroup
}

func (pf *PortForward) Start() error {
    addr := fmt.Sprintf("%s:%d", pf.LocalHost, pf.LocalPort)
    listener, err := net.Listen("tcp", addr)
    if err != nil {
        return fmt.Errorf("cannot listen on %s: %w", addr, err)
    }
    
    pf.listener = listener
    pf.stopCh = make(chan struct{})
    
    go pf.accept()
    return nil
}

func (pf *PortForward) accept() {
    for {
        conn, err := pf.listener.Accept()
        if err != nil {
            select {
            case <-pf.stopCh:
                return
            default:
                continue
            }
        }
        pf.wg.Add(1)
        go pf.handleConn(conn)
    }
}

func (pf *PortForward) handleConn(local net.Conn) {
    defer pf.wg.Done()
    defer local.Close()
    
    remoteAddr := fmt.Sprintf("%s:%d", pf.RemoteHost, pf.RemotePort)
    remote, err := pf.SSHClient.Dial("tcp", remoteAddr)
    if err != nil {
        return
    }
    defer remote.Close()
    
    // Bidirectional copy
    done := make(chan struct{}, 2)
    go func() { io.Copy(local, remote); done <- struct{}{} }()
    go func() { io.Copy(remote, local); done <- struct{}{} }()
    <-done
}

func (pf *PortForward) Stop() {
    close(pf.stopCh)
    pf.listener.Close()
    pf.wg.Wait()
}
```

---

## SKILL-06: AES-256-GCM Password Vault

**Relevan untuk:** `internal/crypto/vault.go`

### Konsep
Master password → PBKDF2 key derivation → AES-256-GCM encryption per-entry.

```go
// internal/crypto/vault.go
package crypto

import (
    "crypto/aes"
    "crypto/cipher"
    "crypto/rand"
    "crypto/sha256"
    "encoding/base64"
    "errors"
    "io"

    "golang.org/x/crypto/pbkdf2"
)

const (
    saltSize   = 32
    keySize    = 32  // 256-bit
    pbkdf2Iter = 100_000
)

type Vault struct {
    masterKey []byte
}

func NewVault(masterPassword string, salt []byte) *Vault {
    key := pbkdf2.Key(
        []byte(masterPassword),
        salt,
        pbkdf2Iter,
        keySize,
        sha256.New,
    )
    return &Vault{masterKey: key}
}

func (v *Vault) Encrypt(plaintext string) (string, error) {
    block, err := aes.NewCipher(v.masterKey)
    if err != nil {
        return "", err
    }
    
    gcm, err := cipher.NewGCM(block)
    if err != nil {
        return "", err
    }
    
    // Random nonce untuk setiap enkripsi
    nonce := make([]byte, gcm.NonceSize())
    if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
        return "", err
    }
    
    ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
    return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func (v *Vault) Decrypt(encoded string) (string, error) {
    data, err := base64.StdEncoding.DecodeString(encoded)
    if err != nil {
        return "", err
    }
    
    block, err := aes.NewCipher(v.masterKey)
    if err != nil {
        return "", err
    }
    
    gcm, err := cipher.NewGCM(block)
    if err != nil {
        return "", err
    }
    
    nonceSize := gcm.NonceSize()
    if len(data) < nonceSize {
        return "", errors.New("ciphertext too short")
    }
    
    nonce, ciphertext := data[:nonceSize], data[nonceSize:]
    plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
    if err != nil {
        return "", errors.New("decryption failed: wrong master password?")
    }
    
    return string(plaintext), nil
}

// GenerateSalt: generate sekali saat init, simpan di SQLite
func GenerateSalt() ([]byte, error) {
    salt := make([]byte, saltSize)
    _, err := io.ReadFull(rand.Reader, salt)
    return salt, err
}
```

---

## SKILL-07: React xterm.js Terminal Component

**Relevan untuk:** `web/src/components/terminal/TerminalPane.tsx`

```tsx
// web/src/components/terminal/TerminalPane.tsx
import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

interface TerminalPaneProps {
  sessionId: string
  isActive: boolean
}

export function TerminalPane({ sessionId, isActive }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const initTerminal = useCallback(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: '#07070F',
        foreground: '#E2E8F0',
        cursor: '#A78BFA',
        cursorAccent: '#07070F',
        selectionBackground: 'rgba(124, 58, 237, 0.3)',
        black: '#0D0D1A',
        red: '#FF2D55',
        green: '#39FF14',
        yellow: '#FFB700',
        blue: '#3B82F6',
        magenta: '#A78BFA',
        cyan: '#00FFFF',
        white: '#E2E8F0',
        brightBlack: '#4A5568',
        brightMagenta: '#C4B5FD',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      convertEol: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    fitAddon.fit()

    termRef.current = term
    fitRef.current = fitAddon

    // WebSocket connection
    const ws = new WebSocket(`ws://localhost:57321/ws/terminal/${sessionId}`)
    wsRef.current = ws

    ws.onopen = () => {
      term.writeln('\x1b[35m[SPECTRE]\x1b[0m Connected to session')
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'output') {
        term.write(atob(msg.data))
      } else if (msg.type === 'buffer') {
        term.write(atob(msg.data)) // Catch-up buffer
      } else if (msg.type === 'disconnected') {
        term.writeln(`\r\n\x1b[31m[SPECTRE]\x1b[0m ${msg.reason}`)
      }
    }

    ws.onclose = () => {
      term.writeln('\r\n\x1b[33m[SPECTRE]\x1b[0m WebSocket closed (session still running)')
    }

    // Terminal input → WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }))
      }
    })

    // Terminal resize → WebSocket
    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }))
      }
    })

    return () => {
      ws.close()
      term.dispose()
    }
  }, [sessionId])

  // Fit terminal on container resize
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      fitRef.current?.fit()
    })
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const cleanup = initTerminal()
    return cleanup
  }, [initTerminal])

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-[#07070F]"
      style={{ display: isActive ? 'block' : 'none' }}
    />
  )
}
```

---

## SKILL-08: Drag & Drop File Upload Component

**Relevan untuk:** `web/src/components/filemanager/DropZone.tsx`

```tsx
// web/src/components/filemanager/DropZone.tsx
import { useState, useRef, useCallback, DragEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUploadQueue } from '@/hooks/useUploadQueue'

interface DropZoneProps {
  connectionId: string
  remotePath: string
  children: React.ReactNode
}

export function DropZone({ connectionId, remotePath, children }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [dragDepth, setDragDepth] = useState(0)
  const { enqueue } = useUploadQueue()

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragDepth(d => d + 1)
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragDepth(d => {
      const newDepth = d - 1
      if (newDepth === 0) setIsDragOver(false)
      return newDepth
    })
  }, [])

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    setDragDepth(0)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    // Enqueue ke upload queue (respects maxConcurrent limit)
    files.forEach(file => {
      enqueue({
        id: crypto.randomUUID(),
        file,
        connectionId,
        remotePath: `${remotePath}/${file.name}`,
        status: 'pending',
        progress: 0,
        size: file.size,
      })
    })
  }, [connectionId, remotePath, enqueue])

  return (
    <div
      className="relative w-full h-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {children}

      {/* Drop overlay */}
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center"
            style={{
              background: 'rgba(124, 58, 237, 0.15)',
              border: '2px dashed rgba(167, 139, 250, 0.7)',
              backdropFilter: 'blur(2px)',
            }}
          >
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="text-purple-300 text-4xl mb-3"
            >
              ↓
            </motion.div>
            <p className="font-mono text-purple-300 text-sm tracking-widest uppercase">
              Drop to upload
            </p>
            <p className="font-mono text-purple-500 text-xs mt-1">
              {remotePath}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

---

## SKILL-09: Upload Queue Hook

**Relevan untuk:** `web/src/hooks/useUploadQueue.ts`

```typescript
// web/src/hooks/useUploadQueue.ts
import { create } from 'zustand'
import { uploadFile } from '@/api/sftp'

interface UploadItem {
  id: string
  file: File
  connectionId: string
  remotePath: string
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number
  size: number
  speed?: number
  error?: string
}

interface UploadQueueState {
  items: UploadItem[]
  maxConcurrent: number
  activeCount: number
  enqueue: (item: UploadItem) => void
  setMaxConcurrent: (max: number) => void
  retry: (id: string) => void
  remove: (id: string) => void
  clearCompleted: () => void
}

export const useUploadQueue = create<UploadQueueState>((set, get) => ({
  items: [],
  maxConcurrent: 3,
  activeCount: 0,

  enqueue: (item) => {
    set(state => ({ items: [...state.items, item] }))
    get().processQueue()
  },

  setMaxConcurrent: (max) => {
    set({ maxConcurrent: Math.min(10, Math.max(1, max)) })
    get().processQueue()
  },

  processQueue: () => {
    const { items, maxConcurrent, activeCount } = get()
    const available = maxConcurrent - activeCount
    if (available <= 0) return

    const pending = items.filter(i => i.status === 'pending')
    const toStart = pending.slice(0, available)

    toStart.forEach(item => {
      set(state => ({
        activeCount: state.activeCount + 1,
        items: state.items.map(i =>
          i.id === item.id ? { ...i, status: 'uploading' } : i
        ),
      }))

      uploadFile(item.connectionId, item.remotePath, item.file, (progress, speed) => {
        set(state => ({
          items: state.items.map(i =>
            i.id === item.id ? { ...i, progress, speed } : i
          ),
        }))
      })
        .then(() => {
          set(state => ({
            activeCount: state.activeCount - 1,
            items: state.items.map(i =>
              i.id === item.id ? { ...i, status: 'done', progress: i.size } : i
            ),
          }))
          get().processQueue() // Process next in queue
        })
        .catch((err) => {
          set(state => ({
            activeCount: state.activeCount - 1,
            items: state.items.map(i =>
              i.id === item.id ? { ...i, status: 'error', error: err.message } : i
            ),
          }))
          get().processQueue()
        })
    })
  },

  retry: (id) => {
    set(state => ({
      items: state.items.map(i =>
        i.id === id ? { ...i, status: 'pending', progress: 0, error: undefined } : i
      ),
    }))
    get().processQueue()
  },

  remove: (id) => {
    set(state => ({ items: state.items.filter(i => i.id !== id) }))
  },

  clearCompleted: () => {
    set(state => ({
      items: state.items.filter(i => i.status !== 'done'),
    }))
  },
}))
```

---

## SKILL-10: Config Export/Import

**Relevan untuk:** `internal/config/export.go`, `import.go`

```go
// internal/config/export.go
package config

import (
    "encoding/json"
    "fmt"
    "time"

    "spectre/internal/crypto"
    "spectre/internal/store"
)

type ExportManifest struct {
    Version     string           `json:"version"`
    ExportedAt  time.Time        `json:"exported_at"`
    Connections []ExportAccount  `json:"connections"`
    Groups      []ExportGroup    `json:"groups"`
    Tunnels     []ExportTunnel   `json:"tunnels,omitempty"`
    Keys        []ExportKey      `json:"keys,omitempty"`
}

type ExportAccount struct {
    Name       string `json:"name"`
    Host       string `json:"host"`
    Port       int    `json:"port"`
    Username   string `json:"username"`
    AuthType   string `json:"auth_type"`
    // Password TIDAK di-export dalam format plain JSON
    // Dalam .spectre format (terenkripsi), password ikut
    GroupName  string `json:"group_name,omitempty"`
    Tags       []string `json:"tags,omitempty"`
    Notes      string `json:"notes,omitempty"`
}

// ExportPlain: JSON tanpa password (untuk berbagi struktur)
func ExportPlain(db *store.DB) ([]byte, error) {
    accounts, _ := db.ListAccounts()
    groups, _ := db.ListGroups()
    
    manifest := ExportManifest{
        Version:    "1.0",
        ExportedAt: time.Now(),
    }
    
    for _, acc := range accounts {
        manifest.Connections = append(manifest.Connections, ExportAccount{
            Name:      acc.Name,
            Host:      acc.Host,
            Port:      acc.Port,
            Username:  acc.Username,
            AuthType:  acc.AuthType,
            GroupName: groupName(groups, acc.GroupID),
            Tags:      acc.Tags,
            Notes:     acc.Notes,
        })
    }
    
    return json.MarshalIndent(manifest, "", "  ")
}

// ExportEncrypted: .spectre format dengan password terenkripsi
func ExportEncrypted(db *store.DB, vault *crypto.Vault) ([]byte, error) {
    // Sama seperti ExportPlain tapi password ikut (terenkripsi ulang)
    data, err := ExportPlain(db) // base structure
    if err != nil {
        return nil, err
    }
    
    // Encrypt seluruh payload dengan vault key
    encrypted, err := vault.Encrypt(string(data))
    if err != nil {
        return nil, err
    }
    
    wrapper := map[string]interface{}{
        "format":    "spectre-encrypted-v1",
        "encrypted": encrypted,
    }
    
    return json.Marshal(wrapper)
}

// ParseSSHConfig: import dari ~/.ssh/config
func ParseSSHConfig(content string) ([]ExportAccount, error) {
    // Parse standard SSH config format
    // Host <name>
    //   HostName <host>
    //   User <user>
    //   Port <port>
    //   IdentityFile <key_path>
    var accounts []ExportAccount
    // ... parsing logic
    return accounts, nil
}
```

---

## SKILL-11: SPECTRE Theme — Tailwind Config

**Relevan untuk:** `web/tailwind.config.ts`

```typescript
// web/tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{tsx,ts}'],
  theme: {
    extend: {
      colors: {
        // SPECTRE palette
        void:     '#030305',
        deep:     '#07070F',
        surface:  '#0D0D1A',
        elevated: '#121224',
        
        purple: {
          dim:    '#2D1B69',
          mid:    '#5B21B6',
          core:   '#7C3AED',
          bright: '#A78BFA',
          glow:   '#C4B5FD',
        },
        
        term: {
          green: '#39FF14',
          cyan:  '#00FFFF',
          red:   '#FF2D55',
          amber: '#FFB700',
        },
      },
      
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      
      animation: {
        'pulse-purple': 'pulse-purple 2s ease-in-out infinite',
        'scanlines':    'scanlines 0.1s linear infinite',
        'glitch':       'glitch 0.5s step-end infinite',
        'data-stream':  'data-stream 3s linear infinite',
        'cursor-blink': 'cursor-blink 1s step-end infinite',
        'status-ping':  'status-online 1.5s ease-in-out infinite',
      },
      
      keyframes: {
        'pulse-purple': {
          '0%, 100%': { boxShadow: '0 0 4px rgba(124, 58, 237, 0.4)' },
          '50%':       { boxShadow: '0 0 20px rgba(124, 58, 237, 0.9), 0 0 40px rgba(124, 58, 237, 0.3)' },
        },
        'status-online': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%':       { opacity: '0.5', transform: 'scale(1.3)' },
        },
        'cursor-blink': {
          '0%, 50%':   { opacity: '1' },
          '51%, 100%': { opacity: '0' },
        },
        'glitch': {
          '0%':   { clipPath: 'inset(40% 0 61% 0)', transform: 'translate(-2px, 0)' },
          '20%':  { clipPath: 'inset(92% 0 1% 0)',  transform: 'translate(2px, 0)' },
          '40%':  { clipPath: 'inset(43% 0 1% 0)',  transform: 'translate(0, 0)' },
          '60%':  { clipPath: 'inset(25% 0 58% 0)', transform: 'translate(1px, 0)' },
          '80%':  { clipPath: 'inset(54% 0 7% 0)',  transform: 'translate(-1px, 0)' },
          '100%': { clipPath: 'inset(58% 0 43% 0)', transform: 'translate(2px, 0)' },
        },
      },
      
      borderRadius: {
        'brutal': '2px',  // Brutalist minimal radius
      },
      
      boxShadow: {
        'purple-sm': '0 0 8px rgba(124, 58, 237, 0.4)',
        'purple-md': '0 0 20px rgba(124, 58, 237, 0.6)',
        'purple-lg': '0 0 40px rgba(124, 58, 237, 0.4), 0 0 80px rgba(124, 58, 237, 0.2)',
        'glow':      '0 0 20px rgba(167, 139, 250, 0.5)',
      },
    },
  },
  plugins: [],
} satisfies Config
```

---

## SKILL-12: Daemon Mode — Background Service

**Relevan untuk:** `cmd/spectre/main.go`

```go
// Background daemon untuk Linux/macOS
func runAsDaemon() error {
    // Cek apakah sudah ada daemon running
    pidFile := filepath.Join(configDir(), "spectre.pid")
    
    if isRunning(pidFile) {
        return fmt.Errorf("SPECTRE daemon already running")
    }
    
    // Daemonize: fork process
    cmd := exec.Command(os.Args[0], filterArgs(os.Args[1:], "--daemon")...)
    cmd.Env = append(os.Environ(), "SPECTRE_DAEMON=1")
    cmd.Stdout = logFile()
    cmd.Stderr = logFile()
    
    if err := cmd.Start(); err != nil {
        return fmt.Errorf("failed to start daemon: %w", err)
    }
    
    // Write PID file
    os.WriteFile(pidFile, []byte(fmt.Sprintf("%d", cmd.Process.Pid)), 0644)
    
    fmt.Printf("SPECTRE daemon started (PID: %d)\n", cmd.Process.Pid)
    fmt.Printf("Access: http://localhost:57321\n")
    
    return nil
}

// Windows: Register sebagai Windows Service
func installWindowsService() error {
    // Menggunakan golang.org/x/sys/windows/svc
    // ...
}

// Systemd unit file generator (Linux)
func generateSystemdUnit() string {
    return fmt.Sprintf(`[Unit]
Description=SPECTRE - Secure SSH Manager
After=network.target

[Service]
Type=simple
ExecStart=%s
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
`, os.Args[0])
}
```

---

## SKILL-13: Frontend — Framer Motion Page Transitions

**Relevan untuk:** `web/src/App.tsx`

```tsx
// web/src/App.tsx
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'

const pageVariants = {
  initial: { opacity: 0, x: -8, filter: 'blur(4px)' },
  in:      { opacity: 1, x: 0,  filter: 'blur(0px)' },
  out:     { opacity: 0, x: 8,  filter: 'blur(4px)' },
}

const pageTransition = {
  type: 'tween',
  ease: [0.25, 0.46, 0.45, 0.94],
  duration: 0.2,
}

export function AnimatedPage({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial="initial"
      animate="in"
      exit="out"
      variants={pageVariants}
      transition={pageTransition}
      className="w-full h-full"
    >
      {children}
    </motion.div>
  )
}

// Usage di Router:
// <AnimatePresence mode="wait">
//   <AnimatedPage key={location.pathname}>
//     <CurrentPage />
//   </AnimatedPage>
// </AnimatePresence>
```

---

## SKILL-14: SSH Key Generation

**Relevan untuk:** `internal/ssh/keygen.go`

```go
// internal/ssh/keygen.go
package ssh

import (
    "crypto/ecdsa"
    "crypto/ed25519"
    "crypto/elliptic"
    "crypto/rand"
    "crypto/rsa"
    "crypto/x509"
    "encoding/pem"

    "golang.org/x/crypto/ssh"
)

type KeyType string

const (
    KeyTypeRSA4096  KeyType = "rsa4096"
    KeyTypeEd25519  KeyType = "ed25519"
    KeyTypeECDSA256 KeyType = "ecdsa256"
)

type GeneratedKey struct {
    PrivateKeyPEM []byte
    PublicKeySSH  []byte
    Fingerprint   string
    KeyType       KeyType
}

func GenerateKeyPair(keyType KeyType) (*GeneratedKey, error) {
    switch keyType {
    case KeyTypeEd25519:
        return generateEd25519()
    case KeyTypeECDSA256:
        return generateECDSA()
    default:
        return generateRSA(4096)
    }
}

func generateEd25519() (*GeneratedKey, error) {
    pub, priv, err := ed25519.GenerateKey(rand.Reader)
    if err != nil {
        return nil, err
    }
    
    privPEM, err := marshalEd25519(priv)
    if err != nil {
        return nil, err
    }
    
    sshPub, err := ssh.NewPublicKey(pub)
    if err != nil {
        return nil, err
    }
    
    return &GeneratedKey{
        PrivateKeyPEM: privPEM,
        PublicKeySSH:  ssh.MarshalAuthorizedKey(sshPub),
        Fingerprint:   ssh.FingerprintSHA256(sshPub),
        KeyType:       KeyTypeEd25519,
    }, nil
}

func generateRSA(bits int) (*GeneratedKey, error) {
    priv, err := rsa.GenerateKey(rand.Reader, bits)
    if err != nil {
        return nil, err
    }
    
    privDER := x509.MarshalPKCS1PrivateKey(priv)
    privPEM := pem.EncodeToMemory(&pem.Block{
        Type:  "RSA PRIVATE KEY",
        Bytes: privDER,
    })
    
    sshPub, err := ssh.NewPublicKey(&priv.PublicKey)
    if err != nil {
        return nil, err
    }
    
    return &GeneratedKey{
        PrivateKeyPEM: privPEM,
        PublicKeySSH:  ssh.MarshalAuthorizedKey(sshPub),
        Fingerprint:   ssh.FingerprintSHA256(sshPub),
        KeyType:       KeyTypeRSA4096,
    }, nil
}
```

---

## SKILL-15: Goreleaser Build Config

**Relevan untuk:** `build/goreleaser.yaml`

```yaml
# build/goreleaser.yaml
version: 2

project_name: spectre

before:
  hooks:
    - cd web && pnpm install --frozen-lockfile && pnpm build
    - cp -r web/dist internal/server/dist

builds:
  - id: spectre
    main: ./cmd/spectre
    binary: spectre
    env:
      - CGO_ENABLED=1  # Untuk SQLite (CGO required)
    goos:
      - linux
      - windows
      - darwin
    goarch:
      - amd64
      - arm64
    ignore:
      - goos: windows
        goarch: arm64
    ldflags:
      - -s -w
      - -X main.Version={{.Version}}
      - -X main.BuildDate={{.Date}}
      - -X main.Commit={{.ShortCommit}}

archives:
  - id: default
    formats: [tar.gz]
    format_overrides:
      - goos: windows
        formats: [zip]
    name_template: >-
      {{ .ProjectName }}_
      {{- .Os }}_
      {{- if eq .Arch "amd64" }}x86_64
      {{- else if eq .Arch "arm64" }}arm64
      {{- else }}{{ .Arch }}{{ end }}
    files:
      - README.md
      - docs/SPECTRE-PLAN.md

checksum:
  name_template: 'checksums.txt'

changelog:
  sort: asc
  filters:
    exclude:
      - '^docs:'
      - '^test:'
      - '^chore:'

release:
  github:
    owner: yourname
    name: spectre
```

---

*SPECTRE Skills v1.0.0*
*"Know the tools. Own the dark."*
