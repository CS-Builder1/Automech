import { db } from '@/db/database'
import type { Vehicle } from '@/db/types'
import { newId, nowISO } from '@/lib/id'

export type NewVehicle = Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>

function checkIdentifier(next: NewVehicle, previous?: Vehicle) {
  const identified = (vehicle: NewVehicle) => [vehicle.licensePlate, vehicle.vin, vehicle.make, vehicle.model].some(value => value?.trim())
  if (!identified(next) && (!previous || identified(previous))) {
    throw new Error('Enter a plate, VIN, make or model to identify this vehicle.')
  }
}

async function requireOwner(id: string) {
  const customer = await db.customers.get(id)
  if (!customer || customer.deletedAt) throw new Error('Restore the customer before changing their vehicles.')
}

export const vehiclesRepo = {
  async list(): Promise<Vehicle[]> {
    const [vehicles, customers] = await Promise.all([db.vehicles.toArray(), db.customers.toArray()])
    const activeOwners = new Set(customers.filter((c) => !c.deletedAt).map((c) => c.id))
    return vehicles.filter((v) => !v.deletedAt && activeOwners.has(v.customerId))
  },

  async forCustomer(customerId: string): Promise<Vehicle[]> {
    const all = await db.vehicles.where('customerId').equals(customerId).toArray()
    const owner = await db.customers.get(customerId)
    return owner && !owner.deletedAt ? all.filter((v) => !v.deletedAt) : []
  },

  async get(id: string): Promise<Vehicle | undefined> {
    return db.vehicles.get(id)
  },

  async create(input: NewVehicle): Promise<Vehicle> {
    return db.transaction('rw', db.vehicles, db.customers, async () => {
      await requireOwner(input.customerId)
      checkIdentifier(input)
      const ts = nowISO()
      const vehicle: Vehicle = { ...input, id: newId(), createdAt: ts, updatedAt: ts, deletedAt: null }
      await db.vehicles.add(vehicle)
      return vehicle
    })
  },

  async update(id: string, patch: Partial<NewVehicle>): Promise<void> {
    await db.transaction('rw', db.vehicles, db.customers, async () => {
      const vehicle = await db.vehicles.get(id)
      if (!vehicle || vehicle.deletedAt) throw new Error('This vehicle is unavailable. Restore the record to make changes.')
      if (patch.customerId && patch.customerId !== vehicle.customerId) throw new Error('The vehicle belongs to another customer.')
      await requireOwner(vehicle.customerId)
      checkIdentifier({ ...vehicle, ...patch }, vehicle)
      await db.vehicles.update(id, { ...patch, customerId: vehicle.customerId, updatedAt: nowISO() })
    })
  },

  async softDelete(id: string): Promise<void> {
    await this.setArchived(id, true)
  },

  async setArchived(id: string, archived: boolean): Promise<void> {
    await db.transaction('rw', db.vehicles, db.customers, async () => {
      const vehicle = await db.vehicles.get(id)
      if (!vehicle) throw new Error('Vehicle not found.')
      await requireOwner(vehicle.customerId)
      const ts = nowISO()
      await db.vehicles.update(id, { deletedAt: archived ? ts : null, updatedAt: ts })
    })
  },
}
