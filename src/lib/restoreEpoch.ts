// Drafts live outside the shop database. A successful replacement invalidates
// both unsaved intake forms and per-tab edits, even for identical restored IDs.
const epochKey = 'automech:restore-epoch'

function discardDrafts(storage: Storage) {
  for (const key of Object.keys(storage)) {
    if (key.startsWith('automech.intake.') || key.startsWith('automech:job-draft:')) storage.removeItem(key)
  }
}

export function syncRestoreEpoch(epoch: string) {
  try {
    if (localStorage.getItem(epochKey) !== epoch) {
      discardDrafts(localStorage)
      localStorage.setItem(epochKey, epoch)
    }
    if (sessionStorage.getItem(epochKey) !== epoch) {
      discardDrafts(sessionStorage)
      sessionStorage.setItem(epochKey, epoch)
    }
  } catch {
    // When Web Storage is unavailable, workOrdersRepo.update still checks the
    // epoch for complaint, diagnosis and mileage edits made through WorkOrderField.
  }
}

export function watchForRestore() {
  function refreshStaleTab() {
    try {
      const latest = localStorage.getItem(epochKey)
      if (!latest || sessionStorage.getItem(epochKey) === latest) return
      syncRestoreEpoch(latest)
      window.location.reload()
    } catch { /* Storage is unavailable in this tab. */ }
  }
  window.addEventListener('storage', event => {
    if (event.key === epochKey) refreshStaleTab()
  })
  window.addEventListener('pageshow', event => {
    if (event.persisted) refreshStaleTab()
  })
}
