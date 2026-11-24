import { useSettings } from './useSettings'
import { formatMoney } from '@/lib/money'

/** Returns a formatter bound to the shop's currency + optional pegged display. */
export function useMoney() {
  const settings = useSettings()
  return (minor: number, currency = settings?.currency ?? 'USD') =>
    formatMoney(minor, {
      currency,
      displayCurrency: currency === settings?.currency ? settings?.displayCurrency : undefined,
      pegRate: settings?.pegRate,
    })
}
