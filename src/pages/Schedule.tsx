import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { appointmentsRepo } from '@/repositories/appointments'
import type { Appointment } from '@/db/types'
import { startOfDay, addDays, relativeDayLabel, formatTime, isToday } from '@/lib/datetime'
import { PageHeader, EmptyState } from '@/components/ui/Page'
import { Button } from '@/components/ui/Button'
import { AppointmentSheet } from '@/components/AppointmentSheet'

export function Schedule() {
  const [day, setDay] = useState(() => startOfDay(new Date()))
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Appointment | undefined>()

  const dayStart = day.toISOString()
  const dayEnd = addDays(day, 1).toISOString()

  const appts = useLiveQuery(async () => appointmentsRepo.inRange(dayStart, dayEnd), [dayStart, dayEnd])
  const customers = useLiveQuery(async () => new Map((await db.customers.toArray()).map((c) => [c.id, c])), []) ?? new Map()

  function openNew() { setEditing(undefined); setSheetOpen(true) }
  function openEdit(a: Appointment) { setEditing(a); setSheetOpen(true) }

  return (
    <div>
      <PageHeader title="Schedule" action={<Button size="sm" onClick={openNew}>+ Appointment</Button>} />

      <div className="mb-4 flex items-center justify-between">
        <button className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-medium dark:bg-slate-800" onClick={() => setDay((d) => addDays(d, -1))}>‹ Prev</button>
        <div className="text-center">
          <div className="font-semibold">{relativeDayLabel(day)}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        </div>
        <button className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-medium dark:bg-slate-800" onClick={() => setDay((d) => addDays(d, 1))}>Next ›</button>
      </div>
      {!isToday(day) && (
        <button className="mb-3 text-sm text-brand-600 dark:text-brand-400" onClick={() => setDay(startOfDay(new Date()))}>← Back to today</button>
      )}

      {appts === undefined ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : appts.length === 0 ? (
        <EmptyState title="Nothing booked" body="No appointments for this day." action={<Button className="mt-2" onClick={openNew}>+ Add appointment</Button>} />
      ) : (
        <ul className="space-y-2">
          {appts.map((a) => {
            const cust = a.customerId ? customers.get(a.customerId) : undefined
            return (
              <li key={a.id}>
                <button onClick={() => openEdit(a)} className="card flex w-full items-center gap-3 px-4 py-3 text-left hover:border-brand-300">
                  <div className="w-16 shrink-0 text-sm font-semibold tabular-nums text-brand-600 dark:text-brand-400">{formatTime(a.startAt)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{a.title}</div>
                    <div className="truncate text-sm text-slate-500 dark:text-slate-400">
                      {cust ? `${cust.firstName} ${cust.lastName}` : 'No customer'}{a.bay ? ` · Bay ${a.bay}` : ''}
                    </div>
                  </div>
                  {a.workOrderId && <Link to={`/jobs/${a.workOrderId}`} onClick={(e) => e.stopPropagation()} className="text-xs text-brand-600 dark:text-brand-400">job →</Link>}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {sheetOpen && (
        <AppointmentSheet open initial={editing} defaultStart={new Date(day.getTime() + 9 * 3600_000)}
          onClose={() => setSheetOpen(false)} onSaved={() => setSheetOpen(false)} />
      )}
    </div>
  )
}
