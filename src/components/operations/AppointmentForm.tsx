import { useState } from 'react'
import type { Appointment, WorkOrder } from '@/db/types'
import { db } from '@/db/database'
import { localDateTime, saveAppointment } from '@/repositories/operations'
import { nowISO } from '@/lib/id'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'

interface Props {
  original?: Appointment
  day: string
  jobs: WorkOrder[]
  linkedJob?: WorkOrder
  onClose: () => void
  onSaved: (day: string) => void
}

export function AppointmentForm({ original, day, jobs, linkedJob, onClose, onSaved }: Props) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const data = new FormData(event.currentTarget)
    const field = (key: string) => String(data.get(key) ?? '')
    setBusy(true)
    try {
      await saveAppointment(
        {
          title: field('title'),
          bay: field('bay'),
          workOrderId: field('job') || undefined,
          startAt: new Date(field('start')).toISOString(),
          endAt: new Date(field('end')).toISOString(),
          notes: field('notes'),
        },
        original,
      )
      onSaved(field('start').slice(0, 10))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save booking.')
    } finally {
      setBusy(false)
    }
  }
  async function cancelBooking() {
    if (!original || !confirm('Cancel this appointment?')) return
    try {
      await db.appointments.update(original.id, { deletedAt: nowISO(), updatedAt: nowISO() })
      onClose()
    } catch {
      setError('Could not cancel the booking. Please try again.')
    }
  }
  return (
    <Sheet open title={original ? 'Edit appointment' : 'Book appointment'} onClose={onClose}>
      <form className="space-y-4" onSubmit={save}>
        <label className="block">
          Visit description
          <input autoFocus className="input" name="title" required defaultValue={original?.title} />
        </label>
        <label className="block">
          Starts
          <input
            className="input"
            name="start"
            type="datetime-local"
            required
            defaultValue={original ? localDateTime(new Date(original.startAt)) : day + 'T09:00'}
          />
        </label>
        <label className="block">
          Ends
          <input
            className="input"
            name="end"
            type="datetime-local"
            required
            defaultValue={original?.endAt ? localDateTime(new Date(original.endAt)) : day + 'T10:00'}
          />
        </label>
        <label className="block">
          Bay
          <input className="input" name="bay" defaultValue={original?.bay} />
        </label>
        <label className="block">
          Linked repair order
          <select className="input" name="job" defaultValue={original?.workOrderId ?? ''}>
            <option value="">No repair order yet</option>
            {original?.workOrderId && (
              <option value={original.workOrderId}>
                {linkedJob?.number ?? original.workOrderId}
                {jobs.some(j => j.id === original.workOrderId) ? ' · ' + (linkedJob?.complaint ?? '') : ' (archived)'}
              </option>
            )}
            {jobs
              .filter(
                (j) =>
                  j.id !== original?.workOrderId && !['invoiced', 'cancelled'].includes(j.status),
              )
              .map((j) => (
                <option key={j.id} value={j.id}>
                  {j.number} · {j.complaint}
                </option>
              ))}
          </select>
        </label>
        <label className="block">
          Contact and visit notes
          <textarea className="input" name="notes" defaultValue={original?.notes} />
        </label>
        {error && <p role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>
          Save appointment
        </Button>
        {original && (
          <Button type="button" variant="ghost" onClick={cancelBooking}>
            Cancel booking
          </Button>
        )}
      </form>
    </Sheet>
  )
}
