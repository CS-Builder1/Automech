import { db, ensureSettings } from '@/db/database'
import type { Invoice, WorkOrder } from '@/db/types'
import { newId, nowISO } from '@/lib/id'
import { computeTotals } from '@/lib/calc'

async function nextInvoiceNumber(): Promise<string> {
  return db.transaction('rw', db.settings, async () => {
    const s = (await db.settings.get('singleton')) ?? (await ensureSettings())
    const next = (s.invoiceCounter ?? 1000) + 1
    await db.settings.update('singleton', { invoiceCounter: next, updatedAt: nowISO() })
    return `INV-${next}`
  })
}

export const invoicesRepo = {
  async list(): Promise<Invoice[]> {
    const all = await db.invoices.toArray()
    return all.filter((i) => !i.deletedAt).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  },

  async get(id: string): Promise<Invoice | undefined> {
    return db.invoices.get(id)
  },

  async forCustomer(customerId: string): Promise<Invoice[]> {
    const all = await db.invoices.where('customerId').equals(customerId).toArray()
    return all.filter((i) => !i.deletedAt).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  },

  async forWorkOrder(workOrderId: string): Promise<Invoice | undefined> {
    const all = await db.invoices.where('workOrderId').equals(workOrderId).toArray()
    return all.find((i) => !i.deletedAt)
  },

  /** Convert a (snapshot of a) repair order into an itemized invoice and mark the RO invoiced. */
  async createFromWorkOrder(wo: WorkOrder): Promise<Invoice> {
    const existing = await this.forWorkOrder(wo.id)
    if (existing) return existing

    const t = computeTotals(wo)
    const ts = nowISO()
    const invoice: Invoice = {
      id: newId(),
      number: await nextInvoiceNumber(),
      workOrderId: wo.id,
      customerId: wo.customerId,
      vehicleId: wo.vehicleId,
      lineItems: wo.lineItems.map((li) => ({ ...li })), // snapshot
      subtotal: t.itemsSubtotal,
      shopSupplies: t.shopSupplies,
      tax: t.tax,
      total: t.total,
      amountPaid: 0,
      issuedAt: ts,
      dueAt: null,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
    }
    await db.invoices.put(invoice)
    await db.workOrders.update(wo.id, { status: 'invoiced', updatedAt: ts })
    return invoice
  },

  async update(id: string, patch: Partial<Invoice>): Promise<void> {
    await db.invoices.update(id, { ...patch, updatedAt: nowISO() })
  },

  /** Recompute amountPaid from recorded payments. Returns the new paid total. */
  async refreshPaid(invoiceId: string): Promise<number> {
    const payments = (await db.payments.where('invoiceId').equals(invoiceId).toArray())
      .filter((p) => p.status === 'paid')
    const amountPaid = payments.reduce((sum, p) => sum + p.amount, 0)
    await db.invoices.update(invoiceId, { amountPaid, updatedAt: nowISO() })
    return amountPaid
  },

  async softDelete(id: string): Promise<void> {
    await db.invoices.update(id, { deletedAt: nowISO(), updatedAt: nowISO() })
  },
}
