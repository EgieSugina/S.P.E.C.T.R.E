package ssh

import (
	"spectre/internal/crypto"

	"golang.org/x/crypto/ssh"
)

func buildAuthMethods(cfg *AccountConfig) []ssh.AuthMethod {
	var methods []ssh.AuthMethod

	if cfg.Password != "" {
		methods = append(methods, ssh.Password(cfg.Password))
	}

	if cfg.PrivateKey != "" {
		signer, err := crypto.ParsePrivateKey(cfg.PrivateKey, cfg.Passphrase)
		if err == nil {
			methods = append(methods, ssh.PublicKeys(signer))
		}
	}

	return methods
}

func HasAuthMethods(cfg *AccountConfig) bool {
	return len(buildAuthMethods(cfg)) > 0
}
