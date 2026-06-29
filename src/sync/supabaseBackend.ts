import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { db } from '@/db/database'
import type { SyncBackend, SyncCollection, SyncableRecord } from './types.ts'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True only when build-time Supabase config is present. */
export function isCloudConfigured(): boolean {
  return Boolean(URL && ANON)
}

let client: SupabaseClient | null = null
export function getSupabase(): SupabaseClient | null {
  if (!isCloudConfigured()) return null
  if (!client) client = createClient(URL!, ANON!, { auth: { persistSession: true, autoRefreshToken: true } })
  return client
}

/** All app data lives in one generic, RLS-scoped `records` table (see migration). */
interface RecordRow {
  user_id: string
  collection: string
  id: string
  updated_at: string
  deleted_at: string | null
  data: SyncableRecord
}

export function createSupabaseBackend(userId: string): SyncBackend {
  const sb = getSupabase()!
  return {
    async pull(collection: SyncCollection, since: string): Promise<SyncableRecord[]> {
      const { data, error } = await sb
        .from('records')
        .select('data')
        .eq('collection', collection)
        .gt('updated_at', since)
      if (error) throw error
      return (data ?? []).map((row) => (row as { data: SyncableRecord }).data)
    },
    async push(collection: SyncCollection, records: SyncableRecord[]): Promise<void> {
      if (!records.length) return
      const rows: RecordRow[] = records.map((r) => ({
        user_id: userId,
        collection,
        id: r.id,
        updated_at: r.updatedAt ?? new Date(0).toISOString(),
        deleted_at: (r.deletedAt as string | null) ?? null,
        data: r,
      }))
      const { error } = await sb.from('records').upsert(rows, { onConflict: 'user_id,collection,id' })
      if (error) throw error
    },
  }
}

const MEDIA_BUCKET = 'media'

/** Best-effort photo sync: upload local blobs, fetch any referenced-but-missing ones. */
export async function syncMedia(userId: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) return

  // Upload every local photo (idempotent upsert keyed by id).
  const local = await db.media.toArray()
  for (const asset of local) {
    await sb.storage.from(MEDIA_BUCKET).upload(`${userId}/${asset.id}`, asset.blob, {
      upsert: true,
      contentType: asset.mimeType,
    }).catch(() => {})
  }

  // Pull blobs referenced by inspections we have locally but whose media is missing.
  const referenced = new Set<string>()
  for (const insp of await db.inspections.toArray()) {
    for (const item of insp.items) for (const pid of item.photoIds ?? []) referenced.add(pid)
  }
  const have = new Set((await db.media.toArray()).map((m) => m.id))
  for (const pid of referenced) {
    if (have.has(pid)) continue
    const { data } = await sb.storage.from(MEDIA_BUCKET).download(`${userId}/${pid}`)
    if (data) await db.media.put({ id: pid, blob: data, mimeType: data.type || 'image/jpeg', createdAt: new Date().toISOString() })
  }
}
