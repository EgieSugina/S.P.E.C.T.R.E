import { useEffect } from 'react'
import { ensureToken, wsUrl } from '@/api/client'
import { addLog } from '@/store/logStore'

const WS_PATCHED = Symbol('spectreWsPatched')

function sanitizeWsUrl(url: string): string {
  try {
    const u = new URL(url, window.location.origin)
    u.searchParams.delete('token')
    return u.pathname + (u.search ? u.search : '')
  } catch {
    return url.replace(/token=[^&]+/, 'token=***')
  }
}

function summarizeWsMessage(data: unknown, direction: 'in' | 'out'): { message: string; detail?: string } {
  if (typeof data === 'string') {
    try {
      return summarizeWsMessage(JSON.parse(data), direction)
    } catch {
      const preview = data.length > 120 ? `${data.slice(0, 120)}…` : data
      return { message: preview }
    }
  }

  if (data && typeof data === 'object') {
    const msg = data as Record<string, unknown>
    const type = String(msg.type ?? 'message')

    if (type === 'output' || type === 'buffer') {
      const len = typeof msg.data === 'string' ? msg.data.length : 0
      return {
        message: `terminal ${type} (${len} b64 chars)`,
        detail: direction === 'out' ? undefined : `[${type}] ${len} bytes`,
      }
    }

    if (type === 'input') {
      let preview = ''
      if (typeof msg.data === 'string') {
        try {
          preview = atob(msg.data)
        } catch {
          preview = msg.data
        }
      }
      preview = preview.replace(/\r/g, '').replace(/\n/g, '↵')
      if (preview.length > 80) preview = `${preview.slice(0, 80)}…`
      return { message: `terminal input: ${preview || '(empty)'}` }
    }

    if (type === 'resize') {
      return { message: `terminal resize ${msg.cols}×${msg.rows}` }
    }

    const parts = [type]
    for (const key of ['connection_id', 'session_id', 'tunnel_id', 'job_id', 'name', 'port', 'reason', 'error', 'status']) {
      if (msg[key] !== undefined && msg[key] !== '') {
        parts.push(`${key}=${msg[key]}`)
      }
    }
    return {
      message: parts.join(' '),
      detail: JSON.stringify(msg, null, 2),
    }
  }

  return { message: String(data) }
}

function attachWsLogging(ws: WebSocket, path: string): WebSocket {
  ws.addEventListener('open', () => {
    addLog({ type: 'process', message: `WS open ${path}`, source: 'ws' })
  })

  ws.addEventListener('close', () => {
    addLog({ type: 'process', message: `WS close ${path}`, source: 'ws' })
  })

  ws.addEventListener('error', () => {
    addLog({ type: 'process', message: `WS error ${path}`, source: 'ws' })
  })

  ws.addEventListener('message', (event) => {
    let parsed: unknown = event.data
    try {
      parsed = JSON.parse(event.data as string)
    } catch {
      /* raw payload */
    }
    const { message, detail } = summarizeWsMessage(parsed, 'in')
    addLog({ type: 'in', message: `← ${path} ${message}`, source: 'ws', detail })
  })

  const origSend = ws.send.bind(ws)
  ws.send = function patchedSend(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    let parsed: unknown = data
    if (typeof data === 'string') {
      try {
        parsed = JSON.parse(data)
      } catch {
        parsed = data
      }
    }
    const { message, detail } = summarizeWsMessage(parsed, 'out')
    addLog({ type: 'out', message: `→ ${path} ${message}`, source: 'ws', detail })
    origSend(data)
  }

  return ws
}

function patchWebSocket(): boolean {
  const w = window as Window & { [WS_PATCHED]?: boolean }
  if (w[WS_PATCHED]) return true

  try {
    const NativeWS = window.WebSocket

    function PatchedWebSocket(
      url: string | URL,
      protocols?: string | string[],
    ): WebSocket {
      const urlStr = typeof url === 'string' ? url : url.toString()
      const path = sanitizeWsUrl(urlStr)
      const ws = new NativeWS(url, protocols)
      return attachWsLogging(ws, path)
    }

    PatchedWebSocket.prototype = NativeWS.prototype
    for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'] as const) {
      ;(PatchedWebSocket as unknown as Record<string, number>)[key] = NativeWS[key]
    }

    window.WebSocket = PatchedWebSocket as unknown as typeof WebSocket
    w[WS_PATCHED] = true
    return true
  } catch (err) {
    console.warn('[SPECTRE] WebSocket log capture disabled:', err)
    return false
  }
}

export function useLogCapture() {
  useEffect(() => {
    patchWebSocket()
    addLog({ type: 'process', message: 'SPECTRE UI log capture active', source: 'system' })

    let ws: WebSocket | null = null
    let cancelled = false

    ensureToken()
      .then(() => {
        if (cancelled) return
        ws = new WebSocket(wsUrl('/ws/system'))
        ws.addEventListener('error', () => {
          addLog({
            type: 'process',
            message: 'System WS connection failed (restart backend if /ws/system was recently added)',
            source: 'system',
          })
        })
      })
      .catch((err) => {
        addLog({
          type: 'process',
          message: `System WS auth failed: ${(err as Error).message}`,
          source: 'system',
        })
      })

    return () => {
      cancelled = true
      ws?.close()
    }
  }, [])
}
