import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Invoice, Payment } from '@/db/types'
import { Button } from '@/components/ui/Button'
import { dateFromTimestamp } from '@/lib/businessDate'
import { formatMoney, parseAmountToMinor } from '@/lib/money'
import { newId } from '@/lib/id'
import { printDocument, receiptDocument, shareDocument, type DocumentView } from '@/lib/financialDocuments'
import { manualMethods, recordPayment, reversePayment, tenderLabel, type ManualMethod } from '@/repositories/billing'

export function DocumentActions({ doc }: { doc: DocumentView }) {
  return <div className="flex flex-wrap gap-2">
    <Button type="button" variant="secondary" size="sm" onClick={() => printDocument(doc)}>Print / PDF</Button>
    <Button type="button" variant="secondary" size="sm" onClick={() => void shareDocument(doc)}>Share / download</Button>
  </div>
}

export function TenderSelect({ value, onChange }: { value: ManualMethod; onChange: (method: ManualMethod) => void }) {
  return <label className="block"><span className="label">Payment method</span>
    <select className="input" value={value} onChange={e => onChange(e.target.value as ManualMethod)}>
      {Object.entries(manualMethods).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
  </label>
}

export function PaymentForm({ invoiceId, workOrderId, currency, balance }: {
  invoiceId?: string; workOrderId?: string; currency: string; balance: number
}) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<ManualMethod>('cash')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(newId())
  const label = invoiceId ? 'Record payment' : 'Record deposit'
  if (balance <= 0) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await recordPayment({ invoiceId, workOrderId, requestId: requestId.current, isDeposit: !invoiceId,
        amount: parseAmountToMinor(amount), method, reference })
      requestId.current = newId()
      setAmount('')
      setReference('')
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save this receipt.')
    } finally { setBusy(false) }
  }
  if (!open) return <Button type="button" size="sm" onClick={() => setOpen(true)}>{label}</Button>
  return <form className="space-y-3" onSubmit={submit}>
    <h3 className="font-semibold">{label}</h3>
    <p className="text-sm text-slate-500">Record funds you have already received.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label><span className="label">Amount ({currency})</span>
        <input className="input" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} required /></label>
      <TenderSelect value={method} onChange={setMethod} />
    </div>
    <label className="block"><span className="label">Transaction reference (optional)</span>
      <input className="input" value={reference} onChange={e => setReference(e.target.value)} /></label>
    {error && <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
    <div className="flex gap-2"><Button disabled={busy}>Save receipt</Button>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button></div>
  </form>
}

export function PaymentLedger({ payments, invoice }: { payments: Payment[]; invoice?: Invoice }) {
  const [selected, setSelected] = useState('')
  const [refund, setRefund] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const reversed = new Set(payments.map(p => p.reversesPaymentId))
  if (!payments.length) return null

  async function confirmReturn(id: string) {
    setError('')
    setBusy(true)
    try {
      await reversePayment(id)
      setRefund('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save the refund.') }
    finally { setBusy(false) }
  }

  return <section className="space-y-2">
    <h3 className="font-semibold">Receipts</h3>
    <ul className="divide-y divide-slate-200 dark:divide-slate-700">
      {[...payments].sort((a,b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).map(p => {
        const doc = receiptDocument(p, invoice)
        const interactive = p.status === 'paid' || Boolean(p.reversesPaymentId)
        return <li key={p.id} className="py-2">
          <button type="button" className="flex w-full items-center justify-between gap-2 text-left" aria-expanded={selected === p.id}
            onClick={() => { setSelected(selected === p.id ? '' : p.id); setRefund(''); setError('') }}>
            <span><strong>{doc.number}</strong> · {interactive ? doc.title : p.status}<br/>
              <small>{p.recordedDate ?? dateFromTimestamp(p.createdAt) ?? 'Date unknown'} · {tenderLabel(p.method)}</small></span>
            <span className="font-semibold tabular-nums">{formatMoney(p.amount, {currency: p.currency ?? invoice?.currency ?? 'USD', displayCurrency: p.displayCurrency, pegRate: p.pegRate})}</span>
          </button>
          {selected === p.id && <div className="mt-2 space-y-3">
            {p.reference && <p className="text-sm">Reference {p.reference}</p>}
            {interactive && <DocumentActions doc={doc} />}
            {p.status === 'paid' && !reversed.has(p.id) && (
              refund === p.id ? <div className="space-y-2">
                <p className="text-sm">Confirm you returned this full amount to the customer using {tenderLabel(p.method).toLowerCase()}.</p>
                <div className="flex gap-2"><Button size="sm" variant="danger" disabled={busy} onClick={() => void confirmReturn(p.id)}>Confirm refund</Button>
                  <Button size="sm" variant="secondary" onClick={() => setRefund('')}>Cancel</Button></div>
              </div> : <Button type="button" size="sm" variant="ghost" onClick={() => setRefund(p.id)}>Record full refund</Button>
            )}
            {error && <p role="alert">{error}</p>}
          </div>}
        </li>
      })}
    </ul>
  </section>
}
