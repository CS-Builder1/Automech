import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { WorkOrder } from '@/db/types'
import { db } from '@/db/database'
import { computeTotals } from '@/lib/calc'
import { formatMoney } from '@/lib/money'
import { approvalIssue } from '@/lib/approval'
import { issueInvoice, jobBillingParties, paymentValue } from '@/repositories/billing'
import { PaymentForm, PaymentLedger } from './PaymentLedger'
import { Button } from './ui/Button'

export function JobBilling({ workOrder }: { workOrder: WorkOrder }) {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [terms, setTerms] = useState('')
  const [due, setDue] = useState('')
  const data = useLiveQuery(async () => ({
    parties: await jobBillingParties(workOrder),
    invoice: await db.invoices.where('workOrderId').equals(workOrder.id).first(),
    payments: await db.payments.where('workOrderId').equals(workOrder.id).toArray(),
  }), [workOrder.id, workOrder.deletedAt, workOrder.customerId, workOrder.vehicleId])
  if (!data) return null
  if (data.invoice) return <section className="card mb-4 p-4"><Link className="font-semibold text-brand-600" to={'/billing/' + data.invoice.id}>View invoice {data.invoice.number}</Link></section>
  const total = computeTotals(workOrder).total
  const paid = data.payments.reduce((sum,p) => sum + paymentValue(p), 0)
  const currency = workOrder.currency ?? 'USD'
  const approvalError = approvalIssue(workOrder)

  async function issue() {
    setError('')
    setBusy(true)
    try { navigate('/billing/' + (await issueInvoice(workOrder.id, terms, due)).id) }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to issue invoice.') }
    finally { setBusy(false) }
  }
  return <section className="card mb-4 space-y-3 p-4">
    <h2 className="font-semibold">Billing</h2>
    {paid > 0 && <p>Deposits received {formatMoney(paid, {currency, displayCurrency: workOrder.displayCurrency, pegRate: workOrder.pegRate})}</p>}
    {data.parties.active && workOrder.status !== 'cancelled' && <PaymentForm workOrderId={workOrder.id} currency={currency} balance={total - paid} />}
    <PaymentLedger payments={data.payments} />
    {data.parties.active && workOrder.status === 'completed' && <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-700">
      <label className="block"><span className="label">Invoice due date (optional)</span><input className="input" type="date" value={due} onChange={e => setDue(e.target.value)}/></label>
      <label className="block"><span className="label">Warranty terms (optional)</span><textarea className="input" value={terms} onChange={e => setTerms(e.target.value)}/></label>
      {approvalError && <p className="text-sm">{approvalError}</p>}
      <Button disabled={Boolean(approvalError) || busy} onClick={() => void issue()}>Issue invoice</Button>
    </div>}
    {error && <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
  </section>
}
