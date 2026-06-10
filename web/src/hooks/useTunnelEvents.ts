import { useEffect } from 'react'
import { ensureToken, wsUrl } from '@/api/client'
import { parseTunnelEvent } from '@/types/tunnelEvents'
import { useTunnelStore } from '@/store/tunnelStore'

export function useTunnelEvents() {
  const handleEvent = useTunnelStore((s) => s.handleWsEvent)

  useEffect(() => {
    let ws: WebSocket | null = null
    let cancelled = false

    ensureToken()
      .then(() => {
        if (cancelled) return
        ws = new WebSocket(wsUrl('/ws/tunnels'))
        ws.onmessage = (event) => {
          try {
            const msg = parseTunnelEvent(JSON.parse(event.data as string))
            if (msg) handleEvent(msg)
          } catch {
            // ignore malformed events
          }
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
      ws?.close()
    }
  }, [handleEvent])
}
