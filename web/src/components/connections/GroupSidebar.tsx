import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Folder, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import { Group } from '@/api/connections'
import { GROUP_COLORS, useGroupStore } from '@/store/groupStore'
import { Button } from '@/components/shared/Button'
import { Modal } from '@/components/shared/Modal'
import { Input } from '@/components/shared/Input'
import { ApiError } from '@/api/client'

interface GroupSidebarProps {
  selectedGroupId: string | null
  onSelect: (id: string | null) => void
  counts: Record<string, number>
  totalCount: number
  ungroupedCount: number
}

function GroupFormModal({
  open,
  onClose,
  onSaved,
  editing,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editing?: Group | null
}) {
  const { create, update } = useGroupStore()
  const [name, setName] = useState('')
  const [color, setColor] = useState(GROUP_COLORS[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const reset = () => {
    setName(editing?.name ?? '')
    setColor(editing?.color ?? GROUP_COLORS[0])
    setError('')
  }

  useEffect(() => {
    if (open) reset()
  }, [open, editing])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setLoading(true)
    setError('')
    try {
      if (editing) {
        await update(editing.id, { ...editing, name: name.trim(), color })
      } else {
        await create({ name: name.trim(), color, sort_order: 0 })
      }
      onSaved()
      onClose()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`[${err.code}] ${err.message}`)
      } else {
        setError((err as Error).message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Group' : 'New Group'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="font-mono text-[10px] text-text-muted uppercase">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Production, Dev, Lab..."
            required
            autoFocus
          />
        </div>
        <div>
          <label className="font-mono text-[10px] text-text-muted uppercase">Color</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {GROUP_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={clsx(
                  'w-7 h-7 rounded-brutal border-2 transition-transform hover:scale-110',
                  color === c ? 'border-purple-bright scale-110' : 'border-transparent',
                )}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>
        {error && <p className="text-term-red font-mono text-xs">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : editing ? 'Update' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function GroupSidebar({
  selectedGroupId,
  onSelect,
  counts,
  totalCount,
  ungroupedCount,
}: GroupSidebarProps) {
  const { groups, remove } = useGroupStore()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Group | null>(null)

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (g: Group) => {
    setEditing(g)
    setFormOpen(true)
  }

  const handleDelete = async (g: Group) => {
    const n = counts[g.id] ?? 0
    const msg =
      n > 0
        ? `Delete "${g.name}"? ${n} connection(s) will become ungrouped.`
        : `Delete "${g.name}"?`
    if (!window.confirm(msg)) return
    await remove(g.id)
    if (selectedGroupId === g.id) {
      onSelect(null)
    }
  }

  return (
    <aside className="w-52 shrink-0 border-r border-[var(--border-default)] pr-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">
          Groups
        </span>
        <button
          type="button"
          onClick={openCreate}
          className="text-text-muted hover:text-purple-bright transition-colors"
          title="New group"
        >
          <Plus size={14} />
        </button>
      </div>

      <nav className="space-y-0.5">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={clsx(
            'w-full flex items-center gap-2 px-2 py-1.5 rounded-brutal font-mono text-xs transition-colors',
            selectedGroupId === null
              ? 'bg-purple-core/20 text-purple-bright border border-purple-core/40'
              : 'text-text-muted hover:bg-hover hover:text-[var(--text-primary)]',
          )}
        >
          {selectedGroupId === null ? <FolderOpen size={14} /> : <Folder size={14} />}
          <span className="flex-1 text-left truncate">All</span>
          <span className="text-[10px] opacity-70">{totalCount}</span>
        </button>

        {groups.map((g) => {
          const active = selectedGroupId === g.id
          const count = counts[g.id] ?? 0
          return (
            <div key={g.id} className="group/item flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => onSelect(g.id)}
                className={clsx(
                  'flex-1 flex items-center gap-2 px-2 py-1.5 rounded-brutal font-mono text-xs transition-colors min-w-0',
                  active
                    ? 'bg-purple-core/20 text-purple-bright border border-purple-core/40'
                    : 'text-text-muted hover:bg-hover hover:text-[var(--text-primary)]',
                )}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: g.color || '#7c3aed' }}
                />
                <span className="flex-1 text-left truncate">{g.name}</span>
                <span className="text-[10px] opacity-70">{count}</span>
              </button>
              <div className="flex opacity-0 group-hover/item:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => openEdit(g)}
                  className="p-1 text-text-muted hover:text-purple-bright"
                  title="Edit group"
                >
                  <Pencil size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(g)}
                  className="p-1 text-text-muted hover:text-term-red"
                  title="Delete group"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          )
        })}

        {ungroupedCount > 0 && groups.length > 0 && (
          <button
            type="button"
            onClick={() => onSelect('__ungrouped__')}
            className={clsx(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-brutal font-mono text-xs transition-colors',
              selectedGroupId === '__ungrouped__'
                ? 'bg-purple-core/20 text-purple-bright border border-purple-core/40'
                : 'text-text-muted hover:bg-hover hover:text-[var(--text-primary)]',
            )}
          >
            <span className="w-2 h-2 rounded-full shrink-0 border border-dashed border-text-muted" />
            <span className="flex-1 text-left truncate">Ungrouped</span>
            <span className="text-[10px] opacity-70">{ungroupedCount}</span>
          </button>
        )}
      </nav>

      <GroupFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {}}
        editing={editing}
      />
    </aside>
  )
}
