import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import type { Appointment, LineItem, PartStatus, WorkOrder } from '@/db/types'
import { dayBounds, localDateTime, updatePart } from '@/repositories/operations'
import { isArchivedJob } from '@/lib/records'
import { STATUS_META } from '@/lib/status'
import { nowISO } from '@/lib/id'
import { AppointmentForm } from '@/components/operations/AppointmentForm'
import { PageHeader } from '@/components/ui/Page'
import { Button } from '@/components/ui/Button'

const queues = {
  schedule: 'Schedule',
  pickups: 'Pickups',
  approvals: 'Awaiting approval',
  parts: 'Parts',
  followup: 'Deferred work',
} as const
type Queue = keyof typeof queues
export function Operations() {
  const [params, setParams] = useSearchParams()
  const key = params.get('view') ?? 'schedule'
  const queue: Queue = Object.prototype.hasOwnProperty.call(queues, key) ? (key as Queue) : 'schedule'
  const [day, setDay] = useState(localDateTime(new Date()).slice(0, 10))
  const [editing, setEditing] = useState<Appointment | 'new'>()
  const [error, setError] = useState('')
  const data = useLiveQuery(async () => {
    const [jobs, customers, vehicles, appointments] = await Promise.all([
      db.workOrders.toArray(),
      db.customers.toArray(),
      db.vehicles.toArray(),
      db.appointments.toArray(),
    ])
    const owners = new Map(customers.map((c) => [c.id, c]))
    const cars = new Map(vehicles.map((v) => [v.id, v]))
    return {
      jobs,
      activeJobs: jobs.filter(j => !isArchivedJob(j, owners.get(j.customerId), cars.get(j.vehicleId))),
      owners,
      cars,
      appointments,
    }
  }, [])
  if (!data) return <p>Loading operations…</p>
  const bounds = dayBounds(day)
  const open = data.activeJobs.filter((j) => !['invoiced', 'cancelled'].includes(j.status))
  const jobLink = (j: WorkOrder) => {
    const owner = data.owners.get(j.customerId)
    const car = data.cars.get(j.vehicleId)
    return (
      <Link className="font-semibold text-brand-700 dark:text-brand-300" to={'/jobs/' + j.id}>
        {j.number} · {[owner?.firstName, owner?.lastName].filter(Boolean).join(' ') || owner?.company} ·{' '}
        {car?.licensePlate || car?.model}
      </Link>
    )
  }
  const appointments = data.appointments
    .filter(
      (a) =>
        !a.deletedAt &&
        a.startAt < bounds.end &&
        (a.endAt ? a.endAt > bounds.start : a.startAt >= bounds.start),
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
  const pending = open.filter((j) => j.status === 'awaiting_approval')
  const pickups = open
    .filter((j) => j.status === 'completed' || (j.promisedAt && j.promisedAt < bounds.end))
    .sort((a, b) => (a.promisedAt ?? 'z').localeCompare(b.promisedAt ?? 'z'))
  const parts = open.flatMap((j) =>
    j.lineItems
      .filter((l) => l.kind === 'part' && l.partStatus !== 'received')
      .map((item) => ({ j, item })),
  )
  const deferred = data.activeJobs.flatMap((j) => (j.declinedItems ?? []).map((item) => ({ j, item })))
  async function contacted(j: WorkOrder, item: LineItem, form: HTMLFormElement) {
    const outcome = String(new FormData(form).get('outcome')).trim()
    if (!outcome) return
    try {
      await db.customers
        .where('id')
        .equals(j.customerId)
        .modify((c) => {
          c.followUps = { ...c.followUps, [item.id]: { outcome, contactedAt: nowISO() } }
          c.updatedAt = nowISO()
        })
      form.reset()
      setError('')
    } catch {
      setError('Could not record the follow-up.')
    }
  }
  return (
    <div>
      <PageHeader
        title="Shop operations"
        action={
          <Button size="sm" onClick={() => setEditing('new')}>
            Book appointment
          </Button>
        }
      />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Work queues">
        {Object.entries(queues).map(([k, v]) => (
          <button
            key={k}
            aria-pressed={queue === k}
            className={'rounded-xl px-3 py-2 ' + (queue === k ? 'bg-brand-600 text-white' : 'card')}
            onClick={() => setParams({ view: k })}
          >
            {v}
          </button>
        ))}
      </nav>
      {(queue === 'schedule' || queue === 'pickups') && (
        <label className="mb-4 block max-w-xs">
          Day
          <input
            type="date"
            className="input"
            value={day}
            onChange={(e) => {
              if (e.target.value) setDay(e.target.value)
            }}
          />
        </label>
      )}
      <h2 className="mb-2 text-lg font-semibold">{queues[queue]}</h2>
      {queue === 'schedule' &&
        (appointments.length ? (
          appointments.map((a) => (
            <article key={a.id} className="card mb-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{a.title}</strong>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={'Edit ' + a.title}
                  onClick={() => setEditing(a)}
                >
                  Edit
                </Button>
              </div>
              <p>
                {new Date(a.startAt).toLocaleString()}{' '}
                {a.endAt && ' – ' + new Date(a.endAt).toLocaleTimeString()} {a.bay && ' · ' + a.bay}
              </p>
              <p>{a.notes}</p>
              {a.workOrderId && (
                <Link className="underline" to={'/jobs/' + a.workOrderId}>
                  Open repair order
                </Link>
              )}
            </article>
          ))
        ) : (
          <p>No appointments for this day.</p>
        ))}
      {(queue === 'approvals' || queue === 'pickups') &&
        ((queue === 'approvals' ? pending : pickups).length ? (
          (queue === 'approvals' ? pending : pickups).map((j) => (
            <article key={j.id} className="card mb-2 p-4">
              {jobLink(j)}
              <p>
                {STATUS_META[j.status].label}
                {j.technician && ' · ' + j.technician}
              </p>
              {j.promisedAt && <p>Promised {new Date(j.promisedAt).toLocaleString()}</p>}
              {data.owners.get(j.customerId)?.phone && (
                <a className="underline" href={'tel:' + data.owners.get(j.customerId)?.phone}>
                  Call customer
                </a>
              )}
            </article>
          ))
        ) : (
          <p>{queue === 'approvals' ? 'No jobs awaiting approval.' : 'No pickups due or ready.'}</p>
        ))}
      {queue === 'parts' &&
        (parts.length ? (
          parts.map(({ j, item }) => (
            <article key={j.id + item.id} className="card mb-3 p-4">
              {jobLink(j)}
              <h3 className="my-2 font-semibold">{item.description}</h3>
              <form
                className="grid gap-3 sm:grid-cols-2"
                onSubmit={async (e) => {
                  e.preventDefault()
                  const values = new FormData(e.currentTarget)
                  try {
                    await updatePart(j.id, item.id, {
                      supplier: String(values.get('supplier')).trim(),
                      expectedAt: String(values.get('eta')),
                      partStatus: String(values.get('status')) as PartStatus,
                    })
                    setError('Part updated.')
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : 'Could not update part.')
                  }
                }}
              >
                <label>
                  Supplier
                  <input className="input" name="supplier" defaultValue={item.supplier} />
                </label>
                <label>
                  Expected arrival
                  <input className="input" type="date" name="eta" defaultValue={item.expectedAt} />
                </label>
                <label>
                  Part status
                  <select className="input" name="status" defaultValue={item.partStatus ?? 'needed'}>
                    {['needed', 'quoted', 'ordered', 'received'].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <Button className="self-end">Update part</Button>
              </form>
            </article>
          ))
        ) : (
          <p>No outstanding parts.</p>
        ))}
      {queue === 'followup' &&
        (deferred.length ? (
          deferred.map(({ j, item }) => {
            const owner = data.owners.get(j.customerId)
            const last = owner?.followUps?.[item.id]
            return (
              <article className="card mb-3 p-4" key={j.id + item.id}>
                {jobLink(j)}
                <h3 className="my-2 font-semibold">{item.description}</h3>
                {owner?.phone && (
                  <a className="underline" href={'tel:' + owner.phone}>
                    Call {owner.phone}
                  </a>
                )}
                {last && (
                  <p>
                    Last contact {new Date(last.contactedAt).toLocaleDateString()} · {last.outcome}
                  </p>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void contacted(j, item, e.currentTarget)
                  }}
                  className="mt-2 flex flex-wrap items-end gap-2"
                >
                  <label>
                    Follow-up outcome
                    <input className="input" required name="outcome" />
                  </label>
                  <Button size="sm">Record contact</Button>
                </form>
              </article>
            )
          })
        ) : (
          <p>No deferred work.</p>
        ))}
      {error && <p role="status">{error}</p>}
      {editing && (
        <AppointmentForm
          day={day}
          jobs={data.activeJobs}
          linkedJob={editing === 'new' ? undefined : data.jobs.find(j => j.id === editing.workOrderId)}
          original={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(undefined)}
          onSaved={(d) => {
            setDay(d)
            setParams({ view: 'schedule' })
            setEditing(undefined)
          }}
        />
      )}
    </div>
  )
}
