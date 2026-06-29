import { db } from '@/db/database'
import type { Reminder } from '@/db/types'
import { newId, nowISO } from '@/lib/id'

export type NewReminder = Omit<Reminder, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>

export const remindersRepo = {
  async all(): Promise<Reminder[]> {
    const all = await db.reminders.toArray()
    return all.filter((r) => !r.deletedAt)
  },

  /** Open (not completed) reminders, soonest due first. */
  async open(): Promise<Reminder[]> {
    return (await this.all())
      .filter((r) => !r.completedAt)
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
  },

  async forVehicle(vehicleId: string): Promise<Reminder[]> {
    return (await this.all()).filter((r) => r.vehicleId === vehicleId)
  },

  async get(id: string): Promise<Reminder | undefined> {
    return db.reminders.get(id)
  },

  async create(input: NewReminder): Promise<Reminder> {
    const ts = nowISO()
    const reminder: Reminder = { ...input, id: newId(), createdAt: ts, updatedAt: ts, deletedAt: null }
    await db.reminders.put(reminder)
    return reminder
  },

  async update(id: string, patch: Partial<NewReminder>): Promise<void> {
    await db.reminders.update(id, { ...patch, updatedAt: nowISO() })
  },

  async complete(id: string): Promise<void> {
    await db.reminders.update(id, { completedAt: nowISO(), updatedAt: nowISO() })
  },

  async softDelete(id: string): Promise<void> {
    await db.reminders.update(id, { deletedAt: nowISO(), updatedAt: nowISO() })
  },
}
