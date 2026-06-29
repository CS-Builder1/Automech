import { db } from '@/db/database'
import type { Payment } from '@/db/types'
import { newId, nowISO } from '@/lib/id'
import { invoicesRepo } from './invoices'

export type NewPayment = Omit<Payment, 'id' | 'createdAt'>

export const paymentsRepo = {
  async forInvoice(invoiceId: string): Promise<Payment[]> {
    const all = await db.payments.where('invoiceId').equals(invoiceId).toArray()
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  },

  async record(input: NewPayment): Promise<Payment> {
    const payment: Payment = { ...input, id: newId(), createdAt: nowISO() }
    await db.payments.put(payment)
    await invoicesRepo.refreshPaid(input.invoiceId)
    return payment
  },

  async remove(id: string): Promise<void> {
    const payment = await db.payments.get(id)
    await db.payments.delete(id)
    if (payment) await invoicesRepo.refreshPaid(payment.invoiceId)
  },
}
