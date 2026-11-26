import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { useSettings } from '@/hooks/useSettings'
import { newId } from '@/lib/id'
import { formatMoney, parseAmountToMinor } from '@/lib/money'
import { downloadDayClose } from '@/lib/financialDocuments'
import { dateFromTimestamp } from '@/lib/businessDate'
import { localDate, getDayClose, recordExpense, tenderLabel, type ManualMethod, type Movement } from '@/repositories/billing'
import { PageHeader } from '@/components/ui/Page'
import { Button } from '@/components/ui/Button'
import { TenderSelect } from '@/components/PaymentLedger'

function ExpenseForm({ currency, date }: { currency: string; date: string }) {
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Supplies')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<ManualMethod>('cash')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(newId())

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await recordExpense({ requestId: request.current, date, description, category, amount: parseAmountToMinor(amount), currency, method })
      request.current = newId()
      setOpen(false)
      setAmount('')
      setDescription('')
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to record expense.') }
    finally { setBusy(false) }
  }
  if (!open) return <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>Add expense</Button>
  return <form onSubmit={submit} className="space-y-3 border-t pt-3 dark:border-slate-700">
    <h3 className="font-semibold">Expense for {date}</h3>
    <label className="block"><span className="label">Description</span><input className="input" required value={description} onChange={e => setDescription(e.target.value)} /></label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label><span className="label">Amount ({currency})</span><input className="input" required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
      <label><span className="label">Category</span><input className="input" required value={category} onChange={e => setCategory(e.target.value)} /></label>
    </div>
    <TenderSelect value={method} onChange={setMethod}/>
    {error && <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
    <div className="flex gap-2"><Button disabled={busy}>Save expense</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button></div>
  </form>
}

function DailyTotals({ movements }: { movements: Movement[] }) {
  const currencies = [...new Set(movements.map(row => row.currency))]
  return <div className="space-y-3">{currencies.map(currency => {
    const rows = movements.filter(r => r.currency === currency)
    const money = (n: number) => formatMoney(n, { currency })
    const byMethod = [...new Set(rows.map(r => r.method))]
    return <div key={currency}><h3 className="font-semibold">{currency}</h3>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr>{['Tender','Received','Refunds','Expenses','Net'].map(h => <th key={h} className="p-1 text-right first:text-left">{h}</th>)}</tr></thead>
        <tbody>{[...byMethod, 'total'].map(method => {
          const items = method === 'total' ? rows : rows.filter(r => r.method === method)
          const sum = (kind: Movement['kind']) => items.filter(r => r.kind === kind).reduce((s,r) => s + r.amount, 0)
          const incoming = sum('payment') + sum('deposit'), returned = sum('refund'), spent = sum('expense')
          return <tr key={method} className="border-t last:font-bold dark:border-slate-700"><th className="p-1 text-left">{method === 'total' ? 'Total' : tenderLabel(method as ManualMethod)}</th>
            {[incoming, Math.abs(returned), Math.abs(spent), incoming+returned+spent].map((n,j) => <td key={j} className="p-1 text-right tabular-nums">{money(n)}</td>)}</tr>
        })}</tbody>
      </table></div>
    </div>
  })}</div>
}

export function Billing() {
  const [date, setDate] = useState(() => localDate(new Date()))
  const [filter, setFilter] = useState('outstanding')
  const settings = useSettings()
  const close = useLiveQuery(() => getDayClose(date), [date])
  const invoices = useLiveQuery(async () => (await db.invoices.filter(i => !i.deletedAt).toArray())
    .sort((a, b) => (b.issuedAt ?? '').localeCompare(a.issuedAt ?? '')), [])
  const outstanding = (invoices ?? []).filter(i => i.total > i.amountPaid)
  const filtered = filter === 'outstanding' ? outstanding : invoices ?? []
  const balances = new Map<string, number>()
  for (const i of outstanding) {
    const currency = i.currency ?? 'USD'
    balances.set(currency, (balances.get(currency) ?? 0) + i.total - i.amountPaid)
  }
  return <div className="mx-auto max-w-3xl space-y-4">
    <PageHeader title="Billing" subtitle="Receivables, receipts and daily close" />
    <section className="card space-y-3 p-4">
      <h2 className="text-lg font-semibold">Invoices &amp; receivables</h2>
      {balances.size > 0 && <div className="text-sm"><span>Outstanding</span> {Array.from(balances, ([currency, amount]) =>
        <strong className="ml-2" key={currency}>{currency} {formatMoney(amount, {currency})}</strong>)}</div>}
      <label className="block"><span className="label">Show invoices</span><select className="input" value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="outstanding">Balance due</option><option value="all">All invoices</option></select></label>
      {!invoices ? <p>Loading invoices…</p> : !filtered.length ? <p className="text-sm text-slate-500">{filter === 'outstanding' ? 'No outstanding invoices.' : 'No invoices issued yet.'}</p> :
        <ul className="divide-y dark:divide-slate-700">{filtered.map(i => <li key={i.id}>
          <Link className="flex flex-wrap justify-between gap-2 py-3" to={'/billing/' + i.id}>
            <span><strong>{i.number}</strong> · {i.customerName ?? 'Customer'}<br/><small>{i.dueAt ? 'Due ' + i.dueAt.slice(0,10) : i.issuedDate ?? dateFromTimestamp(i.issuedAt) ?? 'Date unknown'}</small></span>
            <span>{i.total > i.amountPaid ? formatMoney(i.total - i.amountPaid, {currency: i.currency ?? 'USD', displayCurrency: i.displayCurrency, pegRate: i.pegRate}) + ' due' : 'Paid'}</span>
          </Link></li>)}</ul>}
    </section>
    <section className="card space-y-4 p-4">
      <h2 className="text-lg font-semibold">Daily close</h2>
      <label className="block"><span className="label">Business date</span><input className="input" type="date" value={date} required onChange={e => { if (e.target.value) setDate(e.target.value) }}/></label>
      {!close ? <p>Loading transactions…</p> : (close.movements.length || close.invoices.length) ? <>
        {close.invoices.length > 0 && <div>
          <h3 className="font-semibold">Invoices issued</h3>
          {Array.from(new Set(close.invoices.map(i => i.currency ?? 'USD')), currency => {
            const issued = close.invoices.filter(i => (i.currency ?? 'USD') === currency)
            const money = (n: number) => formatMoney(n, {currency})
            const sales = issued.reduce((sum, i) => sum + i.subtotal + i.shopSupplies, 0)
            const tax = issued.reduce((sum, i) => sum + i.tax, 0)
            return <p className="text-sm" key={currency}>{currency} · Sales {money(sales)} · Tax {money(tax)} · Invoiced {money(sales + tax)}</p>
          })}
        </div>}
        <DailyTotals movements={close.movements} />
        <details><summary className="cursor-pointer font-semibold">Transactions ({close.movements.length})</summary>
          <ul className="divide-y text-sm dark:divide-slate-700">{close.movements.map(m => <li key={m.kind + m.id} className="flex justify-between gap-2 py-2">
            <span>{m.document} · {m.kind}<br/>{m.description}</span><span>{formatMoney(m.amount, {currency: m.currency})}</span></li>)}</ul>
        </details>
        <Button type="button" size="sm" variant="secondary" onClick={() => downloadDayClose(close.movements, close.invoices, date)}>Export daily CSV</Button>
      </> : <p className="text-sm text-slate-500">No invoices, receipts or expenses recorded for this date.</p>}
      {settings && <ExpenseForm currency={settings.currency} date={date} />}
    </section>
  </div>
}
