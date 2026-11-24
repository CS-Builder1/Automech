type Row = Record<string, unknown>
export type BackupTables = Record<string, Row[]>

function record(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const text = (v: unknown) => typeof v === 'string'
const id = (v: unknown) => typeof v === 'string' && v.trim().length > 0
const numeric = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
const minor = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v)
const count = (v: unknown) => minor(v) && Number(v) >= 0
export const timestamp = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v))
const bool = (v: unknown) => typeof v === 'boolean'
const currency = (v: unknown) => typeof v === 'string' && /^[A-Z]{3}$/.test(v)
const oneOf = (...values: string[]) => (v: unknown) => typeof v === 'string' && values.includes(v)
const optional = (check: Check) => (v: unknown) => v == null || check(v)
const array = (check: Check) => (v: unknown) => Array.isArray(v) && v.every(check)
type Check = (value: unknown) => boolean
type Fields = Record<string, Check>

function fields(shape: Fields): Check {
  return (value) => record(value) && Object.entries(shape).every(([key, check]) => check(value[key]))
}

function optionalStrings(...names: string[]): Fields {
  return Object.fromEntries(names.map(name => [name, optional(text)]))
}

const line = fields({
  id, kind: oneOf('part', 'labor', 'fee', 'sublet', 'discount'), description: text,
  quantity: numeric, unitPrice: minor, taxable: bool,
  ...optionalStrings('partNumber', 'supplier'), hours: optional(numeric),
  partStatus: optional(oneOf('needed', 'quoted', 'ordered', 'received')),
  unitCost: optional(minor), hourlyCost: optional(minor), actualHours: optional(numeric),
})
const approval = fields({
  authorizedBy: text, method: oneOf('in_person', 'phone', 'sms', 'email', 'signature', 'online'),
  authorizedAt: timestamp, amountAuthorized: minor, signatureDataUrl: optional(text),
  id: optional(id), note: optional(text), currency: optional(currency), revision: optional(count),
})
const common = { createdAt: timestamp, updatedAt: timestamp, deletedAt: optional(timestamp) }
const paymentMethod = oneOf('cash', 'card', 'bank_transfer', 'stripe', 'wipay', 'fac', 'paypal', 'other')
const shapes: Record<string, Fields> = {
  customers: {
    ...common, firstName: text, lastName: text, ...optionalStrings('company', 'phone', 'email', 'address', 'notes'),
    taxExempt: optional(bool), laborRateOverride: optional(minor), partsMarkupOverride: optional(numeric),
  },
  vehicles: {
    ...common, customerId: id, type: oneOf('car', 'truck', 'motorcycle', 'other'),
    ...optionalStrings('vin', 'make', 'model', 'trim', 'engine', 'color', 'licensePlate', 'notes'),
    year: optional(count), mileage: optional(count),
  },
  workOrders: {
    ...common, number: id, customerId: id, vehicleId: id,
    status: oneOf('estimate', 'awaiting_approval', 'approved', 'in_progress', 'awaiting_parts', 'quality_check', 'completed', 'invoiced', 'cancelled'),
    ...optionalStrings('complaint', 'diagnosis', 'notes'), mileageIn: optional(count), mileageOut: optional(count),
    promisedAt: optional(timestamp), shopSuppliesPct: optional(numeric), taxRatePct: optional(numeric),
    lineItems: array(line), declinedItems: optional(array(line)),
    authorization: optional(approval), authorizations: optional(array(approval)), currency: optional(currency),
  },
  invoices: {
    ...common, number: id, workOrderId: id, customerId: id, vehicleId: id,
    ...optionalStrings('warrantyTerms', 'shopName', 'shopContact', 'customerName', 'customerContact', 'vehicleLabel', 'workOrderNumber'),
    issuedAt: timestamp, dueAt: optional(timestamp), lineItems: array(line), subtotal: minor, shopSupplies: minor,
    tax: minor, total: minor, amountPaid: minor, currency: optional(currency),
  },
  payments: {
    createdAt: timestamp, method: paymentMethod, status: oneOf('pending', 'paid', 'failed', 'refunded'),
    amount: minor, invoiceId: text, ...optionalStrings('number', 'reference', 'note'), isDeposit: optional(bool), currency: optional(currency), balanceAfter: optional(minor),
  },
  media: { createdAt: timestamp, mimeType: text, blob: (v) => v instanceof Blob },
  inspections: {
    ...common, customerId: id, vehicleId: id, templateName: text,
    items: array(fields({ id, label: text, note: optional(text), rating: oneOf('green', 'yellow', 'red', 'na'), photoIds: optional(array(id)) })),
  },
  appointments: { ...common, title: text, notes: optional(text), startAt: timestamp, endAt: optional(timestamp) },
  expenses: {
    createdAt: timestamp, date: (v) => typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) && timestamp(v),
    description: text, category: text, amount: (v) => count(v) && Number(v) > 0, currency, method: paymentMethod,
  },
  settings: {
    shopName: text, ...optionalStrings('ownerName', 'phone', 'email', 'address', 'logoDataUrl'),
    currency, displayCurrency: optional(currency), pegRate: optional(numeric), defaultLaborRate: minor, defaultPartsMarkupPct: numeric,
    defaultTaxRatePct: numeric, shopSuppliesPct: numeric, roCounter: count,
    invoiceCounter: count, receiptCounter: optional(count), updatedAt: timestamp,
  },
}

const links: Record<string, Record<string, string>> = {
  vehicles: { customerId: 'customers' },
  workOrders: { customerId: 'customers', vehicleId: 'vehicles' },
  invoices: { customerId: 'customers', vehicleId: 'vehicles', workOrderId: 'workOrders' },
  payments: { invoiceId: 'invoices', workOrderId: 'workOrders', reversesPaymentId: 'payments' },
  inspections: { customerId: 'customers', vehicleId: 'vehicles', workOrderId: 'workOrders' },
  appointments: { customerId: 'customers', vehicleId: 'vehicles', workOrderId: 'workOrders' },
}

/** Keep deleted rows in the snapshot: historical jobs and invoices can still refer to them. */
export function validateRecords(tables: BackupTables) {
  const ids = new Map<string, Set<string>>()
  for (const [table, rows] of Object.entries(tables)) {
    const seen = new Set<string>()
    ids.set(table, seen)
    const shape = shapes[table]
    if (!shape) throw new Error(`Unsupported backup table: ${table}.`)
    for (const row of rows) {
      if (!record(row) || typeof row.id !== 'string' || !id(row.id) || seen.has(row.id)) {
        throw new Error(`Missing or duplicate record ID in ${table}.`)
      }
      seen.add(row.id)
      for (const [field, check] of Object.entries(shape)) {
        if (!check(row[field])) throw new Error(`Invalid ${table} record (${field}).`)
      }
    }
  }
  if (tables.settings.length !== 1 || !ids.get('settings')?.has('singleton')) {
    throw new Error('The backup needs exactly one shop settings record.')
  }
  for (const [table, references] of Object.entries(links)) {
    for (const row of tables[table]) {
      for (const [field, target] of Object.entries(references)) {
        const value = row[field]
        if (value == null || value === '') continue
        if (typeof value !== 'string' || !ids.get(target)?.has(value)) {
          throw new Error(`A ${table} record references missing data in ${target}.`)
        }
      }
      if (table === 'payments' && !row.invoiceId && !row.workOrderId) {
        throw new Error('A payment is missing its invoice or work order.')
      }
      if (table === 'inspections') {
        for (const item of row.items as { photoIds?: string[] }[]) {
          if (item.photoIds?.some(photo => !ids.get('media')?.has(photo))) {
            throw new Error('An inspection photo is missing from the backup.')
          }
        }
      }
    }
  }
  // A restored counter must never issue a number already present in the backup.
  for (const [table, prefix, counter] of [
    ['workOrders', 'RO-', 'roCounter'], ['invoices', 'INV-', 'invoiceCounter'], ['payments', 'RCT-', 'receiptCounter'],
  ]) {
    for (const row of tables[table]) {
      const number = row.number
      if (typeof number !== 'string' || !number.startsWith(prefix)) continue
      const suffix = number.slice(prefix.length)
      if (/^\d+$/.test(suffix) && Number(suffix) > Number(tables.settings[0][counter] ?? 0)) {
        throw new Error(`The ${counter} is behind an existing document number.`)
      }
    }
  }
}
