import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { workOrdersRepo } from '@/repositories/workOrders'
import { invoicesRepo } from '@/repositories/invoices'
import { inspectionsRepo } from '@/repositories/inspections'
import { STANDARD_INSPECTION, buildItems } from '@/lib/inspectionTemplates'
import { useSettings } from '@/hooks/useSettings'
import { useMoney } from '@/hooks/useMoney'
import type { LineItem, WorkOrder, WorkOrderStatus, AuthorizationRecord } from '@/db/types'
import { computeTotals, lineTotal, checkAuthorization } from '@/lib/calc'
import { STATUS_META, STATUS_ORDER } from '@/lib/status'
import { PageHeader } from '@/components/ui/Page'
import { Button } from '@/components/ui/Button'
import { LineItemEditor } from '@/components/LineItemEditor'
import { AuthorizationSheet } from '@/components/AuthorizationSheet'
import { UpgradeSheet } from '@/components/UpgradeSheet'
import { useEntitlements } from '@/billing/entitlements'
import { PLANS } from '@/billing/plans'

export function WorkOrderDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const settings = useSettings()
  const money = useMoney()

  const wo = useLiveQuery(() => db.workOrders.get(id), [id])
  const customer = useLiveQuery(() => (wo ? db.customers.get(wo.customerId) : undefined), [wo?.customerId])
  const vehicle = useLiveQuery(() => (wo ? db.vehicles.get(wo.vehicleId) : undefined), [wo?.vehicleId])
  const invoice = useLiveQuery(() => invoicesRepo.forWorkOrder(id), [id])
  const inspections = useLiveQuery(() => inspectionsRepo.forWorkOrder(id), [id])

  const [editingItem, setEditingItem] = useState<LineItem | undefined>()
  const [itemSheetOpen, setItemSheetOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [upgrade, setUpgrade] = useState<{ title: string; body: string } | null>(null)
  const { canAddInvoice, canAddInspection } = useEntitlements()

  if (wo === undefined) return <p className="text-sm text-slate-400">Loading…</p>
  if (!wo || wo.deletedAt) return <p className="text-sm text-slate-400">Job not found.</p>

  const totals = computeTotals(wo)
  const auth = checkAuthorization(totals.total, wo.authorization?.amountAuthorized)
  const customerName = customer ? `${customer.firstName} ${customer.lastName}` : 'Customer'

  async function patch(p: Partial<WorkOrder>) {
    await workOrdersRepo.update(id, p)
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
    const exists = wo!.lineItems.some((li) => li.id === item.id)
    const lineItems = exists
      ? wo!.lineItems.map((li) => (li.id === item.id ? item : li))
      : [...wo!.lineItems, item]
    await patch({ lineItems })
    setItemSheetOpen(false)
  }

  async function removeItem() {
    if (!editingItem) return
    await patch({ lineItems: wo!.lineItems.filter((li) => li.id !== editingItem.id) })
    setItemSheetOpen(false)
  }

  async function declineItem(item: LineItem) {
    await patch({
      lineItems: wo!.lineItems.filter((li) => li.id !== item.id),
      declinedItems: [...(wo!.declinedItems ?? []), item],
    })
  }
  async function restoreItem(item: LineItem) {
    await patch({
      declinedItems: (wo!.declinedItems ?? []).filter((li) => li.id !== item.id),
      lineItems: [...wo!.lineItems, item],
    })
  }

  async function saveAuth(record: AuthorizationRecord) {
    await patch({ authorization: record, status: wo!.status === 'estimate' || wo!.status === 'awaiting_approval' ? 'approved' : wo!.status })
    setAuthOpen(false)
  }

  async function startInspection() {
    if (!wo) return
    if (!canAddInspection) {
      setUpgrade({ title: 'Inspection limit reached', body: `The Free plan includes ${PLANS.free.entitlements.inspectionsPerMonth} inspections per month. Upgrade to Pro for unlimited inspections with photos and video.` })
      return
    }
    const inspection = await inspectionsRepo.create({
      workOrderId: wo.id,
      vehicleId: wo.vehicleId,
      customerId: wo.customerId,
      templateName: STANDARD_INSPECTION.name,
      items: buildItems(STANDARD_INSPECTION),
    })
    navigate(`/inspections/${inspection.id}`)
  }

  async function createInvoice() {
    if (!wo) return
    if (wo.lineItems.length === 0) { alert('Add at least one line item before invoicing.'); return }
    // An invoice already created for this RO is never blocked (idempotent).
    if (!invoice && !canAddInvoice) {
      setUpgrade({ title: 'Invoice limit reached', body: `The Free plan includes ${PLANS.free.entitlements.invoicesPerMonth} invoices per month. Upgrade to Pro for unlimited invoicing.` })
      return
    }
    const inv = await invoicesRepo.createFromWorkOrder(wo)
    navigate(`/invoices/${inv.id}`)
  }

  async function remove() {
    if (!confirm(`Delete ${wo!.number}?`)) return
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

      {/* Complaint / diagnosis */}
      <div className="card mb-4 space-y-3 p-4">
        <label className="block">
          <span className="label">Complaint / concern</span>
          <textarea className="input" rows={2} defaultValue={wo.complaint ?? ''}
            onBlur={(e) => patch({ complaint: e.target.value.trim() || undefined })} />
        </label>
        <label className="block">
          <span className="label">Diagnosis / notes</span>
          <textarea className="input" rows={2} defaultValue={wo.diagnosis ?? ''}
            onBlur={(e) => patch({ diagnosis: e.target.value.trim() || undefined })} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Mileage in</span>
            <input className="input" inputMode="numeric" defaultValue={wo.mileageIn ?? ''}
              onBlur={(e) => patch({ mileageIn: e.target.value ? parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) : undefined })} />
          </label>
          <label className="block">
            <span className="label">Mileage out</span>
            <input className="input" inputMode="numeric" defaultValue={wo.mileageOut ?? ''}
              onBlur={(e) => patch({ mileageOut: e.target.value ? parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) : undefined })} />
          </label>
        </div>
      </div>

      {/* Line items */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Line items</h2>
        <Button size="sm" onClick={openNewItem}>+ Add</Button>
      </div>
      <div className="card mb-4 divide-y divide-slate-100 dark:divide-slate-800">
        {wo.lineItems.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            No line items yet. Add labor and parts to build the estimate.
          </p>
        ) : (
          wo.lineItems.map((li) => (
            <LineRow key={li.id} item={li} money={money} onEdit={() => openEditItem(li)} onDecline={() => declineItem(li)} />
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
        {settings && totals.partsCost > 0 && (
          <p className="!mt-2 text-xs text-slate-400">Est. gross profit {money(totals.grossProfit)} · parts cost {money(totals.partsCost)}</p>
        )}
      </div>

      {/* Authorization */}
      <div className="card mb-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Approval</h2>
          <Button size="sm" variant={wo.authorization ? 'secondary' : 'primary'} onClick={() => setAuthOpen(true)}>
            {wo.authorization ? 'Update' : 'Capture approval'}
          </Button>
        </div>
        {wo.authorization ? (
          <div className="mt-3 text-sm">
            <p>Authorized by <span className="font-medium">{wo.authorization.authorizedBy}</span> · {wo.authorization.method.replace('_', ' ')}</p>
            <p className="text-slate-500 dark:text-slate-400">
              {new Date(wo.authorization.authorizedAt).toLocaleString()} · cap {money(wo.authorization.amountAuthorized)}
            </p>
            {wo.authorization.signatureDataUrl && (
              <img src={wo.authorization.signatureDataUrl} alt="signature" className="mt-2 h-16 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700" />
            )}
            {auth.exceeds && (
              <p className={`mt-3 rounded-xl px-3 py-2.5 text-sm font-medium ${auth.needsReauth ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'}`}>
                {auth.needsReauth ? '⚠ Re-approval required' : '⚠ Over approved amount'} — total is {money(totals.total)}, {auth.overPct.toFixed(0)}% over the {money(wo.authorization.amountAuthorized)} cap.
                {auth.needsReauth && ' Get the customer to re-approve before continuing.'}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Capture the customer’s approval before starting work — protects you in a dispute.
          </p>
        )}
      </div>

      {/* Declined work */}
      {(wo.declinedItems?.length ?? 0) > 0 && (
        <div className="card mb-4 p-4">
          <h2 className="font-semibold">Declined / deferred work</h2>
          <p className="mb-2 text-xs text-slate-400">Saved for follow-up — recover this revenue later.</p>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {wo.declinedItems!.map((li) => (
              <div key={li.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-600 line-through dark:text-slate-400">{li.description}</span>
                <button className="text-brand-600 dark:text-brand-400" onClick={() => restoreItem(li)}>Restore</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status */}
      <div className="card mb-4 p-4">
        <span className="label">Status</span>
        <select className="input" value={wo.status} onChange={(e) => patch({ status: e.target.value as WorkOrderStatus })}>
          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
      </div>

      {/* Inspections (DVI) */}
      <div className="card mb-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Inspection</h2>
          <Button size="sm" variant="secondary" onClick={startInspection}>+ New inspection</Button>
        </div>
        {inspections && inspections.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {inspections.map((insp) => {
              const red = insp.items.filter((i) => i.rating === 'red').length
              const yellow = insp.items.filter((i) => i.rating === 'yellow').length
              const green = insp.items.filter((i) => i.rating === 'green').length
              return (
                <li key={insp.id}>
                  <Link to={`/inspections/${insp.id}`} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm hover:border-brand-300 dark:border-slate-700">
                    <span>{new Date(insp.createdAt).toLocaleDateString()} · {insp.templateName}</span>
                    <span className="flex gap-1.5 text-xs font-semibold">
                      <span className="text-emerald-600">{green}</span>
                      <span className="text-amber-600">{yellow}</span>
                      <span className="text-red-600">{red}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Run a digital inspection — rate each point, add photos, and push findings straight onto the estimate.
          </p>
        )}
      </div>

      {/* Invoicing */}
      <div className="card mb-4 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Invoice</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {invoice ? 'This job has been invoiced.' : 'Convert this job into an itemized invoice to get paid.'}
            </p>
          </div>
          {invoice ? (
            <Link to={`/invoices/${invoice.id}`}><Button size="sm" variant="secondary">View invoice</Button></Link>
          ) : (
            <Button size="sm" onClick={createInvoice}>Create invoice</Button>
          )}
        </div>
      </div>

      <Button variant="ghost" size="sm" onClick={remove} className="!text-red-600">Delete job</Button>

      {/* Mounted only while open so each open initializes from a clean `initial`. */}
      {settings && itemSheetOpen && (
        <LineItemEditor
          open
          initial={editingItem}
          defaultLaborRate={settings.defaultLaborRate}
          defaultMarkupPct={settings.defaultPartsMarkupPct}
          defaultTaxRatePct={settings.defaultTaxRatePct}
          onClose={() => setItemSheetOpen(false)}
          onSave={saveItem}
          onDelete={editingItem ? removeItem : undefined}
        />
      )}
      {authOpen && (
        <AuthorizationSheet
          open
          totalMinor={totals.total}
          customerName={customerName}
          initial={wo.authorization}
          onClose={() => setAuthOpen(false)}
          onSave={saveAuth}
        />
      )}
      <UpgradeSheet open={Boolean(upgrade)} title={upgrade?.title ?? ''} body={upgrade?.body ?? ''} onClose={() => setUpgrade(null)} />
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

function LineRow({ item, money, onEdit, onDecline }: { item: LineItem; money: (m: number) => string; onEdit: () => void; onDecline: () => void }) {
  const kindBadge: Record<string, string> = {
    labor: '🔧', part: '📦', sublet: '🏭', fee: '＄', discount: '％',
  }
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button className="flex-1 text-left" onClick={onEdit}>
        <div className="font-medium">
          <span className="mr-1.5">{kindBadge[item.kind]}</span>{item.description}
        </div>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          {item.kind === 'labor' ? `${item.quantity} hr × ${money(item.unitPrice)}` : `${item.quantity} × ${money(item.unitPrice)}`}
          {item.partStatus && ` · ${item.partStatus}`}
          {!item.taxable && item.kind !== 'discount' && ' · no tax'}
        </div>
      </button>
      <div className="text-right">
        <div className="font-semibold tabular-nums">{money(lineTotal(item))}</div>
        <button className="text-xs text-slate-400 hover:text-amber-600" onClick={onDecline}>decline</button>
      </div>
    </div>
  )
}
