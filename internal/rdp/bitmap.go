package rdp

import (
	"encoding/base64"

	"github.com/tomatome/grdp/core"
	"github.com/tomatome/grdp/protocol/pdu"
)

// FrameBitmap is a decompressed desktop region for the browser canvas.
type FrameBitmap struct {
	DestLeft int    `json:"dest_left"`
	DestTop  int    `json:"dest_top"`
	Width    int    `json:"width"`
	Height   int    `json:"height"`
	Data     string `json:"data"` // base64 RGBA
}

func bitmapsFromPDU(rectangles []pdu.BitmapData) []FrameBitmap {
	out := make([]FrameBitmap, 0, len(rectangles))
	for _, v := range rectangles {
		data := v.BitmapDataStream
		if v.IsCompress() {
			data = core.Decompress(data, int(v.Width), int(v.Height), bpp(v.BitsPerPixel))
		}
		w := int(v.DestRight - v.DestLeft + 1)
		h := int(v.DestBottom - v.DestTop + 1)
		if w <= 0 || h <= 0 {
			w = int(v.Width)
			h = int(v.Height)
		}
		out = append(out, FrameBitmap{
			DestLeft: int(v.DestLeft),
			DestTop:  int(v.DestTop),
			Width:    w,
			Height:   h,
			Data:     base64.StdEncoding.EncodeToString(data),
		})
	}
	return out
}

func bpp(bitsPerPixel uint16) int {
	switch bitsPerPixel {
	case 15:
		return 1
	case 16:
		return 2
	case 24:
		return 3
	case 32:
		return 4
	default:
		return 4
	}
}
