import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useConnectionStore } from '@/store/connectionStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useTerminalStore } from '@/store/terminalStore'
import { ConnectionList } from '@/components/connections/ConnectionList'
import { AddConnectionModal } from '@/components/connections/AddConnectionModal'
import { Button } from '@/components/shared/Button'

export function Connections() {
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const { connections, activeConnIds, error, fetch, connect, disconnect, remove, clearError } =
    useConnectionStore()
  const { vaultLocked, vaultConfigured, fetch: fetchSettings, openVaultModal } = useSettingsStore()
  const addTab = useTerminalStore((s) => s.addTab)

  useEffect(() => {
    fetch()
    fetchSettings()
  }, [fetch, fetchSettings])

  const handleConnect = async (id: string) => {
    if (vaultLocked || !vaultConfigured) {
      openVaultModal()
      return
    }
    clearError()
    try {
      await connect(id)
    } catch {
      // error stored in connectionStore
    }
  }

  const handleTerminal = async (connectionId: string, connId: string, name: string) => {
    await addTab(connectionId, connId, name)
    navigate('/terminal')
  }

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <p className="font-mono text-xs text-text-muted">{connections.length} connection(s)</p>
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={14} className="inline mr-1" /> Add Connection
        </Button>
      </div>
      {(vaultLocked || !vaultConfigured) && (
        <div
          className="mb-4 border border-amber-500/40 bg-amber-500/10 rounded-brutal px-4 py-3 font-mono text-xs text-amber-200"
          role="status"
        >
          {vaultConfigured
            ? 'Vault is locked. Connect to unlock, or use Settings.'
            : 'Vault not configured. Connect or save a connection to set up your master password.'}
        </div>
      )}
      {error && (
        <div
          className="mb-4 border border-term-red/40 bg-term-red/10 rounded-brutal px-4 py-3 font-mono text-xs text-term-red"
          role="alert"
        >
          {error}
        </div>
      )}
      <ConnectionList
        connections={connections}
        activeConnIds={activeConnIds}
        vaultLocked={vaultLocked}
        onConnect={handleConnect}
        onDisconnect={disconnect}
        onDelete={remove}
        onTerminal={handleTerminal}
      />
      <AddConnectionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={fetch}
      />
    </div>
  )
}
