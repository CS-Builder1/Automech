import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { remindersRepo } from '@/repositories/reminders'
import { workOrdersRepo } from '@/repositories/workOrders'
import { useSettings } from '@/hooks/useSettings'
import { lineTotal } from '@/lib/calc'
import { useMoney } from '@/hooks/useMoney'
import { relativeDayLabel } from '@/lib/datetime'
import { declinedWorkMessage, reminderMessage } from '@/lib/messages'
import { PageHeader, EmptyState } from '@/components/ui/Page'
import { Button } from '@/components/ui/Button'
import { ContactActions } from '@/components/ContactActions'
import { ReminderSheet } from '@/components/ReminderSheet'

export function FollowUps() {
  const settings = useSettings()
  const money = useMoney()
  const [reminderOpen, setReminderOpen] = useState(false)

  const customers = useLiveQuery(async () => new Map((await db.customers.toArray()).map((c) => [c.id, c])), []) ?? new Map()
  const vehicles = useLiveQuery(async () => new Map((await db.vehicles.toArray()).map((v) => [v.id, v])), []) ?? new Map()
  const reminders = useLiveQuery(() => remindersRepo.open(), [])
  const declined = useLiveQuery(async () => {
    const wos = (await db.workOrders.toArray()).filter(
      (w) => !w.deletedAt && !w.followUpDismissedAt && (w.declinedItems?.length ?? 0) > 0,
    )
    return wos.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [])

  const shopName = settings?.shopName ?? 'your shop'
  const vehLabel = (id?: string) => {
    const v = id ? vehicles.get(id) : undefined
    return v ? [v.year, v.make, v.model].filter(Boolean).join(' ') : undefined
  }

  return (
    <div>
      <PageHeader title="Follow-ups" subtitle="Recover deferred work & keep customers coming back"
        action={<Button size="sm" onClick={() => setReminderOpen(true)}>+ Reminder</Button>} />

      {/* Reminders due */}
      <h2 className="mb-2 font-semibold">Reminders</h2>
      {reminders && reminders.length > 0 ? (
        <ul className="mb-6 space-y-2">
          {reminders.map((r) => {
            const cust = r.customerId ? customers.get(r.customerId) : undefined
            const veh = vehLabel(r.vehicleId)
            const overdue = r.dueDate ? new Date(r.dueDate) < new Date() : false
            const msg = cust ? reminderMessage({ shopName, customerName: cust.firstName, vehicle: veh }, r.title) : undefined
            return (
              <li key={r.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{r.title}</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      {cust ? `${cust.firstName} ${cust.lastName}` : 'No customer'}{veh ? ` · ${veh}` : ''}
                    </div>
                    <div className="mt-0.5 text-xs">
                      {r.dueDate && <span className={overdue ? 'font-medium text-red-600' : 'text-slate-500'}>{overdue ? 'Overdue · ' : 'Due '}{relativeDayLabel(new Date(r.dueDate))}</span>}
                      {r.dueMileage ? <span className="text-slate-500">{r.dueDate ? ' · ' : ''}at {r.dueMileage.toLocaleString()} mi</span> : null}
                    </div>
                  </div>
                  <button className="text-xs text-emerald-600" onClick={() => remindersRepo.complete(r.id)}>Mark done</button>
                </div>
                {cust?.phone && <div className="mt-3"><ContactActions phone={cust.phone} message={msg} size="sm" /></div>}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mb-6 card px-4 py-5 text-center text-sm text-slate-500 dark:text-slate-400">No open reminders.</p>
      )}

      {/* Declined work */}
      <h2 className="mb-2 font-semibold">Declined / deferred work</h2>
      {declined === undefined ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : declined.length === 0 ? (
        <EmptyState title="Nothing to chase" body="When a customer declines recommended work, it shows here so you can follow up and win it back." />
      ) : (
        <ul className="space-y-2">
          {declined.map((w) => {
            const cust = customers.get(w.customerId)
            const veh = vehLabel(w.vehicleId)
            const items = (w.declinedItems ?? [])
            const value = items.reduce((s, li) => s + lineTotal(li), 0)
            const msg = cust ? declinedWorkMessage({ shopName, customerName: cust.firstName, vehicle: veh }, items.map((i) => i.description)) : undefined
            return (
              <li key={w.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/jobs/${w.id}`} className="font-medium text-brand-600 dark:text-brand-400">
                      {cust ? `${cust.firstName} ${cust.lastName}` : 'Customer'}
                    </Link>
                    <div className="text-sm text-slate-500 dark:text-slate-400">{veh ? `${veh} · ` : ''}{w.number}</div>
                  </div>
                  <div className="text-right">
                    {value > 0 && <div className="text-sm font-semibold tabular-nums">{money(value)}</div>}
                    <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => workOrdersRepo.update(w.id, { followUpDismissedAt: new Date().toISOString() })}>Dismiss</button>
                  </div>
                </div>
                <ul className="mt-2 space-y-0.5 text-sm text-slate-600 dark:text-slate-300">
                  {items.map((li) => <li key={li.id}>• {li.description}</li>)}
                </ul>
                {cust?.phone && <div className="mt-3"><ContactActions phone={cust.phone} message={msg} size="sm" /></div>}
              </li>
            )
          })}
        </ul>
      )}

      {reminderOpen && <ReminderSheet open onClose={() => setReminderOpen(false)} onSaved={() => setReminderOpen(false)} />}
    </div>
  )
}
