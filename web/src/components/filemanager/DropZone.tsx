import { useState, useCallback, DragEvent, ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUploadQueue } from '@/hooks/useUploadQueue'
import { collectFromDataTransfer } from '@/lib/localFiles'

interface DropZoneProps {
  connectionId: string
  remotePath: string
  children: ReactNode
}

export function DropZone({ connectionId, remotePath, children }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [, setDragDepth] = useState(0)
  const { enqueueTree } = useUploadQueue()

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragDepth((d) => d + 1)
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragDepth((d) => {
      const newDepth = d - 1
      if (newDepth === 0) setIsDragOver(false)
      return newDepth
    })
  }, [])

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      setDragDepth(0)
      const { files, emptyDirs } = await collectFromDataTransfer(e.dataTransfer)
      if (files.length === 0 && emptyDirs.length === 0) return
      await enqueueTree(connectionId, remotePath, files, emptyDirs)
    },
    [connectionId, remotePath, enqueueTree]
  )

  return (
    <div
      className="relative h-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {children}
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            className="absolute inset-0 z-10 flex items-center justify-center bg-purple-core/10 border-2 border-dashed border-purple-bright rounded-brutal backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <p className="font-mono text-purple-bright text-sm uppercase tracking-wider">
              Drop files or folders to upload
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
