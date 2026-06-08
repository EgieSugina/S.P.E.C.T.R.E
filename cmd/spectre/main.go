package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"spectre/internal/server"
)

var (
	port      int
	bind      string
	daemon    bool
	noBrowser bool
	configDir string
)

func main() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

var rootCmd = &cobra.Command{
	Use:   "spectre",
	Short: "S.P.E.C.T.R.E — Secure Proxy & Encrypted Connection Tunneling Remote Environment",
	Long:  "You were never here.\n\nSSH/SFTP manager with embedded web UI.",
	RunE:  runStart,
}

var startCmd = &cobra.Command{
	Use:   "start",
	Short: "Start the SPECTRE server",
	RunE:  runStart,
}

func init() {
	rootCmd.AddCommand(startCmd)
	rootCmd.AddCommand(stopCmd)
	rootCmd.AddCommand(statusCmd)
	rootCmd.AddCommand(openCmd)

	flags := startCmd.Flags()
	flags.IntVarP(&port, "port", "p", envInt("SPECTRE_PORT", 57321), "HTTP port")
	flags.StringVar(&bind, "bind", envStr("SPECTRE_BIND", "127.0.0.1"), "Bind address")
	flags.BoolVar(&daemon, "daemon", false, "Run as background daemon")
	flags.BoolVar(&noBrowser, "no-browser", envBool("SPECTRE_NO_BROWSER", false), "Don't open browser")
	flags.StringVar(&configDir, "config", envStr("SPECTRE_CONFIG", ""), "Config directory")

	rootCmd.Flags().IntVarP(&port, "port", "p", envInt("SPECTRE_PORT", 57321), "HTTP port")
	rootCmd.Flags().StringVar(&bind, "bind", envStr("SPECTRE_BIND", "127.0.0.1"), "Bind address")
	rootCmd.Flags().BoolVar(&daemon, "daemon", false, "Run as background daemon")
	rootCmd.Flags().BoolVar(&noBrowser, "no-browser", envBool("SPECTRE_NO_BROWSER", false), "Don't open browser")
	rootCmd.Flags().StringVar(&configDir, "config", envStr("SPECTRE_CONFIG", ""), "Config directory")
}

func runStart(cmd *cobra.Command, args []string) error {
	if daemon && os.Getenv("SPECTRE_DAEMON") != "1" {
		return runAsDaemon()
	}

	if configDir == "" {
		home, _ := os.UserHomeDir()
		configDir = filepath.Join(home, ".spectre")
	}

	srv, err := server.New(bind, port, configDir)
	if err != nil {
		return err
	}

	if !noBrowser {
		go func() {
			time.Sleep(500 * time.Millisecond)
			openBrowser(fmt.Sprintf("http://%s:%d", bind, port))
		}()
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	return srv.Start(ctx)
}

var stopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop the SPECTRE daemon",
	RunE: func(cmd *cobra.Command, args []string) error {
		home, _ := os.UserHomeDir()
		pidPath := filepath.Join(home, ".spectre", "spectre.pid")
		data, err := os.ReadFile(pidPath)
		if err != nil {
			return fmt.Errorf("daemon not running")
		}
		pid, err := strconv.Atoi(string(data))
		if err != nil {
			return err
		}
		proc, err := os.FindProcess(pid)
		if err != nil {
			return err
		}
		return proc.Signal(syscall.SIGTERM)
	},
}

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Check daemon status",
	RunE: func(cmd *cobra.Command, args []string) error {
		home, _ := os.UserHomeDir()
		pidPath := filepath.Join(home, ".spectre", "spectre.pid")
		data, err := os.ReadFile(pidPath)
		if err != nil {
			fmt.Println("SPECTRE is not running")
			return nil
		}
		fmt.Printf("SPECTRE is running (PID %s)\n", string(data))
		return nil
	},
}

var openCmd = &cobra.Command{
	Use:   "open",
	Short: "Open SPECTRE in browser",
	RunE: func(cmd *cobra.Command, args []string) error {
		p := port
		if p == 0 {
			p = 57321
		}
		b := bind
		if b == "" {
			b = "127.0.0.1"
		}
		openBrowser(fmt.Sprintf("http://%s:%d", b, p))
		return nil
	},
}

func runAsDaemon() error {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".spectre")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	pidPath := filepath.Join(dir, "spectre.pid")

	executable, err := os.Executable()
	if err != nil {
		return err
	}

	cmd := exec.Command(executable, "start", "--no-browser")
	cmd.Env = append(os.Environ(), "SPECTRE_DAEMON=1")
	cmd.Stdout = nil
	cmd.Stderr = nil
	if err := cmd.Start(); err != nil {
		return err
	}
	if err := os.WriteFile(pidPath, []byte(strconv.Itoa(cmd.Process.Pid)), 0o600); err != nil {
		return err
	}
	fmt.Printf("[SPECTRE] Daemon started (PID %d)\n", cmd.Process.Pid)
	return nil
}

func openBrowser(url string) {
	var c string
	var a []string
	switch runtime.GOOS {
	case "windows":
		c = "cmd"
		a = []string{"/c", "start", url}
	case "darwin":
		c = "open"
		a = []string{url}
	default:
		c = "xdg-open"
		a = []string{url}
	}
	_ = exec.Command(c, a...).Start()
}

func envStr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func envBool(key string, def bool) bool {
	if v := os.Getenv(key); v != "" {
		return v == "1" || v == "true"
	}
	return def
}
