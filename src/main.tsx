import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { ensureSettings } from './db/database'

import { syncRestoreEpoch, watchForRestore } from './lib/restoreEpoch'

watchForRestore()
const root = createRoot(document.getElementById('root')!)

async function startShop() {
  try {
    const settings = await ensureSettings()
    if (settings.restoreEpoch) syncRestoreEpoch(settings.restoreEpoch)
    root.render(<StrictMode><App /></StrictMode>)
  } catch {
    root.render(<main className="mx-auto max-w-lg p-6" role="alert">
      <h1 className="mb-2 text-xl font-semibold">Could not open shop records</h1>
      <p>Check that browser storage is available, then try again.</p>
      <button className="mt-3 rounded-xl bg-brand-600 px-4 py-2 text-white" onClick={startShop}>Try again</button>
    </main>)
  }
}

void startShop()
