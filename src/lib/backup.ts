import Dexie from 'dexie'
import { syncRestoreEpoch } from './restoreEpoch'
import { AutomechDB, db } from '@/db/database'
import { cleanLegacyNumbers, normalizeDocumentCounters, validateRecords, timestamp, type BackupTables } from './backupValidation'

// Format 1: { payload: { format, version, schemaVersion, createdAt, tables }, sha256 }.
// sha256 covers the UTF-8 bytes of JSON.stringify(payload). This detects damage,
// not authorship. Every table includes tombstones; media.blob holds MIME type + base64.
const format = 'automech-shop-backup'
const recoveryFormat = 'automech-shop-recovery'
const originalStores = ['customers', 'vehicles', 'workOrders', 'invoices', 'payments', 'inspections', 'media', 'appointments', 'settings']
type Row = Record<string, unknown>
const isObject = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v)

async function digest(payload: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Open Automech over HTTPS or localhost to check backup integrity.')
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(hash, b => b.toString(16).padStart(2, '0')).join('')
}

async function readAll(database: AutomechDB): Promise<BackupTables> {
  return database.transaction('r', database.tables, async () => {
    const entries = await Promise.all(database.tables.map(async table => [table.name, await table.toArray()] as const))
    return Object.fromEntries(entries)
  })
}

function encodeBlob(blob: Blob): Promise<{ type: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('A stored photo could not be read.'))
    reader.onload = () => {
      const data = String(reader.result)
      resolve({ type: blob.type, base64: data.slice(data.indexOf(',') + 1) })
    }
    reader.readAsDataURL(blob)
  })
}

function decodeBlob(value: unknown): Blob {
  if (!isObject(value) || typeof value.type !== 'string' || typeof value.base64 !== 'string') {
    throw new Error('Invalid photo encoding in backup.')
  }
  let binary: string
  try {
    binary = atob(value.base64)
  } catch {
    throw new Error('Invalid photo content in backup.')
  }
  return new Blob([Uint8Array.from(binary, char => char.charCodeAt(0))], { type: value.type })
}

// JSON drops undefined, turns nonfinite numbers into null, and loses the sign
// of -0. Paths relative to tables preserve each original value unambiguously.
function recoveryValues(tables: BackupTables) {
  const specialValues: { path: string[]; value: string }[] = []
  function visit(value: unknown, path: string[]) {
    if (value === undefined || (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0)))) {
      specialValues.push({ path, value: Object.is(value, -0) ? '-0' : String(value) })
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) visit(child, [...path, key])
    }
  }
  visit(tables, [])
  return specialValues
}

export async function createBackup() {
  const original = await readAll(db)
  let tables = Dexie.deepClone(original)
  cleanLegacyNumbers(tables)
  for (const row of tables.settings) delete row.restoreEpoch
  let problem: string | undefined
  try {
    validateRecords(tables)
    normalizeDocumentCounters(tables)
  } catch (cause) {
    problem = cause instanceof Error ? cause.message : 'Shop records failed validation.'
    tables = original
  }
  for (const row of tables.media) {
    if (row.blob instanceof Blob) row.blob = await encodeBlob(row.blob)
  }
  const createdAt = new Date().toISOString()
  const payload = { format: problem ? recoveryFormat : format, version: 1, schemaVersion: db.verno, createdAt, tables,
    ...(problem && { problem, specialValues: recoveryValues(tables) }) }
  const blob = new Blob([JSON.stringify({ payload, sha256: await digest(payload) })], { type: 'application/json' })
  const prefix = problem ? 'automech-manual-recovery' : 'automech'
  return { blob, createdAt, filename: `${prefix}-${createdAt.replace(/:/g, '-')}.json`, problem }
}

function checkTables(input: unknown, schemaVersion: number): BackupTables {
  if (!isObject(input)) throw new Error('The backup has no shop records.')
  const available = db.tables.map(table => table.name)
  const required = schemaVersion === db.verno ? available : [...originalStores, ...(schemaVersion >= 3 ? ['expenses'] : [])]
  const missing = required.find(name => !Object.prototype.hasOwnProperty.call(input, name))
  if (missing) throw new Error(`The backup is missing the ${missing} table.`)
  const tables: BackupTables = {}
  for (const [name, rows] of Object.entries(input)) {
    if (!required.includes(name) || !available.includes(name)) throw new Error('The backup contains an unsupported table.')
    if (!Array.isArray(rows) || !rows.every(isObject)) throw new Error(`Invalid ${name} table.`)
    tables[name] = rows
  }
  for (const asset of tables.media) asset.blob = decodeBlob(asset.blob)
  validateRecords(tables)
  return tables
}

const restorePrefix = 'automech-restore-'
const ownerSuffix = '-owner'

export async function cleanAbandonedRestores() {
  const names = await Dexie.getDatabaseNames()
  const restores = new Set(names.filter(name => name.startsWith(restorePrefix))
    .map(name => name.endsWith(ownerSuffix) ? name.slice(0, -ownerSuffix.length) : name))
  await Promise.all(Array.from(restores, async name => {
    // This request waits while a tab holds the owner connection, including
    // the gap between closing the old schema and opening the upgraded one.
    await Dexie.delete(name + ownerSuffix)
    await Dexie.delete(name)
  }))
}

/** Run the app's own schema upgrades on an isolated copy before touching live records. */
async function upgradeSnapshot(tables: BackupTables, oldVersion: number): Promise<BackupTables> {
  const name = restorePrefix + crypto.randomUUID()
  const owner = new Dexie(name + ownerSuffix)
  owner.version(1).stores({})
  // Keep this empty database open until the copy is gone. IndexedDB releases
  // the connection automatically if the tab crashes or closes.
  owner.on('versionchange', () => false)
  const old = new Dexie(name)
  const upgraded = new AutomechDB(name)
  try {
    await owner.open()
    const schema: Record<string, string> = {}
    for (const tableName of Object.keys(tables)) {
      const { primKey, indexes } = db.table(tableName).schema
      schema[tableName] = [primKey, ...indexes].map(index => index.src).join(',')
    }
    old.version(oldVersion).stores(schema)
    await old.transaction('rw', old.tables, async () => {
      for (const table of old.tables) await table.bulkAdd(tables[table.name])
    })
    old.close()
    const migrated = await readAll(upgraded)
    validateRecords(migrated)
    return migrated
  } finally {
    old.close()
    upgraded.close()
    try {
      await Dexie.delete(name)
    } finally {
      await owner.delete()
    }
  }
}

export async function inspectBackup(file: File) {
  const source = await file.text()
  let archive: unknown
  try {
    archive = JSON.parse(source, (key, value) => {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') throw new Error()
      return value
    })
  } catch {
    throw new Error('Choose a complete Automech JSON backup file.')
  }
  if (isObject(archive) && isObject(archive.payload) && archive.payload.format === recoveryFormat) {
    throw new Error('This manual recovery file requires repair. Choose a validated shop backup to restore.')
  }
  if (!isObject(archive) || !isObject(archive.payload) || archive.payload.format !== format) {
    throw new Error('This file is not an Automech shop backup.')
  }
  const payload = archive.payload
  const schema = payload.schemaVersion
  if (payload.version !== 1 || typeof schema !== 'number' || !Number.isInteger(schema) || schema < 1 || schema > db.verno) {
    throw new Error('Unsupported backup version. Use a compatible version of Automech.')
  }
  if (archive.sha256 !== await digest(payload)) throw new Error('Backup integrity check failed. Choose another copy.')
  if (typeof payload.createdAt !== 'string' || !timestamp(payload.createdAt)) throw new Error('Invalid backup date.')
  let tables = checkTables(payload.tables, schema)
  if (schema < db.verno) tables = await upgradeSnapshot(tables, schema)
  normalizeDocumentCounters(tables)
  const counts = Object.entries(tables).map(([name, rows]) => ({ name, count: rows.length }))
  return {
    createdAt: payload.createdAt,
    shopName: tables.settings[0].shopName as string,
    counts,
    // Only validated private data reaches this operation. Dexie aborts all
    // clears and inserts together on request errors, including quota failures.
    async replaceShop() {
      const epoch = crypto.randomUUID()
      await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) {
          await table.clear()
          const rows = table.name === 'settings' ? tables.settings.map(row => ({ ...row, restoreEpoch: epoch })) : tables[table.name]
          await table.bulkAdd(rows)
        }
      })
      syncRestoreEpoch(epoch)
    },
  }
}
