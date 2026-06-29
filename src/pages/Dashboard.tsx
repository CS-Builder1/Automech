import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { appointmentsRepo } from '@/repositories/appointments'
import { remindersRepo } from '@/repositories/reminders'
import { startOfDay, addDays, formatTime } from '@/lib/datetime'
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

  const today = startOfDay(new Date())
  const todaysAppts = useLiveQuery(() => appointmentsRepo.inRange(today.toISOString(), addDays(today, 1).toISOString()), [])
  const openReminders = useLiveQuery(() => remindersRepo.open(), [])
  const followUps = useLiveQuery(
    async () => (await db.workOrders.toArray()).filter((w) => !w.deletedAt && !w.followUpDismissedAt && (w.declinedItems?.length ?? 0) > 0).length,
    [],
  )
  const customerMap = useLiveQuery(async () => new Map((await db.customers.toArray()).map((c) => [c.id, c])), []) ?? new Map()
  const remindersDue = (openReminders ?? []).filter((r) => r.dueDate && new Date(r.dueDate) <= addDays(today, 7)).length
  const isEmpty = (customerCount ?? 0) === 0

  return (
    <div>
      <PageHeader title={`Hi${settings?.ownerName ? ', ' + settings.ownerName : ''} 👋`} subtitle={settings?.shopName} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Customers" value={customerCount ?? '—'} to="/customers" />
        <StatCard label="Vehicles" value={vehicleCount ?? '—'} />
        <StatCard label="Open jobs" value={openJobs ?? '—'} to="/jobs" />
        <StatCard label="Outstanding" value={outstanding !== undefined ? money(outstanding) : '—'} to="/invoices" />
      </div>

      {/* Today's schedule */}
      <div className="card mt-5 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Today</h2>
          <Link to="/schedule" className="text-sm text-brand-600 dark:text-brand-400">Schedule →</Link>
        </div>
        {todaysAppts && todaysAppts.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {todaysAppts.map((a) => {
              const cust = a.customerId ? customerMap.get(a.customerId) : undefined
              return (
                <li key={a.id} className="flex items-center gap-3 text-sm">
                  <span className="w-16 shrink-0 font-semibold tabular-nums text-brand-600 dark:text-brand-400">{formatTime(a.startAt)}</span>
                  <span className="truncate">{a.title}{cust ? ` · ${cust.firstName} ${cust.lastName}` : ''}</span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No appointments today.</p>
        )}
      </div>

      {/* Follow-ups */}
      {((followUps ?? 0) > 0 || remindersDue > 0) && (
        <Link to="/follow-ups" className="card mt-3 flex items-center justify-between p-5 hover:border-brand-300">
          <div>
            <h2 className="font-semibold">Follow-ups waiting</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {(followUps ?? 0) > 0 && `${followUps} customer${followUps! > 1 ? 's' : ''} with declined work`}
              {(followUps ?? 0) > 0 && remindersDue > 0 && ' · '}
              {remindersDue > 0 && `${remindersDue} reminder${remindersDue > 1 ? 's' : ''} due soon`}
            </p>
          </div>
          <span className="text-2xl">→</span>
        </Link>
      )}

      {isEmpty && (
        <div className="card mt-3 p-5">
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
      )}
    </div>
  )
}
