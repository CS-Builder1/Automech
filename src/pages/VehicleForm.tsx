import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { vehiclesRepo } from '@/repositories/vehicles'
import { customersRepo } from '@/repositories/customers'
import { db } from '@/db/database'
import { readDraft, createIntakeRecord, intakePath, parseMileage, readIntakeForm, saveIntakeForm } from '@/lib/intakeDraft'
import { decodeVin, isPlausibleVin } from '@/lib/vin'
import type { VehicleType } from '@/db/types'
import { PageHeader } from '@/components/ui/Page'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, TextArea } from '@/components/ui/Field'

const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
  { value: 'car', label: 'Car' },
  { value: 'truck', label: 'Truck' },
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'other', label: 'Other' },
]

export function VehicleForm() {
  const { customerId = '', vehicleId } = useParams()
  const [params] = useSearchParams()
  const draft = !vehicleId ? params.get('draft') : null
  return <VehicleEditor key={[customerId, vehicleId, draft].join('/')} customerId={customerId} vehicleId={vehicleId} draft={draft} />
}

const blankVehicle = {
  type: 'car' as VehicleType,
  vin: '', licensePlate: '', year: '', make: '', model: '', trim: '', engine: '', color: '', mileage: '', notes: '',
}

function VehicleEditor({ customerId, vehicleId, draft }: { customerId: string; vehicleId?: string; draft: string | null }) {
  const editing = Boolean(vehicleId)
  const navigate = useNavigate()
  const cacheKey = draft ? draft + '.vehicle.' + customerId : null
  const [parent] = useState(() => draft ? readDraft(draft) : null)
  const [form, setForm] = useState(() => readIntakeForm(cacheKey, blankVehicle))
  const [decoding, setDecoding] = useState(false)
  const [decodeMsg, setDecodeMsg] = useState<string | null>(null)
  const [vinDecode, setVinDecode] = useState<Record<string, string> | undefined>()
  const [loaded, setLoaded] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const recordPath = '/customers/' + customerId + (vehicleId ? '/vehicles/' + vehicleId : '')

  useEffect(() => {
    let active = true
    Promise.all([customersRepo.get(customerId), vehicleId ? vehiclesRepo.get(vehicleId) : undefined]).then(([customer, v]) => {
      if (!active) return
      if (!customer || customer.deletedAt || (vehicleId && (!v || v.deletedAt || v.customerId !== customerId))) {
        setUnavailable(true)
      } else if (v) {
        setForm({
          type: v.type, vin: v.vin ?? '', licensePlate: v.licensePlate ?? '',
          year: v.year?.toString() ?? '', make: v.make ?? '', model: v.model ?? '', trim: v.trim ?? '',
          engine: v.engine ?? '', color: v.color ?? '', mileage: v.mileage?.toString() ?? '', notes: v.notes ?? '',
        })
        setVinDecode(v.vinDecode)
      }
      setLoaded(true)
    }).catch(() => { if (active) { setUnavailable(true); setLoaded(true) } })
    return () => { active = false }
  }, [customerId, vehicleId])

  async function update(next: typeof form) {
    setForm(next)
    try {
      await saveIntakeForm(cacheKey, blankVehicle, form, next)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this draft. Keep the page open until you add the vehicle.')
    }
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (k === 'vin') { setVinDecode(undefined); setDecodeMsg(null) }
    update({ ...form, [k]: e.target.value })
  }

  async function handleDecode() {
    const vin = form.vin.trim().toUpperCase()
    if (!isPlausibleVin(vin)) {
      setDecodeMsg('That doesn’t look like a valid VIN (11–17 characters).')
      return
    }
    setDecoding(true)
    setDecodeMsg(null)
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10000)
    try {
      const d = await decodeVin(vin, controller.signal)
      update({
        ...form,
        year: d.year?.toString() ?? form.year,
        make: d.make ?? form.make,
        model: d.model ?? form.model,
        trim: d.trim ?? form.trim,
        engine: d.engine ?? form.engine,
        type: d.type?.toLowerCase().includes('motorcycle') ? 'motorcycle'
          : d.type?.toLowerCase().includes('truck') ? 'truck' : form.type,
      })
      setVinDecode(d.raw)
      setDecodeMsg(d.make ? `Decoded: ${[d.year, d.make, d.model].filter(Boolean).join(' ')}` : (d.errorText || 'No match found — enter details manually.'))
    } catch {
      setDecodeMsg('Couldn’t reach the VIN service. You may be offline — enter details manually for now.')
    } finally {
      window.clearTimeout(timeout)
      setDecoding(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy.current) return
    if (![form.licensePlate, form.vin, form.make, form.model].some(value => value.trim())) {
      setError('Enter a plate, VIN, make or model to identify this vehicle.')
      return
    }
    const mileage = parseMileage(form.mileage)
    if (Number.isNaN(mileage) || (form.year.trim() && !/^\d{4}$/.test(form.year.trim()))) {
      setError('Enter a four-digit year and whole-number mileage, or leave them blank.')
      return
    }
    const payload = {
      customerId,
      type: form.type,
      vin: form.vin.trim().toUpperCase() || undefined,
      licensePlate: form.licensePlate.trim() || undefined,
      year: form.year.trim() ? Number(form.year.trim()) : undefined,
      make: form.make.trim() || undefined,
      model: form.model.trim() || undefined,
      trim: form.trim.trim() || undefined,
      engine: form.engine.trim() || undefined,
      color: form.color.trim() || undefined,
      mileage,
      notes: form.notes.trim() || undefined,
      vinDecode,
    }
    busy.current = true
    setSaving(true)
    try {
      if (vehicleId) {
        await vehiclesRepo.update(vehicleId, payload)
        navigate(recordPath)
      } else {
        const path = await createIntakeRecord(cacheKey, blankVehicle, form, parent, {
          table: db.vehicles, create: () => vehiclesRepo.create(payload), path: () => recordPath,
          selection: v => ({ customerId, vehicleId: v.id }),
        })
        navigate(path, { replace: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save vehicle. Please try again.')
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  async function cancel() {
    try {
      await saveIntakeForm(cacheKey, blankVehicle, form, null)
      navigate(draft ? intakePath(draft) : recordPath)
    } catch (err) { setError((err as Error).message) }
  }

  if (!loaded) return <p>Loading…</p>
  if (unavailable) return <p role="alert">This customer or vehicle is unavailable for editing.</p>

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={editing ? 'Edit vehicle' : 'New vehicle'} />
      <form onSubmit={submit}>
        <fieldset className="space-y-4" disabled={decoding || saving}>
          <Field label="VIN" htmlFor="vin" hint="Tip: decode to auto-fill year, make, model & engine.">
            <div className="flex gap-2">
              <TextInput id="vin" value={form.vin} onChange={set('vin')} className="uppercase"
                autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder="1HGCM82633A004352" />
              <Button type="button" variant="secondary" onClick={handleDecode} disabled={decoding}>
                {decoding ? 'Decoding…' : 'Decode'}
              </Button>
            </div>
          </Field>
          {decodeMsg && (
            <p className="-mt-2 text-sm text-brand-600 dark:text-brand-400">{decodeMsg}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" htmlFor="type">
              <select id="type" className="input" value={form.type} onChange={set('type')}>
                {VEHICLE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="License plate" htmlFor="plate">
              <TextInput id="plate" value={form.licensePlate} onChange={set('licensePlate')} className="uppercase" />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Year" htmlFor="year">
              <TextInput id="year" inputMode="numeric" value={form.year} onChange={set('year')} />
            </Field>
            <div className="col-span-2">
              <Field label="Make" htmlFor="make">
                <TextInput id="make" value={form.make} onChange={set('make')} />
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Model" htmlFor="model">
              <TextInput id="model" value={form.model} onChange={set('model')} />
            </Field>
            <Field label="Trim" htmlFor="trim">
              <TextInput id="trim" value={form.trim} onChange={set('trim')} />
            </Field>
          </div>

          <Field label="Engine" htmlFor="engine">
            <TextInput id="engine" value={form.engine} onChange={set('engine')} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Color" htmlFor="color">
              <TextInput id="color" value={form.color} onChange={set('color')} />
            </Field>
            <Field label="Mileage" htmlFor="mileage">
              <TextInput id="mileage" inputMode="numeric" value={form.mileage} onChange={set('mileage')} />
            </Field>
          </div>

          <Field label="Notes" htmlFor="notes">
            <TextArea id="notes" rows={2} value={form.notes} onChange={set('notes')} />
          </Field>

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="submit" full disabled={saving || decoding}>{editing ? 'Save changes' : 'Add vehicle'}</Button>
            <Button type="button" variant="secondary" onClick={cancel} disabled={saving}>Cancel</Button>
          </div>
        </fieldset>
      </form>
    </div>
  )
}
