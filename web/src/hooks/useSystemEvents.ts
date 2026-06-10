import { useEffect } from 'react'
import { ensureToken, wsUrl } from '@/api/client'
import { parseSystemEvent } from '@/types/systemEvents'
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
            const msg = parseSystemEvent(JSON.parse(event.data as string))
            if (!msg) return

            switch (msg.type) {
              case 'connection_down':
                markConnectionLost(msg.connection_id, msg.reason)
                if (msg.conn_id) onFileConnectionLost(msg.conn_id)
                break
              case 'broadcast_started':
              case 'broadcast_completed':
              case 'broadcast_failed':
              case 'jump_connecting':
              case 'jump_connected':
              case 'jump_failed':
                // Phase 3 push notifications — handlers wired when features land
                break
              default:
                break
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
