import type { LineItem } from '@/db/types'

/** Signed total for a single line, in minor units. Discounts subtract. */
export function lineTotal(li: LineItem): number {
  const base = Math.round((li.quantity || 0) * (li.unitPrice || 0))
  return li.kind === 'discount' ? -Math.abs(base) : base
}

export interface Totals {
  itemsSubtotal: number
  shopSupplies: number
  taxable: number
  tax: number
  total: number
  partsCost: number   // what the shop pays for parts (margin insight)
  grossProfit: number // total (ex-tax) minus parts cost
}

/** Compute an RO/invoice breakdown from its line items + its tax/supply rates. */
export function computeTotals(input: {
  lineItems: LineItem[]
  shopSuppliesPct?: number
  taxRatePct?: number
}): Totals {
  const items = input.lineItems ?? []
  const itemsSubtotal = items.reduce((sum, li) => sum + lineTotal(li), 0)

  const suppliesBase = items
    .filter((li) => li.kind === 'labor' || li.kind === 'part')
    .reduce((sum, li) => sum + lineTotal(li), 0)
  const shopSupplies = Math.round((suppliesBase * (input.shopSuppliesPct ?? 0)) / 100)

  const taxable = items.filter((li) => li.taxable).reduce((sum, li) => sum + lineTotal(li), 0)
  const tax = Math.round((taxable * (input.taxRatePct ?? 0)) / 100)

  const total = itemsSubtotal + shopSupplies + tax

  const partsCost = items
    .filter((li) => li.kind === 'part' || li.kind === 'sublet')
    .reduce((sum, li) => sum + Math.round((li.quantity || 0) * (li.unitCost || 0)), 0)
  const grossProfit = itemsSubtotal + shopSupplies - partsCost

  return { itemsSubtotal, shopSupplies, taxable, tax, total, partsCost, grossProfit }
}

export interface AuthCheck {
  /** Total exceeds the authorized cap at all. */
  exceeds: boolean
  /** Exceeds by more than the legal-style 10% re-authorization threshold. */
  needsReauth: boolean
  overBy: number
  overPct: number
}

/**
 * Dispute-proofing guardrail: many jurisdictions require re-authorization when a
 * bill exceeds the approved estimate (commonly by >10%). Surface that automatically.
 */
export function checkAuthorization(total: number, amountAuthorized?: number): AuthCheck {
  if (!amountAuthorized || amountAuthorized <= 0) {
    return { exceeds: false, needsReauth: false, overBy: 0, overPct: 0 }
  }
  const overBy = total - amountAuthorized
  const overPct = (overBy / amountAuthorized) * 100
  return {
    exceeds: overBy > 0,
    needsReauth: overPct > 10,
    overBy,
    overPct,
  }
}
