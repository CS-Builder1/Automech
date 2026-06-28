import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { useMoney } from '@/hooks/useMoney'
import { computeTotals } from '@/lib/calc'
import { STATUS_META } from '@/lib/status'
import type { WorkOrderStatus } from '@/db/types'
import { PageHeader, EmptyState } from '@/components/ui/Page'
import { Button } from '@/components/ui/Button'

const FILTERS: { key: 'open' | 'all' | WorkOrderStatus; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'all', label: 'All' },
  { key: 'estimate', label: 'Estimates' },
  { key: 'completed', label: 'Completed' },
]

export function Jobs() {
  const money = useMoney()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('open')

  const rows = useLiveQuery(async () => {
    const all = (await db.workOrders.toArray()).filter((w) => !w.deletedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const filtered = all.filter((w) => {
      if (filter === 'all') return true
      if (filter === 'open') return w.status !== 'invoiced' && w.status !== 'cancelled'
      return w.status === filter
    })
    const custMap = new Map((await db.customers.toArray()).map((c) => [c.id, c]))
    const vehMap = new Map((await db.vehicles.toArray()).map((v) => [v.id, v]))
    return filtered.map((w) => ({
      wo: w,
      customer: custMap.get(w.customerId),
      vehicle: vehMap.get(w.vehicleId),
      total: computeTotals(w).total,
    }))
  }, [filter])

  return (
    <div>
      <PageHeader
        title="Jobs"
        subtitle="Estimates, repair orders & approvals"
        action={<Link to="/jobs/new"><Button size="sm">+ New</Button></Link>}
      />

      <div className="mb-4 flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium ${
              filter === f.key ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows === undefined ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={filter === 'open' ? 'No open jobs' : 'No jobs here'}
          body="Start an estimate — pick a customer and vehicle, add labor and parts, then capture approval."
          action={<Link to="/jobs/new"><Button className="mt-2">+ New job</Button></Link>}
        />
      ) : (
        <ul className="space-y-2">
          {rows.map(({ wo, customer, vehicle, total }) => (
            <li key={wo.id}>
              <Link to={`/jobs/${wo.id}`} className="card flex items-center justify-between px-4 py-3 hover:border-brand-300">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{wo.number}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_META[wo.status].color}`}>
                      {STATUS_META[wo.status].label}
                    </span>
                  </div>
                  <div className="truncate text-sm text-slate-500 dark:text-slate-400">
                    {customer ? `${customer.firstName} ${customer.lastName}` : 'Customer'}
                    {vehicle && ` · ${[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}`}
                  </div>
                </div>
                <span className="ml-3 shrink-0 font-semibold tabular-nums">{money(total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
