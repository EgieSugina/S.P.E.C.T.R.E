import { useEffect } from 'react'
import { Plus } from 'lucide-react'
import { rdpApi } from '@/api/rdp'
import { useConnectionStore } from '@/store/connectionStore'
import { useRdpStore } from '@/store/rdpStore'
import { RdpPane } from '@/components/rdp/RdpPane'
import { TerminalTab } from '@/components/terminal/TerminalTab'
import { Button } from '@/components/shared/Button'
import { EmptySessionPane } from '@/components/shared/EmptySessionPane'
import { formatConnectionError } from '@/lib/connectionErrors'

export function RdpPage() {
  const { connections, activeConnIds, fetch, connect } = useConnectionStore()
  const { tabs, activeTabId, addTab, removeTab, setActive, updateTabSession } = useRdpStore()

  useEffect(() => {
    fetch()
  }, [fetch])

  const rdpConnections = connections.filter((c) => (c.protocol || 'ssh') === 'rdp')

  const handleNewTab = async () => {
    const active = rdpConnections.find((c) => activeConnIds[c.id])
    if (!active) return
    const connId = activeConnIds[active.id]
    await addTab(active.id, connId, active.name)
  }

  const hasActiveConnection = rdpConnections.some((c) => activeConnIds[c.id])

  const handleReconnect = async (tabId: string, connectionId: string) => {
    try {
      const connId = await connect(connectionId)
      const session = await rdpApi.create(connId)
      updateTabSession(
        tabId,
        session.session_id,
        connId,
        session.width ?? 1280,
        session.height ?? 720,
      )
    } catch (e) {
      alert(formatConnectionError(e))
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center border-b border-[var(--border-default)] bg-surface">
        <div className="flex flex-1 overflow-x-auto">
          {tabs.map((tab) => (
            <TerminalTab
              key={tab.id}
              name={tab.name}
              active={tab.id === activeTabId}
              onSelect={() => setActive(tab.id)}
              onClose={() => removeTab(tab.id)}
            />
          ))}
        </div>
        <Button variant="ghost" className="m-2" onClick={handleNewTab}>
          <Plus size={14} />
        </Button>
      </div>
      <div className="flex-1 relative">
        {tabs.length === 0 ? (
          <EmptySessionPane
            variant="rdp"
            hasActiveConnection={hasActiveConnection}
            onNewTab={handleNewTab}
          />
        ) : (
          tabs.map((tab) => (
            <div
              key={`${tab.id}-${tab.sessionId}`}
              className="absolute inset-0"
              style={{ display: tab.id === activeTabId ? 'block' : 'none' }}
            >
              <RdpPane
                sessionId={tab.sessionId}
                width={tab.width}
                height={tab.height}
                isActive={tab.id === activeTabId}
                onReconnect={() => handleReconnect(tab.id, tab.connectionId)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
