//go:build linux

package tray

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"time"

	"fyne.io/systray"

	"spectre/internal/daemon"
)

type Config struct {
	Port      int
	Bind      string
	ConfigDir string
}

func Run(cfg Config) error {
	if runtime.GOOS != "linux" {
		return fmt.Errorf("system tray requires Linux (KDE/Plasma)")
	}
	systray.Run(func() { onReady(cfg) }, onExit)
	return nil
}

func onReady(cfg Config) {
	systray.SetTitle("SPECTRE")

	mOpen := systray.AddMenuItem("Open SPECTRE", "Open web UI in browser")
	systray.AddSeparator()
	mStart := systray.AddMenuItem("Start Daemon", "Start background server")
	mStop := systray.AddMenuItem("Stop Daemon", "Stop background server")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Quit Tray", "Remove icon from system tray")

	configDir := daemon.ResolveConfigDir(cfg.ConfigDir)
	opts := daemon.Options{
		Port:      cfg.Port,
		Bind:      cfg.Bind,
		ConfigDir: configDir,
	}
	if opts.Port == 0 {
		opts.Port = daemon.DefaultPort
	}
	if opts.Bind == "" {
		opts.Bind = daemon.DefaultBind
	}

	var lastRunning bool
	var iconSynced bool

	refreshMenu := func() {
		running := daemon.IsRunning(configDir)
		if running {
			mStart.Disable()
			mStop.Enable()
			systray.SetTooltip("SPECTRE — Running")
		} else {
			mStart.Enable()
			mStop.Disable()
			systray.SetTooltip("SPECTRE — Stopped")
		}
		if !iconSynced || running != lastRunning {
			systray.SetIcon(TrayIcon(running))
			lastRunning = running
			iconSynced = true
		}
	}
	refreshMenu()

	go func() {
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			refreshMenu()
		}
	}()

	go func() {
		for {
			select {
			case <-mOpen.ClickedCh:
				if !daemon.IsRunning(configDir) {
					Notify("SPECTRE", "Daemon is not running. Start it from the tray menu.")
					continue
				}
				openBrowser(daemon.URL(configDir))
			case <-mStart.ClickedCh:
				if err := daemon.Start(opts); err != nil {
					Notify("SPECTRE", err.Error())
					continue
				}
				Notify("SPECTRE", fmt.Sprintf("Daemon started on %s", daemon.URL(configDir)))
				refreshMenu()
			case <-mStop.ClickedCh:
				if err := daemon.Stop(configDir); err != nil {
					Notify("SPECTRE", err.Error())
					continue
				}
				Notify("SPECTRE", "Daemon stopped")
				refreshMenu()
			case <-mQuit.ClickedCh:
				systray.Quit()
				return
			}
		}
	}()
}

func onExit() {}

func openBrowser(url string) {
	_ = exec.Command("xdg-open", url).Start()
}

func InstallAutostart(executable string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	iconDir := fmt.Sprintf("%s/.local/share/icons/hicolor/256x256/apps", home)
	if err := os.MkdirAll(iconDir, 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(iconDir+"/spectre.png", Icon256(), 0o644); err != nil {
		return err
	}

	autostartDir := fmt.Sprintf("%s/.config/autostart", home)
	if err := os.MkdirAll(autostartDir, 0o755); err != nil {
		return err
	}

	desktop := fmt.Sprintf(`[Desktop Entry]
Type=Application
Name=SPECTRE
GenericName=SSH Manager Tray
Comment=S.P.E.C.T.R.E system tray — start/stop daemon from KDE panel
Exec=%s tray --no-browser
Icon=spectre
Terminal=false
Categories=Network;System;
StartupNotify=false
X-KDE-StartupNotify=false
X-KDE-autostart-after=panel
X-GNOME-Autostart-enabled=true
`, executable)

	return os.WriteFile(autostartDir+"/spectre-tray.desktop", []byte(desktop), 0o644)
}

func UninstallAutostart() error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	_ = os.Remove(home + "/.config/autostart/spectre-tray.desktop")
	_ = os.Remove(home + "/.local/share/icons/hicolor/256x256/apps/spectre.png")
	return nil
}

func AutostartInstalled() bool {
	home, err := os.UserHomeDir()
	if err != nil {
		return false
	}
	_, err = os.Stat(home + "/.config/autostart/spectre-tray.desktop")
	return err == nil
}
