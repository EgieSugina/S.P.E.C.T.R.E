import { useEffect, useRef, useState } from 'react'
import { CheckSquare, FolderPlus, FolderUp, RefreshCw, Trash2, Upload } from 'lucide-react'
import { useConnectionStore } from '@/store/connectionStore'
import { useFileStore } from '@/store/fileStore'
import { FileTree } from '@/components/filemanager/FileTree'
import { DropZone } from '@/components/filemanager/DropZone'
import { UploadQueuePanel } from '@/components/filemanager/UploadQueue'
import { sftpApi } from '@/api/sftp'
import { Button } from '@/components/shared/Button'
import { Modal } from '@/components/shared/Modal'
import { useUploadQueue } from '@/hooks/useUploadQueue'
import { useSftpProgress } from '@/hooks/useSftpProgress'
import { collectFromFileList } from '@/lib/localFiles'

export function FileManagerPage() {
  const { connections, activeConnIds, fetch } = useConnectionStore()
  const { connId, currentPath, entries, setConnId, navigate, refresh } = useFileStore()
  const { enqueue, enqueueTree } = useUploadQueue()
  const queue = useUploadQueue((s) => s.queue)
  const clearCompleted = useUploadQueue((s) => s.clearCompleted)

  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const prevActiveRef = useRef(0)

  useSftpProgress(connId)

  useEffect(() => {
    fetch()
  }, [fetch])

  useEffect(() => {
    if (connId) navigate(currentPath)
  }, [connId])

  useEffect(() => {
    setSelectedPaths(new Set())
  }, [connId, currentPath])

  useEffect(() => {
    const active = queue.filter((q) => q.status === 'uploading' || q.status === 'pending').length
    if (prevActiveRef.current > 0 && active === 0) {
      refresh()
      clearCompleted()
    }
    prevActiveRef.current = active
  }, [queue, refresh, clearCompleted])

  const activeConnections = connections.filter((c) => activeConnIds[c.id])

  const toggleSelect = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const allSelected = entries.length > 0 && entries.every((e) => selectedPaths.has(e.path))

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedPaths(new Set())
    } else {
      setSelectedPaths(new Set(entries.map((e) => e.path)))
    }
  }

  const pathsToDelete = (paths: Iterable<string>) =>
    [...paths].filter(
      (p) => ![...paths].some((other) => other !== p && p.startsWith(other + '/')),
    )

  const openFilePicker = (directory: boolean) => {
    if (!connId) return
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    if (directory) {
      input.webkitdirectory = true
    }
    input.onchange = async () => {
      if (!input.files || input.files.length === 0) return
      if (directory) {
        const { files, emptyDirs } = collectFromFileList(input.files)
        await enqueueTree(connId, currentPath, files, emptyDirs)
      } else {
        for (const file of Array.from(input.files)) {
          const path = currentPath.endsWith('/')
            ? currentPath + file.name
            : currentPath + '/' + file.name
          enqueue(connId, file, path)
        }
      }
    }
    input.click()
  }

  const handleMkdir = async () => {
    if (!connId) return
    const name = prompt('Directory name:')
    if (!name) return
    const path = currentPath.endsWith('/') ? currentPath + name : currentPath + '/' + name
    await sftpApi.mkdir(connId, path)
    refresh()
  }

  const handleDeleteSelected = async () => {
    if (!connId || selectedPaths.size === 0) return
    setDeleting(true)
    setDeleteError(null)
    const errors: string[] = []
    for (const path of pathsToDelete(selectedPaths)) {
      try {
        await sftpApi.delete(connId, path)
      } catch (e) {
        errors.push(`${path}: ${(e as Error).message}`)
      }
    }
    setDeleting(false)
    if (errors.length > 0) {
      setDeleteError(errors.join('\n'))
    } else {
      setDeleteOpen(false)
      setSelectedPaths(new Set())
      refresh()
    }
  }

  const handleSingleDelete = async (path: string) => {
    if (!connId) return
    if (!confirm(`Delete ${path}?`)) return
    try {
      await sftpApi.delete(connId, path)
      setSelectedPaths((prev) => {
        const next = new Set(prev)
        next.delete(path)
        return next
      })
      refresh()
    } catch (e) {
      alert((e as Error).message)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b border-[var(--border-default)] bg-surface">
        <select
          className="bg-elevated border border-[var(--border-default)] rounded-brutal px-3 py-2 font-mono text-xs text-purple-bright"
          value={connId || ''}
          onChange={(e) => setConnId(e.target.value || null)}
        >
          <option value="">Select connection...</option>
          {activeConnections.map((c) => (
            <option key={c.id} value={activeConnIds[c.id]}>{c.name}</option>
          ))}
        </select>
        <span className="font-mono text-xs text-term-cyan flex-1 truncate">{currentPath}</span>
        <Button variant="ghost" onClick={() => refresh()} disabled={!connId}>
          <RefreshCw size={14} />
        </Button>
        <Button variant="ghost" onClick={handleMkdir} disabled={!connId}>
          <FolderPlus size={14} />
        </Button>
        <Button
          variant="ghost"
          onClick={handleSelectAll}
          disabled={!connId || entries.length === 0}
        >
          <CheckSquare size={14} className="inline mr-1" />
          {allSelected ? 'Deselect All' : 'Select All'}
        </Button>
        <Button
          variant="danger"
          onClick={() => { setDeleteError(null); setDeleteOpen(true) }}
          disabled={!connId || selectedPaths.size === 0}
        >
          <Trash2 size={14} className="inline mr-1" /> Delete Selected
        </Button>
        <Button variant="primary" onClick={() => openFilePicker(false)} disabled={!connId}>
          <Upload size={14} className="inline mr-1" /> Upload
        </Button>
        <Button variant="ghost" onClick={() => openFilePicker(true)} disabled={!connId}>
          <FolderUp size={14} className="inline mr-1" /> Upload Folder
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {connId ? (
          <DropZone connectionId={connId} remotePath={currentPath}>
            <FileTree
              entries={entries}
              currentPath={currentPath}
              selectedPaths={selectedPaths}
              onNavigate={navigate}
              onDownload={(path) => window.open(sftpApi.downloadUrl(connId, path), '_blank')}
              onDelete={handleSingleDelete}
              onToggleSelect={toggleSelect}
            />
          </DropZone>
        ) : (
          <div className="flex items-center justify-center h-full font-mono text-text-muted text-sm">
            Connect to a server, then select it here.
          </div>
        )}
      </div>
      <UploadQueuePanel />

      <Modal open={deleteOpen} onClose={() => !deleting && setDeleteOpen(false)} title="Confirm Delete">
        <p className="font-mono text-sm text-text-secondary mb-4">
          Delete {selectedPaths.size} selected item{selectedPaths.size === 1 ? '' : 's'}? This cannot be undone.
        </p>
        {deleteError && (
          <pre className="font-mono text-xs text-term-red whitespace-pre-wrap mb-4 max-h-32 overflow-auto">
            {deleteError}
          </pre>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteSelected} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
