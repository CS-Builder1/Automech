export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime()
}

export function isToday(d: Date): boolean {
  return isSameDay(d, new Date())
}

/** "Today", "Tomorrow", "Yesterday", else a short weekday + date. */
export function relativeDayLabel(d: Date): string {
  const today = startOfDay(new Date())
  const day = startOfDay(d)
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** Build a value for <input type="datetime-local"> from an ISO string (local tz). */
export function toLocalInputValue(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16)
}

/** Parse a <input type="datetime-local"> value back to an ISO string. */
export function fromLocalInputValue(value: string): string {
  return new Date(value).toISOString()
}

export function toDateInputValue(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}
