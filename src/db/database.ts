import Dexie, { type Table } from 'dexie'
import { dateFromTimestamp } from '@/lib/businessDate'
import { normalizeLegacyOrder } from '@/lib/approval'
import type {
  Customer, Vehicle, WorkOrder, Invoice, Payment,
  Inspection, MediaAsset, Appointment, ShopSettings, Expense,
} from './types'

/**
 * Local-first IndexedDB store. This is the source of truth on-device so the app
 * works fully offline; a sync engine (later sprint) reconciles with Supabase.
 */
export class AutomechDB extends Dexie {
  customers!: Table<Customer, string>
  vehicles!: Table<Vehicle, string>
  workOrders!: Table<WorkOrder, string>
  invoices!: Table<Invoice, string>
  payments!: Table<Payment, string>
  expenses!: Table<Expense, string>
  inspections!: Table<Inspection, string>
  media!: Table<MediaAsset, string>
  appointments!: Table<Appointment, string>
  settings!: Table<ShopSettings, string>

  constructor(name = 'automech') {
    super(name)
    this.version(1).stores({
      customers: 'id, lastName, firstName, phone, email, updatedAt, deletedAt',
      vehicles: 'id, customerId, vin, licensePlate, make, model, updatedAt, deletedAt',
      workOrders: 'id, number, customerId, vehicleId, status, updatedAt, deletedAt',
      invoices: 'id, number, workOrderId, customerId, issuedAt, updatedAt, deletedAt',
      payments: 'id, invoiceId, method, status, createdAt',
      inspections: 'id, workOrderId, vehicleId, customerId, updatedAt, deletedAt',
      media: 'id, createdAt',
      appointments: 'id, customerId, vehicleId, workOrderId, startAt, updatedAt, deletedAt',
      settings: 'id',
    })
    this.version(2).stores({}).upgrade(async (tx) => {
      const settings = await tx.table('settings').get('singleton')
      const invoiced = new Set(await tx.table('invoices').orderBy('workOrderId').uniqueKeys())
      await tx.table<WorkOrder>('workOrders').toCollection().modify((order) => {
        Object.assign(order, normalizeLegacyOrder(order, settings?.currency ?? 'USD', settings?.displayCurrency, settings?.pegRate))
        if (order.status === 'invoiced' && !invoiced.has(order.id)) order.status = 'completed'
      })
    })
    this.version(3).stores({
      payments: 'id, number, invoiceId, workOrderId, method, status, createdAt',
      expenses: 'id, date, createdAt',
    }).upgrade(async (tx) => {
      // Earlier builds had financial tables, without a currency on the documents.
      const settings = await tx.table('settings').get('singleton')
      const currency = settings?.currency || 'USD'
      const invoices = new Map<string, Invoice>()
      await tx.table<Invoice>('invoices').toCollection().modify((invoice) => {
        invoice.currency ??= currency
        invoice.issuedDate ??= dateFromTimestamp(invoice.issuedAt)
        invoices.set(invoice.id, invoice)
      })
      await tx.table<Payment>('payments').toCollection().modify((payment) => {
        const invoice = invoices.get(payment.invoiceId)
        payment.currency ??= invoice?.currency ?? currency
        payment.workOrderId ??= invoice?.workOrderId
        payment.recordedDate ??= dateFromTimestamp(payment.createdAt)
      })
    })
  }
}

export const db = new AutomechDB()

const SETTINGS_DEFAULTS: ShopSettings = {
  id: 'singleton',
  shopName: 'My Shop',
  currency: 'USD',
  displayCurrency: undefined,
  pegRate: undefined,
  defaultLaborRate: 9000,     // $90.00 / hr
  defaultPartsMarkupPct: 30,
  defaultTaxRatePct: 0,
  shopSuppliesPct: 0,
  roCounter: 1000,
  invoiceCounter: 1000,
  updatedAt: new Date().toISOString(),
}

/** Ensure the singleton settings row exists. Safe to call on every boot. */
export async function ensureSettings(): Promise<ShopSettings> {
  return db.transaction('rw', db.settings, async () => {
    const existing = await db.settings.get('singleton')
    if (existing) return existing
    await db.settings.add(SETTINGS_DEFAULTS)
    return SETTINGS_DEFAULTS
  })
}
