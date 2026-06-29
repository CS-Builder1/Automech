import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { appointmentsRepo } from '@/repositories/appointments'
import type { Appointment } from '@/db/types'
import { toLocalInputValue, fromLocalInputValue } from '@/lib/datetime'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { Field, TextInput, TextArea } from './ui/Field'

const DURATIONS = [30, 60, 90, 120, 180]

interface Props {
  open: boolean
  initial?: Appointment
  defaultStart?: Date
  onClose: () => void
  onSaved: () => void
}

export function AppointmentSheet({ open, initial, defaultStart, onClose, onSaved }: Props) {
  const customers = useLiveQuery(async () => (await db.customers.toArray()).filter((c) => !c.deletedAt), [])

  const [title, setTitle] = useState(initial?.title ?? '')
  const [start, setStart] = useState(toLocalInputValue(initial?.startAt ?? defaultStart?.toISOString()))
  const [duration, setDuration] = useState(() => {
    if (initial?.startAt && initial.endAt) return Math.round((+new Date(initial.endAt) - +new Date(initial.startAt)) / 60000)
    return 60
  })
  const [bay, setBay] = useState(initial?.bay ?? '')
  const [customerId, setCustomerId] = useState(initial?.customerId ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [conflictMsg, setConflictMsg] = useState<string | null>(null)

  const vehicles = useLiveQuery(
    async () => (customerId ? (await db.vehicles.where('customerId').equals(customerId).toArray()).filter((v) => !v.deletedAt) : []),
    [customerId],
  )
  const [vehicleId, setVehicleId] = useState(initial?.vehicleId ?? '')

  useEffect(() => {
    const startIso = fromLocalInputValue(start)
    const endIso = new Date(+new Date(startIso) + duration * 60000).toISOString()
    appointmentsRepo.conflicts({ startAt: startIso, endAt: endIso, bay: bay || undefined }, initial?.id).then((c) => {
      setConflictMsg(c.length ? `Bay ${bay} already has “${c[0].title}” at that time.` : null)
    })
  }, [start, duration, bay, initial?.id])

  async function save() {
    if (!title.trim()) return
    const startIso = fromLocalInputValue(start)
    const endIso = new Date(+new Date(startIso) + duration * 60000).toISOString()
    const payload = {
      title: title.trim(),
      startAt: startIso,
      endAt: endIso,
      bay: bay.trim() || undefined,
      customerId: customerId || undefined,
      vehicleId: vehicleId || undefined,
      notes: notes.trim() || undefined,
    }
    if (initial) await appointmentsRepo.update(initial.id, payload)
    else await appointmentsRepo.create(payload)
    onSaved()
  }

  return (
    <Sheet open={open} onClose={onClose} title={initial ? 'Edit appointment' : 'New appointment'}>
      <div className="space-y-4">
        <Field label="Title" htmlFor="atitle">
          <TextInput id="atitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Brake job — drop off" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start" htmlFor="astart">
            <input id="astart" type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Duration" htmlFor="adur">
            <select id="adur" className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {DURATIONS.map((d) => <option key={d} value={d}>{d < 60 ? `${d} min` : `${d / 60} hr`}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Bay (optional)" htmlFor="abay" hint="Used to flag double-bookings.">
          <TextInput id="abay" value={bay} onChange={(e) => setBay(e.target.value)} placeholder="e.g. 1" />
        </Field>
        {conflictMsg && (
          <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">⚠ {conflictMsg}</p>
        )}
        <Field label="Customer (optional)" htmlFor="acust">
          <select id="acust" className="input" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setVehicleId('') }}>
            <option value="">— none —</option>
            {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
          </select>
        </Field>
        {customerId && vehicles && vehicles.length > 0 && (
          <Field label="Vehicle (optional)" htmlFor="aveh">
            <select id="aveh" className="input" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">— none —</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}</option>)}
            </select>
          </Field>
        )}
        <Field label="Notes (optional)" htmlFor="anotes">
          <TextArea id="anotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="flex gap-3">
          <Button full onClick={save}>{initial ? 'Save' : 'Add appointment'}</Button>
          {initial && (
            <Button variant="danger" onClick={async () => { await appointmentsRepo.softDelete(initial.id); onSaved() }}>Delete</Button>
          )}
        </div>
      </div>
    </Sheet>
  )
}
