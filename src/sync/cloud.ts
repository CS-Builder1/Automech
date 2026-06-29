import { useSyncExternalStore } from 'react'
import { syncAll } from './engine.ts'
import { dexieStore } from './dexieStore.ts'
import { getSupabase, isCloudConfigured, createSupabaseBackend, syncMedia } from './supabaseBackend.ts'

export interface CloudState {
  configured: boolean
  status: 'signed_out' | 'signed_in'
  email?: string
  userId?: string
  syncing: boolean
  lastSyncedAt?: string
  lastError?: string
}

const EPOCH = '1970-01-01T00:00:00.000Z'
let state: CloudState = { configured: isCloudConfigured(), status: 'signed_out', syncing: false }
const listeners = new Set<() => void>()

function set(patch: Partial<CloudState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function cursorKey(userId: string) { return `automech.syncCursor.${userId}` }

let initialized = false
export function initCloud() {
  if (initialized || !isCloudConfigured()) return
  initialized = true
  const sb = getSupabase()!
  sb.auth.getSession().then(({ data }) => {
    const u = data.session?.user
    if (u) { set({ status: 'signed_in', email: u.email ?? undefined, userId: u.id }); void syncNow() }
  })
  sb.auth.onAuthStateChange((_event, session) => {
    const u = session?.user
    if (u) { set({ status: 'signed_in', email: u.email ?? undefined, userId: u.id }); void syncNow() }
    else set({ status: 'signed_out', email: undefined, userId: undefined })
  })
}

export async function sendOtp(email: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Cloud sync is not configured.')
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
  if (error) throw error
}

export async function verifyOtp(email: string, token: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Cloud sync is not configured.')
  const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  await getSupabase()?.auth.signOut()
}

let syncing = false
export async function syncNow(): Promise<void> {
  if (syncing || !state.userId) return
  syncing = true
  set({ syncing: true, lastError: undefined })
  try {
    const backend = createSupabaseBackend(state.userId)
    const since = localStorage.getItem(cursorKey(state.userId)) ?? EPOCH
    const result = await syncAll(dexieStore, backend, since)
    localStorage.setItem(cursorKey(state.userId), result.cursor)
    await syncMedia(state.userId)
    set({ syncing: false, lastSyncedAt: new Date().toISOString() })
  } catch (e) {
    set({ syncing: false, lastError: e instanceof Error ? e.message : 'Sync failed' })
  } finally {
    syncing = false
  }
}

export function useCloud(): CloudState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb) },
    () => state,
    () => state,
  )
}
