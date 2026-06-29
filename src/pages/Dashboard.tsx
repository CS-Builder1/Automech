import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { PageHeader } from '@/components/ui/Page'
import { useSettings } from '@/hooks/useSettings'
import { useMoney } from '@/hooks/useMoney'

function StatCard({ label, value, to }: { label: string; value: string | number; to?: string }) {
  const inner = (
    <div className="card px-4 py-4">
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  )
  return to ? <Link to={to}>{inner}</Link> : inner
}

export function Dashboard() {
  const settings = useSettings()
  const customerCount = useLiveQuery(async () => (await db.customers.toArray()).filter((c) => !c.deletedAt).length, [])
  const vehicleCount = useLiveQuery(async () => (await db.vehicles.toArray()).filter((v) => !v.deletedAt).length, [])
  const openJobs = useLiveQuery(
    async () => (await db.workOrders.toArray()).filter((w) => !w.deletedAt && w.status !== 'invoiced' && w.status !== 'cancelled').length,
    [],
  )
  const outstanding = useLiveQuery(
    async () => (await db.invoices.toArray()).filter((i) => !i.deletedAt).reduce((sum, i) => sum + Math.max(0, i.total - i.amountPaid), 0),
    [],
  )
  const money = useMoney()

  return (
    <div>
      <PageHeader title={`Hi${settings?.ownerName ? ', ' + settings.ownerName : ''} 👋`} subtitle={settings?.shopName} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Customers" value={customerCount ?? '—'} to="/customers" />
        <StatCard label="Vehicles" value={vehicleCount ?? '—'} />
        <StatCard label="Open jobs" value={openJobs ?? '—'} to="/jobs" />
        <StatCard label="Outstanding" value={outstanding !== undefined ? money(outstanding) : '—'} to="/invoices" />
      </div>

      <div className="card mt-5 p-5">
        <h2 className="font-semibold">Welcome to Automech</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Everything you record is saved on your device first, so the app keeps working with no signal.
          Start by adding a customer and their vehicle — decode the VIN to auto-fill year, make and model.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/customers/new" className="rounded-xl bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700">
            + Add customer
          </Link>
          <Link to="/settings" className="rounded-xl bg-slate-200 px-4 py-2.5 font-semibold text-slate-800 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-100">
            Set up your shop
          </Link>
        </div>
      </div>
    </div>
  )
}
