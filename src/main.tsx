import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { syncRestoreEpoch, watchForRestore } from './lib/restoreEpoch'
import { ensureSettings } from './db/database'

watchForRestore()
const root = createRoot(document.getElementById('root')!)
void ensureSettings().then(settings => {
  // Recover after a browser exit between the IndexedDB commit and draft cleanup.
  if ('restoreEpoch' in settings && typeof settings.restoreEpoch === 'string') syncRestoreEpoch(settings.restoreEpoch)
  root.render(<StrictMode><App /></StrictMode>)
}).catch(() => {
  root.render(<p role="alert">Could not open shop storage. Check browser storage access and reload.</p>)
})
