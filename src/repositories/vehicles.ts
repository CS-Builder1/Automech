import { db } from '@/db/database'
import type { Vehicle } from '@/db/types'
import { newId, nowISO } from '@/lib/id'

export type NewVehicle = Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>

export const vehiclesRepo = {
  async list(): Promise<Vehicle[]> {
    const all = await db.vehicles.toArray()
    return all.filter((v) => !v.deletedAt)
  },

  async forCustomer(customerId: string): Promise<Vehicle[]> {
    const all = await db.vehicles.where('customerId').equals(customerId).toArray()
    return all.filter((v) => !v.deletedAt)
  },

  async get(id: string): Promise<Vehicle | undefined> {
    return db.vehicles.get(id)
  },

  async create(input: NewVehicle): Promise<Vehicle> {
    const ts = nowISO()
    const vehicle: Vehicle = { ...input, id: newId(), createdAt: ts, updatedAt: ts, deletedAt: null }
    await db.vehicles.put(vehicle)
    return vehicle
  },

  async update(id: string, patch: Partial<NewVehicle>): Promise<void> {
    await db.vehicles.update(id, { ...patch, updatedAt: nowISO() })
  },

  async softDelete(id: string): Promise<void> {
    await db.vehicles.update(id, { deletedAt: nowISO(), updatedAt: nowISO() })
  },
}
