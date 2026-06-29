import { db } from '@/db/database'
import type { LocalStore, SyncCollection, SyncableRecord } from './types.ts'

/** Maps sync collections onto Dexie tables. */
export const dexieStore: LocalStore = {
  async list(collection: SyncCollection): Promise<SyncableRecord[]> {
    return (await db.table(collection).toArray()) as SyncableRecord[]
  },
  async get(collection: SyncCollection, id: string): Promise<SyncableRecord | undefined> {
    return (await db.table(collection).get(id)) as SyncableRecord | undefined
  },
  async put(collection: SyncCollection, record: SyncableRecord): Promise<void> {
    await db.table(collection).put(record)
  },
}
