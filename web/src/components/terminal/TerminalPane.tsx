import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { wsUrl } from '@/api/client'
import { getXtermTheme } from '@/lib/theme'

interface TerminalPaneProps {
  sessionId: string
  isActive: boolean
}

export function TerminalPane({ sessionId, isActive }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const initTerminal = useCallback(() => {
    if (!containerRef.current) return

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
        term.writeln(`\r\n\x1b[31m[SPECTRE]\x1b[0m ${msg.reason}`)
      }
    }

    ws.onclose = () => {
      term.writeln('\r\n\x1b[33m[SPECTRE]\x1b[0m WebSocket closed (session still running)')
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

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-deep"
      style={{ display: isActive ? 'block' : 'none' }}
    />
  )
}
