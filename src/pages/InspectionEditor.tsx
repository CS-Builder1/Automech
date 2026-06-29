import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { inspectionsRepo } from '@/repositories/inspections'
import { mediaRepo } from '@/repositories/media'
import { workOrdersRepo } from '@/repositories/workOrders'
import type { InspectionItem, InspectionRating, LineItem } from '@/db/types'
import { newId } from '@/lib/id'
import { PageHeader } from '@/components/ui/Page'
import { Button } from '@/components/ui/Button'
import { MediaImage } from '@/components/MediaImage'

const RATINGS: { value: InspectionRating; label: string; on: string; off: string }[] = [
  { value: 'green', label: 'Good', on: 'bg-emerald-500 text-white', off: 'text-emerald-600 dark:text-emerald-400' },
  { value: 'yellow', label: 'Soon', on: 'bg-amber-500 text-white', off: 'text-amber-600 dark:text-amber-400' },
  { value: 'red', label: 'Now', on: 'bg-red-600 text-white', off: 'text-red-600 dark:text-red-400' },
]

export function InspectionEditor() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const inspection = useLiveQuery(() => db.inspections.get(id), [id])
  const vehicle = useLiveQuery(() => (inspection ? db.vehicles.get(inspection.vehicleId) : undefined), [inspection?.vehicleId])

  if (inspection === undefined) return <p className="text-sm text-slate-400">Loading…</p>
  if (!inspection || inspection.deletedAt) return <p className="text-sm text-slate-400">Inspection not found.</p>

  const items = inspection.items
  const counts = {
    green: items.filter((i) => i.rating === 'green').length,
    yellow: items.filter((i) => i.rating === 'yellow').length,
    red: items.filter((i) => i.rating === 'red').length,
  }
  const findings = items.filter((i) => i.rating === 'yellow' || i.rating === 'red')

  async function patchItem(itemId: string, patch: Partial<InspectionItem>) {
    await inspectionsRepo.update(id, {
      items: inspection!.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
    })
  }

  async function addFindingToEstimate(item: InspectionItem) {
    if (!inspection!.workOrderId) return
    const wo = await workOrdersRepo.get(inspection!.workOrderId)
    if (!wo) return
    // Re-read the item so a just-typed note (saved on blur) is included.
    const fresh = await inspectionsRepo.get(id)
    const current = fresh?.items.find((i) => i.id === item.id) ?? item
    const line: LineItem = {
      id: newId(),
      kind: 'labor',
      description: current.note ? `${current.label} — ${current.note}` : current.label,
      quantity: 1,
      unitPrice: 0,
      hours: 1,
      taxable: true,
    }
    await workOrdersRepo.update(wo.id, { lineItems: [...wo.lineItems, line] })
    await patchItem(item.id, { addedToEstimate: true })
  }

  const grouped = groupByCategory(items)

  return (
    <div className="mx-auto max-w-2xl pb-8">
      <PageHeader
        title={inspection.templateName}
        subtitle={vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') : undefined}
      />

      {/* Summary */}
      <div className="card mb-4 grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800">
        <Tally n={counts.green} label="Good" color="text-emerald-600" />
        <Tally n={counts.yellow} label="Soon" color="text-amber-600" />
        <Tally n={counts.red} label="Now" color="text-red-600" />
      </div>

      {grouped.map(([category, list]) => (
        <div key={category} className="mb-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">{category}</h2>
          <div className="card divide-y divide-slate-100 dark:divide-slate-800">
            {list.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                hasWorkOrder={Boolean(inspection.workOrderId)}
                onRate={(rating) => patchItem(item.id, { rating })}
                onNote={(note) => patchItem(item.id, { note: note || undefined })}
                onPhoto={async (file) => {
                  const pid = await mediaRepo.add(file)
                  await patchItem(item.id, { photoIds: [...(item.photoIds ?? []), pid] })
                }}
                onRemovePhoto={async (pid) => {
                  await mediaRepo.remove(pid)
                  await patchItem(item.id, { photoIds: (item.photoIds ?? []).filter((p) => p !== pid) })
                }}
                onAddToEstimate={() => addFindingToEstimate(item)}
              />
            ))}
          </div>
        </div>
      ))}

      {inspection.workOrderId && findings.length > 0 && (
        <div className="card mb-4 p-4 text-sm text-slate-500 dark:text-slate-400">
          {findings.length} finding{findings.length > 1 ? 's' : ''} flagged. Use “Add to estimate” on a finding to put recommended work on{' '}
          <Link to={`/jobs/${inspection.workOrderId}`} className="text-brand-600 dark:text-brand-400">the job</Link>.
        </div>
      )}

      <Button variant="ghost" size="sm" className="!text-red-600"
        onClick={async () => { if (confirm('Delete this inspection?')) { await inspectionsRepo.softDelete(id); navigate(-1) } }}>
        Delete inspection
      </Button>
    </div>
  )
}

function ItemRow({
  item, hasWorkOrder, onRate, onNote, onPhoto, onRemovePhoto, onAddToEstimate,
}: {
  item: InspectionItem
  hasWorkOrder: boolean
  onRate: (r: InspectionRating) => void
  onNote: (n: string) => void
  onPhoto: (file: File) => void
  onRemovePhoto: (id: string) => void
  onAddToEstimate: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [expanded, setExpanded] = useState(false)
  const isFinding = item.rating === 'yellow' || item.rating === 'red'

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{item.label}</span>
        <div className="flex gap-1">
          {RATINGS.map((r) => (
            <button
              key={r.value}
              onClick={() => onRate(r.value)}
              className={`h-9 w-9 rounded-lg border text-xs font-bold transition-colors ${
                item.rating === r.value ? r.on + ' border-transparent' : `border-slate-200 dark:border-slate-700 ${r.off}`
              }`}
              aria-label={r.label}
            >
              {r.label[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button className="text-xs text-slate-400 hover:text-brand-600" onClick={() => setExpanded((e) => !e)}>
          {item.note || (item.photoIds?.length ?? 0) > 0 ? '✎ note / photos' : '+ note / photo'}
        </button>
        {isFinding && hasWorkOrder && (
          item.addedToEstimate ? (
            <span className="text-xs text-emerald-600">✓ on estimate</span>
          ) : (
            <button className="text-xs font-medium text-brand-600 dark:text-brand-400" onClick={onAddToEstimate}>+ add to estimate</button>
          )
        )}
      </div>

      {(expanded || item.note || (item.photoIds?.length ?? 0) > 0) && (
        <div className="mt-2 space-y-2">
          <input
            className="input text-sm"
            placeholder="Note (e.g. 3mm pad left, leaking)"
            defaultValue={item.note ?? ''}
            onBlur={(e) => onNote(e.target.value.trim())}
          />
          <div className="flex flex-wrap gap-2">
            {(item.photoIds ?? []).map((pid) => (
              <MediaImage key={pid} id={pid} onRemove={() => onRemovePhoto(pid)} />
            ))}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-xs text-slate-400 dark:border-slate-600"
            >
              <span className="text-xl">📷</span> Photo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = '' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Tally({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div className="px-2 py-3 text-center">
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{n}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  )
}

function groupByCategory(items: InspectionItem[]): [string, InspectionItem[]][] {
  const map = new Map<string, InspectionItem[]>()
  for (const item of items) {
    const cat = item.category ?? 'Items'
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(item)
  }
  return Array.from(map.entries())
}
