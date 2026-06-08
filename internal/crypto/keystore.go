package crypto

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"

	"golang.org/x/crypto/ssh"
)

func ParsePrivateKey(pemData, passphrase string) (ssh.Signer, error) {
	block, _ := pem.Decode([]byte(pemData))
	if block == nil {
		return nil, errors.New("invalid PEM data")
	}

	var key interface{}
	var err error
	if passphrase != "" {
		key, err = ssh.ParseRawPrivateKeyWithPassphrase(block.Bytes, []byte(passphrase))
	} else {
		key, err = ssh.ParseRawPrivateKey(block.Bytes)
	}
	if err != nil {
		return nil, err
	}
	return ssh.NewSignerFromKey(key)
}

func GenerateRSAKey(bits int) (privatePEM, publicSSH string, fingerprint string, err error) {
	if bits == 0 {
		bits = 4096
	}
	key, err := rsa.GenerateKey(rand.Reader, bits)
	if err != nil {
		return "", "", "", err
	}
	privBytes := x509.MarshalPKCS1PrivateKey(key)
	privatePEM = string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: privBytes}))
	pub, err := ssh.NewPublicKey(&key.PublicKey)
	if err != nil {
		return "", "", "", err
	}
	publicSSH = string(ssh.MarshalAuthorizedKey(pub))
	fingerprint = ssh.FingerprintSHA256(pub)
	return privatePEM, publicSSH, fingerprint, nil
}

func GenerateEd25519Key() (privatePEM, publicSSH string, fingerprint string, err error) {
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return "", "", "", err
	}
	signer, err := ssh.NewSignerFromKey(priv)
	if err != nil {
		return "", "", "", err
	}
	privBytes, err := ssh.MarshalPrivateKey(signer, "")
	if err != nil {
		return "", "", "", err
	}
	privatePEM = string(pem.EncodeToMemory(privBytes))
	publicSSH = string(ssh.MarshalAuthorizedKey(signer.PublicKey()))
	fingerprint = ssh.FingerprintSHA256(signer.PublicKey())
	return privatePEM, publicSSH, fingerprint, nil
}
