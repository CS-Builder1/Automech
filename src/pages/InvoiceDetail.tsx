import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { invoicesRepo } from '@/repositories/invoices'
import { paymentsRepo } from '@/repositories/payments'
import { useSettings } from '@/hooks/useSettings'
import { useMoney } from '@/hooks/useMoney'
import { lineTotal } from '@/lib/calc'
import { getProvider } from '@/payments/providers'
import { PageHeader } from '@/components/ui/Page'
import { Button } from '@/components/ui/Button'
import { RecordPaymentSheet } from '@/components/RecordPaymentSheet'

export function InvoiceDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const settings = useSettings()
  const money = useMoney()

  const invoice = useLiveQuery(() => db.invoices.get(id), [id])
  const customer = useLiveQuery(() => (invoice ? db.customers.get(invoice.customerId) : undefined), [invoice?.customerId])
  const vehicle = useLiveQuery(() => (invoice ? db.vehicles.get(invoice.vehicleId) : undefined), [invoice?.vehicleId])
  const payments = useLiveQuery(() => paymentsRepo.forInvoice(id), [id])

  const [payOpen, setPayOpen] = useState(false)

  if (invoice === undefined) return <p className="text-sm text-slate-400">Loading…</p>
  if (!invoice || invoice.deletedAt) return <p className="text-sm text-slate-400">Invoice not found.</p>

  const balance = invoice.total - invoice.amountPaid
  const paid = balance <= 0
  const customerName = customer ? `${customer.firstName} ${customer.lastName}` : 'Customer'

  async function recordPayment(input: { method: any; amount: number; isDeposit: boolean; reference?: string; note?: string }) {
    await paymentsRepo.record({ invoiceId: id, status: 'paid', ...input })
    setPayOpen(false)
  }

  async function share() {
    const lines = [
      `${settings?.shopName ?? 'Invoice'} — ${invoice!.number}`,
      `${customerName}${vehicle ? ` · ${[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}` : ''}`,
      `Total ${money(invoice!.total)} · Balance ${money(balance)}`,
    ].join('\n')
    try {
      if (navigator.share) await navigator.share({ title: invoice!.number, text: lines })
      else { await navigator.clipboard.writeText(lines); alert('Invoice summary copied to clipboard.') }
    } catch { /* user cancelled */ }
  }

  return (
    <div className="mx-auto max-w-2xl pb-8">
      <div className="no-print">
        <PageHeader
          title={invoice.number}
          subtitle={`Issued ${new Date(invoice.issuedAt).toLocaleDateString()}`}
          action={
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${paid ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'}`}>
              {paid ? 'Paid' : 'Balance due'}
            </span>
          }
        />
      </div>

      {/* Printable invoice */}
      <div className="invoice-print card p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{settings?.shopName ?? 'My Shop'}</h2>
            {settings?.address && <p className="text-sm text-slate-500">{settings.address}</p>}
            {settings?.phone && <p className="text-sm text-slate-500">{settings.phone}</p>}
          </div>
          <div className="text-right">
            <div className="text-lg font-bold">{invoice.number}</div>
            <div className="text-sm text-slate-500">{new Date(invoice.issuedAt).toLocaleDateString()}</div>
          </div>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="text-sm text-slate-500">Bill to</p>
          <p className="font-semibold">{customerName}</p>
          {customer?.address && <p className="text-sm text-slate-500">{customer.address}</p>}
          {vehicle && (
            <p className="text-sm text-slate-500">
              {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}
              {vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ''}{vehicle.vin ? ` · VIN ${vehicle.vin}` : ''}
            </p>
          )}
        </div>

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700">
              <th className="py-1.5 font-medium">Description</th>
              <th className="py-1.5 text-right font-medium">Qty</th>
              <th className="py-1.5 text-right font-medium">Price</th>
              <th className="py-1.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((li) => (
              <tr key={li.id} className="border-b border-slate-50 dark:border-slate-800/60">
                <td className="py-1.5">{li.description}{li.partNumber ? ` (${li.partNumber})` : ''}</td>
                <td className="py-1.5 text-right tabular-nums">{li.kind === 'labor' ? `${li.quantity}h` : li.quantity}</td>
                <td className="py-1.5 text-right tabular-nums">{money(li.unitPrice)}</td>
                <td className="py-1.5 text-right tabular-nums">{money(lineTotal(li))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 space-y-1 text-sm">
          <Row label="Subtotal" value={money(invoice.subtotal)} />
          {invoice.shopSupplies > 0 && <Row label="Shop supplies" value={money(invoice.shopSupplies)} />}
          {invoice.tax > 0 && <Row label="Tax" value={money(invoice.tax)} />}
          <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-bold dark:border-slate-700">
            <span>Total</span><span className="tabular-nums">{money(invoice.total)}</span>
          </div>
          {invoice.amountPaid > 0 && <Row label="Paid" value={`− ${money(invoice.amountPaid)}`} />}
          <div className="flex justify-between text-base font-bold">
            <span>Balance due</span><span className="tabular-nums">{money(balance)}</span>
          </div>
        </div>

        {invoice.warrantyTerms && <p className="mt-4 text-xs text-slate-500">Warranty: {invoice.warrantyTerms}</p>}
      </div>

      {/* Actions */}
      <div className="no-print mt-4 flex flex-wrap gap-2">
        {!paid && <Button onClick={() => setPayOpen(true)}>Record payment</Button>}
        <Button variant="secondary" onClick={() => window.print()}>Print / Save PDF</Button>
        <Button variant="secondary" onClick={share}>Share</Button>
        <Link to={`/jobs/${invoice.workOrderId}`}><Button variant="ghost">View job</Button></Link>
      </div>

      {/* Payments */}
      <div className="no-print mt-5">
        <h2 className="mb-2 font-semibold">Payments</h2>
        {payments && payments.length > 0 ? (
          <div className="card divide-y divide-slate-100 dark:divide-slate-800">
            {payments.map((p) => {
              const prov = getProvider(p.method)
              return (
                <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <div className="font-medium">{prov.emoji} {prov.label}{p.isDeposit ? ' · deposit' : ''}</div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {new Date(p.createdAt).toLocaleString()}{p.reference ? ` · ${p.reference}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">{money(p.amount)}</span>
                    <button className="text-xs text-slate-400 hover:text-red-600" onClick={() => paymentsRepo.remove(p.id)}>remove</button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="card px-4 py-5 text-center text-sm text-slate-500 dark:text-slate-400">
            No payments yet. Record cash, card, or a deposit.
          </p>
        )}
      </div>

      <div className="no-print mt-8">
        <Button variant="ghost" size="sm" className="!text-red-600"
          onClick={async () => { if (confirm(`Delete ${invoice.number}?`)) { await invoicesRepo.softDelete(id); navigate('/invoices') } }}>
          Delete invoice
        </Button>
      </div>

      {payOpen && <RecordPaymentSheet open balanceMinor={balance} onClose={() => setPayOpen(false)} onSave={recordPayment} />}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600 dark:text-slate-300">
      <span>{label}</span><span className="tabular-nums">{value}</span>
    </div>
  )
}
