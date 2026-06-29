import { useEffect, useState } from 'react'
import { mediaRepo } from '@/repositories/media'

interface Props {
  id: string
  className?: string
  onRemove?: () => void
}

/** Loads a photo blob from IndexedDB and renders it via an object URL. */
export function MediaImage({ id, className = '', onRemove }: Props) {
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    let revoked = false
    let objectUrl: string | undefined
    mediaRepo.get(id).then((asset) => {
      if (asset && !revoked) {
        objectUrl = URL.createObjectURL(asset.blob)
        setUrl(objectUrl)
      }
    })
    return () => {
      revoked = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id])

  return (
    <div className={`relative ${className}`}>
      {url ? (
        <img src={url} alt="inspection" className="h-20 w-20 rounded-lg border border-slate-200 object-cover dark:border-slate-700" />
      ) : (
        <div className="h-20 w-20 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white"
          aria-label="Remove photo"
        >
          ✕
        </button>
      )}
    </div>
  )
}
