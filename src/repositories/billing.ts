import { db, ensureSettings } from '@/db/database'
import type { Expense, Invoice, Payment, PaymentMethod, WorkOrder } from '@/db/types'
import { computeTotals } from '@/lib/calc'
import { approvalIssue } from '@/lib/approval'
import { newId, nowISO } from '@/lib/id'
import { localDate } from '@/lib/businessDate'
import { nextNumber } from './documentNumbers'

export const manualMethods = {
  cash: 'Cash', card: 'Card (external terminal)', bank_transfer: 'Bank transfer',
  paypal: 'PayPal (manual)', other: 'Other',
} as const
export type ManualMethod = keyof typeof manualMethods

export const tenderLabel = (method: PaymentMethod) =>
  method in manualMethods ? manualMethods[method as ManualMethod] : method.toUpperCase()

export { localDate }

function validDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && localDate(new Date(date + 'T12:00:00')) === date
}

export function paymentValue(payment: Payment) {
  if (payment.status === 'paid') return payment.amount
  return payment.status === 'refunded' && payment.reversesPaymentId ? -payment.amount : 0
}

function documentCurrency(source: Pick<Invoice, 'currency' | 'displayCurrency' | 'pegRate'> | undefined, fallback: string) {
  return { currency: source?.currency ?? fallback, displayCurrency: source?.displayCurrency, pegRate: source?.pegRate }
}

export async function jobBillingParties(order: WorkOrder) {
  const [customer, vehicle] = await Promise.all([db.customers.get(order.customerId), db.vehicles.get(order.vehicleId)])
  const active = Boolean(!order.deletedAt && customer && !customer.deletedAt && vehicle && !vehicle.deletedAt && vehicle.customerId === order.customerId)
  return { customer, vehicle, active }
}

export async function issueInvoice(workOrderId: string, terms = '', dueDate = ''): Promise<Invoice> {
  return db.transaction('rw', [db.workOrders, db.invoices, db.payments, db.settings, db.customers, db.vehicles], async () => {
    const existing = await db.invoices.where('workOrderId').equals(workOrderId).first()
    if (existing?.deletedAt) throw new Error('This invoice has been archived.')
    if (existing) return existing
    const order = await db.workOrders.get(workOrderId)
    if (!order || order.deletedAt || order.status !== 'completed') throw new Error('Complete the job before issuing an invoice.')
    const issue = approvalIssue(order)
    if (issue) throw new Error(issue)
    if (dueDate && !validDate(dueDate)) throw new Error('Enter a valid due date.')
    const settings = await ensureSettings()
    const { customer, vehicle, active } = await jobBillingParties(order)
    if (!active) throw new Error('Restore the customer and vehicle before issuing an invoice.')
    const payments = await db.payments.where('workOrderId').equals(workOrderId).toArray()
    const totals = computeTotals(order)
    const currency = order.currency ?? settings.currency
    if (!Number.isSafeInteger(totals.total) || totals.total < 0) throw new Error('Review the estimate total before issuing.')
    if (payments.some(p => p.currency && p.currency !== currency)) throw new Error('The deposit and estimate currencies differ.')
    const amountPaid = payments.reduce((total, p) => total + paymentValue(p), 0)
    if (amountPaid > totals.total) throw new Error('Return the excess deposit before issuing this invoice.')
    const timestamp = nowISO()
    const invoice: Invoice = {
      id: newId(), number: await nextNumber(settings, 'invoiceCounter'), ...documentCurrency(order, currency),
      workOrderId, workOrderNumber: order.number, customerId: order.customerId, vehicleId: order.vehicleId,
      customerName: [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') || customer?.company || 'Customer',
      customerContact: [(customer?.firstName || customer?.lastName) && customer?.company, customer?.address, customer?.phone, customer?.email].filter(Boolean).join(' · '),
      vehicleLabel: [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.licensePlate, vehicle?.vin].filter(Boolean).join(' '),
      shopName: settings.shopName, shopContact: [settings.address, settings.phone, settings.email].filter(Boolean).join(' · '),
      lineItems: order.lineItems, subtotal: totals.itemsSubtotal, shopSupplies: totals.shopSupplies, tax: totals.tax,
      total: totals.total, amountPaid, warrantyTerms: terms.trim() || undefined, dueAt: dueDate || null,
      issuedDate: localDate(timestamp), issuedAt: timestamp, createdAt: timestamp, updatedAt: timestamp,
    }
    await db.invoices.add(invoice)
    await db.payments.where('workOrderId').equals(workOrderId).modify({ invoiceId: invoice.id })
    await db.workOrders.update(workOrderId, { status: 'invoiced', updatedAt: timestamp })
    return invoice
  })
}

interface PaymentInput {
  requestId: string
  workOrderId?: string
  invoiceId?: string
  amount: number
  method: ManualMethod
  isDeposit?: boolean
  reference?: string
}

function checkAmount(amount: number, method: ManualMethod) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Enter an amount greater than zero.')
  if (!Object.prototype.hasOwnProperty.call(manualMethods, method)) throw new Error('Choose a manual payment method.')
}

export async function recordPayment(input: PaymentInput): Promise<Payment> {
  checkAmount(input.amount, input.method)
  if (!input.requestId.trim()) throw new Error('A receipt identifier is required.')
  return db.transaction('rw', [db.payments, db.workOrders, db.invoices, db.settings, db.customers, db.vehicles], async () => {
    const prior = await db.payments.get(input.requestId)
    if (prior) {
      if (prior.reversesPaymentId || prior.amount !== input.amount || prior.method !== input.method || Boolean(prior.isDeposit) !== Boolean(input.isDeposit) ||
        (prior.reference ?? '') !== (input.reference?.trim() ?? '') ||
        (input.invoiceId && prior.invoiceId !== input.invoiceId) || (input.workOrderId && prior.workOrderId !== input.workOrderId)) {
        throw new Error('This receipt identifier already belongs to another payment.')
      }
      return prior
    }
    const invoice = input.invoiceId ? await db.invoices.get(input.invoiceId)
      : input.workOrderId ? await db.invoices.where('workOrderId').equals(input.workOrderId).first() : undefined
    if ((input.invoiceId && !invoice) || invoice?.deletedAt) throw new Error('Invoice unavailable.')
    if (!input.invoiceId && invoice) throw new Error('This job has been invoiced. Open the invoice to record a payment.')
    const workOrderId = invoice?.workOrderId ?? input.workOrderId
    const order = workOrderId ? await db.workOrders.get(workOrderId) : undefined
    if (!invoice && (!input.isDeposit || !order || order.deletedAt || order.status === 'cancelled' || order.status === 'invoiced')) {
      throw new Error('Choose an active job to record a deposit.')
    }
    const settings = await ensureSettings()
    const parties = !invoice && order ? await jobBillingParties(order) : undefined
    if (parties && !parties.active) throw new Error('Restore the customer and vehicle before recording a deposit.')
    const customer = parties?.customer
    const paid = invoice ? invoice.amountPaid : (await db.payments.where('workOrderId').equals(workOrderId!).toArray()).reduce((sum, p) => sum + paymentValue(p), 0)
    const total = invoice ? invoice.total : computeTotals(order!).total
    const balanceAfter = total - paid - input.amount
    if (!Number.isSafeInteger(balanceAfter) || balanceAfter < 0) throw new Error('The amount exceeds the remaining balance.')
    const createdAt = nowISO()
    const receipt: Payment = {
      id: input.requestId, number: await nextNumber(settings, 'receiptCounter'), workOrderId, invoiceId: invoice?.id ?? '',
      method: input.method, amount: input.amount, isDeposit: Boolean(input.isDeposit), status: 'paid',
      ...documentCurrency(invoice ?? order, settings.currency), shopName: invoice?.shopName ?? settings.shopName,
      customerName: invoice?.customerName || [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') || customer?.company || 'Customer',
      documentNumber: invoice?.number ?? order?.number, reference: input.reference?.trim() || undefined,
      balanceAfter, createdAt, recordedDate: localDate(createdAt),
    }
    await db.payments.add(receipt)
    if (invoice) await db.invoices.update(invoice.id, { amountPaid: paid + receipt.amount, updatedAt: createdAt })
    return receipt
  })
}

export async function reversePayment(paymentId: string): Promise<Payment> {
  return db.transaction('rw', [db.invoices, db.payments, db.settings, db.workOrders], async () => {
    const original = await db.payments.get(paymentId)
    if (!original || original.status !== 'paid' || original.reversesPaymentId) throw new Error('Select a paid receipt to reverse.')
    const prior = await db.payments.filter(p => p.reversesPaymentId === paymentId).first()
    if (prior) return prior
    const invoice = original.invoiceId ? await db.invoices.get(original.invoiceId) : undefined
    const order = original.workOrderId ? await db.workOrders.get(original.workOrderId) : undefined
    if (!invoice && !order) throw new Error('The original document is unavailable.')
    const balance = invoice ? invoice.total - invoice.amountPaid
      : computeTotals(order!).total - (await db.payments.where('workOrderId').equals(order!.id).toArray()).reduce((s, p) => s + paymentValue(p), 0)
    const settings = await ensureSettings()
    const createdAt = nowISO()
    const reversal: Payment = { ...original, id: newId(), number: await nextNumber(settings, 'receiptCounter'),
      reversesPaymentId: original.id, status: 'refunded', createdAt, recordedDate: localDate(createdAt),
      currency: original.currency ?? invoice?.currency ?? settings.currency, balanceAfter: balance + original.amount,
      reference: original.number ?? original.reference, documentNumber: invoice?.number ?? original.documentNumber }
    if (invoice && invoice.amountPaid < original.amount) throw new Error('This reversal exceeds the invoice amount paid.')
    await db.payments.add(reversal)
    if (invoice) await db.invoices.update(invoice.id, { amountPaid: invoice.amountPaid - original.amount, updatedAt: createdAt })
    return reversal
  })
}

interface ExpenseInput {
  requestId: string
  date: string
  method: ManualMethod
  currency: string
  description: string
  category: string
  amount: number
}

export function recordExpense(input: ExpenseInput) {
  checkAmount(input.amount, input.method)
  if (!input.requestId || !validDate(input.date) || !input.description.trim() || !/^[A-Z]{3}$/.test(input.currency)) {
    throw new Error('Enter a valid expense date, description and currency.')
  }
  const expense: Expense = { id: input.requestId, date: input.date, description: input.description.trim(),
    category: input.category.trim() || 'General', amount: input.amount, method: input.method, currency: input.currency, createdAt: nowISO() }
  return db.transaction('rw', db.expenses, async () => {
    const prior = await db.expenses.get(expense.id)
    if (prior) {
      if (prior.amount !== expense.amount || prior.date !== expense.date || prior.method !== expense.method ||
          prior.description !== expense.description || prior.currency !== expense.currency || prior.category !== expense.category) {
        throw new Error('This entry identifier already belongs to another expense.')
      }
      return prior
    }
    await db.expenses.add(expense)
    return expense
  })
}

export interface Movement {
  id: string
  date: string
  kind: 'deposit' | 'payment' | 'refund' | 'expense'
  document: string
  description: string
  reference: string
  method: PaymentMethod
  currency: string
  amount: number
}

export async function getDayClose(date: string) {
  const [payments, expenses, invoices] = await db.transaction('r', [db.payments, db.expenses, db.invoices], () => Promise.all([
    db.payments.filter(p => (p.recordedDate ?? localDate(p.createdAt)) === date && paymentValue(p) !== 0).toArray(),
    db.expenses.where('date').equals(date).toArray(),
    db.invoices.filter(i => !i.deletedAt && (i.issuedDate ?? localDate(i.issuedAt)) === date).toArray(),
  ]))
  const movements: Movement[] = payments.map(p => ({
    id: p.id, date, kind: p.reversesPaymentId ? 'refund' : p.isDeposit ? 'deposit' : 'payment',
    document: p.number ?? p.id, description: [p.customerName, p.documentNumber].filter(Boolean).join(' · '),
    reference: p.reference ?? '', method: p.method, currency: p.currency ?? 'USD', amount: paymentValue(p),
  }))
  for (const e of expenses) movements.push({
    id: e.id, date, kind: 'expense', description: e.description, document: e.category, reference: '',
    method: e.method, currency: e.currency, amount: -e.amount,
  })
  return { movements, invoices }
}
