import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { workOrdersRepo, type ApprovalInput } from '@/repositories/workOrders'
import { useSettings } from '@/hooks/useSettings'
import { useMoney } from '@/hooks/useMoney'
import type { LineItem, WorkOrderStatus, EstimateSnapshot } from '@/db/types'
import { computeTotals, lineTotal } from '@/lib/calc'
import { STATUS_META, STATUS_ORDER } from '@/lib/status'
import { PageHeader } from '@/components/ui/Page'
import { Button } from '@/components/ui/Button'
import { LineItemEditor } from '@/components/LineItemEditor'
import { AuthorizationSheet, EstimateSummary } from '@/components/AuthorizationSheet'
import { approvalHistory, approvalIssue, estimateSnapshot, needsApproval } from '@/lib/approval'
import { JobBilling } from '@/components/JobBilling'
import { JobPlanning } from '@/components/operations/JobPlanning'
import { WorkOrderField } from '@/components/WorkOrderField'

export function WorkOrderDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const settings = useSettings()
  const format = useMoney()
  const data = useLiveQuery(async () => {
    const order = await db.workOrders.get(id)
    if (!order) return null
    const restoreEpoch = (await db.settings.get('singleton'))?.restoreEpoch ?? 'initial'
    return { order, restoreEpoch, customer: await db.customers.get(order.customerId), vehicle: await db.vehicles.get(order.vehicleId) }
  }, [id])
  const [editingItem, setEditingItem] = useState<LineItem | undefined>()
  const [itemSheetOpen, setItemSheetOpen] = useState(false)
  const [approval, setApproval] = useState<{ snapshot: EstimateSnapshot; revision: number }>()
  const [error, setError] = useState('')

  if (data === undefined) return <p className="text-sm text-slate-400">Loading…</p>
  if (!data) return <p>Job not found.</p>
  const { order: wo, vehicle, customer, restoreEpoch } = data
  const money = (amount: number) => format(amount, wo)
  const totals = computeTotals(wo)
  const history = approvalHistory(wo)
  const latest = history[history.length - 1]
  const issue = approvalIssue(wo)
  const customerName = [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') || customer?.company || 'Customer'
  const archivedParent = !customer || customer.deletedAt || !vehicle || vehicle.deletedAt
  const archived = Boolean(wo.deletedAt || archivedParent)
  const locked = archived || wo.status === 'invoiced'
  const readOnly = locked || wo.status === 'completed'

  async function run(action: () => Promise<void>) {
    setError('')
    try { await action() } catch (cause) { setError((cause as Error).message) }
  }

  function openNewItem() {
    setEditingItem(undefined)
    setItemSheetOpen(true)
  }
  function openEditItem(item: LineItem) {
    setEditingItem(item)
    setItemSheetOpen(true)
  }

  async function saveItem(item: LineItem) {
    await workOrdersRepo.changeLine(id, 'save', item, editingItem)
    setItemSheetOpen(false)
  }

  async function removeItem() {
    if (!editingItem) return
    await workOrdersRepo.changeLine(id, 'remove', editingItem, editingItem)
    setItemSheetOpen(false)
  }

  async function saveAuth(input: ApprovalInput) {
    if (!approval) return
    await workOrdersRepo.recordApproval(id, input, approval.snapshot, approval.revision)
    setApproval(undefined)
  }

  async function archive() {
    if (!confirm(`Archive ${wo.number}?`)) return
    await workOrdersRepo.softDelete(id)
    navigate('/jobs')
  }

  return (
    <div className="mx-auto max-w-2xl pb-8">
      <PageHeader
        title={wo.number}
        subtitle={vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') : undefined}
        action={
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_META[wo.status].color}`}>
            {STATUS_META[wo.status].label}
          </span>
        }
      />

      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      {archived && <div className="card mb-3 space-y-2 p-3">
        <p>Archived job · read-only</p>
        {customer?.deletedAt && <Link className="underline" to={`/customers/${wo.customerId}`}>View archived customer</Link>}
        {vehicle?.deletedAt && <Link className="block underline" to={`/customers/${wo.customerId}/vehicles/${wo.vehicleId}`}>View archived vehicle</Link>}
        {wo.deletedAt && !archivedParent && <Button onClick={() => run(() => workOrdersRepo.restore(id))}>Restore job</Button>}
      </div>}
      {/* Customer + vehicle */}
      <div className="card mb-4 p-4">
        <div className="flex items-center justify-between">
          <div>
            <Link to={`/customers/${wo.customerId}`} className="font-semibold text-brand-600 dark:text-brand-400">{customerName}</Link>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {vehicle ? [vehicle.licensePlate && `Plate ${vehicle.licensePlate}`, vehicle.vin && `VIN ${vehicle.vin}`].filter(Boolean).join(' · ') : '—'}
            </div>
          </div>
          {customer?.phone && (
            <a href={`tel:${customer.phone}`} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium dark:bg-slate-800">Call</a>
          )}
        </div>
      </div>

      <JobPlanning key={'planning:' + wo.id} job={wo} readOnly={readOnly} />

      {/* Complaint / diagnosis */}
      <div className="card mb-4 space-y-3 p-4">
        <WorkOrderField key={restoreEpoch + id + 'complaint'} order={wo} restoreEpoch={restoreEpoch} field="complaint" label="Complaint / concern" readOnly={readOnly} />
        <WorkOrderField key={restoreEpoch + id + 'diagnosis'} order={wo} restoreEpoch={restoreEpoch} field="diagnosis" label="Diagnosis / notes" readOnly={readOnly} />
        <div className="grid grid-cols-2 gap-3">
          <WorkOrderField key={restoreEpoch + id + 'in'} order={wo} restoreEpoch={restoreEpoch} field="mileageIn" label="Mileage in" readOnly={readOnly} />
          <WorkOrderField key={restoreEpoch + id + 'out'} order={wo} restoreEpoch={restoreEpoch} field="mileageOut" label="Mileage out" readOnly={readOnly} />
        </div>
      </div>

      {/* Line items */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Line items</h2>
        {!readOnly && <Button size="sm" onClick={openNewItem}>+ Add</Button>}
      </div>
      <div className="card mb-4 divide-y divide-slate-100 dark:divide-slate-800">
        {wo.lineItems.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            No line items yet. Add labor and parts to build the estimate.
          </p>
        ) : (
          wo.lineItems.map((li) => (
            <LineRow key={li.id} item={li} money={money} readOnly={readOnly} onEdit={() => openEditItem(li)} onDecline={() => run(() => workOrdersRepo.changeLine(id, 'decline', li, li))} />
          ))
        )}
      </div>

      {/* Totals */}
      <div className="card mb-4 space-y-1.5 p-4 text-sm">
        <Row label="Subtotal" value={money(totals.itemsSubtotal)} />
        {totals.shopSupplies > 0 && <Row label={`Shop supplies (${wo.shopSuppliesPct ?? 0}%)`} value={money(totals.shopSupplies)} />}
        {totals.tax > 0 && <Row label={`Tax (${wo.taxRatePct ?? 0}%)`} value={money(totals.tax)} />}
        <div className="!mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-base font-bold dark:border-slate-800">
          <span>Total</span><span className="tabular-nums">{money(totals.total)}</span>
        </div>
        {wo.lineItems.length > 0 && (
          <p className="!mt-2 text-xs text-slate-600 dark:text-slate-300">
            Revenue less recorded direct costs {money(totals.grossProfit)} · parts/sublet cost {money(totals.partsCost)} · direct labor {money(totals.laborCost)}. Excludes overhead and unrecorded costs.
          </p>
        )}
      </div>

      <section className="card mb-4 space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Approval</h2>
          {!locked && <Button size="sm" disabled={!wo.lineItems.length} onClick={() => setApproval({snapshot: estimateSnapshot(wo, customer, vehicle), revision: history.length})}>
            {latest ? 'Update' : 'Capture approval'}
          </Button>}
        </div>
        {issue && !locked && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{issue}</p>}
        {history.slice().reverse().map((record, i) => (
          <details className="border-t pt-2 text-sm" key={record.id ?? record.authorizedAt} open={i === 0}>
            <summary className="cursor-pointer font-medium">
              Approval {record.revision ?? history.length - i} · {format(record.amountAuthorized, record.snapshot ?? {currency: record.currency ?? wo.currency})} ({record.currency ?? wo.currency})
            </summary>
            <p>Authorized by {record.authorizedBy} · {record.method.replace('_', ' ')} · {new Date(record.authorizedAt).toLocaleString()}</p>
            {record.note && <p>{record.note}</p>}
            {record.snapshot ? <EstimateSummary snapshot={record.snapshot} amountAuthorized={record.amountAuthorized} /> : <p>Legacy approval. The original itemized scope was not recorded.</p>}
            {record.signatureDataUrl && <img src={record.signatureDataUrl} alt={`Signature by ${record.authorizedBy}`} className="mt-2 h-16 rounded-lg border bg-white p-1" />}
          </details>
        ))}
      </section>

      {/* Declined work */}
      {(wo.declinedItems?.length ?? 0) > 0 && (
        <div className="card mb-4 p-4">
          <h2 className="font-semibold">Declined / deferred work</h2>
          <p className="mb-2 text-xs text-slate-400">Saved for follow-up — recover this revenue later.</p>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {wo.declinedItems!.map((li) => (
              <div key={li.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-600 line-through dark:text-slate-400">{li.description}</span>
                {!readOnly && <button className="min-h-11 min-w-11 text-brand-600 dark:text-brand-400" aria-label={`Restore ${li.description}`} onClick={() => run(() => workOrdersRepo.changeLine(id, 'restore', li, li))}>Restore</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status */}
      <div className="card mb-4 p-4">
        <label className="label" htmlFor="job-status">Status</label>
        <select id="job-status" disabled={locked} className="input" value={wo.status} onChange={e => {
          const status = e.target.value as WorkOrderStatus
          void run(() => workOrdersRepo.setStatus(id, status))
        }}>
          {STATUS_ORDER.filter(status => status !== 'invoiced' || wo.status === 'invoiced').map(status => (
            <option key={status} value={status} disabled={Boolean(issue && needsApproval(status))}>{STATUS_META[status].label}</option>
          ))}
        </select>
      </div>

      {!locked && <Button variant="ghost" size="sm" onClick={() => run(archive)} className="!text-red-600">Archive job</Button>}

      <JobBilling key={'billing:' + wo.id} workOrder={wo} />

      {/* Mounted only while open so each open initializes from a clean `initial`. */}
      {!readOnly && settings && itemSheetOpen && (
        <LineItemEditor
          open
          initial={editingItem}
          defaultLaborRate={wo.currency === settings.currency ? settings.defaultLaborRate : 0}
          defaultMarkupPct={settings.defaultPartsMarkupPct}
          defaultTaxRatePct={wo.taxRatePct ?? 0}
          onClose={() => setItemSheetOpen(false)}
          onSave={saveItem}
          onDelete={editingItem ? removeItem : undefined}
        />
      )}
      {!locked && approval && (
        <AuthorizationSheet snapshot={approval.snapshot} number={wo.number} customerName={customerName} initialMethod={latest?.method}
          onClose={() => setApproval(undefined)} onSave={saveAuth} />
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
      <span>{label}</span><span className="tabular-nums">{value}</span>
    </div>
  )
}

function LineRow({ item, money, readOnly, onEdit, onDecline }: { readOnly: boolean; item: LineItem; money: (m: number) => string; onEdit: () => void; onDecline: () => void }) {
  const kindBadge: Record<string, string> = {
    labor: '🔧', part: '📦', sublet: '🏭', fee: '＄', discount: '％',
  }
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button className="min-h-11 flex-1 text-left" disabled={readOnly} onClick={onEdit}>
        <div className="font-medium">
          <span className="mr-1.5">{kindBadge[item.kind]}</span>{item.description}
        </div>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          {item.kind === 'labor' ? `${item.quantity} hr × ${money(item.unitPrice)}` : `${item.quantity} × ${money(item.unitPrice)}`}
          {item.actualHours !== undefined && ` · ${item.actualHours} actual hr`}
          {item.partStatus && ` · ${item.partStatus}`}
          {!item.taxable && item.kind !== 'discount' && ' · no tax'}
        </div>
      </button>
      <div className="text-right">
        <div className="font-semibold tabular-nums">{money(lineTotal(item))}</div>
        {!readOnly && <button className="min-h-11 min-w-11 text-sm text-slate-600 dark:text-slate-300" aria-label={`Decline ${item.description}`} onClick={onDecline}>Decline</button>}
      </div>
    </div>
  )
}
