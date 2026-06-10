import { useEffect } from 'react'
import { ensureToken, wsUrl } from '@/api/client'
import { useConnectionStore } from '@/store/connectionStore'
import { useFileStore } from '@/store/fileStore'

export function useSystemEvents() {
  const markConnectionLost = useConnectionStore((s) => s.markConnectionLost)
  const onFileConnectionLost = useFileStore((s) => s.onConnectionLost)

  useEffect(() => {
    let ws: WebSocket | null = null
    let cancelled = false

    ensureToken()
      .then(() => {
        if (cancelled) return
        ws = new WebSocket(wsUrl('/ws/system'))
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as {
              type?: string
              connection_id?: string
              conn_id?: string
              reason?: string
            }
            if (msg.type === 'connection_down' && msg.connection_id) {
              markConnectionLost(msg.connection_id, msg.reason)
              if (msg.conn_id) onFileConnectionLost(msg.conn_id)
            }
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
  }, [markConnectionLost, onFileConnectionLost])
}
