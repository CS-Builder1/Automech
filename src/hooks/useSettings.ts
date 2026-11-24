import { useLiveQuery } from 'dexie-react-hooks'
import { db, ensureSettings } from '@/db/database'
import type { ShopSettings } from '@/db/types'
import { nowISO } from '@/lib/id'

export function useSettings(): ShopSettings | undefined {
  return useLiveQuery(() => db.settings.get('singleton'), [])
}

export async function saveSettings(patch: Partial<ShopSettings>): Promise<void> {
  await ensureSettings()
  await db.settings.update('singleton', { ...patch, updatedAt: nowISO() })
}
