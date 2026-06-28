import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { PageHeader, EmptyState } from '@/components/ui/Page'
import { Button } from '@/components/ui/Button'

export function Customers() {
  const [query, setQuery] = useState('')

  const customers = useLiveQuery(async () => {
    const all = (await db.customers.orderBy('lastName').toArray()).filter((c) => !c.deletedAt)
    const q = query.trim().toLowerCase()
    if (!q) return all
    return all.filter((c) =>
      [c.firstName, c.lastName, c.company, c.phone, c.email]
        .filter(Boolean)
        .some((f) => f!.toLowerCase().includes(q)),
    )
  }, [query])

  const vehicleCounts = useLiveQuery(async () => {
    const counts: Record<string, number> = {}
    for (const v of await db.vehicles.toArray()) {
      if (!v.deletedAt) counts[v.customerId] = (counts[v.customerId] ?? 0) + 1
    }
    return counts
  }, []) ?? {}

  return (
    <div>
      <PageHeader
        title="Customers"
        action={
          <Link to="/customers/new">
            <Button size="sm">+ Add</Button>
          </Link>
        }
      />

      <input
        className="input mb-4"
        placeholder="Search name, phone, email…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        type="search"
      />

      {customers === undefined ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : customers.length === 0 ? (
        <EmptyState
          title={query ? 'No matches' : 'No customers yet'}
          body={query ? 'Try a different search.' : 'Add your first customer to get started.'}
          action={
            !query && (
              <Link to="/customers/new">
                <Button className="mt-2">+ Add customer</Button>
              </Link>
            )
          }
        />
      ) : (
        <ul className="space-y-2">
          {customers.map((c) => (
            <li key={c.id}>
              <Link to={`/customers/${c.id}`} className="card flex items-center justify-between px-4 py-3 hover:border-brand-300">
                <div>
                  <div className="font-semibold">
                    {c.firstName} {c.lastName}
                    {c.company && <span className="ml-1.5 text-sm font-normal text-slate-400">· {c.company}</span>}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">{c.phone || c.email || 'No contact info'}</div>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {vehicleCounts[c.id] ?? 0} 🚗
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
