export function StatusBar() {
  return (
    <footer className="h-6 flex items-center px-4 border-t border-[var(--border-default)] bg-void font-mono text-[10px] text-text-muted gap-4">
      <span>127.0.0.1:57321</span>
      <span className="text-purple-dim">|</span>
      <span>ENCRYPTED VAULT</span>
      <span className="text-purple-dim">|</span>
      <span className="text-purple-bright/60">You were never here.</span>
    </footer>
  )
}
