import { useEffect, useRef, useCallback } from 'react'

export function useWebSocket(url: string | null, onMessage: (data: unknown) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  useEffect(() => {
    if (!url) return
    const ws = new WebSocket(url)
    wsRef.current = ws
    ws.onmessage = (e) => {
      try {
        onMessageRef.current(JSON.parse(e.data))
      } catch {
        onMessageRef.current(e.data)
      }
    }
    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [url])

  return { send }
}
