import { useEffect, useState } from 'react'
import { useSettings, saveSettings } from '@/hooks/useSettings'
import { PageHeader } from '@/components/ui/Page'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { CloudSyncCard } from '@/components/CloudSyncCard'
import { PlanCard } from '@/components/PlanCard'
import { parseAmountToMinor, minorToDecimal } from '@/lib/money'

const CURRENCIES = ['USD', 'XCD', 'EUR', 'GBP', 'CAD', 'TTD', 'JMD']

export function Settings() {
  const settings = useSettings()
  const [form, setForm] = useState({
    shopName: '', ownerName: '', phone: '', email: '', address: '',
    currency: 'USD', displayCurrency: '', pegRate: '',
    defaultLaborRate: '', defaultTaxRatePct: '', defaultPartsMarkupPct: '', shopSuppliesPct: '',
  })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!settings) return
    setForm({
      shopName: settings.shopName, ownerName: settings.ownerName ?? '', phone: settings.phone ?? '',
      email: settings.email ?? '', address: settings.address ?? '',
      currency: settings.currency, displayCurrency: settings.displayCurrency ?? '',
      pegRate: settings.pegRate?.toString() ?? '',
      defaultLaborRate: minorToDecimal(settings.defaultLaborRate).toString(),
      defaultTaxRatePct: settings.defaultTaxRatePct.toString(),
      defaultPartsMarkupPct: settings.defaultPartsMarkupPct.toString(),
      shopSuppliesPct: settings.shopSuppliesPct.toString(),
    })
  }, [settings])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await saveSettings({
      shopName: form.shopName.trim() || 'My Shop',
      ownerName: form.ownerName.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      currency: form.currency,
      displayCurrency: form.displayCurrency || undefined,
      pegRate: form.pegRate ? parseFloat(form.pegRate) : undefined,
      defaultLaborRate: parseAmountToMinor(form.defaultLaborRate),
      defaultTaxRatePct: parseFloat(form.defaultTaxRatePct) || 0,
      defaultPartsMarkupPct: parseFloat(form.defaultPartsMarkupPct) || 0,
      shopSuppliesPct: parseFloat(form.shopSuppliesPct) || 0,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!settings) return <p className="text-sm text-slate-400">Loading…</p>

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

        <div className="flex items-center gap-3">
          <Button type="submit">Save settings</Button>
          {saved && <span className="text-sm font-medium text-emerald-600">Saved ✓</span>}
        </div>
      </form>

      <div className="mt-6">
        <PlanCard />
      </div>

      <div className="mt-6">
        <CloudSyncCard />
      </div>

      <p className="mt-8 text-center text-xs text-slate-400">Automech v0.1 · Sprint 1 · data stored on this device</p>
    </div>
  )
}
