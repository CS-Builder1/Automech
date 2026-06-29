import Dexie, { type Table } from 'dexie'
import type {
  Customer, Vehicle, WorkOrder, Invoice, Payment,
  Inspection, MediaAsset, Appointment, Reminder, ShopSettings,
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
  inspections!: Table<Inspection, string>
  media!: Table<MediaAsset, string>
  appointments!: Table<Appointment, string>
  reminders!: Table<Reminder, string>
  settings!: Table<ShopSettings, string>

  constructor() {
    super('automech')
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
    // v2: service / inspection reminders.
    this.version(2).stores({
      reminders: 'id, customerId, vehicleId, type, dueDate, completedAt, deletedAt',
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
  const existing = await db.settings.get('singleton')
  if (existing) return existing
  await db.settings.put(SETTINGS_DEFAULTS)
  return SETTINGS_DEFAULTS
}
