import { motion } from 'framer-motion'
import { Globe, Server, Shield } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { ProxyConnection } from '@/api/tunnels'
import type { GraphEdge, GraphNode, TunnelGraph } from '@/api/tunnels'

interface ConnectionGraphProps {
  graph?: TunnelGraph
  bindAddr?: string
  connections?: ProxyConnection[]
  empty?: boolean
}

type ViewMode = 'graph' | 'table' | 'both'
type DestFilter = 'active' | 'all'

const COLORS = {
  proxy: 'var(--purple-core)',
  proxyGlow: 'var(--purple-bright)',
  destination: 'var(--cyan-data)',
  destinationIdle: 'var(--purple-mid)',
  edge: 'var(--purple-mid)',
  edgeActive: 'var(--green-term)',
  text: 'var(--text-secondary)',
  muted: 'var(--text-muted)',
  ringActive: 'var(--green-term)',
  ringIdle: 'var(--purple-mid)',
  ringWarn: 'var(--amber-warn)',
  selectGlow: 'var(--cyan-data)',
}

const DEFAULT_MAX_NODES = 8
const SVG_WIDTH = 560
const SVG_HEIGHT = 420

interface DestNode extends GraphNode {
  active: number
  total: number
  port?: string
}

export function ConnectionGraph({ graph, bindAddr, connections, empty }: ConnectionGraphProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('both')
  const [filter, setFilter] = useState<DestFilter>('active')
  const [showAll, setShowAll] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const dragRef = useRef<{ active: boolean; x: number; y: number }>({
    active: false,
    x: 0,
    y: 0,
  })

  const edgeMap = useMemo(() => {
    const map = new Map<string, GraphEdge>()
    graph?.edges.forEach((e) => map.set(e.target, e))
    return map
  }, [graph?.edges])

  const allDestNodes = useMemo<DestNode[]>(() => {
    const dests = graph?.nodes.filter((n) => n.type === 'destination') ?? []
    return dests.map((n) => ({
      ...n,
      active: edgeMap.get(n.id)?.active ?? 0,
      total: edgeMap.get(n.id)?.count ?? 0,
      port: extractPort(n.label),
    }))
  }, [graph?.nodes, edgeMap])

  const sortedDests = useMemo(() => {
    let nodes = [...allDestNodes]
    if (filter === 'active') nodes = nodes.filter((n) => n.active > 0)
    return nodes.sort((a, b) => {
      if (a.active !== b.active) return b.active - a.active
      return b.total - a.total
    })
  }, [allDestNodes, filter])

  const displayDests = useMemo(
    () => (showAll ? sortedDests : sortedDests.slice(0, DEFAULT_MAX_NODES)),
    [sortedDests, showAll],
  )

  const overflowCount = sortedDests.length - displayDests.length

  const layout = useMemo(() => {
    const cx = SVG_WIDTH / 2
    const cy = SVG_HEIGHT / 2
    const proxyNode = graph?.nodes.find((n) => n.type === 'proxy')

    const activeNodes = displayDests.filter((n) => n.active > 0)
    const idleNodes = displayDests.filter((n) => n.active === 0)
    const innerCount = activeNodes.length
    const outerCount = idleNodes.length
    const totalDisplayed = displayDests.length

    const innerRadius = 80 + Math.min(innerCount * 4, 48) + Math.min(totalDisplayed, 12)
    const outerRadius =
      outerCount > 0 ? innerRadius + 62 + Math.min(outerCount * 2, 24) : innerRadius

    const labelFontSize = Math.max(7, Math.min(10, 12 - Math.floor(totalDisplayed / 5)))
    const nodeRadius = totalDisplayed > 16 ? 16 : totalDisplayed > 10 ? 18 : 20

    const positions: Record<string, { x: number; y: number; angle: number; tier: 'inner' | 'outer' }> =
      { local: { x: cx, y: cy, angle: 0, tier: 'inner' } }

    activeNodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / Math.max(innerCount, 1) - Math.PI / 2
      positions[node.id] = {
        x: cx + innerRadius * Math.cos(angle),
        y: cy + innerRadius * Math.sin(angle),
        angle,
        tier: 'inner',
      }
    })

    const phaseOffset = innerCount > 0 ? Math.PI / innerCount : 0
    idleNodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / Math.max(outerCount, 1) - Math.PI / 2 + phaseOffset
      positions[node.id] = {
        x: cx + outerRadius * Math.cos(angle),
        y: cy + outerRadius * Math.sin(angle),
        angle,
        tier: 'outer',
      }
    })

    return {
      cx,
      cy,
      positions,
      proxyNode,
      activeNodes,
      idleNodes,
      labelFontSize,
      nodeRadius,
    }
  }, [graph?.nodes, displayDests])

  const selectedNode = selectedId ? displayDests.find((n) => n.id === selectedId) : null
  const selectedConnections = useMemo(() => {
    if (!selectedNode || !connections) return []
    return connections.filter((c) => c.destination === selectedNode.label)
  }, [selectedNode, connections])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.92 : 1.08
    setTransform((t) => ({
      ...t,
      scale: Math.min(2.5, Math.max(0.6, t.scale * factor)),
    }))
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    dragRef.current = { active: true, x: e.clientX, y: e.clientY }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.active) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    dragRef.current = { active: true, x: e.clientX, y: e.clientY }
    setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }))
  }, [])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current.active = false
    ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
  }, [])

  const resetView = useCallback(() => {
    setTransform({ x: 0, y: 0, scale: 1 })
  }, [])

  if (empty || !graph || (graph.edges.length === 0 && graph.nodes.length <= 1)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[360px] border border-dashed border-purple-core/20 rounded-brutal bg-deep/50">
        <p className="font-mono text-xs text-text-muted">No active proxy connections</p>
        {bindAddr && (
          <p className="font-mono text-[10px] text-text-muted mt-2">
            Route traffic through socks5://{bindAddr}
          </p>
        )}
      </div>
    )
  }

  const { positions, proxyNode, labelFontSize, nodeRadius } = layout
  const highlightId = hoveredId ?? selectedId
  const isBoth = viewMode === 'both'

  const graphPanel = (
    <div className={`relative flex flex-col min-h-0 ${isBoth ? 'h-full min-h-[min(380px,42vh)]' : ''}`}>
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className={`w-full border border-[var(--border-default)] rounded-brutal bg-deep/60 cursor-grab active:cursor-grabbing select-none touch-none ${
          isBoth ? 'flex-1 min-h-[380px]' : 'h-[420px]'
        }`}
        role="img"
        aria-label="Proxy connection graph"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClick={() => setSelectedId(null)}
      >
        <defs>
          <filter id="glow-purple" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-select" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <marker
            id="arrow-active"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={COLORS.edgeActive} />
          </marker>
          <marker
            id="arrow-idle"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={COLORS.edge} opacity="0.5" />
          </marker>
        </defs>

        <g
          transform={`translate(${transform.x + SVG_WIDTH / 2}, ${transform.y + SVG_HEIGHT / 2}) scale(${transform.scale}) translate(${-SVG_WIDTH / 2}, ${-SVG_HEIGHT / 2})`}
        >
          {graph.edges.map((edge) => {
            const from = positions[edge.source]
            const to = positions[edge.target]
            if (!from || !to) return null
            const active = edge.active > 0
            const highlighted = highlightId === edge.target
            const dimmed = highlightId !== null && edge.target !== highlightId
            const destNode = displayDests.find((n) => n.id === edge.target)
            const edgeLabel = destNode?.port
              ? `:${destNode.port}`
              : active
                ? `${edge.active} active`
                : `${edge.count} total`
            const subLabel = active ? 'SOCKS5' : 'idle'

            return (
              <CurvedEdge
                key={`${edge.source}-${edge.target}`}
                from={from}
                to={to}
                active={active}
                highlighted={highlighted}
                dimmed={dimmed}
                label={edgeLabel}
                subLabel={subLabel}
                nodeRadius={nodeRadius}
              />
            )
          })}

          {displayDests.map((node) => {
            const pos = positions[node.id]
            if (!pos) return null
            const active = node.active > 0
            const isSelected = selectedId === node.id
            const isHovered = hoveredId === node.id
            const showLabel = isHovered || isSelected || displayDests.length <= 12
            const labelRot = labelRotation(pos.angle)
            const opacity = active ? 1 : 0.55
            const strokeColor = isSelected
              ? COLORS.selectGlow
              : isHovered
                ? COLORS.proxyGlow
                : active
                  ? COLORS.destination
                  : COLORS.destinationIdle

            return (
              <g
                key={node.id}
                opacity={opacity}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedId((id) => (id === node.id ? null : node.id))
                }}
                onPointerEnter={() => setHoveredId(node.id)}
                onPointerLeave={() => setHoveredId(null)}
              >
                <title>{node.label}</title>

                {isSelected && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={nodeRadius + 14}
                    fill="none"
                    stroke={COLORS.selectGlow}
                    strokeWidth={2}
                    strokeOpacity={0.5}
                    filter="url(#glow-select)"
                  />
                )}

                {active && (
                  <motion.circle
                    cx={pos.x}
                    cy={pos.y}
                    r={nodeRadius + 12}
                    fill="none"
                    stroke={COLORS.edgeActive}
                    strokeWidth={1}
                    initial={{ opacity: 0.6, scale: 0.9 }}
                    animate={{ opacity: 0, scale: 1.6 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                  />
                )}

                <StatusRing
                  cx={pos.x}
                  cy={pos.y}
                  radius={nodeRadius + 6}
                  active={node.active}
                  total={node.total}
                  isActive={active}
                />

                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={nodeRadius}
                  fill="var(--bg-surface)"
                  stroke={strokeColor}
                  strokeWidth={isSelected ? 2.5 : 2}
                  filter={isSelected ? 'url(#glow-select)' : active ? 'url(#glow-green)' : undefined}
                />

                <NodeIcon x={pos.x} y={pos.y} size={nodeRadius * 0.9} active={active} />

                {(node.active > 0 || node.total > 0) && (
                  <g>
                    <circle
                      cx={pos.x + nodeRadius * 0.7}
                      cy={pos.y - nodeRadius * 0.7}
                      r={9}
                      fill={active ? 'var(--bg-elevated)' : 'var(--bg-deep)'}
                      stroke={active ? COLORS.edgeActive : COLORS.edge}
                      strokeWidth={1}
                    />
                    <text
                      x={pos.x + nodeRadius * 0.7}
                      y={pos.y - nodeRadius * 0.7 + 3.5}
                      textAnchor="middle"
                      fill={active ? COLORS.edgeActive : COLORS.muted}
                      fontSize="7"
                      fontFamily="var(--font-mono)"
                      fontWeight="bold"
                    >
                      {node.active > 0 ? node.active : node.total}
                    </text>
                  </g>
                )}

                {showLabel && (
                  <g>
                    {(isSelected || isHovered) && (
                      <rect
                        x={pos.x + labelOffset(pos.angle, 28).dx - 42}
                        y={pos.y + labelOffset(pos.angle, 28).dy - 8}
                        width={84}
                        height={16}
                        rx={2}
                        fill="var(--purple-dim)"
                        fillOpacity={0.85}
                        stroke={COLORS.selectGlow}
                        strokeWidth={0.5}
                        strokeOpacity={0.4}
                      />
                    )}
                    <text
                      x={pos.x}
                      y={pos.y}
                      dx={labelOffset(pos.angle, pos.tier === 'outer' ? 28 : 26).dx}
                      dy={labelOffset(pos.angle, pos.tier === 'outer' ? 28 : 26).dy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={isSelected || isHovered ? COLORS.selectGlow : active ? COLORS.destination : COLORS.muted}
                      fontSize={labelFontSize}
                      fontFamily="var(--font-mono)"
                      transform={`rotate(${labelRot}, ${pos.x + labelOffset(pos.angle, 26).dx}, ${pos.y + labelOffset(pos.angle, 26).dy})`}
                    >
                      {truncateHostLabel(node.label, displayDests.length > 14 ? 10 : 14)}
                    </text>
                  </g>
                )}
              </g>
            )
          })}

          <g>
            <circle
              cx={positions.local.x}
              cy={positions.local.y}
              r={28}
              fill="none"
              stroke={COLORS.proxyGlow}
              strokeWidth={1.5}
              strokeOpacity={0.4}
              filter="url(#glow-purple)"
            />
            <motion.circle
              cx={positions.local.x}
              cy={positions.local.y}
              r={24}
              fill="var(--bg-elevated)"
              stroke={COLORS.proxyGlow}
              strokeWidth={2}
              filter="url(#glow-purple)"
              animate={{ strokeOpacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <NodeIcon
              x={positions.local.x}
              y={positions.local.y}
              size={18}
              active
              variant="proxy"
            />
            <text
              x={positions.local.x}
              y={positions.local.y + 38}
              textAnchor="middle"
              fill={COLORS.proxyGlow}
              fontSize="8"
              fontFamily="var(--font-mono)"
              fontWeight="bold"
            >
              SOCKS5
            </text>
            <text
              x={positions.local.x}
              y={positions.local.y + 50}
              textAnchor="middle"
              fill={COLORS.text}
              fontSize={9}
              fontFamily="var(--font-mono)"
            >
              {truncateHostLabel(proxyNode?.label ?? bindAddr ?? 'local', 22)}
            </text>
          </g>
        </g>
      </svg>

      <div className="absolute top-2 right-2 flex gap-1">
        <button
          type="button"
          onClick={resetView}
          className="px-1.5 py-0.5 font-mono text-[9px] text-text-muted bg-deep/80 border border-[var(--border-default)] rounded-brutal hover:text-purple-bright transition-colors"
        >
          Reset view
        </button>
      </div>

      {overflowCount > 0 && !showAll && (
        <p className="absolute bottom-2 left-3 font-mono text-[9px] text-text-muted">
          +{overflowCount} more in table view
        </p>
      )}

      {selectedNode && (viewMode === 'graph' || viewMode === 'both') && (
        <div
          className={`p-3 border border-purple-core/30 rounded-brutal bg-surface/90 backdrop-blur-sm shrink-0 ${
            isBoth
              ? 'absolute bottom-2 left-2 right-2 z-10 shadow-lg max-h-[40%] overflow-y-auto'
              : 'mt-2'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-xs text-purple-bright truncate">{selectedNode.label}</p>
              <p className="font-mono text-[10px] text-text-muted mt-1">
                {selectedNode.active} active · {selectedNode.total} total routed
                {selectedNode.port ? ` · port ${selectedNode.port}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="font-mono text-[10px] text-text-muted hover:text-purple-bright shrink-0"
            >
              dismiss
            </button>
          </div>
          {selectedConnections.length > 0 && (
            <div className="mt-3 max-h-32 overflow-y-auto overflow-x-auto rounded-brutal border border-[var(--border-default)]/60">
              <table className="w-full font-mono text-[10px] border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="text-text-muted text-left border-b border-[var(--border-default)] bg-surface/80">
                    <th className="py-1 px-3 bg-surface/80">Source</th>
                    <th className="py-1 px-3 bg-surface/80">Since</th>
                    <th className="py-1 px-3 bg-surface/80">Bytes in</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedConnections.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-[var(--border-default)]/40 text-text-secondary"
                    >
                      <td className="py-1 pr-3 text-term-cyan">{c.source}</td>
                      <td className="py-1 pr-3 text-text-muted">
                        {new Date(c.started_at).toLocaleTimeString()}
                      </td>
                      <td className="py-1">{formatBytes(c.bytes_in)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )

  const tablePanel = (
    <div
      className={`overflow-hidden border border-[var(--border-default)] rounded-brutal flex flex-col min-h-0 ${
        isBoth ? 'h-full' : ''
      }`}
    >
      <div className={`overflow-x-auto overflow-y-auto ${isBoth ? 'flex-1 min-h-0' : 'max-h-64'}`}>
        <table className="w-full font-mono text-[10px] border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="text-text-muted text-left border-b border-[var(--border-default)] bg-elevated">
              <th className="py-1.5 px-3 bg-elevated">Destination</th>
              <th className="py-1.5 px-3 bg-elevated">Active</th>
              <th className="py-1.5 px-3 bg-elevated">Total</th>
              <th className="py-1.5 px-3 bg-elevated">Status</th>
            </tr>
          </thead>
          <tbody>
            {sortedDests.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 px-3 text-text-muted text-center">
                  No destinations match filter
                </td>
              </tr>
            ) : (
              sortedDests.map((node) => {
                const active = node.active > 0
                const isSelected = selectedId === node.id
                return (
                  <tr
                    key={node.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId((id) => (id === node.id ? null : node.id))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setSelectedId((id) => (id === node.id ? null : node.id))
                      }
                    }}
                    className={`border-b border-[var(--border-default)]/40 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-purple-dim/30 text-purple-bright'
                        : active
                          ? 'text-text-secondary hover:bg-hover/40'
                          : 'text-text-muted opacity-60 hover:bg-hover/20'
                    }`}
                  >
                    <td className="py-1.5 px-3 max-w-[200px] truncate" title={node.label}>
                      {node.label}
                    </td>
                    <td className="py-1.5 px-3 text-term-green">{node.active}</td>
                    <td className="py-1.5 px-3">{node.total}</td>
                    <td className="py-1.5 px-3">
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
                          active ? 'bg-term-green shadow-[0_0_6px_var(--green-term)]' : 'bg-purple-mid'
                        }`}
                      />
                      {active ? 'active' : 'idle'}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      <div className="flex flex-wrap items-center gap-3 justify-between shrink-0">
        <div className="flex flex-wrap gap-1">
          <ViewToggle label="Graph" active={viewMode === 'graph'} onClick={() => setViewMode('graph')} />
          <ViewToggle label="Table" active={viewMode === 'table'} onClick={() => setViewMode('table')} />
          <ViewToggle label="Both" active={viewMode === 'both'} onClick={() => setViewMode('both')} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            <ViewToggle label="Active" active={filter === 'active'} onClick={() => setFilter('active')} />
            <ViewToggle label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
          </div>
          {sortedDests.length > DEFAULT_MAX_NODES && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="font-mono text-[10px] text-purple-bright hover:text-purple-glow transition-colors"
            >
              {showAll
                ? `Showing all ${sortedDests.length} destinations`
                : `Showing ${displayDests.length} of ${sortedDests.length} destinations — expand`}
            </button>
          )}
        </div>
      </div>

      {isBoth ? (
        <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-3 flex-1 min-h-[min(400px,45vh)]">
          <div className="min-w-0 min-h-[min(380px,42vh)] md:min-h-0 flex flex-col">{graphPanel}</div>
          <div className="min-w-0 min-h-[min(240px,30vh)] md:min-h-0 flex flex-col overflow-hidden">{tablePanel}</div>
        </div>
      ) : (
        <div className="space-y-3">
          {(viewMode === 'graph') && graphPanel}
          {(viewMode === 'table') && tablePanel}
        </div>
      )}

      <div className="flex flex-wrap gap-4 font-mono text-[10px] text-text-muted shrink-0">
        <LegendDot color={COLORS.proxyGlow} label="SOCKS5 proxy" />
        <LegendDot color={COLORS.destination} label="Active destination" />
        <LegendDot color={COLORS.destinationIdle} label="Idle destination" />
        <LegendDot color={COLORS.edgeActive} label="Active route" pulse />
        <LegendDot color={COLORS.edge} label="Idle / historical" dashed />
        <span className="text-text-muted/70">Scroll to zoom · drag to pan</span>
      </div>
    </div>
  )
}

function StatusRing({
  cx,
  cy,
  radius,
  active,
  total,
  isActive,
}: {
  cx: number
  cy: number
  radius: number
  active: number
  total: number
  isActive: boolean
}) {
  const segments = 12
  const gap = 0.08
  const segAngle = (2 * Math.PI) / segments
  const filled = total > 0 ? Math.min(segments, Math.ceil((active / total) * segments)) : isActive ? segments : 0

  return (
    <g>
      {Array.from({ length: segments }, (_, i) => {
        const start = i * segAngle + gap / 2 - Math.PI / 2
        const end = (i + 1) * segAngle - gap / 2 - Math.PI / 2
        const x1 = cx + radius * Math.cos(start)
        const y1 = cy + radius * Math.sin(start)
        const x2 = cx + radius * Math.cos(end)
        const y2 = cy + radius * Math.sin(end)
        const largeArc = end - start > Math.PI ? 1 : 0
        const filledSeg = i < filled
        const color = filledSeg
          ? COLORS.ringActive
          : total > 0 && !isActive
            ? COLORS.ringIdle
            : COLORS.ringIdle

        return (
          <path
            key={i}
            d={`M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={filledSeg ? 0.9 : 0.25}
          />
        )
      })}
    </g>
  )
}

function NodeIcon({
  x,
  y,
  size,
  active,
  variant = 'destination',
}: {
  x: number
  y: number
  size: number
  active: boolean
  variant?: 'destination' | 'proxy'
}) {
  const half = size / 2
  const color =
    variant === 'proxy'
      ? 'var(--purple-bright)'
      : active
        ? 'var(--cyan-data)'
        : 'var(--purple-mid)'

  const Icon = variant === 'proxy' ? Shield : active ? Globe : Server

  return (
    <foreignObject x={x - half} y={y - half} width={size} height={size}>
      <div className="flex items-center justify-center w-full h-full pointer-events-none">
        <Icon size={size * 0.85} style={{ color }} strokeWidth={2} />
      </div>
    </foreignObject>
  )
}

function CurvedEdge({
  from,
  to,
  active,
  highlighted,
  dimmed,
  label,
  subLabel,
  nodeRadius,
}: {
  from: { x: number; y: number }
  to: { x: number; y: number }
  active: boolean
  highlighted: boolean
  dimmed: boolean
  label: string
  subLabel: string
  nodeRadius: number
}) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / dist
  const uy = dy / dist

  const startX = from.x + ux * 28
  const startY = from.y + uy * 28
  const endX = to.x - ux * (nodeRadius + 8)
  const endY = to.y - uy * (nodeRadius + 8)

  const midX = (startX + endX) / 2
  const midY = (startY + endY) / 2
  const perpX = -uy * 20
  const perpY = ux * 20
  const ctrlX = midX + perpX
  const ctrlY = midY + perpY

  const pathD = `M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`
  const strokeColor = active ? COLORS.edgeActive : COLORS.edge
  const opacity = dimmed ? 0.1 : active ? 0.9 : 0.35
  const strokeWidth = highlighted && !dimmed ? 2.5 : active ? 2 : 1

  const labelX = 0.25 * startX + 0.5 * ctrlX + 0.25 * endX
  const labelY = 0.25 * startY + 0.5 * ctrlY + 0.25 * endY

  return (
    <g opacity={opacity}>
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={active ? undefined : '5 4'}
        markerEnd={active ? 'url(#arrow-active)' : 'url(#arrow-idle)'}
      />
      {(highlighted || active) && (
        <g>
          <rect
            x={labelX - 28}
            y={labelY - 14}
            width={56}
            height={22}
            rx={2}
            fill="var(--bg-deep)"
            fillOpacity={0.92}
            stroke={active ? COLORS.edgeActive : COLORS.edge}
            strokeWidth={0.5}
            strokeOpacity={0.5}
          />
          <text
            x={labelX}
            y={labelY - 3}
            textAnchor="middle"
            fill={active ? COLORS.edgeActive : COLORS.muted}
            fontSize="8"
            fontFamily="var(--font-mono)"
            fontWeight="bold"
          >
            {label}
          </text>
          <text
            x={labelX}
            y={labelY + 7}
            textAnchor="middle"
            fill={COLORS.muted}
            fontSize="6"
            fontFamily="var(--font-mono)"
          >
            {subLabel}
          </text>
        </g>
      )}
    </g>
  )
}

function ViewToggle({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-1.5 py-0.5 font-mono text-[10px] uppercase rounded-brutal border transition-colors ${
        active
          ? 'border-purple-core text-purple-bright bg-purple-dim/30'
          : 'border-transparent text-text-muted hover:text-text-secondary hover:border-[var(--border-hover)]'
      }`}
    >
      {label}
    </button>
  )
}

function LegendDot({
  color,
  label,
  pulse,
  dashed,
}: {
  color: string
  label: string
  pulse?: boolean
  dashed?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block w-2.5 h-2.5 rounded-full"
        style={{
          background: dashed ? 'transparent' : color,
          border: `1.5px ${dashed ? 'dashed' : 'solid'} ${color}`,
          boxShadow: pulse ? `0 0 6px ${color}` : undefined,
        }}
      />
      {label}
    </span>
  )
}

function labelRotation(angle: number): number {
  const deg = (angle * 180) / Math.PI + 90
  return deg > 90 && deg < 270 ? deg + 180 : deg
}

function labelOffset(angle: number, dist: number): { dx: number; dy: number } {
  return {
    dx: Math.cos(angle) * dist,
    dy: Math.sin(angle) * dist,
  }
}

function extractPort(label: string): string | undefined {
  const match = label.match(/:(\d+)$/)
  return match ? match[1] : undefined
}

function truncateHostLabel(label: string, maxHost = 14): string {
  const portMatch = label.match(/:(\d+)$/)
  const port = portMatch ? portMatch[0] : ''
  const host = port ? label.slice(0, -port.length) : label

  if (host.length <= maxHost) return label

  const first = host.split('.')[0]
  if (first.length > 0 && first.length <= maxHost) {
    return `${first}…${port}`
  }

  return `${host.slice(0, maxHost - 1)}…${port}`
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
