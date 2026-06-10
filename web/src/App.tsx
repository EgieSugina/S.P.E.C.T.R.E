import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Navbar } from '@/components/layout/Navbar'
import { StatusBar } from '@/components/layout/StatusBar'
import { LogPanel } from '@/components/layout/LogPanel'
import { useLogCapture } from '@/hooks/useLogCapture'
import { useSystemEvents } from '@/hooks/useSystemEvents'
import { useTunnelEvents } from '@/hooks/useTunnelEvents'
import { Dashboard } from '@/pages/Dashboard'
import { Connections } from '@/pages/Connections'
import { TerminalPage } from '@/pages/Terminal'
import { RdpPage } from '@/pages/Rdp'
import { FileManagerPage } from '@/pages/FileManager'
import { ProxyPage } from '@/pages/Proxy'
import { KeysPage } from '@/pages/Keys'
import { Settings } from '@/pages/Settings'
import { VaultUnlockModal } from '@/components/layout/VaultUnlockModal'
import { DottedGlowBackground } from '@/components/layout/DottedGlowBackground'
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
          <Route path="/rdp" element={<RdpPage />} />
          <Route path="/files" element={<FileManagerPage />} />
          <Route path="/proxy" element={<ProxyPage />} />
          <Route path="/keys" element={<KeysPage />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

function AppShell() {
  useLogCapture()
  useSystemEvents()
  useTunnelEvents()
  const fetchSettings = useSettingsStore((s) => s.fetch)

  useEffect(() => {
    ensureToken()
      .then(() => fetchSettings())
      .catch(console.error)
  }, [fetchSettings])

  return (
    <div className="relative flex h-full flex-col bg-deep">
      <DottedGlowBackground
        className="pointer-events-none z-0"
        gap={18}
        radius={1.5}
        colorDarkVar="--purple-core"
        glowColorDarkVar="--purple-glow"
        opacity={0.45}
        speedMin={0.3}
        speedMax={1.0}
      />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <Navbar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <AnimatedRoutes />
          <LogPanel />
          <StatusBar />
        </div>
        <VaultUnlockModal />
      </div>
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
