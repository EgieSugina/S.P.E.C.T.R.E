package ssh

import "spectre/internal/crypto"

func GenerateKey(keyType string, bits int) (privatePEM, publicSSH, fingerprint string, err error) {
	switch keyType {
	case "ed25519":
		return crypto.GenerateEd25519Key()
	case "rsa", "":
		return crypto.GenerateRSAKey(bits)
	default:
		return crypto.GenerateRSAKey(4096)
	}
}
