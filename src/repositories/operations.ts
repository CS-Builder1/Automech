import { db } from '@/db/database'
import type { Appointment, InspectionRating, LineItem, WorkOrder } from '@/db/types'
import { newId, nowISO } from '@/lib/id'

export function localDateTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function dayBounds(day: string) {
  const start = new Date(day + 'T00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

export async function saveAppointment(
  input: Pick<Appointment, 'title' | 'startAt' | 'endAt' | 'bay' | 'workOrderId' | 'notes'>,
  original?: Appointment,
) {
  if (!input.title.trim() || !input.endAt || input.startAt >= input.endAt)
    throw Error('Choose an end time after the start.')
  return db.transaction('rw', db.appointments, db.workOrders, async () => {
    const originalRow = original && (await db.appointments.get(original.id))
    if (
      original &&
      (!originalRow || originalRow.deletedAt || originalRow.updatedAt !== original.updatedAt)
    ) {
      throw Error('This booking changed. Reopen it to see the latest details.')
    }
    const job = input.workOrderId ? await db.workOrders.get(input.workOrderId) : undefined
    if (input.workOrderId && (!job || job.deletedAt)) throw Error('The linked job is unavailable.')
    const bay = input.bay?.trim()
    if (bay) {
      const earlier = await db.appointments.where('startAt').below(input.endAt!).toArray()
      if (
        earlier.some(
          (a) =>
            a.id !== original?.id &&
            !a.deletedAt &&
            a.bay?.trim().toLowerCase() === bay.toLowerCase() &&
            (a.endAt ?? a.startAt) > input.startAt,
        )
      ) {
        throw Error('This bay is already booked during that time.')
      }
    }
    const stamp = nowISO()
    await db.appointments.put({
      ...original,
      ...input,
      title: input.title.trim(),
      bay,
      customerId: job?.customerId ?? (original?.workOrderId ? undefined : original?.customerId),
      vehicleId: job?.vehicleId ?? (original?.workOrderId ? undefined : original?.vehicleId),
      id: original?.id ?? newId(),
      createdAt: original?.createdAt ?? stamp,
      updatedAt: stamp,
    })
  })
}

function requireOpen(job: WorkOrder | undefined): asserts job is WorkOrder {
  if (!job || job.deletedAt || job.status === 'invoiced' || job.status === 'cancelled')
    throw Error('This job is closed or unavailable.')
}

export async function updateDispatch(id: string, technician: string, promisedAt: string | null) {
  await db.transaction('rw', db.workOrders, async () => {
    requireOpen(await db.workOrders.get(id))
    await db.workOrders.update(id, { technician: technician.trim(), promisedAt, updatedAt: nowISO() })
  })
}

export async function updatePart(
  jobId: string,
  itemId: string,
  changes: Pick<LineItem, 'supplier' | 'expectedAt' | 'partStatus'>,
) {
  await db.transaction('rw', db.workOrders, async () => {
    const job = await db.workOrders.get(jobId)
    requireOpen(job)
    if (!job.lineItems.some((item) => item.kind === 'part' && item.id === itemId))
      throw Error('This part is no longer on the job.')
    await db.workOrders.update(jobId, {
      lineItems: job.lineItems.map((item) => (item.id === itemId ? { ...item, ...changes } : item)),
      updatedAt: nowISO(),
    })
  })
}

export async function saveFinding(jobId: string, label: string, rating: InspectionRating, note: string) {
  if (!label.trim()) throw Error('Enter what you inspected.')
  await db.transaction('rw', db.workOrders, db.inspections, async () => {
    const job = await db.workOrders.get(jobId)
    requireOpen(job)
    const stamp = nowISO()
    const inspection = await db.inspections
      .where('workOrderId')
      .equals(jobId)
      .filter((i) => !i.deletedAt && i.templateName === 'Shop inspection')
      .first()
    const item = { id: newId(), label: label.trim(), rating, note: note.trim() }
    if (inspection)
      await db.inspections.update(inspection.id, {
        items: [...inspection.items, item],
        updatedAt: stamp,
      })
    else
      await db.inspections.add({
        id: newId(),
        workOrderId: jobId,
        customerId: job.customerId,
        vehicleId: job.vehicleId,
        templateName: 'Shop inspection',
        items: [item],
        createdAt: stamp,
        updatedAt: stamp,
      })
  })
}

export async function quoteFinding(inspectionId: string, itemId: string, unitPrice: number) {
  if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) throw Error('Enter a valid quoted price.')
  await db.transaction('rw', db.workOrders, db.inspections, async () => {
    const inspection = await db.inspections.get(inspectionId)
    const item = inspection?.items.find((i) => i.id === itemId)
    if (!inspection?.workOrderId || inspection.deletedAt || !item)
      throw Error('Inspection finding is unavailable.')
    const job = await db.workOrders.get(inspection.workOrderId)
    requireOpen(job)
    if ([...job.lineItems, ...(job.declinedItems ?? [])].some((i) => i.id === itemId)) return
    const line: LineItem = {
      id: item.id,
      description: item.label,
      kind: 'labor',
      quantity: 1,
      hours: 1,
      unitPrice,
      taxable: Boolean(job.taxRatePct),
    }
    await db.workOrders.update(job.id, { lineItems: [...job.lineItems, line], updatedAt: nowISO() })
  })
}
