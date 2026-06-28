import { useLiveQuery } from 'dexie-react-hooks'
import { db, ensureSettings } from '@/db/database'
import type { ShopSettings } from '@/db/types'
import { nowISO } from '@/lib/id'

export function useSettings(): ShopSettings | undefined {
  return useLiveQuery(async () => {
    return (await db.settings.get('singleton')) ?? (await ensureSettings())
  }, [])
}

export async function saveSettings(patch: Partial<ShopSettings>): Promise<void> {
  await ensureSettings()
  await db.settings.update('singleton', { ...patch, updatedAt: nowISO() })
}
