import { newId } from './id'

export interface IntakeDraft {
  customerId: string
  vehicleId: string
  complaint: string
  mileageIn: string
}

const prefix = 'automech.intake.'
const currentTab = prefix + 'current'

export function readDraft(id: string): IntakeDraft | null {
  const raw = localStorage.getItem(prefix + id)
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    if (value && ['customerId', 'vehicleId', 'complaint', 'mileageIn'].every(key => typeof value[key] === 'string')) {
      return value as IntakeDraft
    }
  } catch { /* An incomplete draft cannot be resumed. */ }
  return null
}

export function saveDraft(id: string, draft: IntakeDraft) {
  localStorage.setItem(prefix + id, JSON.stringify(draft))
  sessionStorage.setItem(currentTab, id)
}

export function beginIntake(params: URLSearchParams): string {
  const supplied = params.get('draft')
  const previous = supplied || sessionStorage.getItem(currentTab)
  const customerId = params.get('customerId') || ''
  const vehicleId = params.get('vehicleId') || ''
  if (previous) {
    const saved = readDraft(previous)
    if (saved && (!customerId || saved.customerId === customerId) && (!vehicleId || saved.vehicleId === vehicleId)) return previous
  }
  const id = newId()
  saveDraft(id, { customerId, vehicleId, complaint: '', mileageIn: '' })
  return id
}

export function finishIntake(id: string) {
  const key = prefix + id
  for (const stored of Object.keys(localStorage)) {
    if (stored === key || stored.startsWith(key + '.')) localStorage.removeItem(stored)
  }
  if (sessionStorage.getItem(currentTab) === id) sessionStorage.removeItem(currentTab)
}

export function intakePath(id: string) {
  return '/jobs/new?' + new URLSearchParams({ draft: id })
}

export function requireDraft(id: string) {
  const draft = readDraft(id)
  if (!draft) throw new Error('This intake draft has already been closed. Open a new job to continue.')
  return draft
}

export function afterRecordCreated(
  draftId: string | null, formKey: string | null, selection: Pick<IntakeDraft, 'customerId' | 'vehicleId'>, recordPath: string,
): string {
  if (!draftId) return recordPath
  try {
    saveDraft(draftId, { ...requireDraft(draftId), ...selection })
    saveIntakeForm(formKey, null)
    return intakePath(draftId)
  } catch {
    // The record was committed even if the device can no longer save its intake draft.
    return recordPath
  }
}

/** Accept whole odometer readings with optional groups of thousands. */
export function parseMileage(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(trimmed)) return NaN
  const miles = Number(trimmed.replace(/,/g, ''))
  return Number.isSafeInteger(miles) ? miles : NaN
}

export function readIntakeForm<T extends object>(key: string | null, defaults: T): T {
  if (!key) return defaults
  try {
    const raw = JSON.parse(localStorage.getItem(prefix + key) || '{}')
    const form = { ...defaults }
    for (const field of Object.keys(defaults) as Array<keyof T>) {
      if (raw && typeof raw[field] === typeof defaults[field]) form[field] = raw[field]
    }
    return form
  } catch {
    return defaults
  }
}

export function saveIntakeForm(key: string | null, form: object | null) {
  if (!key) return
  if (form) localStorage.setItem(prefix + key, JSON.stringify(form))
  else localStorage.removeItem(prefix + key)
}
