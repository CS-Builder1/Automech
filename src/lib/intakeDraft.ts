import type { Table } from 'dexie'
import { db } from '@/db/database'
import { newId } from './id'

export interface IntakeDraft {
  customerId: string
  vehicleId: string
  complaint: string
  mileageIn: string
}

const prefix = 'automech.intake.'
const currentTab = prefix + 'current'
const retentionMs = 14 * 24 * 60 * 60 * 1000
const closedMessage = 'This intake draft has already been closed. Open a new job to continue.'
type StoredDraft = IntakeDraft & { updatedAt?: number }

export function readDraft(id: string): StoredDraft | null {
  const raw = localStorage.getItem(prefix + id)
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    if (value && ['customerId', 'vehicleId', 'complaint', 'mileageIn'].every(key => typeof value[key] === 'string')) {
      return value as StoredDraft
    }
  } catch { /* An incomplete draft cannot be resumed. */ }
  return null
}

function saveDraft(id: string, draft: IntakeDraft) {
  localStorage.setItem(prefix + id, JSON.stringify({ ...draft, updatedAt: Date.now() }))
  sessionStorage.setItem(currentTab, id)
}

function requireUnchanged<T extends object>(current: T, expected: T, fields: (keyof T)[]) {
  if (fields.some(field => current[field] !== expected[field])) {
    throw new Error('This intake changed in another tab. Reload to review its latest details.')
  }
}

export function requireCurrentDraft(id: string, expected: IntakeDraft) {
  const current = requireDraft(id)
  requireUnchanged(current, expected, ['customerId', 'vehicleId', 'complaint', 'mileageIn'])
  return current
}

// IndexedDB serializes the check and Web Storage change across browser tabs.
// Conversion takes the same workOrders lock and uses the draft ID as its record ID.
function editIntake<T>(id: string, action: () => T | Promise<T>, extraTables: string[] = []) {
  return db.transaction('rw', ['workOrders', ...extraTables], async () => {
    if (await db.workOrders.get(id)) throw new Error(closedMessage)
    requireDraft(id)
    return action()
  })
}

export function updateIntake(id: string, expected: IntakeDraft, next: IntakeDraft) {
  return editIntake(id, () => {
    requireCurrentDraft(id, expected)
    saveDraft(id, next)
  })
}

export function cancelIntake(id: string, expected: IntakeDraft) {
  return editIntake(id, () => {
    requireCurrentDraft(id, expected)
    finishIntake(id)
  })
}

// Draft IDs contain no dots. Child forms share their parent's ID as a prefix.
function draftGroups() {
  const groups = new Map<string, string[]>()
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(prefix)) continue
    const id = key.slice(prefix.length).split('.')[0]
    const keys = groups.get(id) ?? []
    keys.push(key)
    groups.set(id, keys)
  }
  return groups
}

export function pruneIntakeDrafts() {
  const now = Date.now()
  try {
    for (const [id, keys] of draftGroups()) {
      const draft = readDraft(id)
      if (!draft || (typeof draft.updatedAt === 'number' && draft.updatedAt < now - retentionMs)) {
        for (const key of keys) localStorage.removeItem(key)
        if (sessionStorage.getItem(currentTab) === id) sessionStorage.removeItem(currentTab)
      } else if (!Number.isFinite(draft.updatedAt)) {
        // Undated drafts from earlier releases receive one recovery window.
        localStorage.setItem(prefix + id, JSON.stringify({ ...draft, updatedAt: now }))
      }
    }
  } catch { /* Shop records can still open when Web Storage is unavailable. */ }
}

export function otherIntakes(currentId: string) {
  const saved: { id: string; draft: StoredDraft }[] = []
  for (const [id, keys] of draftGroups()) {
    if (id === currentId) continue
    const draft = readDraft(id)
    if (draft && (draft.customerId || draft.vehicleId || draft.mileageIn || draft.complaint || keys.length > 1)) {
      saved.push({ id, draft })
    }
  }
  return saved.sort((a, b) => (b.draft.updatedAt ?? 0) - (a.draft.updatedAt ?? 0))
}

export function beginIntake(params: URLSearchParams): string {
  const supplied = params.get('draft')
  const previous = supplied || sessionStorage.getItem(currentTab)
  const customerId = params.get('customerId') || ''
  const vehicleId = params.get('vehicleId') || ''
  if (previous) {
    const saved = readDraft(previous)
    if (saved && (!customerId || saved.customerId === customerId) && (!vehicleId || saved.vehicleId === vehicleId)) {
      sessionStorage.setItem(currentTab, previous)
      return previous
    }
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
  if (!draft) throw new Error(closedMessage)
  return draft
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

function checkChildForm<T extends object>(key: string, defaults: T, expected: T) {
  requireUnchanged(readIntakeForm(key, defaults), expected, Object.keys(defaults) as (keyof T)[])
}

export async function saveIntakeForm<T extends object>(key: string | null, defaults: T, expected: T, next: T | null) {
  if (!key) return
  const id = key.split('.')[0]
  await editIntake(id, () => {
    checkChildForm(key, defaults, expected)
    if (next) {
      saveDraft(id, requireDraft(id))
      localStorage.setItem(prefix + key, JSON.stringify(next))
    } else localStorage.removeItem(prefix + key)
    localStorage.removeItem(prefix + key + '.recordId')
  })
}

export async function createIntakeRecord<T extends object, R extends { id: string }>(
  formKey: string | null, defaults: T, expected: T, parent: IntakeDraft | null,
  record: {
    table: Table<R, string>; create: () => Promise<R>; path: (record: R) => string
    selection: (record: R) => Pick<IntakeDraft, 'customerId' | 'vehicleId'>
  },
) {
  if (!formKey) return record.path(await record.create())
  const key = formKey
  const id = key.split('.')[0]
  const recordKey = prefix + key + '.recordId'
  function checkForm() {
    if (!parent) throw new Error(closedMessage)
    requireUnchanged(requireDraft(id), parent, ['customerId', 'vehicleId'])
    checkChildForm(key, defaults, expected)
  }
  const saved = await editIntake(id, async () => {
    checkForm()
    // A retry between the IndexedDB commit and draft cleanup reuses the same record.
    const pendingId = localStorage.getItem(recordKey)
    const previous = pendingId && await record.table.get(pendingId)
    if (previous) return previous
    const created = await record.create()
    localStorage.setItem(recordKey, created.id)
    return created
  }, ['customers', 'vehicles'])

  try {
    return await editIntake(id, () => {
      checkForm()
      if (localStorage.getItem(recordKey) !== saved.id) return record.path(saved)
      saveDraft(id, { ...requireDraft(id), ...record.selection(saved) })
      localStorage.removeItem(prefix + key)
      localStorage.removeItem(recordKey)
      return intakePath(id)
    })
  } catch {
    // The record was committed even if the intake was closed or changed in another tab.
    return record.path(saved)
  }
}
