import { useEffect, useRef } from 'react'
import { wsUrl } from '@/api/client'
import { useUploadQueue } from '@/hooks/useUploadQueue'

export function useSftpProgress(connId: string | null) {
  const updateFromWS = useUploadQueue((s) => s.updateFromWS)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!connId) return

    const ws = new WebSocket(wsUrl(`/ws/sftp/${connId}`))
    wsRef.current = ws
    ws.onmessage = (e) => {
      try {
        updateFromWS(JSON.parse(e.data))
      } catch {
        /* ignore malformed messages */
      }
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [connId, updateFromWS])
}
