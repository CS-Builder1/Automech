import { useState } from 'react'
import type { ShopSettings } from '@/db/types'
import { useSettingsSnapshot, saveSettings } from '@/hooks/useSettings'
import { PageHeader } from '@/components/ui/Page'
import { BackupSettings } from '@/components/BackupSettings'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { parseRate, parseAmountToMinor, minorToDecimal } from '@/lib/money'

const CURRENCIES = ['USD', 'XCD', 'EUR', 'GBP', 'CAD', 'TTD', 'JMD']

function settingsForm(settings: ShopSettings) {
  return {
    shopName: settings.shopName, ownerName: settings.ownerName ?? '', phone: settings.phone ?? '',
    email: settings.email ?? '', address: settings.address ?? '',
    currency: settings.currency, displayCurrency: settings.displayCurrency ?? '',
    pegRate: settings.pegRate?.toString() ?? '',
    defaultLaborRate: minorToDecimal(settings.defaultLaborRate).toString(),
    defaultTaxRatePct: settings.defaultTaxRatePct.toString(),
    defaultPartsMarkupPct: settings.defaultPartsMarkupPct.toString(),
    shopSuppliesPct: settings.shopSuppliesPct.toString(),
  }
}

type SettingsEdits = Partial<ReturnType<typeof settingsForm>>

export function Settings() {
  const [revision, setRevision] = useState(0)
  const snapshot = useSettingsSnapshot(revision)
  const [submitted, setSubmitted] = useState<{ revision: number; edits: SettingsEdits } | null>(null)
  const [edits, setEdits] = useState<SettingsEdits>({})
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  if (!snapshot?.settings) return <p className="text-sm text-slate-400">Loading…</p>

  // Keep the submitted values visible until a query started after that write returns.
  const pending = submitted && submitted.revision !== snapshot.revision ? submitted : null
  const base = { ...settingsForm(snapshot.settings), ...pending?.edits }
  const form = { ...base, ...edits }
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = event.target.value
    setEdits(current => {
      const next = { ...current, [key]: value }
      if (value === base[key]) delete next[key]
      return next
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    setError('')
    try {
      const usePeg = Boolean(form.displayCurrency && form.displayCurrency !== form.currency)
      const pegRate = usePeg ? parseRate(form.pegRate, 'Exchange rate') : undefined
      if (pegRate === 0) throw Error('Exchange rate must be greater than zero.')
      const patch = {
        shopName: form.shopName.trim() || 'My Shop',
        ownerName: form.ownerName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        currency: form.currency,
        displayCurrency: usePeg ? form.displayCurrency : undefined,
        pegRate,
        defaultLaborRate: parseAmountToMinor(form.defaultLaborRate),
        defaultTaxRatePct: parseRate(form.defaultTaxRatePct || '0', 'Tax rate'),
        defaultPartsMarkupPct: parseRate(form.defaultPartsMarkupPct || '0', 'Parts markup'),
        shopSuppliesPct: parseRate(form.shopSuppliesPct || '0', 'Shop supplies'),
      }
      const nextRevision = revision + 1
      setSubmitted({ revision: nextRevision, edits })
      setEdits({})
      await saveSettings(patch)
      setRevision(nextRevision)
    } catch (cause) {
      setSubmitted(null)
      setEdits(current => ({ ...edits, ...current }))
      setError(cause instanceof Error ? cause.message : 'Could not save shop settings.')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Settings" subtitle="Shop profile, currency & default rates" />
      <form onSubmit={submit} className="space-y-6">
        <section className="card space-y-4 p-4">
          <h2 className="font-semibold">Shop profile</h2>
          <Field label="Shop name" htmlFor="shopName">
            <TextInput id="shopName" value={form.shopName} onChange={set('shopName')} />
          </Field>
          <Field label="Owner name" htmlFor="ownerName">
            <TextInput id="ownerName" value={form.ownerName} onChange={set('ownerName')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" htmlFor="phone">
              <TextInput id="phone" value={form.phone} onChange={set('phone')} />
            </Field>
            <Field label="Email" htmlFor="email">
              <TextInput id="email" value={form.email} onChange={set('email')} />
            </Field>
          </div>
          <Field label="Address" htmlFor="address">
            <TextInput id="address" value={form.address} onChange={set('address')} />
          </Field>
        </section>

        <section className="card space-y-4 p-4">
          <h2 className="font-semibold">Currency</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Billing currency" htmlFor="currency">
              <select id="currency" className="input" value={form.currency} onChange={set('currency')}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Also display (optional)" htmlFor="displayCurrency" hint="e.g. show XCD alongside USD">
              <select id="displayCurrency" className="input" value={form.displayCurrency} onChange={set('displayCurrency')}>
                <option value="">— none —</option>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          {form.displayCurrency && (
            <Field label="Peg rate" htmlFor="pegRate" hint={`${form.displayCurrency} per 1 ${form.currency} (e.g. XCD is 2.70 per USD)`}>
              <TextInput id="pegRate" inputMode="decimal" value={form.pegRate} onChange={set('pegRate')} placeholder="2.70" />
            </Field>
          )}
        </section>

        <section className="card space-y-4 p-4">
          <h2 className="font-semibold">Default rates</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Labor rate / hr (${form.currency})`} htmlFor="laborRate">
              <TextInput id="laborRate" inputMode="decimal" value={form.defaultLaborRate} onChange={set('defaultLaborRate')} />
            </Field>
            <Field label="Parts markup %" htmlFor="markup">
              <TextInput id="markup" inputMode="decimal" value={form.defaultPartsMarkupPct} onChange={set('defaultPartsMarkupPct')} />
            </Field>
            <Field label="Tax rate %" htmlFor="tax">
              <TextInput id="tax" inputMode="decimal" value={form.defaultTaxRatePct} onChange={set('defaultTaxRatePct')} />
            </Field>
            <Field label="Shop supplies %" htmlFor="supplies">
              <TextInput id="supplies" inputMode="decimal" value={form.shopSuppliesPct} onChange={set('shopSuppliesPct')} />
            </Field>
          </div>
        </section>

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!!pending}>Save settings</Button>
          {saved && <span className="text-sm font-medium text-emerald-600">Saved ✓</span>}
        </div>
      </form>

      <BackupSettings />

      <p className="mt-8 text-center text-xs text-slate-400">Shop records are stored in this browser.</p>
    </div>
  )
}
