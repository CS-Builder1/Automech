import { useSettings } from './useSettings'
import { formatMoney, type FormatOptions } from '@/lib/money'

/** A stored document always supplies its own billing and display currencies. */
export function useMoney() {
  const settings = useSettings()
  return (minor: number, source?: string | Partial<FormatOptions>) => {
    if (typeof source === 'string') return formatMoney(minor, { currency: source })
    const options = source ?? settings
    return formatMoney(minor, { currency: options?.currency ?? 'USD', displayCurrency: options?.displayCurrency, pegRate: options?.pegRate })
  }
}
