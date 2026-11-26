import type { AuthorizationRecord, Customer, EstimateSnapshot, Vehicle, WorkOrder, WorkOrderStatus } from '@/db/types'
import { computeTotals, checkAuthorization } from './calc'
import { displayPair } from './money'

export function approvalHistory(order: WorkOrder): AuthorizationRecord[] {
  return order.authorizations ?? (order.authorization ? [order.authorization] : [])
}

export function normalizeLegacyOrder(order: WorkOrder, shopCurrency: string, displayCurrency?: string, pegRate?: number): WorkOrder {
  const currency = order.currency ?? shopCurrency
  const authorizations = approvalHistory(order).map((record, index) => ({
    ...record, currency: record.currency ?? currency, revision: record.revision ?? index + 1,
  }))
  const pair = currency === shopCurrency ? displayPair(currency, displayCurrency, pegRate) : {}
  return { ...pair, ...order, currency, authorizations, authorization: authorizations[authorizations.length - 1] }
}

export function estimateSnapshot(order: WorkOrder, customer?: Customer, vehicle?: Vehicle): EstimateSnapshot {
  return {
    currency: order.currency ?? 'USD',
    ...displayPair(order.currency ?? 'USD', order.displayCurrency, order.pegRate),
    ...(customer && { customerLabel: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.company || 'Customer' }),
    ...(vehicle && { vehicleLabel: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.vin || vehicle.type,
      vehiclePlate: vehicle.licensePlate }),
    lineItems: order.lineItems.map(({ id, kind, description, quantity, unitPrice, taxable, partNumber }) =>
      ({ id, kind, description, quantity, unitPrice, taxable, ...(partNumber ? { partNumber } : {}) })),
    shopSuppliesPct: order.shopSuppliesPct ?? 0,
    taxRatePct: order.taxRatePct ?? 0,
  }
}

/** Compare individual fields so restored objects can have any property order. */
export function sameEstimate(a: EstimateSnapshot, b: EstimateSnapshot): boolean {
  return a.currency === b.currency && a.displayCurrency === b.displayCurrency && a.pegRate === b.pegRate && a.taxRatePct === b.taxRatePct && a.shopSuppliesPct === b.shopSuppliesPct &&
    a.lineItems.length === b.lineItems.length && a.lineItems.every((line, i) => {
      const other = b.lineItems[i]
      return line.id === other.id && line.kind === other.kind && line.description === other.description &&
        line.partNumber === other.partNumber && line.quantity === other.quantity &&
        line.unitPrice === other.unitPrice && line.taxable === other.taxable
    })
}

export function approvalIssue(order: WorkOrder): string | null {
  const history = approvalHistory(order)
  const latest = history[history.length - 1]
  if (!latest) return 'Capture customer approval before advancing this job.'
  if (!latest.snapshot) return 'Re-approval required. Confirm the itemized estimate for this legacy approval.'
  if (latest.method === 'signature' && !latest.signatureDataUrl) return 'Re-approval required. A signature is missing.'
  const total = computeTotals(order).total
  if (checkAuthorization(total, latest.amountAuthorized).needsReauth) {
    return 'Re-approval required. The total exceeds the authorized limit.'
  }
  if (!sameEstimate(latest.snapshot, estimateSnapshot(order)) || latest.amountAuthorized !== total) {
    return 'Re-approval required. The itemized estimate has changed.'
  }
  return null
}

export function needsApproval(status: WorkOrderStatus): boolean {
  return ['approved', 'in_progress', 'awaiting_parts', 'quality_check', 'completed', 'invoiced'].includes(status)
}
