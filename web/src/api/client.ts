import { addLog } from '@/store/logStore'

const TOKEN_KEY = 'spectre_token'

let token: string | null = localStorage.getItem(TOKEN_KEY)

export function getToken(): string | null {
  return token
}

export function setToken(t: string) {
  token = t
  localStorage.setItem(TOKEN_KEY, t)
}

export async function ensureToken(): Promise<string> {
  if (token) return token
  const res = await fetch('/api/auth/token')
  const data = await res.json()
  setToken(data.token)
  return data.token
}

export class ApiError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

function summarizeBody(body: RequestInit['body']): string | undefined {
  if (!body || body instanceof FormData) return body instanceof FormData ? '[FormData]' : undefined
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body)
      const keys = Object.keys(parsed as object)
      return keys.length ? `{${keys.join(', ')}}` : '{}'
    } catch {
      return body.length > 80 ? `${body.slice(0, 80)}…` : body
    }
  }
  return undefined
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase()
  const bodyHint = summarizeBody(options.body)
  addLog({
    type: 'out',
    message: `${method} /api${path}${bodyHint ? ` ${bodyHint}` : ''}`,
    source: 'api',
    detail: typeof options.body === 'string' ? options.body : undefined,
  })

  const t = await ensureToken()
  const headers: Record<string, string> = {
    'X-SPECTRE-Token': t,
    ...(options.headers as Record<string, string>),
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  let res: Response
  try {
    res = await fetch(`/api${path}`, { ...options, headers })
  } catch (e) {
    addLog({
      type: 'process',
      message: `API network error ${method} /api${path}: ${(e as Error).message}`,
      source: 'api',
    })
    throw e
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ code: 'UNKNOWN', message: res.statusText }))
    addLog({
      type: 'process',
      message: `API ${res.status} [${err.code || 'UNKNOWN'}] ${method} /api${path}`,
      source: 'api',
      detail: err.message || res.statusText,
    })
    throw new ApiError(err.code || 'UNKNOWN', err.message || res.statusText)
  }

  if (res.status === 204) {
    addLog({ type: 'in', message: `${res.status} ${method} /api${path}`, source: 'api' })
    return undefined as T
  }

  const contentType = res.headers.get('content-type')
  if (contentType?.includes('application/json')) {
    const data = await res.json()
    const preview =
      Array.isArray(data)
        ? `[${data.length} items]`
        : typeof data === 'object' && data !== null
          ? `{${Object.keys(data as object).slice(0, 5).join(', ')}}`
          : String(data)
    addLog({
      type: 'in',
      message: `${res.status} ${method} /api${path} → ${preview}`,
      source: 'api',
      detail: JSON.stringify(data, null, 2).slice(0, 2000),
    })
    return data
  }

  addLog({ type: 'in', message: `${res.status} ${method} /api${path} (binary)`, source: 'api' })
  return res as unknown as T
}

export function wsUrl(path: string): string {
  const t = token || localStorage.getItem(TOKEN_KEY) || ''
  const sep = path.includes('?') ? '&' : '?'
  const qs = `${sep}token=${encodeURIComponent(t)}`

  // Dev: connect directly to Go backend (Vite :5173 has no native WS handler).
  if (import.meta.env.DEV) {
    const port = import.meta.env.VITE_SPECTRE_PORT ?? '57321'
    return `ws://127.0.0.1:${port}${path}${qs}`
  }

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${path}${qs}`
}
