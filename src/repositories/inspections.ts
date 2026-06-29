import { db } from '@/db/database'
import type { Inspection } from '@/db/types'
import { newId, nowISO } from '@/lib/id'
import { mediaRepo } from './media'

export type NewInspection = Omit<Inspection, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>

export const inspectionsRepo = {
  async get(id: string): Promise<Inspection | undefined> {
    return db.inspections.get(id)
  },

  async forWorkOrder(workOrderId: string): Promise<Inspection[]> {
    const all = await db.inspections.where('workOrderId').equals(workOrderId).toArray()
    return all.filter((i) => !i.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  async forVehicle(vehicleId: string): Promise<Inspection[]> {
    const all = await db.inspections.where('vehicleId').equals(vehicleId).toArray()
    return all.filter((i) => !i.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  async create(input: NewInspection): Promise<Inspection> {
    const ts = nowISO()
    const inspection: Inspection = { ...input, id: newId(), createdAt: ts, updatedAt: ts, deletedAt: null }
    await db.inspections.put(inspection)
    return inspection
  },

  async update(id: string, patch: Partial<Inspection>): Promise<void> {
    await db.inspections.update(id, { ...patch, updatedAt: nowISO() })
  },

  async softDelete(id: string): Promise<void> {
    const inspection = await db.inspections.get(id)
    if (inspection) {
      // Free the photos this inspection owned.
      for (const item of inspection.items) {
        for (const pid of item.photoIds ?? []) await mediaRepo.remove(pid)
      }
    }
    await db.inspections.update(id, { deletedAt: nowISO(), updatedAt: nowISO() })
  },
}
