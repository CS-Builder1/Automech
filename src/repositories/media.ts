import { db } from '@/db/database'
import type { MediaAsset } from '@/db/types'
import { newId, nowISO } from '@/lib/id'
import { downscaleImage } from '@/lib/image'

export const mediaRepo = {
  async add(file: Blob): Promise<string> {
    const blob = file.type.startsWith('image/') ? await downscaleImage(file) : file
    const asset: MediaAsset = { id: newId(), blob, mimeType: blob.type || 'application/octet-stream', createdAt: nowISO() }
    await db.media.put(asset)
    return asset.id
  },

  async get(id: string): Promise<MediaAsset | undefined> {
    return db.media.get(id)
  },

  async remove(id: string): Promise<void> {
    await db.media.delete(id)
  },
}
