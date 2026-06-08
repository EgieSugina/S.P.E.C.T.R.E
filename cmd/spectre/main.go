package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strconv"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"spectre/internal/daemon"
	"spectre/internal/server"
	"spectre/internal/tray"
)

var (
	port      int
	bind      string
	daemonFlag bool
	noBrowser bool
	configDir string
	installTrayAutostart bool
	uninstallTrayAutostart bool
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

var trayCmd = &cobra.Command{
	Use:   "tray",
	Short: "Run KDE system tray icon to start/stop the daemon",
	Long:  "Shows a ghost icon in the KDE status area with start, stop, and open actions.",
	RunE:  runTray,
}

func init() {
	rootCmd.AddCommand(startCmd)
	rootCmd.AddCommand(stopCmd)
	rootCmd.AddCommand(statusCmd)
	rootCmd.AddCommand(openCmd)
	rootCmd.AddCommand(trayCmd)

	flags := startCmd.Flags()
	flags.IntVarP(&port, "port", "p", envInt("SPECTRE_PORT", daemon.DefaultPort), "HTTP port")
	flags.StringVar(&bind, "bind", envStr("SPECTRE_BIND", daemon.DefaultBind), "Bind address")
	flags.BoolVar(&daemonFlag, "daemon", false, "Run as background daemon")
	flags.BoolVar(&noBrowser, "no-browser", envBool("SPECTRE_NO_BROWSER", false), "Don't open browser")
	flags.StringVar(&configDir, "config", envStr("SPECTRE_CONFIG", ""), "Config directory")

	rootCmd.Flags().IntVarP(&port, "port", "p", envInt("SPECTRE_PORT", daemon.DefaultPort), "HTTP port")
	rootCmd.Flags().StringVar(&bind, "bind", envStr("SPECTRE_BIND", daemon.DefaultBind), "Bind address")
	rootCmd.Flags().BoolVar(&daemonFlag, "daemon", false, "Run as background daemon")
	rootCmd.Flags().BoolVar(&noBrowser, "no-browser", envBool("SPECTRE_NO_BROWSER", false), "Don't open browser")
	rootCmd.Flags().StringVar(&configDir, "config", envStr("SPECTRE_CONFIG", ""), "Config directory")

	trayFlags := trayCmd.Flags()
	trayFlags.IntVarP(&port, "port", "p", envInt("SPECTRE_PORT", daemon.DefaultPort), "HTTP port for daemon")
	trayFlags.StringVar(&bind, "bind", envStr("SPECTRE_BIND", daemon.DefaultBind), "Bind address for daemon")
	trayFlags.StringVar(&configDir, "config", envStr("SPECTRE_CONFIG", ""), "Config directory")
	trayFlags.BoolVar(&noBrowser, "no-browser", true, "Don't open browser when starting from tray")
	trayFlags.BoolVar(&installTrayAutostart, "install-autostart", false, "Install KDE autostart entry")
	trayFlags.BoolVar(&uninstallTrayAutostart, "uninstall-autostart", false, "Remove KDE autostart entry")
}

func runStart(cmd *cobra.Command, args []string) error {
	if daemonFlag && os.Getenv("SPECTRE_DAEMON") != "1" {
		return runAsDaemon()
	}

	dir := daemon.ResolveConfigDir(configDir)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}

	srv, err := server.New(bind, port, dir)
	if err != nil {
		return err
	}

	if os.Getenv("SPECTRE_DAEMON") == "1" {
		pid := os.Getpid()
		if err := os.WriteFile(daemon.PidPath(dir), []byte(strconv.Itoa(pid)), 0o600); err != nil {
			return err
		}
		if err := daemon.WriteRuntime(dir, daemon.RuntimeInfo{
			Bind: bind,
			Port: port,
			PID:  pid,
		}); err != nil {
			return err
		}
		defer daemon.RemoveRuntimeArtifacts(dir)
	}

	if !noBrowser {
		go func() {
			time.Sleep(500 * time.Millisecond)
			openBrowser(daemon.URL(dir))
		}()
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	return srv.Start(ctx)
}

func runTray(cmd *cobra.Command, args []string) error {
	executable, err := os.Executable()
	if err != nil {
		return err
	}

	if uninstallTrayAutostart {
		if err := tray.UninstallAutostart(); err != nil {
			return err
		}
		fmt.Println("[SPECTRE] KDE autostart removed")
		return nil
	}

	if installTrayAutostart {
		if err := tray.InstallAutostart(executable); err != nil {
			return err
		}
		fmt.Println("[SPECTRE] KDE autostart installed (~/.config/autostart/spectre-tray.desktop)")
		return nil
	}

	return tray.Run(tray.Config{
		Port:      port,
		Bind:      bind,
		ConfigDir: configDir,
	})
}

var stopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop the SPECTRE daemon",
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := daemon.Stop(configDir); err != nil {
			return err
		}
		daemon.RemoveRuntimeArtifacts(daemon.ResolveConfigDir(configDir))
		fmt.Println("[SPECTRE] Daemon stopped")
		return nil
	},
}

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Check daemon status",
	RunE: func(cmd *cobra.Command, args []string) error {
		running, pid := daemon.Status(configDir)
		if !running {
			fmt.Println("SPECTRE is not running")
			return nil
		}
		fmt.Printf("SPECTRE is running (PID %d) at %s\n", pid, daemon.URL(daemon.ResolveConfigDir(configDir)))
		return nil
	},
}

var openCmd = &cobra.Command{
	Use:   "open",
	Short: "Open SPECTRE in browser",
	RunE: func(cmd *cobra.Command, args []string) error {
		dir := daemon.ResolveConfigDir(configDir)
		if !daemon.IsRunning(dir) {
			return fmt.Errorf("daemon not running")
		}
		openBrowser(daemon.URL(dir))
		return nil
	},
}

func runAsDaemon() error {
	opts := daemon.Options{
		Port:      port,
		Bind:      bind,
		ConfigDir: configDir,
	}
	if err := daemon.Start(opts); err != nil {
		return err
	}
	dir := daemon.ResolveConfigDir(configDir)
	pid, _ := daemon.ReadPID(dir)
	fmt.Printf("[SPECTRE] Daemon started (PID %d)\n", pid)
	fmt.Printf("[SPECTRE] Access: %s\n", daemon.URL(dir))
	fmt.Println("[SPECTRE] Tip: run `spectre tray --install-autostart` for KDE panel control")
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
