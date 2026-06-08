package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
	"sync"

	"golang.org/x/crypto/pbkdf2"
)

const (
	SaltSize   = 32
	KeySize    = 32
	PBKDF2Iter = 100_000
)

type Vault struct {
	mu        sync.RWMutex
	masterKey []byte
	locked    bool
}

func NewVault() *Vault {
	return &Vault{locked: true}
}

func (v *Vault) IsLocked() bool {
	v.mu.RLock()
	defer v.mu.RUnlock()
	return v.locked
}

func (v *Vault) Unlock(masterPassword string, salt []byte) error {
	key := pbkdf2.Key([]byte(masterPassword), salt, PBKDF2Iter, KeySize, sha256.New)
	v.mu.Lock()
	defer v.mu.Unlock()
	v.masterKey = key
	v.locked = false
	return nil
}

func (v *Vault) Lock() {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.masterKey = nil
	v.locked = true
}

func HashMasterPassword(password string, salt []byte) string {
	key := pbkdf2.Key([]byte(password), salt, PBKDF2Iter, KeySize, sha256.New)
	return base64.StdEncoding.EncodeToString(key)
}

func VerifyMasterPassword(password string, salt []byte, hash string) bool {
	return HashMasterPassword(password, salt) == hash
}

func (v *Vault) Encrypt(plaintext string) (string, error) {
	v.mu.RLock()
	defer v.mu.RUnlock()
	if v.locked || v.masterKey == nil {
		return "", errors.New("vault is locked")
	}
	return encryptWithKey(v.masterKey, plaintext)
}

func (v *Vault) Decrypt(encoded string) (string, error) {
	v.mu.RLock()
	defer v.mu.RUnlock()
	if v.locked || v.masterKey == nil {
		return "", errors.New("vault is locked")
	}
	return decryptWithKey(v.masterKey, encoded)
}

func EncryptWithPassword(plaintext, masterPassword string, salt []byte) (string, error) {
	key := pbkdf2.Key([]byte(masterPassword), salt, PBKDF2Iter, KeySize, sha256.New)
	return encryptWithKey(key, plaintext)
}

func DecryptWithPassword(encoded, masterPassword string, salt []byte) (string, error) {
	key := pbkdf2.Key([]byte(masterPassword), salt, PBKDF2Iter, KeySize, sha256.New)
	return decryptWithKey(key, encoded)
}

func encryptWithKey(key []byte, plaintext string) (string, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func decryptWithKey(key []byte, encoded string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
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
		return "", errors.New("decryption failed")
	}
	return string(plaintext), nil
}

func GenerateSalt() ([]byte, error) {
	salt := make([]byte, SaltSize)
	_, err := io.ReadFull(rand.Reader, salt)
	return salt, err
}
