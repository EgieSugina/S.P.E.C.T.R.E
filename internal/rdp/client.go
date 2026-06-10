package rdp

import (
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/tomatome/grdp/core"
	"github.com/tomatome/grdp/glog"
	"github.com/tomatome/grdp/plugin"
	"github.com/tomatome/grdp/protocol/nla"
	"github.com/tomatome/grdp/protocol/pdu"
	"github.com/tomatome/grdp/protocol/sec"
	"github.com/tomatome/grdp/protocol/t125"
	"github.com/tomatome/grdp/protocol/tpkt"
	"github.com/tomatome/grdp/protocol/x224"
)

func init() {
	glog.SetLevel(glog.NONE)
}

// Client wraps a live RDP protocol session (tomatome/grdp).
type Client struct {
	tpkt     *tpkt.TPKT
	mcs      *t125.MCSClient
	sec      *sec.Client
	pdu      *pdu.Client
	channels *plugin.Channels
	width    int
	height   int
}

func dialAndLogin(cfg *AccountConfig) (*Client, error) {
	width, height := cfg.Width, cfg.Height
	if width <= 0 {
		width = 1280
	}
	if height <= 0 {
		height = 720
	}

	conn, err := net.DialTimeout("tcp", cfg.Addr(), 15*time.Second)
	if err != nil {
		return nil, fmt.Errorf("dial: %w", err)
	}

	domain, user := splitDomainUser(cfg.Domain, cfg.Username)

	c := &Client{width: width, height: height}
	c.tpkt = tpkt.New(core.NewSocketLayer(conn), nla.NewNTLMv2(domain, user, cfg.Password))
	x224c := x224.New(c.tpkt)
	c.mcs = t125.NewMCSClient(x224c)
	c.sec = sec.NewClient(c.mcs)
	c.pdu = pdu.NewClient(c.sec)
	c.channels = plugin.NewChannels(c.sec)

	c.mcs.SetClientCoreData(uint16(width), uint16(height))
	c.sec.SetUser(user)
	c.sec.SetPwd(cfg.Password)
	c.sec.SetDomain(domain)

	c.tpkt.SetFastPathListener(c.sec)
	c.sec.SetFastPathListener(c.pdu)
	c.sec.SetChannelSender(c.mcs)
	c.channels.SetChannelSender(c.sec)

	if err := x224c.Connect(); err != nil {
		c.Close()
		return nil, fmt.Errorf("rdp connect: %w", err)
	}
	return c, nil
}

func splitDomainUser(domain, user string) (string, string) {
	if i := strings.Index(user, "\\"); i >= 0 {
		return user[:i], user[i+1:]
	}
	if i := strings.Index(user, "/"); i >= 0 {
		return user[:i], user[i+1:]
	}
	return domain, user
}

func (c *Client) On(event string, fn interface{}) {
	c.pdu.On(event, fn)
}

func (c *Client) SendMouse(button int, x, y int, pressed bool) {
	p := &pdu.PointerEvent{}
	if pressed {
		p.PointerFlags |= pdu.PTRFLAGS_DOWN
	}
	switch button {
	case 0:
		p.PointerFlags |= pdu.PTRFLAGS_BUTTON1
	case 1:
		p.PointerFlags |= pdu.PTRFLAGS_BUTTON3
	case 2:
		p.PointerFlags |= pdu.PTRFLAGS_BUTTON2
	default:
		p.PointerFlags |= pdu.PTRFLAGS_MOVE
	}
	p.XPos = uint16(x)
	p.YPos = uint16(y)
	c.pdu.SendInputEvents(pdu.INPUT_EVENT_MOUSE, []pdu.InputEventsInterface{p})
}

func (c *Client) SendMouseMove(x, y int) {
	c.SendMouse(-1, x, y, false)
}

func (c *Client) SendKey(scancode uint16, pressed bool) {
	p := &pdu.ScancodeKeyEvent{KeyCode: scancode}
	if !pressed {
		p.KeyboardFlags |= pdu.KBDFLAGS_RELEASE
	}
	c.pdu.SendInputEvents(pdu.INPUT_EVENT_SCANCODE, []pdu.InputEventsInterface{p})
}

func (c *Client) Close() {
	if c != nil && c.tpkt != nil {
		c.tpkt.Close()
	}
}
