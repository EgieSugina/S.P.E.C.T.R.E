import { motion } from 'framer-motion'
import { useCallback, useState } from 'react'
import { Activity, AlertTriangle, Loader2, Route } from 'lucide-react'
import type { Connection } from '@/api/connections'
import { traceApi, type TraceHop, type TraceResult } from '@/api/trace'
import { ApiError } from '@/api/client'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'

interface RouteTraceProps {
  connection?: Connection
  defaultHost?: string
}

export function RouteTrace({ connection, defaultHost }: RouteTraceProps) {
  const [host, setHost] = useState(defaultHost ?? connection?.host ?? '')
  const [result, setResult] = useState<TraceResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runTrace = useCallback(async () => {
    const target = host.trim()
    if (!target) {
      setError('Enter a host to trace')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = connection
        ? await traceApi.traceConnection(connection.id, target !== connection.host ? target : undefined)
        : await traceApi.traceHost(target)
      setResult(data)
      if (data.error) {
        setError(data.error)
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [host, connection])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block font-mono text-[10px] text-text-muted uppercase mb-1">
            Target host
          </label>
          <Input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="hostname or IP"
            onKeyDown={(e) => e.key === 'Enter' && !loading && runTrace()}
          />
        </div>
        <Button onClick={runTrace} disabled={loading}>
          {loading ? (
            <Loader2 size={14} className="inline mr-1 animate-spin" />
          ) : (
            <Route size={14} className="inline mr-1" />
          )}
          Trace route
        </Button>
      </div>

      {connection && (
        <p className="font-mono text-[10px] text-text-muted">
          Via connection <span className="text-purple-bright">{connection.name}</span>
          {connection.host ? ` · SSH gateway ${connection.host}:${connection.port}` : ''}
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 border border-term-amber/40 rounded-brutal bg-term-amber/5">
          <AlertTriangle size={14} className="text-term-amber shrink-0 mt-0.5" />
          <p className="font-mono text-xs text-term-amber">{error}</p>
        </div>
      )}

      {loading && !result && (
        <div className="flex flex-col items-center justify-center h-[280px] border border-dashed border-purple-core/20 rounded-brutal bg-deep/50">
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            <Activity size={24} className="text-purple-bright mb-3" />
          </motion.div>
          <p className="font-mono text-xs text-text-muted">Tracing route…</p>
        </div>
      )}

      {result && result.hops.length > 0 && (
        <TraceHopChain result={result} animating={loading} />
      )}

      {result && result.hops.length === 0 && !loading && (
        <div className="p-6 border border-dashed border-purple-core/20 rounded-brutal text-center">
          <p className="font-mono text-xs text-text-muted">No hops returned</p>
        </div>
      )}
    </div>
  )
}

function TraceHopChain({ result, animating }: { result: TraceResult; animating: boolean }) {
  const { hops, via, tool, duration_ms, resolved_ip, target } = result

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="font-mono text-[10px] text-text-muted">
          <span className="text-term-cyan">{target}</span>
          {resolved_ip && resolved_ip !== target && (
            <span className="ml-2 text-text-muted">→ {resolved_ip}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 font-mono text-[10px]">
          <MetaBadge label={via === 'ssh' ? 'via SSH' : 'local'} />
          <MetaBadge label={tool} />
          <MetaBadge label={`${duration_ms}ms`} />
          <MetaBadge label={`${hops.length} hops`} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        <div className="relative border border-[var(--border-default)] rounded-brutal bg-deep/60 p-4 min-h-[280px] overflow-x-auto">
          <HopGraph hops={hops} animating={animating} />
        </div>

        <div className="border border-[var(--border-default)] rounded-brutal bg-surface/40 max-h-[360px] overflow-y-auto">
          <table className="w-full font-mono text-[10px] border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="text-text-muted text-left border-b border-[var(--border-default)] bg-elevated">
                <th className="py-1.5 px-3 bg-elevated w-8">#</th>
                <th className="py-1.5 px-3 bg-elevated">Host</th>
                <th className="py-1.5 px-3 bg-elevated w-16">RTT</th>
                <th className="py-1.5 px-3 bg-elevated w-16">Status</th>
              </tr>
            </thead>
            <tbody>
              {hops.map((hop) => (
                <HopRow key={hop.hop} hop={hop} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function HopGraph({ hops, animating }: { hops: TraceHop[]; animating: boolean }) {
  const nodeW = 120
  const nodeH = 48
  const gapY = 36
  const padX = 40
  const padY = 24
  const width = 280
  const height = padY * 2 + hops.length * (nodeH + gapY) - gapY

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full min-w-[240px]"
      role="img"
      aria-label="Route trace hop chain"
    >
      <defs>
        <filter id="hop-glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {hops.map((hop, i) => {
        if (i === hops.length - 1) return null
        const x1 = padX + nodeW / 2
        const y1 = padY + i * (nodeH + gapY) + nodeH
        const x2 = padX + nodeW / 2
        const y2 = padY + (i + 1) * (nodeH + gapY)
        const timedOut = hop.status === 'timeout' || hops[i + 1]?.status === 'timeout'
        return (
          <g key={`edge-${i}`}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={timedOut ? 'var(--term-red)' : 'var(--purple-mid)'}
              strokeWidth={2}
              strokeOpacity={timedOut ? 0.5 : 0.7}
              strokeDasharray={timedOut ? '4 4' : undefined}
            />
            {!timedOut && !animating && (
              <motion.circle
                r={3}
                fill="var(--purple-bright)"
                filter="url(#hop-glow)"
                initial={{ cx: x1, cy: y1, opacity: 0 }}
                animate={{
                  cx: [x1, x2],
                  cy: [y1, y2],
                  opacity: [0, 1, 1, 0],
                }}
                transition={{
                  duration: 1.4,
                  repeat: Infinity,
                  delay: i * 0.35,
                  ease: 'easeInOut',
                }}
              />
            )}
          </g>
        )
      })}

      {hops.map((hop, i) => {
        const x = padX
        const y = padY + i * (nodeH + gapY)
        const colors = hopColors(hop.status)
        return (
          <g key={hop.hop} transform={`translate(${x}, ${y})`}>
            <rect
              width={nodeW}
              height={nodeH}
              rx={2}
              fill="var(--bg-surface)"
              stroke={colors.stroke}
              strokeWidth={hop.status === 'target' ? 2 : 1.5}
              filter={hop.status === 'target' ? 'url(#hop-glow)' : undefined}
            />
            <text
              x={8}
              y={16}
              fill="var(--text-muted)"
              fontSize="8"
              fontFamily="var(--font-mono)"
            >
              hop {hop.hop}
            </text>
            <text
              x={8}
              y={30}
              fill={colors.text}
              fontSize="9"
              fontFamily="var(--font-mono)"
              fontWeight={hop.status === 'target' || hop.status === 'gateway' ? 'bold' : 'normal'}
            >
              {truncate(hop.host, 16)}
            </text>
            {hop.ip && hop.ip !== hop.host && (
              <text x={8} y={42} fill="var(--text-muted)" fontSize="7" fontFamily="var(--font-mono)">
                {truncate(hop.ip, 18)}
              </text>
            )}
            {hop.rtt_ms != null && hop.rtt_ms >= 0 && (
              <text
                x={nodeW - 6}
                y={30}
                textAnchor="end"
                fill={colors.rtt}
                fontSize="9"
                fontFamily="var(--font-mono)"
              >
                {hop.rtt_ms.toFixed(1)}ms
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function HopRow({ hop }: { hop: TraceHop }) {
  const colors = hopColors(hop.status)
  return (
    <tr className="border-b border-[var(--border-default)]/40 text-text-secondary">
      <td className="py-1.5 px-3 text-text-muted">{hop.hop}</td>
      <td className="py-1.5 px-3 max-w-[140px]">
        <span className={colors.textClass} title={hop.host}>
          {hop.host}
        </span>
        {hop.ip && hop.ip !== hop.host && (
          <span className="block text-text-muted text-[9px]">{hop.ip}</span>
        )}
      </td>
      <td className="py-1.5 px-3">
        {hop.rtt_ms != null && hop.rtt_ms >= 0 ? (
          <span className="text-term-green">{hop.rtt_ms.toFixed(1)}</span>
        ) : (
          <span className="text-term-red">—</span>
        )}
      </td>
      <td className="py-1.5 px-3">
        <StatusDot status={hop.status} />
      </td>
    </tr>
  )
}

function StatusDot({ status }: { status: TraceHop['status'] }) {
  const map: Record<TraceHop['status'], { color: string; label: string }> = {
    alive: { color: 'var(--green-term)', label: 'alive' },
    target: { color: 'var(--cyan-data)', label: 'target' },
    gateway: { color: 'var(--purple-bright)', label: 'gateway' },
    local: { color: 'var(--purple-core)', label: 'local' },
    timeout: { color: 'var(--term-red)', label: 'timeout' },
  }
  const { color, label } = map[status]
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: color, boxShadow: status !== 'timeout' ? `0 0 4px ${color}` : undefined }}
      />
      <span className="text-[9px] text-text-muted">{label}</span>
    </span>
  )
}

function MetaBadge({ label }: { label: string }) {
  return (
    <span className="px-1.5 py-0.5 border border-purple-core/30 rounded-brutal text-purple-bright bg-purple-dim/20">
      {label}
    </span>
  )
}

function hopColors(status: TraceHop['status']) {
  switch (status) {
    case 'timeout':
      return {
        stroke: 'var(--term-red)',
        text: 'var(--term-red)',
        rtt: 'var(--term-red)',
        textClass: 'text-term-red',
      }
    case 'target':
      return {
        stroke: 'var(--cyan-data)',
        text: 'var(--cyan-data)',
        rtt: 'var(--term-green)',
        textClass: 'text-term-cyan',
      }
    case 'gateway':
      return {
        stroke: 'var(--purple-bright)',
        text: 'var(--purple-bright)',
        rtt: 'var(--term-green)',
        textClass: 'text-purple-bright',
      }
    case 'local':
      return {
        stroke: 'var(--purple-core)',
        text: 'var(--purple-bright)',
        rtt: 'var(--text-muted)',
        textClass: 'text-purple-bright',
      }
    default:
      return {
        stroke: 'var(--purple-mid)',
        text: 'var(--text-secondary)',
        rtt: 'var(--term-green)',
        textClass: 'text-text-secondary',
      }
  }
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}
