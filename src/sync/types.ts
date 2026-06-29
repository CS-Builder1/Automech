// Sync layer contracts. The engine is decoupled from both Dexie and Supabase via
// these interfaces so its merge logic is unit-testable against in-memory fakes.

/** Every syncable record carries a stable id and an ISO updatedAt for LWW. */
export interface SyncableRecord {
  id: string
  updatedAt?: string
  deletedAt?: string | null
  [key: string]: unknown
}

/** Collections that sync as JSON. Photos (media blobs) sync separately. */
export const SYNC_COLLECTIONS = [
  'customers', 'vehicles', 'workOrders', 'invoices', 'payments',
  'inspections', 'appointments', 'reminders', 'settings',
] as const

export type SyncCollection = (typeof SYNC_COLLECTIONS)[number]

/** Local persistence the engine reads/writes (Dexie in the app, Map in tests). */
export interface LocalStore {
  list(collection: SyncCollection): Promise<SyncableRecord[]>
  get(collection: SyncCollection, id: string): Promise<SyncableRecord | undefined>
  put(collection: SyncCollection, record: SyncableRecord): Promise<void>
}

/** Remote backend the engine pushes to / pulls from (Supabase in the app). */
export interface SyncBackend {
  pull(collection: SyncCollection, since: string): Promise<SyncableRecord[]>
  push(collection: SyncCollection, records: SyncableRecord[]): Promise<void>
}

export interface SyncResult {
  pushed: number
  pulled: number
  cursor: string
}
