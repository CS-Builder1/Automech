import { useState } from 'react'
import { createBackup, inspectBackup } from '@/lib/backup'
import { Button } from './ui/Button'

type Preview = Awaited<ReturnType<typeof inspectBackup>>
const historyKey = 'automech.lastBackupDownload'
const names: Record<string, string> = {
  customers: 'Customers', vehicles: 'Vehicles', workOrders: 'Work orders', invoices: 'Invoices',
  payments: 'Payments', expenses: 'Expenses', inspections: 'Inspections', appointments: 'Appointments',
  media: 'Photos', settings: 'Shop settings',
}

function readLastBackup() {
  try { return localStorage.getItem(historyKey) } catch { return null }
}

export function BackupSettings() {
  const [lastBackup, setLastBackup] = useState(readLastBackup)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<Preview>()
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function perform(action: () => Promise<void>) {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete this operation.')
    } finally {
      setBusy(false)
    }
  }

  function download() {
    void perform(async () => {
      const { blob, createdAt, filename } = await createBackup()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setLastBackup(createdAt)
      try { localStorage.setItem(historyKey, createdAt) } catch { /* Download still works without localStorage. */ }
      setMessage('Download started. Keep the file somewhere private and accessible from another device.')
    })
  }

  function selectFile(file?: File) {
    setPreview(undefined)
    setConfirmed(false)
    if (!file) return
    void perform(async () => {
      setPreview(await inspectBackup(file))
      setMessage('File checked. Review the backup before restoring.')
    })
  }

  return (
    <section className="card mt-6 space-y-4 p-4" aria-labelledby="backup-heading">
      <h2 id="backup-heading" className="text-lg font-semibold">Backup and restore</h2>
      <p className="text-sm">Finish any open intake to include it. Download a copy of your saved shop records, signatures, photos and settings. Keep this file private.</p>
      <Button type="button" variant="secondary" disabled={busy} onClick={download}>Download backup</Button>
      <p className="text-sm">Last backup download on this device: {lastBackup ? new Date(lastBackup).toLocaleString() : 'None yet'}</p>
      <div className="space-y-2 border-t pt-4">
        <label htmlFor="restore-file" className="block font-semibold">Restore from a backup file</label>
        <p id="restore-hint" className="text-sm">Choose an Automech JSON file to see its date and record counts.</p>
        <input id="restore-file" className="block max-w-full text-sm" type="file" accept=".json,application/json"
          disabled={busy} aria-describedby="restore-hint"
          onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; selectFile(file) }} />
      </div>
      <div role="status" aria-live="polite" className="text-sm">{busy ? 'Working…' : message}</div>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      {preview && (
        <div className="space-y-3 rounded-lg border p-3">
          <h3 className="font-semibold">Review backup</h3>
          <p>{preview.shopName} · <time dateTime={preview.createdAt}>{new Date(preview.createdAt).toLocaleString()}</time></p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {preview.counts.map(({ name, count }) => (
              <div key={name} className="flex justify-between gap-2"><dt>{names[name] ?? name}</dt><dd>{count}</dd></div>
            ))}
          </dl>
          <label className="flex items-start gap-2 text-sm">
            <input className="mt-1" type="checkbox" disabled={busy} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
            Replace all shop records on this device with this backup.
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="danger" disabled={!confirmed || busy} onClick={() => void perform(async () => {
              try {
                await preview.replaceShop()
              } catch (err) {
                const reason = err instanceof Error ? err.message : 'Storage write failed.'
                throw new Error(`Restore failed. Your previous shop records are intact. ${reason}`)
              }
              setPreview(undefined)
              setConfirmed(false)
              setMessage('Restore complete. Your shop records are ready on this device.')
            })}>Restore shop records</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => {
              setPreview(undefined)
              setMessage('Restore cancelled.')
              setConfirmed(false)
            }}>Cancel restore</Button>
          </div>
        </div>
      )}
    </section>
  )
}
