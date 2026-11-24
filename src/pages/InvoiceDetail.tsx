import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { invoiceDocument } from '@/lib/financialDocuments'
import { DocumentActions, PaymentForm, PaymentLedger } from '@/components/PaymentLedger'

export function InvoiceDetail() {
  const { id = '' } = useParams()
  const data = useLiveQuery(async () => ({
    invoice: await db.invoices.get(id), payments: await db.payments.where('invoiceId').equals(id).toArray(),
  }), [id])
  if (!data) return <p>Loading invoice…</p>
  const i = data.invoice
  if (!i || i.deletedAt) return <p>Invoice unavailable. <Link to="/billing" className="text-brand-600">Back to billing</Link></p>
  const doc = invoiceDocument(i)
  return <div className="mx-auto max-w-2xl space-y-4">
    <Link to="/billing" className="text-sm font-semibold text-brand-600">← Billing</Link>
    <section className="card space-y-3 p-4">
      <div><h1 className="text-2xl font-bold">Invoice {i.number}</h1><p>{doc.shop}</p></div>
      <p>{doc.details.join(' · ')}</p>
      <div><p className="font-semibold">{doc.customer}</p><p className="text-sm">{doc.customerContact}</p></div>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr>{doc.headings.map(h => <th key={h} className="py-2 text-left">{h}</th>)}</tr></thead>
        <tbody>{doc.rows.map((row, n) => <tr key={i.lineItems[n].id} className="border-t dark:border-slate-700">{row.map((c,j) => <td key={j} className="py-2 pr-2">{c}</td>)}</tr>)}</tbody>
      </table></div>
      <dl>{doc.totals.map(([label, amount]) => <div key={label} className="flex justify-between gap-2 py-1 last:font-bold"><dt>{label}</dt><dd>{amount}</dd></div>)}</dl>
      {doc.terms && <p className="whitespace-pre-wrap text-sm"><strong>Warranty terms</strong><br/>{doc.terms}</p>}
      <DocumentActions doc={doc}/>
      <Link className="block text-sm text-brand-600" to={'/jobs/' + i.workOrderId}>View repair order {i.workOrderNumber}</Link>
    </section>
    {i.total > i.amountPaid && <section className="card p-4"><PaymentForm invoiceId={id} currency={i.currency ?? 'USD'} balance={i.total - i.amountPaid} /></section>}
    {data.payments.length > 0 && <div className="card p-4"><PaymentLedger payments={data.payments} invoice={i} /></div>}
  </div>
}
