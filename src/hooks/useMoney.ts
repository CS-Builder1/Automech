import { useSettings } from './useSettings'
import { formatMoney, type FormatOptions } from '@/lib/money'
import { computeTotals } from '@/lib/calc'
import type { Invoice, WorkOrder } from '@/db/types'

function formatDocumentMoney(minor: number, source?: Partial<FormatOptions>) {
  return formatMoney(minor, {currency: source?.currency ?? 'USD', displayCurrency: source?.displayCurrency, pegRate: source?.pegRate})
}

export function formatJobTotal(job: WorkOrder, invoice?: Invoice) {
  return formatDocumentMoney(invoice?.total ?? computeTotals(job).total, invoice ?? job)
}

/** A stored document always supplies its own billing and display currencies. */
export function useMoney() {
  const settings = useSettings()
  return (minor: number, source?: string | Partial<FormatOptions>) => {
    if (typeof source === 'string') return formatMoney(minor, { currency: source })
    return formatDocumentMoney(minor, source ?? settings)
  }
}
