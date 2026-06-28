// Money is stored as integer minor units (cents) to avoid floating-point drift.
// Display supports a pegged secondary currency (e.g. XCD pegged to USD at 2.70).

export function parseAmountToMinor(input: string): number {
  const cleaned = input.replace(/[^0-9.-]/g, '')
  const value = parseFloat(cleaned)
  if (Number.isNaN(value)) return 0
  return Math.round(value * 100)
}

export function minorToDecimal(minor: number): number {
  return minor / 100
}

export interface FormatOptions {
  currency: string
  /** Optional pegged display currency + rate (display units per 1 base unit). */
  displayCurrency?: string
  pegRate?: number
}

function fmt(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(minor / 100)
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`
  }
}

/** Primary formatted amount, with optional pegged secondary in parentheses. */
export function formatMoney(minor: number, opts: FormatOptions): string {
  const primary = fmt(minor, opts.currency)
  if (opts.displayCurrency && opts.pegRate && opts.displayCurrency !== opts.currency) {
    const pegged = fmt(Math.round(minor * opts.pegRate), opts.displayCurrency)
    return `${primary} (${pegged})`
  }
  return primary
}
