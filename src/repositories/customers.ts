import { db } from '@/db/database'
import type { Customer } from '@/db/types'
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
    const q = query.trim().toLowerCase()
    const all = await this.list()
    if (!q) return all
    return all.filter((c) =>
      [c.firstName, c.lastName, c.company, c.phone, c.email]
        .filter(Boolean)
        .some((f) => f!.toLowerCase().includes(q)),
    )
  },

  async create(input: NewCustomer): Promise<Customer> {
    const ts = nowISO()
    const customer: Customer = { ...input, id: newId(), createdAt: ts, updatedAt: ts, deletedAt: null }
    await db.customers.put(customer)
    return customer
  },

  async update(id: string, patch: Partial<NewCustomer>): Promise<void> {
    await db.customers.update(id, { ...patch, updatedAt: nowISO() })
  },

  async softDelete(id: string): Promise<void> {
    await db.customers.update(id, { deletedAt: nowISO(), updatedAt: nowISO() })
  },
}
