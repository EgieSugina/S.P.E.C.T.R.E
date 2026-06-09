package ssh

import (
	"encoding/base64"
	"fmt"
	"net"
	"strconv"

	"golang.org/x/crypto/ssh"
	"gorm.io/gorm"

	"spectre/internal/store"
)

type HostKeyMismatchError struct {
	Host        string `json:"host"`
	Port        int    `json:"port"`
	Expected    string `json:"expected_fingerprint"`
	Received    string `json:"received_fingerprint"`
	ReceivedKey string `json:"received_key"`
	KeyType     string `json:"key_type"`
}

func (e *HostKeyMismatchError) Error() string {
	return fmt.Sprintf(
		"host key mismatch for %s:%d: expected %s, got %s",
		e.Host, e.Port, e.Expected, e.Received,
	)
}

func NewHostKeyCallback(db *store.DB) ssh.HostKeyCallback {
	return func(_ string, remote net.Addr, key ssh.PublicKey) error {
		host, portStr, err := net.SplitHostPort(remote.String())
		if err != nil {
			return fmt.Errorf("invalid remote address: %w", err)
		}
		port, err := strconv.Atoi(portStr)
		if err != nil {
			return fmt.Errorf("invalid port: %w", err)
		}

		fp := ssh.FingerprintSHA256(key)
		stored, err := db.GetKnownHost(host, port)
		if err == gorm.ErrRecordNotFound {
			return db.UpsertKnownHost(&store.KnownHost{
				Host:        host,
				Port:        port,
				KeyType:     key.Type(),
				Fingerprint: fp,
				KeyData:     base64.StdEncoding.EncodeToString(key.Marshal()),
			})
		}
		if err != nil {
			return err
		}
		if stored.Fingerprint != fp {
			return &HostKeyMismatchError{
				Host:        host,
				Port:        port,
				Expected:    stored.Fingerprint,
				Received:    fp,
				ReceivedKey: base64.StdEncoding.EncodeToString(key.Marshal()),
				KeyType:     key.Type(),
			}
		}
		return nil
	}
}

func TrustHostKey(db *store.DB, host string, port int, keyType, fingerprint, keyData string) error {
	return db.UpsertKnownHost(&store.KnownHost{
		Host:        host,
		Port:        port,
		KeyType:     keyType,
		Fingerprint: fingerprint,
		KeyData:     keyData,
	})
}
