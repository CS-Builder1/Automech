import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { workOrdersRepo } from '@/repositories/workOrders'
import { useIntakeAutosave } from '@/hooks/useIntakeAutosave'
import { useSettings } from '@/hooks/useSettings'
import { beginIntake, cancelIntake, finishIntake, intakePath, otherIntakes, parseMileage, readDraft, updateIntake } from '@/lib/intakeDraft'
import type { IntakeDraft } from '@/lib/intakeDraft'
import { displayCustomer } from '@/lib/records'
import { PageHeader } from '@/components/ui/Page'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, TextArea } from '@/components/ui/Field'

export function WorkOrderStart() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [ready, setReady] = useState<{ id: string; draft: IntakeDraft; others: ReturnType<typeof otherIntakes> }>()
  const [error, setError] = useState('')
  useEffect(() => {
    try {
      const id = beginIntake(params)
      if (params.get('draft') !== id) {
        navigate(intakePath(id), { replace: true })
        return
      }
      const draft = readDraft(id)
      if (draft) setReady({ id, draft, others: otherIntakes(id) })
    } catch {
      setError('Device storage is unavailable. Enable site storage and reload to start a job.')
    }
  }, [params, navigate])

  if (error) return <p role="alert">{error}</p>
  if (!ready || ready.id !== params.get('draft')) return <p>Opening intake…</p>
  return <Intake key={ready.id} id={ready.id} initial={ready.draft} others={ready.others} />
}

function Intake({ id, initial, others }: {
  id: string; initial: IntakeDraft; others: ReturnType<typeof otherIntakes>
}) {
  const navigate = useNavigate()
  const settings = useSettings()
  const [draft, setDraft] = useState(initial)
  const autosave = useIntakeAutosave(initial, (expected, next) => updateIntake(id, expected, next))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const customers = useLiveQuery(async () =>
    (await db.customers.toArray()).filter(c => !c.deletedAt).sort((a, b) => displayCustomer(a).localeCompare(displayCustomer(b))), [])
  const customer = customers?.find(c => c.id === draft.customerId)
  const vehicles = useLiveQuery(async () => {
    if (!customer) return []
    return (await db.vehicles.where('customerId').equals(customer.id).toArray()).filter(v => !v.deletedAt)
  }, [customer?.id])
  const availableVehicles = vehicles?.filter(v => v.customerId === customer?.id) ?? []
  const picked = availableVehicles.find(v => v.id === draft.vehicleId)
  // An archived or mismatched explicit choice requires a fresh selection.
  const vehicle = picked ?? (!draft.vehicleId && availableVehicles.length === 1 ? availableVehicles[0] : undefined)

  async function change(patch: Partial<IntakeDraft>) {
    const next = { ...draft, ...patch }
    setDraft(next)
    try {
      await autosave.save(next)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the intake draft. Keep this page open and free device storage.')
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!settings || !customer || !vehicle || busy.current) return
    const mileageIn = parseMileage(draft.mileageIn)
    if (Number.isNaN(mileageIn)) {
      setError('Enter a whole number for mileage in.')
      return
    }
    busy.current = true
    setSaving(true)
    try {
      const wo = await workOrdersRepo.create({
        customerId: customer.id, vehicleId: vehicle.id, status: 'estimate',
        complaint: draft.complaint.trim() || undefined, mileageIn,
        lineItems: [], declinedItems: [],
        shopSuppliesPct: settings.shopSuppliesPct,
        taxRatePct: customer.taxExempt ? 0 : settings.defaultTaxRatePct,
      }, { id, draft: await autosave.lastSaved() })
      try {
        finishIntake(id)
      } finally {
        navigate('/jobs/' + wo.id, { replace: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the estimate. Your intake draft is still available.')
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  const draftQuery = '?' + new URLSearchParams({ draft: id })
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="New job" subtitle="Intake draft saved on this device" />
      {others.length > 0 && <ul className="mb-4 space-y-2">
        {others.map(({ id: savedId, draft: saved }) => {
          const owner = customers?.find(c => c.id === saved.customerId)
          const description = [owner && displayCustomer(owner), saved.complaint.trim()].filter(Boolean).join(' · ')
          return <li key={savedId}><Link className="font-medium text-brand-600" to={intakePath(savedId)}>
            Resume intake {description ? 'for ' + description : 'from ' + new Date(saved.updatedAt ?? Date.now()).toLocaleString()}
          </Link></li>
        })}
      </ul>}
      <form className="space-y-4" onSubmit={create}>
        <Field label="Customer" htmlFor="cust"
          hint={customers && draft.customerId && !customer ? 'The previous customer is unavailable. Choose an active customer.' : undefined}>
          <select id="cust" className="input" value={customer?.id ?? ''} onChange={e => change({ customerId: e.target.value, vehicleId: '' })}>
            <option value="">Select customer</option>
            {customers?.map(c => <option key={c.id} value={c.id}>{displayCustomer(c)}</option>)}
          </select>
          <Link className="mt-2 inline-block font-medium text-brand-600" to={'/customers/new' + draftQuery}>+ Add customer</Link>
        </Field>
        {customer && (
          <Field label="Vehicle" htmlFor="veh"
            hint={vehicles && draft.vehicleId && !picked ? 'The previous vehicle is unavailable. Choose an active vehicle.' : undefined}>
            <select id="veh" className="input" value={vehicle?.id ?? ''} onChange={e => change({ vehicleId: e.target.value })}>
              <option value="">Select vehicle</option>
              {availableVehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}{v.licensePlate ? ' · ' + v.licensePlate : ''}
                </option>
              ))}
            </select>
            <Link className="mt-2 inline-block font-medium text-brand-600" to={'/customers/' + customer.id + '/vehicles/new' + draftQuery}>+ Add a vehicle</Link>
          </Field>
        )}
        <Field label="Complaint / concern" htmlFor="complaint">
          <TextArea id="complaint" rows={3} value={draft.complaint} onChange={e => change({ complaint: e.target.value })}
            placeholder="What did the customer report?" />
        </Field>
        <Field label="Mileage in" htmlFor="mileage">
          <TextInput id="mileage" inputMode="numeric" value={draft.mileageIn} onChange={e => change({ mileageIn: e.target.value })} />
        </Field>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button full type="submit" disabled={!customer || !vehicle || !settings || saving}>Create estimate</Button>
          <Button type="button" variant="secondary" disabled={saving} onClick={async () => {
            try {
              await cancelIntake(id, await autosave.lastSaved())
            } catch { /* Another editor may have changed or closed the draft. */ }
            navigate('/jobs', { replace: true })
          }}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}
