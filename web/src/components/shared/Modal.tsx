import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur-sm scanlines"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-lg bg-elevated border border-[var(--border-default)] rounded-brutal p-6"
            style={{ animation: 'modal-in 0.2s ease-out' }}
            initial={{ opacity: 0, y: -20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 border-l-[3px] border-purple-core pl-3">
              <h2 className="font-display text-lg text-purple-bright">{title}</h2>
              <button onClick={onClose} className="text-text-muted hover:text-purple-bright">
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
