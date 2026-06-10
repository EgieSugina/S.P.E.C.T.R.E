import { Tunnel } from '@/api/tunnels'
import { Input } from '@/components/shared/Input'

export type ProxyMode = 'none' | 'tunnel' | 'manual'

export interface ProxyFormValue {
  mode: ProxyMode
  proxy_tunnel_id: string
  proxy_host: string
  proxy_port: number
}

interface ProxySelectorProps {
  value: ProxyFormValue
  onChange: (value: ProxyFormValue) => void
  tunnels: Tunnel[]
  excludeConnectionId?: string
}

const SOCKS_TYPES = new Set(['socks5', 'dynamic'])

export function proxyFormFromConnection(conn: {
  proxy_tunnel_id?: string | null
  proxy_host?: string
  proxy_port?: number
}): ProxyFormValue {
  if (conn.proxy_tunnel_id) {
    return {
      mode: 'tunnel',
      proxy_tunnel_id: conn.proxy_tunnel_id,
      proxy_host: '',
      proxy_port: 1080,
    }
  }
  if (conn.proxy_host && conn.proxy_port) {
    return {
      mode: 'manual',
      proxy_tunnel_id: '',
      proxy_host: conn.proxy_host,
      proxy_port: conn.proxy_port,
    }
  }
  return { mode: 'none', proxy_tunnel_id: '', proxy_host: '', proxy_port: 1080 }
}

export function proxyPayloadFromForm(form: ProxyFormValue) {
  if (form.mode === 'tunnel' && form.proxy_tunnel_id) {
    return {
      proxy_tunnel_id: form.proxy_tunnel_id,
      proxy_type: undefined,
      proxy_host: '',
      proxy_port: 0,
    }
  }
  if (form.mode === 'manual' && form.proxy_host && form.proxy_port > 0) {
    return {
      proxy_tunnel_id: null,
      proxy_type: 'socks5',
      proxy_host: form.proxy_host,
      proxy_port: form.proxy_port,
    }
  }
  return {
    proxy_tunnel_id: null,
    proxy_type: '',
    proxy_host: '',
    proxy_port: 0,
  }
}

export function ProxySelector({ value, onChange, tunnels, excludeConnectionId }: ProxySelectorProps) {
  const proxyTunnels = tunnels.filter(
    (t) => SOCKS_TYPES.has(t.type) && t.connection_id !== excludeConnectionId,
  )

  return (
    <div className="space-y-3">
      <div>
        <label className="font-mono text-[10px] text-text-muted uppercase">Proxy</label>
        <select
          value={value.mode}
          onChange={(e) =>
            onChange({
              ...value,
              mode: e.target.value as ProxyMode,
            })
          }
          className="w-full mt-1 bg-deep border border-[var(--border-default)] rounded-brutal px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-purple-core/60 focus:outline-none"
        >
          <option value="none">None (direct)</option>
          <option value="tunnel">SPECTRE SOCKS5 tunnel</option>
          <option value="manual">External SOCKS5</option>
        </select>
      </div>

      {value.mode === 'tunnel' && (
        <div>
          <label className="font-mono text-[10px] text-text-muted uppercase">Proxy tunnel</label>
          {proxyTunnels.length === 0 ? (
            <p className="font-mono text-xs text-text-muted mt-1">
              No SOCKS5 tunnels available. Create one on the Proxy page first.
            </p>
          ) : (
            <select
              value={value.proxy_tunnel_id}
              onChange={(e) => onChange({ ...value, proxy_tunnel_id: e.target.value })}
              required
              className="w-full mt-1 bg-deep border border-[var(--border-default)] rounded-brutal px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:border-purple-core/60 focus:outline-none"
            >
              <option value="">Select tunnel...</option>
              {proxyTunnels.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.local_host}:{t.local_port}) — {t.status}
                </option>
              ))}
            </select>
          )}
          <p className="font-mono text-[10px] text-text-muted mt-1.5">
            The tunnel must be running before you connect.
          </p>
        </div>
      )}

      {value.mode === 'manual' && (
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="font-mono text-[10px] text-text-muted uppercase">SOCKS5 host</label>
            <Input
              value={value.proxy_host}
              onChange={(e) => onChange({ ...value, proxy_host: e.target.value })}
              placeholder="127.0.0.1"
              required
            />
          </div>
          <div>
            <label className="font-mono text-[10px] text-text-muted uppercase">Port</label>
            <Input
              type="number"
              value={value.proxy_port}
              onChange={(e) => onChange({ ...value, proxy_port: +e.target.value })}
              required
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function proxyLabel(
  conn: {
    proxy_tunnel_id?: string | null
    proxy_host?: string
    proxy_port?: number
  },
  tunnels: Tunnel[],
): string | null {
  if (conn.proxy_tunnel_id) {
    const tunnel = tunnels.find((t) => t.id === conn.proxy_tunnel_id)
    if (tunnel) {
      return `via ${tunnel.name}`
    }
    return 'via proxy tunnel'
  }
  if (conn.proxy_host && conn.proxy_port) {
    return `via SOCKS5 ${conn.proxy_host}:${conn.proxy_port}`
  }
  return null
}
