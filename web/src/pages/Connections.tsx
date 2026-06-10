import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useConnectionStore } from '@/store/connectionStore'
import { useGroupStore } from '@/store/groupStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useTerminalStore } from '@/store/terminalStore'
import { useRdpStore } from '@/store/rdpStore'
import { ConnectionList } from '@/components/connections/ConnectionList'
import { GroupSidebar } from '@/components/connections/GroupSidebar'
import { AddConnectionModal } from '@/components/connections/AddConnectionModal'
import { HostKeyTrustModal, parseHostKeyMismatch } from '@/components/connections/HostKeyTrustModal'
import { HostKeyMismatchDetails } from '@/api/knownHosts'
import { Tunnel, tunnelsApi } from '@/api/tunnels'
import { ProxyChain, proxyChainsApi } from '@/api/proxyChains'
import { Button } from '@/components/shared/Button'
export function Connections() {
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [tunnels, setTunnels] = useState<Tunnel[]>([])
  const [chains, setChains] = useState<ProxyChain[]>([])
  const [hostKeyPrompt, setHostKeyPrompt] = useState<{
    connectionId: string
    details: HostKeyMismatchDetails
  } | null>(null)
  const {
    connections,
    activeConnIds,
    error,
    fetch,
    connect,
    disconnect,
    remove,
    assignGroup,
    clearError,
  } = useConnectionStore()
  const { groups, fetch: fetchGroups } = useGroupStore()
  const { vaultLocked, vaultConfigured, fetch: fetchSettings, openVaultModal } = useSettingsStore()
  const addTab = useTerminalStore((s) => s.addTab)
  const addRdpTab = useRdpStore((s) => s.addTab)

  useEffect(() => {
    fetch()
    fetchGroups()
    fetchSettings()
    tunnelsApi.list().then(setTunnels).catch(() => setTunnels([]))
    proxyChainsApi.list().then(setChains).catch(() => setChains([]))
  }, [fetch, fetchGroups, fetchSettings])

  const { counts, ungroupedCount } = useMemo(() => {
    const counts: Record<string, number> = {}
    let ungroupedCount = 0
    for (const c of connections) {
      if (c.group_id) {
        counts[c.group_id] = (counts[c.group_id] ?? 0) + 1
      } else {
        ungroupedCount++
      }
    }
    return { counts, ungroupedCount }
  }, [connections])

  const handleConnect = async (id: string) => {
    if (vaultLocked || !vaultConfigured) {
      openVaultModal()
      return
    }
    clearError()
    try {
      await connect(id)
    } catch (e) {
      const mismatch = parseHostKeyMismatch(e)
      if (mismatch) {
        setHostKeyPrompt({ connectionId: id, details: mismatch })
      }
    }
  }

  const handleHostKeyTrusted = async () => {
    if (!hostKeyPrompt) return
    const { connectionId } = hostKeyPrompt
    setHostKeyPrompt(null)
    clearError()
    try {
      await connect(connectionId)
    } catch {
      // error stored in connectionStore
    }
  }

  const handleTerminal = async (connectionId: string, connId: string, name: string) => {
    await addTab(connectionId, connId, name)
    navigate('/terminal')
  }

  const handleDesktop = async (connectionId: string, connId: string, name: string) => {
    await addRdpTab(connectionId, connId, name)
    navigate('/rdp')
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
      <div className="flex gap-6">
        <GroupSidebar
          selectedGroupId={selectedGroupId}
          onSelect={setSelectedGroupId}
          counts={counts}
          totalCount={connections.length}
          ungroupedCount={ungroupedCount}
        />
        <div className="flex-1 min-w-0">
          <ConnectionList
            connections={connections}
            groups={groups}
            tunnels={tunnels}
            chains={chains}
            activeConnIds={activeConnIds}
            selectedGroupId={selectedGroupId}
            vaultLocked={vaultLocked}
            onConnect={handleConnect}
            onDisconnect={disconnect}
            onDelete={remove}
            onTerminal={handleTerminal}
            onDesktop={handleDesktop}
            onAssignGroup={assignGroup}
          />
        </div>
      </div>
      <AddConnectionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={fetch}
      />
      <HostKeyTrustModal
        open={!!hostKeyPrompt}
        details={hostKeyPrompt?.details ?? null}
        onClose={() => setHostKeyPrompt(null)}
        onTrusted={handleHostKeyTrusted}
      />
    </div>
  )
}
