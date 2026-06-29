/**
 * Downscale a captured photo before storing it in IndexedDB so inspections with
 * many photos stay light and sync cheaply later. Falls back to the original blob
 * if the browser can't decode it.
 */
export async function downscaleImage(file: Blob, maxDim = 1280, quality = 0.8): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
    )
    return blob ?? file
  } catch {
    return file
  }
}
