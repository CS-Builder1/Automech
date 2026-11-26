// Money is stored as integer minor units (cents) to avoid floating-point drift.
// Display supports a pegged secondary currency (e.g. XCD pegged to USD at 2.70).

export function parseAmountToMinor(input: string): number {
  const value = input.trim()
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) {
    throw new Error('Enter a nonnegative amount with up to two decimal places and no grouping separators.')
  }
  const [whole, fraction = ''] = value.split(/[.,]/)
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(minor)) throw new Error('Amount is too large.')
  return minor
}

function parseNonnegativeDecimal(input: string, label: string): number {
  const raw = input.trim()
  const value = Number(raw.replace(',', '.'))
  if (!/^\d+(?:[.,]\d+)?$/.test(raw) || /,\d{3}$/.test(raw) || value > Number.MAX_SAFE_INTEGER) {
    throw new Error(label + ' must be a nonnegative number without grouping separators.')
  }
  return value
}

export function parseRate(input: string, label = 'Rate'): number {
  return parseNonnegativeDecimal(input, label)
}

export function parseQuantity(input: string): number {
  return parseNonnegativeDecimal(input, 'Quantity')
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

export function displayPair(currency: string, displayCurrency?: string, pegRate?: number): Pick<FormatOptions, 'displayCurrency' | 'pegRate'> {
  return displayCurrency && displayCurrency !== currency && pegRate !== undefined && Number.isFinite(pegRate) && pegRate > 0
    ? { displayCurrency, pegRate }
    : {}
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
