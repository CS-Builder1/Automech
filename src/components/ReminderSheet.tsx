import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { remindersRepo } from '@/repositories/reminders'
import type { Reminder, ReminderType } from '@/db/types'
import { toDateInputValue } from '@/lib/datetime'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { Field, TextInput, TextArea } from './ui/Field'

const TYPES: { value: ReminderType; label: string }[] = [
  { value: 'service', label: 'Service due' },
  { value: 'inspection', label: 'State inspection' },
  { value: 'custom', label: 'Custom' },
]

interface Props {
  open: boolean
  initial?: Reminder
  presetCustomerId?: string
  presetVehicleId?: string
  onClose: () => void
  onSaved: () => void
}

export function ReminderSheet({ open, initial, presetCustomerId, presetVehicleId, onClose, onSaved }: Props) {
  const customers = useLiveQuery(async () => (await db.customers.toArray()).filter((c) => !c.deletedAt), [])

  const [type, setType] = useState<ReminderType>(initial?.type ?? 'service')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [dueDate, setDueDate] = useState(toDateInputValue(initial?.dueDate))
  const [dueMileage, setDueMileage] = useState(initial?.dueMileage?.toString() ?? '')
  const [customerId, setCustomerId] = useState(initial?.customerId ?? presetCustomerId ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  const vehicles = useLiveQuery(
    async () => (customerId ? (await db.vehicles.where('customerId').equals(customerId).toArray()).filter((v) => !v.deletedAt) : []),
    [customerId],
  )
  const [vehicleId, setVehicleId] = useState(initial?.vehicleId ?? presetVehicleId ?? '')

  async function save() {
    const finalTitle = title.trim() || TYPES.find((t) => t.value === type)!.label
    const payload = {
      type,
      title: finalTitle,
      dueDate: dueDate ? new Date(dueDate + 'T09:00').toISOString() : null,
      dueMileage: dueMileage ? parseInt(dueMileage.replace(/[^0-9]/g, ''), 10) : null,
      customerId: customerId || undefined,
      vehicleId: vehicleId || undefined,
      notes: notes.trim() || undefined,
    }
    if (initial) await remindersRepo.update(initial.id, payload)
    else await remindersRepo.create(payload)
    onSaved()
  }

  return (
    <Sheet open={open} onClose={onClose} title={initial ? 'Edit reminder' : 'New reminder'}>
      <div className="space-y-4">
        <Field label="Type" htmlFor="rtype">
          <select id="rtype" className="input" value={type} onChange={(e) => setType(e.target.value as ReminderType)}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Title" htmlFor="rtitle">
          <TextInput id="rtitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Oil change due" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date" htmlFor="rdate">
            <input id="rdate" type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Due mileage" htmlFor="rmiles">
            <TextInput id="rmiles" inputMode="numeric" value={dueMileage} onChange={(e) => setDueMileage(e.target.value)} placeholder="e.g. 60000" />
          </Field>
        </div>
        <Field label="Customer (optional)" htmlFor="rcust">
          <select id="rcust" className="input" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setVehicleId('') }}>
            <option value="">— none —</option>
            {(customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
          </select>
        </Field>
        {customerId && vehicles && vehicles.length > 0 && (
          <Field label="Vehicle (optional)" htmlFor="rveh">
            <select id="rveh" className="input" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">— none —</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}</option>)}
            </select>
          </Field>
        )}
        <Field label="Notes (optional)" htmlFor="rnotes">
          <TextArea id="rnotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="flex gap-3">
          <Button full onClick={save}>{initial ? 'Save' : 'Add reminder'}</Button>
          {initial && (
            <Button variant="danger" onClick={async () => { await remindersRepo.softDelete(initial.id); onSaved() }}>Delete</Button>
          )}
        </div>
      </div>
    </Sheet>
  )
}
