import { useState } from 'react'
import { useCloud, sendOtp, verifyOtp, signOut, syncNow } from '@/sync/cloud'
import { Button } from './ui/Button'
import { Field, TextInput } from './ui/Field'

export function CloudSyncCard() {
  const cloud = useCloud()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [stage, setStage] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  if (!cloud.configured) {
    return (
      <section className="card space-y-2 p-4">
        <h2 className="font-semibold">Cloud sync & backup</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Not configured yet. Your data is safe on this device. To sync across phone, tablet and desktop,
          connect a Supabase project: set <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">VITE_SUPABASE_URL</code> and{' '}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">VITE_SUPABASE_ANON_KEY</code>, then run the
          migration in <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">supabase/migrations</code>.
        </p>
      </section>
    )
  }

  async function send() {
    setBusy(true); setMsg(null)
    try { await sendOtp(email.trim()); setStage('code'); setMsg('Check your email: enter the 6-digit code, or tap the link if your email shows one.') }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Could not send code.') }
    finally { setBusy(false) }
  }
  async function verify() {
    setBusy(true); setMsg(null)
    try { await verifyOtp(email.trim(), code.trim()) }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Invalid code.') }
    finally { setBusy(false) }
  }

  if (cloud.status === 'signed_in') {
    return (
      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Cloud sync & backup</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">Signed in as <span className="font-medium">{cloud.email}</span></p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {cloud.syncing ? 'Syncing…' : cloud.lastSyncedAt ? `Last synced ${new Date(cloud.lastSyncedAt).toLocaleTimeString()}` : 'Not synced yet'}
          {cloud.lastError && <span className="text-red-600"> · {cloud.lastError}</span>}
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void syncNow()} disabled={cloud.syncing}>Sync now</Button>
          <Button size="sm" variant="secondary" onClick={() => void signOut()}>Sign out</Button>
        </div>
      </section>
    )
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-semibold">Cloud sync & backup</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">Sign in with your email to back up and sync across devices.</p>
      {stage === 'email' ? (
        <>
          <Field label="Email" htmlFor="cloudEmail">
            <TextInput id="cloudEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@shop.com" />
          </Field>
          <Button size="sm" onClick={send} disabled={busy || !email.includes('@')}>Email me a code</Button>
        </>
      ) : (
        <>
          <Field label="6-digit code" htmlFor="cloudCode">
            <TextInput id="cloudCode" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={verify} disabled={busy || code.trim().length < 6}>Verify & sign in</Button>
            <Button size="sm" variant="ghost" onClick={() => setStage('email')}>Back</Button>
          </div>
        </>
      )}
      {msg && <p className="text-xs text-slate-500 dark:text-slate-400">{msg}</p>}
    </section>
  )
}
