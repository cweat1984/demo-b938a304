import './lib/guestPartition'
import { bindPresent } from './lib/present'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource/barlow/500.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow/700.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import App from './App'
import { guardStores } from './lib/storageGuard'
import { ErrorBoundary } from './components/ErrorBoundary'
import { registerSW } from './lib/sw'
import { startExpenseSync } from './launch2/expenseCosts'
startExpenseSync()
import { startBrandSync } from './data/brandSync'
startBrandSync()
registerSW()
guardStores() // saved stores with a bad shape fall back to defaults before the first render

/** dive3 B1(c): frame-buster — the app never runs inside another site's frame (only our own Phone + office page frames it). */
const foreignFrame = (() => { if (window.top === window.self) return false; try { return window.parent.location.origin !== location.origin } catch { return true } })()
if (foreignFrame) {
  document.getElementById('root')!.innerHTML = '<div style="font:16px system-ui;padding:40px;text-align:center;color:#ddd;background:#0b0d10;min-height:100vh">This app can’t be shown inside another site. <a style="color:#7cc4ff" target="_top" rel="noopener" href="' + location.origin + location.pathname + '">Open it in its own tab</a>.</div>'
} else createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </StrictMode>,
)

bindPresent()
