import { db } from '@/db/database'
import type { ShopSettings } from '@/db/types'
import { nowISO } from '@/lib/id'

const documents = {
  roCounter: { table: db.workOrders, prefix: 'RO-' },
  invoiceCounter: { table: db.invoices, prefix: 'INV-' },
  receiptCounter: { table: db.payments, prefix: 'RCT-' },
}

/** Allocate inside the write transaction that creates the document. */
export async function nextNumber(settings: ShopSettings, key: keyof typeof documents) {
  const { table, prefix } = documents[key]
  let count = settings[key] ?? 1000
  // Legacy documents, including archived jobs, can be ahead of the counter.
  do {
    count += 1
    if (!Number.isSafeInteger(count)) throw new Error('Document number is too large.')
  } while (await table.where('number').equals(prefix + count).count())
  await db.settings.update('singleton', { [key]: count, updatedAt: nowISO() })
  return prefix + count
}
