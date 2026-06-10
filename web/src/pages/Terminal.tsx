import { useEffect } from 'react'
import { Plus } from 'lucide-react'
import { sessionsApi } from '@/api/connections'
import { useConnectionStore } from '@/store/connectionStore'
import { useTerminalStore } from '@/store/terminalStore'
import { TerminalPane } from '@/components/terminal/TerminalPane'
import { TerminalTab } from '@/components/terminal/TerminalTab'
import { Button } from '@/components/shared/Button'
import { formatConnectionError } from '@/lib/connectionErrors'

export function TerminalPage() {
  const { connections, activeConnIds, fetch, connect } = useConnectionStore()
  const { tabs, activeTabId, addTab, removeTab, setActive, updateTabSession } = useTerminalStore()

  useEffect(() => {
    fetch()
  }, [fetch])

  const handleNewTab = async () => {
    const active = connections.find((c) => activeConnIds[c.id])
    if (!active) return
    const connId = activeConnIds[active.id]
    await addTab(active.id, connId, active.name)
  }

  const handleReconnect = async (tabId: string, connectionId: string) => {
    try {
      const connId = await connect(connectionId)
      const session = await sessionsApi.create(connId)
      updateTabSession(tabId, session.session_id, connId)
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
          <div className="flex items-center justify-center h-full font-mono text-text-muted text-sm">
            Connect to a server first, then open a terminal tab.
          </div>
        ) : (
          tabs.map((tab) => (
            <div
              key={`${tab.id}-${tab.sessionId}`}
              className="absolute inset-0"
              style={{ display: tab.id === activeTabId ? 'block' : 'none' }}
            >
              <TerminalPane
                sessionId={tab.sessionId}
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
