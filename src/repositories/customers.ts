import { db } from '@/db/database'
import type { Customer } from '@/db/types'
import { findRecords, indexRecords } from '@/lib/records'
import { newId, nowISO } from '@/lib/id'

export type NewCustomer = Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>

export const customersRepo = {
  async list(): Promise<Customer[]> {
    const all = await db.customers.orderBy('lastName').toArray()
    return all.filter((c) => !c.deletedAt)
  },

  async get(id: string): Promise<Customer | undefined> {
    return db.customers.get(id)
  },

  async search(query: string): Promise<Customer[]> {
    return db.transaction('r', db.customers, db.vehicles, db.workOrders, async () => {
      const [customers, vehicles, jobs] = await Promise.all([
        db.customers.toArray(), db.vehicles.toArray(), db.workOrders.toArray(),
      ])
      return findRecords(indexRecords(customers, vehicles, jobs), query, false).customers
    })
  },

  async create(input: NewCustomer): Promise<Customer> {
    const ts = nowISO()
    const customer: Customer = { ...input, id: newId(), createdAt: ts, updatedAt: ts, deletedAt: null }
    await db.customers.add(customer)
    return customer
  },

  async update(id: string, patch: Partial<NewCustomer>): Promise<void> {
    await db.transaction('rw', db.customers, async () => {
      const customer = await db.customers.get(id)
      if (!customer || customer.deletedAt) throw new Error('This customer is unavailable. Restore the record to make changes.')
      await db.customers.update(id, { ...patch, updatedAt: nowISO() })
    })
  },

  async softDelete(id: string): Promise<void> {
    await this.setArchived(id, true)
  },

  async setArchived(id: string, archived: boolean): Promise<void> {
    const ts = nowISO()
    if (!await db.customers.update(id, { deletedAt: archived ? ts : null, updatedAt: ts })) throw new Error('Customer not found.')
  },
}
