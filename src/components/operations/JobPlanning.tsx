import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import type { InspectionRating, WorkOrder } from '@/db/types'
import { parseAmountToMinor } from '@/lib/money'
import { Button } from '@/components/ui/Button'
import { localDateTime, quoteFinding, saveFinding, updateDispatch } from '@/repositories/operations'

const ratings: Record<InspectionRating, string> = {
  green: 'OK',
  yellow: 'Monitor',
  red: 'Needs attention',
  na: 'Not inspected',
}

export function JobPlanning({ job, readOnly = false }: { job: WorkOrder; readOnly?: boolean }) {
  const [message, setMessage] = useState('')
  const inspections = useLiveQuery(
    () =>
      db.inspections
        .where('workOrderId')
        .equals(job.id)
        .filter((i) => !i.deletedAt)
        .toArray(),
    [job.id],
  )
  const closed = readOnly || ['invoiced', 'cancelled'].includes(job.status)
  async function submit(
    e: React.FormEvent<HTMLFormElement>,
    action: (data: FormData) => Promise<void>,
    success: string,
    reset = false,
  ) {
    e.preventDefault()
    const form = e.currentTarget
    try {
      await action(new FormData(form))
      if (reset) form.reset()
      setMessage(success)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not save changes.')
    }
  }
  return (
    <details className="card mb-4 p-4">
      <summary className="cursor-pointer font-semibold">Dispatch and inspection</summary>
      {!closed && (
        <form
          className="my-4 space-y-3"
          onSubmit={(e) =>
            submit(
              e,
              (data) =>
                updateDispatch(
                  job.id,
                  String(data.get('tech')),
                  data.get('due') ? new Date(String(data.get('due'))).toISOString() : null,
                ),
              'Dispatch saved.',
            )
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              Assigned technician
              <input className="input" name="tech" defaultValue={job.technician} />
            </label>
            <label>
              Promised pickup
              <input
                className="input"
                type="datetime-local"
                name="due"
                defaultValue={job.promisedAt ? localDateTime(new Date(job.promisedAt)) : ''}
              />
            </label>
          </div>
          <Button size="sm">Save dispatch</Button>
        </form>
      )}
      {!closed && (
        <form
          className="space-y-2 border-t py-4"
          onSubmit={(e) =>
            submit(
              e,
              (data) =>
                saveFinding(
                  job.id,
                  String(data.get('finding')),
                  String(data.get('rating')) as InspectionRating,
                  String(data.get('note')),
                ),
              'Finding saved.',
              true,
            )
          }
        >
          <label className="block">
            Inspection finding
            <input className="input" name="finding" required />
          </label>
          <label className="block">
            Condition
            <select className="input" aria-label="Condition" name="rating">
              {Object.entries(ratings).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Inspection notes
            <textarea className="input" name="note" />
          </label>
          <Button size="sm">Save finding</Button>
        </form>
      )}
      {inspections?.map((i) =>
        i.items.map((item) => (
          <article className="border-t py-3" key={item.id}>
            <p className="font-semibold">
              {item.label} · {ratings[item.rating]}
            </p>
            {item.note && <p>{item.note}</p>}
            {job.lineItems.some((line) => line.id === item.id) ? (
              <p>On estimate</p>
            ) : job.declinedItems?.some((line) => line.id === item.id) ? (
              <p>Deferred</p>
            ) : (
              !closed && (
                <form
                  className="mt-2 flex flex-wrap items-end gap-2"
                  onSubmit={(e) =>
                    submit(
                      e,
                      (data) => {
                        return quoteFinding(i.id, item.id, parseAmountToMinor(String(data.get('price'))))
                      },
                      'Finding added to estimate.',
                    )
                  }
                >
                  <label>
                    Quoted labor for one hour
                    <input className="input" name="price" inputMode="decimal" required />
                  </label>
                  <Button size="sm">Add to estimate</Button>
                </form>
              )
            )}
          </article>
        )),
      )}
      {message && (
        <p role="status" className="py-2">
          {message}
        </p>
      )}
    </details>
  )
}
