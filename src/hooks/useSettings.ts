import { useLiveQuery } from 'dexie-react-hooks'
import { db, ensureSettings } from '@/db/database'
import type { ShopSettings } from '@/db/types'
import { nowISO } from '@/lib/id'

export function useSettingsSnapshot(revision: number) {
  return useLiveQuery(async () => ({ revision, settings: await db.settings.get('singleton') }), [revision])
}

export function useSettings(): ShopSettings | undefined {
  return useSettingsSnapshot(0)?.settings
}

export async function saveSettings(patch: Partial<ShopSettings>): Promise<void> {
  await ensureSettings()
  await db.settings.update('singleton', { ...patch, updatedAt: nowISO() })
}
