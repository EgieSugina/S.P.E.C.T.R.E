import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Navbar } from '@/components/layout/Navbar'
import { StatusBar } from '@/components/layout/StatusBar'
import { LogPanel } from '@/components/layout/LogPanel'
import { useLogCapture } from '@/hooks/useLogCapture'
import { Dashboard } from '@/pages/Dashboard'
import { Connections } from '@/pages/Connections'
import { TerminalPage } from '@/pages/Terminal'
import { FileManagerPage } from '@/pages/FileManager'
import { ProxyPage } from '@/pages/Proxy'
import { Settings } from '@/pages/Settings'
import { VaultUnlockModal } from '@/components/layout/VaultUnlockModal'
import { ensureToken } from '@/api/client'
import { useSettingsStore } from '@/store/settingsStore'

const pageVariants = {
  initial: { opacity: 0, x: 12, filter: 'blur(4px)' },
  animate: { opacity: 1, x: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, x: -12, filter: 'blur(4px)' },
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.2 }}
        className="flex-1 overflow-hidden"
      >
        <Routes location={location}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/connections" element={<Connections />} />
          <Route path="/terminal" element={<TerminalPage />} />
          <Route path="/files" element={<FileManagerPage />} />
          <Route path="/proxy" element={<ProxyPage />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

function AppShell() {
  useLogCapture()
  const fetchSettings = useSettingsStore((s) => s.fetch)

  useEffect(() => {
    ensureToken()
      .then(() => fetchSettings())
      .catch(console.error)
  }, [fetchSettings])

  return (
    <div className="flex flex-col h-full bg-deep scanlines relative">
      <Navbar />
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <AnimatedRoutes />
        <LogPanel />
        <StatusBar />
      </div>
      <VaultUnlockModal />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}
