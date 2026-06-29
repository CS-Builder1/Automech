import { useEffect } from 'react'
import { initCloud, syncNow, useCloud } from '@/sync/cloud'

/** Initialises cloud sync and keeps it ticking on focus + a gentle interval. */
export function BackgroundSync() {
  const cloud = useCloud()

  useEffect(() => { initCloud() }, [])

  useEffect(() => {
    if (cloud.status !== 'signed_in') return
    const onFocus = () => void syncNow()
    window.addEventListener('focus', onFocus)
    const interval = window.setInterval(() => void syncNow(), 2 * 60 * 1000)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(interval)
    }
  }, [cloud.status])

  return null
}
