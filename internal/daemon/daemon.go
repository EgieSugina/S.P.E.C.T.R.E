package daemon

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"syscall"
)

const (
	DefaultPort = 57321
	DefaultBind = "127.0.0.1"
)

type Options struct {
	Port      int
	Bind      string
	ConfigDir string
}

type RuntimeInfo struct {
	Bind string `json:"bind"`
	Port int    `json:"port"`
	PID  int    `json:"pid"`
}

func ResolveConfigDir(custom string) string {
	if custom != "" {
		return custom
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ".spectre"
	}
	return filepath.Join(home, ".spectre")
}

func PidPath(configDir string) string {
	return filepath.Join(configDir, "spectre.pid")
}

func RuntimePath(configDir string) string {
	return filepath.Join(configDir, "runtime.json")
}

func ReadPID(configDir string) (int, error) {
	data, err := os.ReadFile(PidPath(configDir))
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(string(data))
}

func IsRunning(configDir string) bool {
	pid, err := ReadPID(configDir)
	if err != nil {
		return false
	}
	return processAlive(pid)
}

func processAlive(pid int) bool {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return proc.Signal(syscall.Signal(0)) == nil
}

func ReadRuntime(configDir string) (RuntimeInfo, error) {
	data, err := os.ReadFile(RuntimePath(configDir))
	if err != nil {
		return RuntimeInfo{Bind: DefaultBind, Port: DefaultPort}, err
	}
	var info RuntimeInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return RuntimeInfo{Bind: DefaultBind, Port: DefaultPort}, err
	}
	if info.Bind == "" {
		info.Bind = DefaultBind
	}
	if info.Port == 0 {
		info.Port = DefaultPort
	}
	return info, nil
}

func URL(configDir string) string {
	info, err := ReadRuntime(configDir)
	if err != nil {
		return fmt.Sprintf("http://%s:%d", DefaultBind, DefaultPort)
	}
	return fmt.Sprintf("http://%s:%d", info.Bind, info.Port)
}

func WriteRuntime(configDir string, info RuntimeInfo) error {
	if err := os.MkdirAll(configDir, 0o700); err != nil {
		return err
	}
	data, err := json.Marshal(info)
	if err != nil {
		return err
	}
	return os.WriteFile(RuntimePath(configDir), data, 0o600)
}

func RemoveRuntimeArtifacts(configDir string) {
	_ = os.Remove(PidPath(configDir))
	_ = os.Remove(RuntimePath(configDir))
}

func Start(opts Options) error {
	configDir := ResolveConfigDir(opts.ConfigDir)
	if err := os.MkdirAll(configDir, 0o700); err != nil {
		return err
	}
	if IsRunning(configDir) {
		return fmt.Errorf("SPECTRE daemon already running")
	}

	executable, err := os.Executable()
	if err != nil {
		return err
	}

	args := []string{"start", "--no-browser", "--bind", opts.Bind, "--port", strconv.Itoa(opts.Port)}
	if opts.ConfigDir != "" {
		args = append(args, "--config", configDir)
	}

	cmd := exec.Command(executable, args...)
	cmd.Env = append(os.Environ(), "SPECTRE_DAEMON=1")
	cmd.Stdout = nil
	cmd.Stderr = nil
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start daemon: %w", err)
	}

	pid := cmd.Process.Pid
	if err := os.WriteFile(PidPath(configDir), []byte(strconv.Itoa(pid)), 0o600); err != nil {
		return err
	}
	return WriteRuntime(configDir, RuntimeInfo{
		Bind: opts.Bind,
		Port: opts.Port,
		PID:  pid,
	})
}

func Stop(configDir string) error {
	configDir = ResolveConfigDir(configDir)
	pid, err := ReadPID(configDir)
	if err != nil {
		return fmt.Errorf("daemon not running")
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		RemoveRuntimeArtifacts(configDir)
		return fmt.Errorf("daemon not running")
	}
	if err := proc.Signal(syscall.SIGTERM); err != nil {
		RemoveRuntimeArtifacts(configDir)
		return fmt.Errorf("daemon not running")
	}
	return nil
}

func Status(configDir string) (bool, int) {
	configDir = ResolveConfigDir(configDir)
	pid, err := ReadPID(configDir)
	if err != nil || !processAlive(pid) {
		return false, 0
	}
	return true, pid
}
