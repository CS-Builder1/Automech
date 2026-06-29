import {
  SYNC_COLLECTIONS,
  type LocalStore,
  type SyncBackend,
  type SyncCollection,
  type SyncableRecord,
  type SyncResult,
} from './types.ts'

const EPOCH = '1970-01-01T00:00:00.000Z'

function ts(r: SyncableRecord): string {
  return r.updatedAt ?? EPOCH
}

/**
 * Sync one collection. Strategy: PULL first and merge remote into local by
 * last-write-wins (newer updatedAt wins), THEN push local records that are at
 * least as new as what we hold. Pulling before pushing means an older local
 * edit can never clobber a newer remote one — the classic offline-first LWW.
 */
export async function syncCollection(
  collection: SyncCollection,
  local: LocalStore,
  backend: SyncBackend,
  since: string,
): Promise<{ pushed: number; pulled: number; maxSeen: string }> {
  let pulled = 0
  let maxSeen = since
  const appliedFromRemote = new Set<string>()

  // 1. Pull remote changes and merge (LWW).
  const remote = await backend.pull(collection, since)
  for (const rr of remote) {
    if (ts(rr) > maxSeen) maxSeen = ts(rr)
    const localRec = await local.get(collection, rr.id)
    if (!localRec || ts(localRec) < ts(rr)) {
      await local.put(collection, rr)
      appliedFromRemote.add(rr.id)
      pulled++
    }
  }

  // 2. Push local records changed since the cursor that we didn't just receive.
  const localRecords = await local.list(collection)
  const toPush = localRecords.filter((r) => ts(r) > since && !appliedFromRemote.has(r.id))
  for (const r of toPush) if (ts(r) > maxSeen) maxSeen = ts(r)
  if (toPush.length) await backend.push(collection, toPush)

  return { pushed: toPush.length, pulled, maxSeen }
}

/** Sync every collection and return an advanced cursor + totals. */
export async function syncAll(
  local: LocalStore,
  backend: SyncBackend,
  since: string,
): Promise<SyncResult> {
  let pushed = 0
  let pulled = 0
  let cursor = since
  for (const collection of SYNC_COLLECTIONS) {
    const res = await syncCollection(collection, local, backend, since)
    pushed += res.pushed
    pulled += res.pulled
    if (res.maxSeen > cursor) cursor = res.maxSeen
  }
  return { pushed, pulled, cursor }
}
