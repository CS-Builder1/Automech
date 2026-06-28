import { useSettings } from './useSettings'
import { formatMoney } from '@/lib/money'

/** Returns a formatter bound to the shop's currency + optional pegged display. */
export function useMoney() {
  const settings = useSettings()
  return (minor: number) =>
    formatMoney(minor, {
      currency: settings?.currency ?? 'USD',
      displayCurrency: settings?.displayCurrency,
      pegRate: settings?.pegRate,
    })
}
