package rdp

import "fmt"

// AccountConfig holds credentials and display settings for an RDP connection.
type AccountConfig struct {
	Host     string
	Port     int
	Domain   string
	Username string
	Password string
	Width    int
	Height   int
}

func (c *AccountConfig) Addr() string {
	port := c.Port
	if port == 0 {
		port = 3389
	}
	return fmt.Sprintf("%s:%d", c.Host, port)
}
