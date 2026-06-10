import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { wsUrl } from '@/api/client'
import { formatDisconnectReason } from '@/lib/connectionErrors'
import { getXtermTheme } from '@/lib/theme'
import { Button } from '@/components/shared/Button'

interface TerminalPaneProps {
  sessionId: string
  isActive: boolean
  onReconnect?: () => Promise<void>
}

export function TerminalPane({ sessionId, isActive, onReconnect }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const disconnectedRef = useRef(false)
  const [disconnected, setDisconnected] = useState(false)
  const [disconnectReason, setDisconnectReason] = useState('')
  const [reconnecting, setReconnecting] = useState(false)

  const initTerminal = useCallback(() => {
    if (!containerRef.current) return

    disconnectedRef.current = false
    setDisconnected(false)
    setDisconnectReason('')

    const term = new Terminal({
      theme: getXtermTheme(),
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      convertEol: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    fitAddon.fit()

    termRef.current = term
    fitRef.current = fitAddon

    const ws = new WebSocket(wsUrl(`/ws/terminal/${sessionId}`))
    wsRef.current = ws

    const markDisconnected = (reason: string) => {
      if (disconnectedRef.current) return
      disconnectedRef.current = true
      const message = formatDisconnectReason(reason)
      setDisconnected(true)
      setDisconnectReason(message)
      term.writeln(`\r\n\x1b[31m[SPECTRE]\x1b[0m ${message}`)
    }

    ws.onopen = () => {
      term.writeln('\x1b[35m[SPECTRE]\x1b[0m Connected to session')
      const dims = fitAddon.proposeDimensions()
      if (dims) {
        ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }))
      }
    }

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'output' || msg.type === 'buffer') {
        term.write(atob(msg.data))
      } else if (msg.type === 'disconnected') {
        markDisconnected(msg.reason || 'connection lost')
      }
    }

    ws.onclose = (event) => {
      if (!disconnectedRef.current) {
        markDisconnected(event.reason || 'connection lost')
      }
    }

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }))
      }
    })

    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }))
      }
    })

    return () => {
      ws.close()
      term.dispose()
    }
  }, [sessionId])

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (isActive) fitRef.current?.fit()
    })
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [isActive])

  useEffect(() => {
    const cleanup = initTerminal()
    return cleanup
  }, [initTerminal])

  useEffect(() => {
    if (isActive) {
      setTimeout(() => fitRef.current?.fit(), 50)
    }
  }, [isActive])

  const handleReconnect = async () => {
    if (!onReconnect) return
    setReconnecting(true)
    try {
      await onReconnect()
    } finally {
      setReconnecting(false)
    }
  }

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full bg-deep"
        style={{ display: isActive ? 'block' : 'none' }}
      />
      {disconnected && isActive && (
        <div className="absolute inset-x-0 top-0 z-10 border-b border-term-red/40 bg-term-red/10 px-4 py-3 flex items-center justify-between gap-3">
          <p className="font-mono text-xs text-term-red">{disconnectReason}</p>
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
