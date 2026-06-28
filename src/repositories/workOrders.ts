import { db, ensureSettings } from '@/db/database'
import type { WorkOrder, WorkOrderStatus } from '@/db/types'
import { newId, nowISO } from '@/lib/id'

export type NewWorkOrder = Omit<WorkOrder, 'id' | 'number' | 'createdAt' | 'updatedAt' | 'deletedAt'>

/** Atomically increment the RO counter and return the next human-friendly number. */
async function nextRoNumber(): Promise<string> {
  return db.transaction('rw', db.settings, async () => {
    const s = (await db.settings.get('singleton')) ?? (await ensureSettings())
    const next = (s.roCounter ?? 1000) + 1
    await db.settings.update('singleton', { roCounter: next, updatedAt: nowISO() })
    return `RO-${next}`
  })
}

export const workOrdersRepo = {
  async list(): Promise<WorkOrder[]> {
    const all = await db.workOrders.toArray()
    return all
      .filter((w) => !w.deletedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },

  async get(id: string): Promise<WorkOrder | undefined> {
    return db.workOrders.get(id)
  },

  async forCustomer(customerId: string): Promise<WorkOrder[]> {
    const all = await db.workOrders.where('customerId').equals(customerId).toArray()
    return all.filter((w) => !w.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },

  async forVehicle(vehicleId: string): Promise<WorkOrder[]> {
    const all = await db.workOrders.where('vehicleId').equals(vehicleId).toArray()
    return all.filter((w) => !w.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },

  async create(input: NewWorkOrder): Promise<WorkOrder> {
    const ts = nowISO()
    const wo: WorkOrder = {
      ...input,
      id: newId(),
      number: await nextRoNumber(),
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
    }
    await db.workOrders.put(wo)
    return wo
  },

  async update(id: string, patch: Partial<WorkOrder>): Promise<void> {
    await db.workOrders.update(id, { ...patch, updatedAt: nowISO() })
  },

  async setStatus(id: string, status: WorkOrderStatus): Promise<void> {
    await db.workOrders.update(id, { status, updatedAt: nowISO() })
  },

  async softDelete(id: string): Promise<void> {
    await db.workOrders.update(id, { deletedAt: nowISO(), updatedAt: nowISO() })
  },
}
