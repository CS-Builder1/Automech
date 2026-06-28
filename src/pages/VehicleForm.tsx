import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { vehiclesRepo } from '@/repositories/vehicles'
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
  const editing = Boolean(vehicleId)
  const navigate = useNavigate()

  const [form, setForm] = useState({
    type: 'car' as VehicleType,
    vin: '', licensePlate: '', year: '', make: '', model: '', trim: '', engine: '', color: '', mileage: '', notes: '',
  })
  const [decoding, setDecoding] = useState(false)
  const [decodeMsg, setDecodeMsg] = useState<string | null>(null)
  const [vinDecode, setVinDecode] = useState<Record<string, string> | undefined>()

  useEffect(() => {
    if (!vehicleId) return
    vehiclesRepo.get(vehicleId).then((v) => {
      if (!v) return
      setForm({
        type: v.type, vin: v.vin ?? '', licensePlate: v.licensePlate ?? '',
        year: v.year?.toString() ?? '', make: v.make ?? '', model: v.model ?? '', trim: v.trim ?? '',
        engine: v.engine ?? '', color: v.color ?? '', mileage: v.mileage?.toString() ?? '', notes: v.notes ?? '',
      })
      setVinDecode(v.vinDecode)
    })
  }, [vehicleId])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function handleDecode() {
    const vin = form.vin.trim().toUpperCase()
    if (!isPlausibleVin(vin)) {
      setDecodeMsg('That doesn’t look like a valid VIN (11–17 characters).')
      return
    }
    setDecoding(true)
    setDecodeMsg(null)
    try {
      const d = await decodeVin(vin)
      setForm((f) => ({
        ...f,
        year: d.year?.toString() ?? f.year,
        make: d.make ?? f.make,
        model: d.model ?? f.model,
        trim: d.trim ?? f.trim,
        engine: d.engine ?? f.engine,
        type: d.type?.toLowerCase().includes('motorcycle') ? 'motorcycle'
          : d.type?.toLowerCase().includes('truck') ? 'truck' : f.type,
      }))
      setVinDecode(d.raw)
      setDecodeMsg(d.make ? `Decoded: ${[d.year, d.make, d.model].filter(Boolean).join(' ')}` : (d.errorText || 'No match found — enter details manually.'))
    } catch {
      setDecodeMsg('Couldn’t reach the VIN service. You may be offline — enter details manually for now.')
    } finally {
      setDecoding(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      customerId,
      type: form.type,
      vin: form.vin.trim().toUpperCase() || undefined,
      licensePlate: form.licensePlate.trim() || undefined,
      year: form.year ? parseInt(form.year, 10) : undefined,
      make: form.make.trim() || undefined,
      model: form.model.trim() || undefined,
      trim: form.trim.trim() || undefined,
      engine: form.engine.trim() || undefined,
      color: form.color.trim() || undefined,
      mileage: form.mileage ? parseInt(form.mileage.replace(/[^0-9]/g, ''), 10) : undefined,
      notes: form.notes.trim() || undefined,
      vinDecode,
    }
    if (editing && vehicleId) {
      await vehiclesRepo.update(vehicleId, payload)
    } else {
      await vehiclesRepo.create(payload)
    }
    navigate(`/customers/${customerId}`)
  }

  async function remove() {
    if (!vehicleId || !confirm('Delete this vehicle?')) return
    await vehiclesRepo.softDelete(vehicleId)
    navigate(`/customers/${customerId}`)
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={editing ? 'Edit vehicle' : 'New vehicle'} />
      <form onSubmit={submit} className="space-y-4">
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

        <div className="flex gap-3 pt-2">
          <Button type="submit" full>{editing ? 'Save changes' : 'Add vehicle'}</Button>
          <Button type="button" variant="secondary" onClick={() => navigate(`/customers/${customerId}`)}>Cancel</Button>
        </div>
        {editing && (
          <Button type="button" variant="ghost" size="sm" onClick={remove} className="!text-red-600">Delete vehicle</Button>
        )}
      </form>
    </div>
  )
}
