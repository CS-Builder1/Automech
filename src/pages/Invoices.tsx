import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { useMoney } from '@/hooks/useMoney'
import { PageHeader, EmptyState } from '@/components/ui/Page'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'paid', label: 'Paid' },
] as const

export function Invoices() {
  const money = useMoney()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all')

  const rows = useLiveQuery(async () => {
    const all = (await db.invoices.toArray()).filter((i) => !i.deletedAt)
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
    const filtered = all.filter((i) => {
      const paid = i.total - i.amountPaid <= 0
      if (filter === 'paid') return paid
      if (filter === 'unpaid') return !paid
      return true
    })
    const custMap = new Map((await db.customers.toArray()).map((c) => [c.id, c]))
    return filtered.map((i) => ({ inv: i, customer: custMap.get(i.customerId) }))
  }, [filter])

  const outstanding = useLiveQuery(async () => {
    const all = (await db.invoices.toArray()).filter((i) => !i.deletedAt)
    return all.reduce((sum, i) => sum + Math.max(0, i.total - i.amountPaid), 0)
  }, [])

  return (
    <div>
      <PageHeader title="Invoices" subtitle={outstanding ? `${money(outstanding)} outstanding` : undefined} />

      <div className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${filter === f.key ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {rows === undefined ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="No invoices yet" body="Complete a job and tap “Create invoice” to bill the customer." />
      ) : (
        <ul className="space-y-2">
          {rows.map(({ inv, customer }) => {
            const balance = inv.total - inv.amountPaid
            const paid = balance <= 0
            return (
              <li key={inv.id}>
                <Link to={`/invoices/${inv.id}`} className="card flex items-center justify-between px-4 py-3 hover:border-brand-300">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{inv.number}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${paid ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                        {paid ? 'Paid' : `${money(balance)} due`}
                      </span>
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      {customer ? `${customer.firstName} ${customer.lastName}` : 'Customer'} · {new Date(inv.issuedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <span className="font-semibold tabular-nums">{money(inv.total)}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
