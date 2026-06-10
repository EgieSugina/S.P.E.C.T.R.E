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
	"spectre/internal/service"
	"spectre/internal/tray"
	"spectre/internal/update"
	"spectre/internal/version"
)

var (
	port      int
	bind      string
	daemonFlag bool
	noBrowser bool
	configDir string
	installTrayAutostart     bool
	uninstallTrayAutostart   bool
	serviceUser              bool
	updateCheckOnly          bool
	updateRepo               string
)

func main() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

var rootCmd = &cobra.Command{
	Use:   "spectre",
	Short: "S.P.E.C.T.R.E — Secure Proxy & Encrypted Connection Tunneling Remote Environment",
	Long: `You were never here.

SSH/SFTP manager with embedded web UI. Default command starts the server.

Commands:
  start    Start the HTTP server (foreground or --daemon)
  stop     Stop a background daemon
  status   Show daemon PID and URL
  open     Open the UI in your browser
  tray     Linux KDE system tray icon and autostart
  service  Install OS background service (systemd / launchd / Windows Service)
  update   Check for or apply updates from GitHub releases
  version  Print build version information`,
	RunE: runStart,
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
	rootCmd.AddCommand(serviceCmd)
	rootCmd.AddCommand(updateCmd)
	rootCmd.AddCommand(versionCmd)

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

	serviceCmd.PersistentFlags().BoolVar(&serviceUser, "user", true, "User-level service (systemd --user / LaunchAgent)")
	serviceCmd.PersistentFlags().IntVarP(&port, "port", "p", envInt("SPECTRE_PORT", daemon.DefaultPort), "HTTP port")
	serviceCmd.PersistentFlags().StringVar(&bind, "bind", envStr("SPECTRE_BIND", daemon.DefaultBind), "Bind address")
	serviceCmd.PersistentFlags().StringVar(&configDir, "config", envStr("SPECTRE_CONFIG", ""), "Config directory")

	updateCmd.Flags().BoolVar(&updateCheckOnly, "check", false, "Check for updates without installing")
	updateCmd.Flags().StringVar(&updateRepo, "repo", "", "GitHub repo owner/name (default EgieSugina/S.P.E.C.T.R.E)")

	serviceCmd.AddCommand(serviceInstallCmd)
	serviceCmd.AddCommand(serviceUninstallCmd)
	serviceCmd.AddCommand(serviceStatusCmd)

	for _, cmd := range []*cobra.Command{stopCmd, statusCmd, openCmd} {
		cmd.Flags().StringVar(&configDir, "config", envStr("SPECTRE_CONFIG", ""), "Config directory")
	}
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

var serviceCmd = &cobra.Command{
	Use:   "service",
	Short: "Install or manage OS background service",
	Long: `Register SPECTRE as a platform service so it starts at login.

Linux: writes ~/.config/systemd/user/spectre.service (systemctl --user)
macOS: writes ~/Library/LaunchAgents/com.spectre.daemon.plist
Windows: registers Windows Service "SPECTRE" (requires administrator)`,
}

var serviceInstallCmd = &cobra.Command{
	Use:   "install",
	Short: "Install background service",
	RunE:  runServiceInstall,
}

var serviceUninstallCmd = &cobra.Command{
	Use:   "uninstall",
	Short: "Remove background service",
	RunE:  runServiceUninstall,
}

var serviceStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show service installation state",
	RunE:  runServiceStatus,
}

var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "Check for or install updates from GitHub releases",
	Long:  "Compares the running binary to the latest GitHub release and optionally replaces it in place.",
	RunE:  runUpdate,
}

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print version, build date, and commit",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Printf("spectre %s (%s, %s)\n", version.Version, version.Commit, version.BuildDate)
	},
}

var stopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop the SPECTRE daemon",
	Long:  "Sends SIGTERM to the PID in the config directory and removes runtime artifacts.",
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
	Long:  "Reports whether the background daemon is running and prints its PID and URL.",
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
	Long:  "Opens the daemon URL in the default browser. The daemon must already be running.",
	RunE: func(cmd *cobra.Command, args []string) error {
		dir := daemon.ResolveConfigDir(configDir)
		if !daemon.IsRunning(dir) {
			return fmt.Errorf("daemon not running")
		}
		openBrowser(daemon.URL(dir))
		return nil
	},
}

func runServiceInstall(cmd *cobra.Command, args []string) error {
	executable, err := os.Executable()
	if err != nil {
		return err
	}
	if err := service.Install(service.Options{
		Executable: executable,
		Port:       port,
		Bind:       bind,
		ConfigDir:  configDir,
		User:       serviceUser,
	}); err != nil {
		return err
	}
	fmt.Println("[SPECTRE] Service installed")
	return nil
}

func runServiceUninstall(cmd *cobra.Command, args []string) error {
	if err := service.Uninstall(serviceUser); err != nil {
		return err
	}
	fmt.Println("[SPECTRE] Service removed")
	return nil
}

func runServiceStatus(cmd *cobra.Command, args []string) error {
	state, err := service.Status(serviceUser)
	if err != nil {
		return err
	}
	fmt.Printf("SPECTRE service: %s\n", state)
	return nil
}

func runUpdate(cmd *cobra.Command, args []string) error {
	if updateCheckOnly {
		res, err := update.Check(updateRepo)
		if err != nil {
			return err
		}
		fmt.Printf("Current: %s\nLatest:  %s\n", res.Current, res.Latest)
		if res.UpdateAvail {
			fmt.Println("Update available — run `spectre update` to install")
		} else {
			fmt.Println(res.Message)
		}
		return nil
	}
	res, err := update.Apply(updateRepo)
	if err != nil {
		return err
	}
	fmt.Println(res.Message)
	return nil
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
