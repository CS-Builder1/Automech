import { useState } from 'react'
import type { AuthMethod, EstimateSnapshot } from '@/db/types'
import type { ApprovalInput } from '@/repositories/workOrders'
import { formatMoney } from '@/lib/money'
import { computeTotals, lineTotal } from '@/lib/calc'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { Field, TextInput } from './ui/Field'
import { SignaturePad } from './SignaturePad'

const METHODS: { value: AuthMethod; label: string }[] = [
  { value: 'in_person', label: 'In person' }, { value: 'signature', label: 'Signature' },
  { value: 'phone', label: 'Phone' }, { value: 'sms', label: 'Text / SMS' },
  { value: 'email', label: 'Email' }, { value: 'online', label: 'Online' },
]

export function EstimateSummary({ snapshot, amountAuthorized }: { snapshot: EstimateSnapshot; amountAuthorized?: number }) {
  const totals = computeTotals(snapshot)
  const total = amountAuthorized ?? totals.total
  // Approval records freeze the total. The snapshot fixes the line amounts and supplies,
  // leaving the tax originally approved even if the shop's discount rule has changed.
  const tax = total - totals.itemsSubtotal - totals.shopSupplies
  const money = (amount: number) => formatMoney(amount, snapshot)
  return (
    <div className="space-y-2 rounded-xl border border-slate-300 p-3 text-sm dark:border-slate-600">
      {snapshot.customerLabel && <p>Customer · {snapshot.customerLabel}</p>}
      {snapshot.vehicleLabel && <p>Vehicle · {snapshot.vehicleLabel}{snapshot.vehiclePlate && ` · Plate ${snapshot.vehiclePlate}`}</p>}
      {snapshot.displayCurrency && snapshot.pegRate && <p>1 {snapshot.currency} = {snapshot.pegRate} {snapshot.displayCurrency}</p>}
      <ul className="divide-y divide-slate-200 dark:divide-slate-700">
        {snapshot.lineItems.map(line => (
          <li key={line.id} className="flex justify-between gap-2 py-1.5">
            <span>{line.description}{line.partNumber && ` · ${line.partNumber}`}<br />
              <span className="text-xs">{line.quantity} {line.kind === 'labor' ? 'hr' : '×'} at {money(line.unitPrice)}{line.taxable && (line.kind !== 'discount' || tax < totals.tax) && ' · taxable'}</span></span>
            <span>{money(lineTotal(line))}</span>
          </li>
        ))}
      </ul>
      {totals.shopSupplies !== 0 && <p>Shop supplies ({snapshot.shopSuppliesPct}%): {money(totals.shopSupplies)}</p>}
      {tax !== 0 && <p>Tax ({snapshot.taxRatePct}%): {money(tax)}</p>}
      <p className="font-semibold">Authorized total ({snapshot.currency}) {money(total)}</p>
    </div>
  )
}

interface Props {
  snapshot: EstimateSnapshot
  customerName: string
  number: string
  initialMethod?: AuthMethod
  onClose: () => void
  onSave: (input: ApprovalInput) => Promise<void>
}

export function AuthorizationSheet({ snapshot, customerName, number, initialMethod, onClose, onSave }: Props) {
  const [authorizedBy, setAuthorizedBy] = useState(customerName)
  const [method, setMethod] = useState<AuthMethod>(initialMethod ?? 'signature')
  const [note, setNote] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    setSaving(true)
    try { await onSave({ authorizedBy, method, note, signatureDataUrl: signature ?? undefined }) }
    catch (cause) { setError((cause as Error).message) }
    finally { setSaving(false) }
  }
  return (
    <Sheet open onClose={onClose} title="Capture approval">
      <div className="space-y-4">
        <p>Review the work and total for {number} before recording approval.</p>
        <EstimateSummary snapshot={snapshot} />
        <Field label="Authorized by" htmlFor="by">
          <TextInput id="by" value={authorizedBy} onChange={(e) => setAuthorizedBy(e.target.value)} />
        </Field>
        <Field label="How was it authorized?" htmlFor="method">
          <select id="method" className="input" value={method} onChange={(e) => {
            setMethod(e.target.value as AuthMethod)
            setSignature(null)
          }}>
            {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
        <Field label="Note (optional)" htmlFor="note">
          <TextInput id="note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {(method === 'signature' || method === 'in_person') && (
          <Field label={method === 'signature' ? 'Customer signature (required)' : 'Customer signature (optional)'}>
            <SignaturePad key={method} onChange={setSignature} />
          </Field>
        )}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <Button type="button" full onClick={save} disabled={saving || !authorizedBy.trim() || (method === 'signature' && !signature)}>Record approval</Button>
      </div>
    </Sheet>
  )
}
