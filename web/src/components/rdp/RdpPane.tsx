import { useCallback, useEffect, useRef, useState } from 'react'
import { wsUrl } from '@/api/client'
import { rdpScancode } from '@/lib/rdpKeyboard'
import { Button } from '@/components/shared/Button'

interface FrameBitmap {
  dest_left: number
  dest_top: number
  width: number
  height: number
  data: string
}

interface RdpPaneProps {
  sessionId: string
  width: number
  height: number
  isActive: boolean
  onReconnect?: () => Promise<void>
}

function decodeBase64(b64: string): Uint8ClampedArray {
  const bin = atob(b64)
  const out = new Uint8ClampedArray(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function RdpPane({ sessionId, width, height, isActive, onReconnect }: RdpPaneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [disconnected, setDisconnected] = useState(false)
  const [disconnectReason, setDisconnectReason] = useState('')
  const [reconnecting, setReconnecting] = useState(false)
  const [focused, setFocused] = useState(false)

  const drawBitmap = useCallback((bitmap: FrameBitmap) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pixels = decodeBase64(bitmap.data)
    const w = bitmap.width
    const h = bitmap.height
    if (pixels.length < w * h * 4) return
    const imageData = ctx.createImageData(w, h)
    imageData.data.set(pixels.subarray(0, w * h * 4))
    ctx.putImageData(imageData, bitmap.dest_left, bitmap.dest_top)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = width
    canvas.height = height

    setDisconnected(false)
    setDisconnectReason('')

    const ws = new WebSocket(wsUrl(`/ws/rdp/${sessionId}`))
    wsRef.current = ws

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'frame' && Array.isArray(msg.bitmaps)) {
        for (const b of msg.bitmaps as FrameBitmap[]) drawBitmap(b)
      } else if (msg.type === 'disconnected') {
        setDisconnected(true)
        setDisconnectReason(msg.reason || 'connection lost')
      } else if (msg.type === 'connected' && msg.width && msg.height) {
        canvas.width = msg.width
        canvas.height = msg.height
      }
    }

    ws.onclose = () => {
      setDisconnected(true)
      setDisconnectReason((prev) => prev || 'websocket closed')
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [sessionId, width, height, drawBitmap])

  const send = (payload: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload))
    }
  }

  const mouseButton = (button: number) => {
    switch (button) {
      case 0:
        return 0
      case 1:
        return 2
      case 2:
        return 1
      default:
        return -1
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!focused || disconnected) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.round(((e.clientX - rect.left) / rect.width) * e.currentTarget.width)
    const y = Math.round(((e.clientY - rect.top) / rect.height) * e.currentTarget.height)
    send({ type: 'mouse', button: -1, x, y, pressed: false })
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.currentTarget.focus()
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.round(((e.clientX - rect.left) / rect.width) * e.currentTarget.width)
    const y = Math.round(((e.clientY - rect.top) / rect.height) * e.currentTarget.height)
    send({ type: 'mouse', button: mouseButton(e.button), x, y, pressed: true })
  }

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.round(((e.clientX - rect.left) / rect.width) * e.currentTarget.width)
    const y = Math.round(((e.clientY - rect.top) / rect.height) * e.currentTarget.height)
    send({ type: 'mouse', button: mouseButton(e.button), x, y, pressed: false })
  }

  const handleKey = (e: React.KeyboardEvent, pressed: boolean) => {
    e.preventDefault()
    const sc = rdpScancode(e.code)
    if (sc === 0) return
    send({ type: pressed ? 'keydown' : 'keyup', scancode: sc })
  }

  const handleReconnect = async () => {
    if (!onReconnect) return
    setReconnecting(true)
    try {
      await onReconnect()
      setDisconnected(false)
      setDisconnectReason('')
    } finally {
      setReconnecting(false)
    }
  }

  return (
    <div ref={containerRef} className="relative w-full h-full bg-deep overflow-auto flex items-center justify-center">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        className="border border-[var(--border-default)] outline-none max-w-full max-h-full"
        style={{ display: isActive ? 'block' : 'none' }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => handleKey(e, true)}
        onKeyUp={(e) => handleKey(e, false)}
      />
      {!focused && !disconnected && (
        <p className="absolute bottom-4 font-mono text-[10px] text-text-muted pointer-events-none">
          Click canvas to capture keyboard
        </p>
      )}
      {disconnected && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-deep/90 gap-3">
          <p className="font-mono text-sm text-term-red">{disconnectReason}</p>
          {onReconnect && (
            <Button variant="primary" onClick={handleReconnect} disabled={reconnecting}>
              {reconnecting ? 'Reconnecting…' : 'Reconnect'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
