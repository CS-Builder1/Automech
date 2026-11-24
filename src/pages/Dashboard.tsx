import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { PageHeader } from '@/components/ui/Page'
import { useSettings } from '@/hooks/useSettings'

export function Dashboard() {
  const settings = useSettings()
  const stats = useLiveQuery(async () => {
    const [customers, vehicles, jobs] = await Promise.all([
      db.customers.toArray(),
      db.vehicles.toArray(),
      db.workOrders.toArray(),
    ])
    const owners = new Set(customers.filter((c) => !c.deletedAt).map((c) => c.id))
    const cars = new Set(
      vehicles.filter((v) => !v.deletedAt && owners.has(v.customerId)).map((v) => v.id),
    )
    const active = jobs.filter(
      (j) =>
        !j.deletedAt &&
        owners.has(j.customerId) &&
        cars.has(j.vehicleId) &&
        !['invoiced', 'cancelled'].includes(j.status),
    )
    return {
      customers: owners.size,
      vehicles: cars.size,
      jobs: active.length,
      approvals: active.filter((j) => j.status === 'awaiting_approval').length,
      parts: active.reduce(
        (sum, j) =>
          sum + j.lineItems.filter((l) => l.kind === 'part' && l.partStatus !== 'received').length,
        0,
      ),
      ready: active.filter((j) => j.status === 'completed').length,
    }
  }, [])
  const links = [
    { label: 'Open jobs', value: stats?.jobs, to: '/jobs' },
    { label: 'Awaiting approval', value: stats?.approvals, to: '/operations?view=approvals' },
    { label: 'Outstanding parts', value: stats?.parts, to: '/operations?view=parts' },
    { label: 'Ready for pickup', value: stats?.ready, to: '/operations?view=pickups' },
    { label: 'Customers', value: stats?.customers, to: '/customers' },
  ]
  return (
    <div>
      <PageHeader title={settings?.shopName || 'My shop'} subtitle="Today at the shop" />
      <div className="mb-5 flex flex-wrap gap-2">
        <Link className="rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white" to="/jobs/new">
          New job
        </Link>
        <Link className="card px-4 py-3 font-semibold" to="/operations">
          Schedule
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {links.map((link) => (
          <Link key={link.to} className="card p-4 hover:border-brand-400" to={link.to}>
            <div className="text-2xl font-bold">{link.value ?? '—'}</div>
            <span>{link.label}</span>
          </Link>
        ))}
      </div>
      <Link
        className="mt-4 inline-block py-2 font-semibold text-brand-700 dark:text-brand-300"
        to="/operations?view=followup"
      >
        Deferred work and follow-up
      </Link>
      {stats?.customers === 0 && (
        <section className="card mt-4 p-4">
          <h2 className="mb-3 font-semibold">Set up your shop</h2>
          <div className="flex flex-wrap gap-4">
            <Link className="py-2 underline" to="/settings">
              Shop profile and rates
            </Link>
            <Link className="py-2 underline" to="/customers/new">
              Add customer
            </Link>
          </div>
        </section>
      )}
    </div>
  )
}
