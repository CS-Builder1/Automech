import { db } from '@/db/database'
import type { Appointment } from '@/db/types'
import { newId, nowISO } from '@/lib/id'

export type NewAppointment = Omit<Appointment, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>

export const appointmentsRepo = {
  async all(): Promise<Appointment[]> {
    const all = await db.appointments.toArray()
    return all.filter((a) => !a.deletedAt).sort((a, b) => a.startAt.localeCompare(b.startAt))
  },

  async inRange(startIso: string, endIso: string): Promise<Appointment[]> {
    return (await this.all()).filter((a) => a.startAt >= startIso && a.startAt < endIso)
  },

  async upcoming(fromIso: string): Promise<Appointment[]> {
    return (await this.all()).filter((a) => (a.endAt ?? a.startAt) >= fromIso)
  },

  async get(id: string): Promise<Appointment | undefined> {
    return db.appointments.get(id)
  },

  /** Same bay + overlapping time = a double-booking conflict. */
  async conflicts(appt: Pick<Appointment, 'startAt' | 'endAt' | 'bay'>, ignoreId?: string): Promise<Appointment[]> {
    if (!appt.bay) return []
    const start = appt.startAt
    const end = appt.endAt ?? appt.startAt
    return (await this.all()).filter((a) => {
      if (a.id === ignoreId || a.bay !== appt.bay) return false
      const aStart = a.startAt
      const aEnd = a.endAt ?? a.startAt
      return aStart < end && start < aEnd
    })
  },

  async create(input: NewAppointment): Promise<Appointment> {
    const ts = nowISO()
    const appt: Appointment = { ...input, id: newId(), createdAt: ts, updatedAt: ts, deletedAt: null }
    await db.appointments.put(appt)
    return appt
  },

  async update(id: string, patch: Partial<NewAppointment>): Promise<void> {
    await db.appointments.update(id, { ...patch, updatedAt: nowISO() })
  },

  async softDelete(id: string): Promise<void> {
    await db.appointments.update(id, { deletedAt: nowISO(), updatedAt: nowISO() })
  },
}
