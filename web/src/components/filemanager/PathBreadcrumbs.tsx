interface Crumb {
  label: string
  path: string
}

export function pathToBreadcrumbs(path: string): Crumb[] {
  const normalized = path.replace(/\/+$/, '') || '/'
  if (normalized === '/') {
    return [{ label: '/', path: '/' }]
  }

  const parts = normalized.split('/').filter(Boolean)
  const crumbs: Crumb[] = [{ label: '/', path: '/' }]
  let accumulated = ''
  for (const part of parts) {
    accumulated += '/' + part
    crumbs.push({ label: part, path: accumulated })
  }
  return crumbs
}

interface PathBreadcrumbsProps {
  path: string
  onNavigate: (path: string) => void
}

export function PathBreadcrumbs({ path, onNavigate }: PathBreadcrumbsProps) {
  const crumbs = pathToBreadcrumbs(path)

  return (
    <nav
      aria-label="Current path"
      className="flex flex-1 min-w-0 items-center gap-0.5 overflow-x-auto font-mono text-xs"
    >
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <span key={crumb.path} className="flex items-center shrink-0">
            {i > 0 && <span className="text-text-muted mx-0.5">/</span>}
            {isLast ? (
              <span className="text-term-cyan">{crumb.label}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(crumb.path)}
                className="text-text-muted hover:text-purple-bright transition-colors"
              >
                {crumb.label}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}
