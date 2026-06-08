import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyTheme, getStoredTheme } from '@/lib/theme'
import './styles/globals.css'
import './styles/animations.css'
import './styles/terminal.css'

const storedTheme = getStoredTheme()
if (storedTheme) applyTheme(storedTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
