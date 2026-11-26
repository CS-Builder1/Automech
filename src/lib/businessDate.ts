export function localDate(value: Date | string) {
  const d = typeof value === 'string' ? new Date(value) : value
  const pad = (n: number) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

/** A legacy document can lack both its business date and its original timestamp. */
export function dateFromTimestamp(timestamp: string | undefined) {
  if (!timestamp) return undefined
  const date = new Date(timestamp)
  return Number.isFinite(date.getTime()) ? localDate(date) : undefined
}
