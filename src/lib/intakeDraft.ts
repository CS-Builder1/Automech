import type { Table } from 'dexie'
import { db } from '@/db/database'
import { newId } from './id'

export interface IntakeDraft {
  customerId: string
  vehicleId: string
  complaint: string
  mileageIn: string
  childRevision?: number
}

const prefix = 'automech.intake.'
const currentTab = prefix + 'current'
const retentionMs = 14 * 24 * 60 * 60 * 1000
const closedMessage = 'This intake draft has already been closed. Open a new job to continue.'
type StoredDraft = IntakeDraft & { updatedAt?: number }
let detachedIntake: string | undefined

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

function rememberCurrentIntake(id: string) {
  sessionStorage.setItem(currentTab, id)
  detachedIntake = undefined
}

function saveDraft(id: string, draft: IntakeDraft) {
  rememberCurrentIntake(id)
  localStorage.setItem(prefix + id, JSON.stringify({ ...draft, updatedAt: Date.now() }))
}

function requireUnchanged<T extends object>(current: T, expected: T, fields: (keyof T)[]) {
  if (fields.some(field => current[field] !== expected[field])) {
    throw new Error('This intake changed in another tab. Reload to review its latest details.')
  }
}

export function requireCurrentDraft(id: string, expected: IntakeDraft) {
  const current = requireDraft(id)
  requireUnchanged(current, expected, ['customerId', 'vehicleId', 'complaint', 'mileageIn', 'childRevision'])
  return current
}

// The transaction serializes record creation. Another renderer can still see an older
// Web Storage snapshot, so retries must identify an existing record in IndexedDB.
function editIntake<T>(id: string, action: () => T | Promise<T>, extraTables: string[] = []) {
  return db.transaction('rw', ['workOrders', ...extraTables], async () => {
    if (await db.workOrders.get(id)) throw new Error(closedMessage)
    requireDraft(id)
    return action()
  })
}

type ChildAttempt = { id: string; input: Record<string, unknown> }
type ChildReceipt = { revision: number } & ({ attempts: ChildAttempt[] } | { selectedId: string })
type IntakeChild = { id: string; intakeReceipt?: ChildReceipt }

// A different child form or parent editor can supersede a pending link. Seal
// it in IndexedDB so even a renderer with a cached parent cannot publish it.
async function sealPendingChildren(id: string, parent: IntakeDraft) {
  const revision = parent.childRevision ?? 0
  await Promise.all([
    { name: 'customers', key: id + '.customer' },
    { name: 'vehicles', key: id + '.vehicle.' + parent.customerId },
  ].map(async ({ name, key }) => {
    const table = db.table<IntakeChild, string>(name)
    const ids = [key + '~' + revision]
    // If the previous link's sealing transaction aborted, its row still exists.
    if (revision > 0) ids.push(key + '~' + (revision - 1))
    const legacyId = localStorage.getItem(prefix + key + '.recordId')
    if (legacyId) ids.push(legacyId)
    for (const row of await table.bulkGet(ids)) {
      if (!row || (row.intakeReceipt && 'selectedId' in row.intakeReceipt)) continue
      const attempts = row.intakeReceipt?.attempts
      const selectedId = attempts?.[attempts.length - 1]?.id ?? row.id
      await table.update(row.id, { intakeReceipt: { revision: row.intakeReceipt?.revision ?? revision, selectedId } })
    }
  }))
}

export function updateIntake(id: string, expected: IntakeDraft, next: IntakeDraft) {
  return editIntake(id, async () => {
    requireCurrentDraft(id, expected)
    await sealPendingChildren(id, expected)
    saveDraft(id, next)
  }, ['customers', 'vehicles'])
}

function clearCurrentIntake(id: string) {
  try {
    if (sessionStorage.getItem(currentTab) === id) sessionStorage.removeItem(currentTab)
  } catch {
    // Skip this pointer on the next New job even if the browser denied its removal.
    detachedIntake = id
  }
}

export async function cancelIntake(id: string, expected: IntakeDraft) {
  try {
    await editIntake(id, async () => {
      requireCurrentDraft(id, expected)
      await sealPendingChildren(id, expected)
      finishIntake(id)
    }, ['customers', 'vehicles'])
  } catch (error) {
    clearCurrentIntake(id)
    throw error
  }
}

export async function cancelIntakeForm<T extends object>(key: string | null, defaults: T, expected: T, standalonePath: string) {
  if (!key) return { path: standalonePath }
  const id = key.split('.')[0]
  try {
    await saveIntakeForm(key, defaults, expected, null)
    return { path: intakePath(id) }
  } catch {
    try {
      if (!(await db.workOrders.get(id)) && readDraft(id)) {
        return { path: intakePath(id), notice: 'Could not discard the saved form. Reopen it from this intake to review its latest details.' }
      }
    } catch { /* Storage may be unavailable while checking whether the intake is still open. */ }
    return { path: '/jobs', notice: 'Could not discard the saved form. Its intake is closed or unavailable.' }
  }
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
        clearCurrentIntake(id)
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
  if (previous && (supplied || previous !== detachedIntake)) {
    const saved = readDraft(previous)
    if (saved && (!customerId || saved.customerId === customerId) && (!vehicleId || saved.vehicleId === vehicleId)) {
      rememberCurrentIntake(previous)
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
  clearCurrentIntake(id)
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
  })
}

export async function createIntakeRecord<T extends object, R extends { id: string }>(
  formKey: string | null, defaults: T, expected: T, parent: IntakeDraft | null,
  record: {
    table: Table<R, string>; input: Partial<R>; create: (id?: string) => Promise<R>; path: (record: R) => string
    selection: (record: R) => Pick<IntakeDraft, 'customerId' | 'vehicleId'>
  },
) {
  if (!formKey) return record.path(await record.create())
  const key = formKey
  const id = key.split('.')[0]
  const legacyReceipt = prefix + key + '.recordId'
  const revision = parent?.childRevision ?? 0
  const recordId = key + '~' + revision
  function checkForm() {
    if (!parent) throw new Error(closedMessage)
    requireUnchanged(requireDraft(id), parent, ['customerId', 'vehicleId', 'childRevision'])
    checkChildForm(key, defaults, expected)
  }
  const table = record.table as Table<R & IntakeChild, string>
  const input: Record<string, unknown> = { ...record.input }
  const fields = Object.keys(input)
  const saved = await editIntake(id, async () => {
    checkForm()
    const legacyId = localStorage.getItem(legacyReceipt)
    const legacy = legacyId ? await table.get(legacyId) : undefined
    const first = await table.get(recordId) ?? (legacy?.intakeReceipt && legacy.intakeReceipt.revision !== revision ? undefined : legacy)
    const receipt = first?.intakeReceipt
    if (first && receipt && 'selectedId' in receipt) {
      return { row: await table.get(receipt.selectedId) ?? first }
    }
    // Older releases wrote the row without a receipt. Compare its persisted
    // fields so the first retry after an upgrade can recognize it.
    const attempts = receipt && 'attempts' in receipt ? receipt.attempts : (first
      ? [{ id: first.id, input: Object.fromEntries(fields.map(field => [field, first[field as keyof R]])) }]
      : [])
    const match = attempts.find(attempt => fields.every(field => attempt.input[field] === input[field]))
    const row = match ? await table.get(match.id) : await record.create(first ? newId() : recordId)
    if (!row) throw new Error('This intake record is unavailable. Reload the intake to continue.')
    const anchor = first ?? row
    const next = [...attempts.filter(attempt => attempt !== match), { id: row.id, input }]
    await table.put({ ...anchor, intakeReceipt: { revision, attempts: next } })
    return { row, receiptId: anchor.id }
  }, ['customers', 'vehicles'])
  const { row, receiptId } = saved
  if (!receiptId) return record.path(row)

  try {
    return await editIntake(id, async () => {
      checkForm()
      const anchor = await table.get(receiptId)
      const receipt = anchor?.intakeReceipt
      if (!anchor || !receipt || !('attempts' in receipt) || receipt.attempts[receipt.attempts.length - 1]?.id !== row.id) {
        return record.path(row)
      }
      const current = requireDraft(id)
      await table.put({ ...anchor, intakeReceipt: { revision, selectedId: row.id } })
      await sealPendingChildren(id, current)
      saveDraft(id, { ...current, ...record.selection(row), childRevision: revision + 1 })
      localStorage.removeItem(prefix + key)
      localStorage.removeItem(legacyReceipt)
      return intakePath(id)
    }, ['customers', 'vehicles'])
  } catch {
    // The record was committed even if the intake was closed or changed in another tab.
    return record.path(saved.row)
  }
}
