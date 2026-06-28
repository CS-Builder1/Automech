import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { workOrdersRepo } from '@/repositories/workOrders'
import { useSettings } from '@/hooks/useSettings'
import { PageHeader, EmptyState } from '@/components/ui/Page'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, TextArea } from '@/components/ui/Field'

export function WorkOrderStart() {
  const navigate = useNavigate()
  const settings = useSettings()
  const [params] = useSearchParams()

  const customers = useLiveQuery(async () => (await db.customers.toArray()).filter((c) => !c.deletedAt), [])
  const [customerId, setCustomerId] = useState(params.get('customerId') ?? '')
  const vehicles = useLiveQuery(
    async () => (customerId ? (await db.vehicles.where('customerId').equals(customerId).toArray()).filter((v) => !v.deletedAt) : []),
    [customerId],
  )
  const [vehicleId, setVehicleId] = useState(params.get('vehicleId') ?? '')
  const [complaint, setComplaint] = useState('')
  const [mileageIn, setMileageIn] = useState('')

  useEffect(() => {
    // Auto-select the only vehicle, or clear stale selection when customer changes.
    if (vehicles && vehicles.length === 1) setVehicleId(vehicles[0].id)
    else if (vehicles && !vehicles.some((v) => v.id === vehicleId)) setVehicleId('')
  }, [vehicles]) // eslint-disable-line react-hooks/exhaustive-deps

  const canCreate = useMemo(() => Boolean(customerId && vehicleId), [customerId, vehicleId])

  async function create() {
    if (!canCreate || !settings) return
    const wo = await workOrdersRepo.create({
      customerId,
      vehicleId,
      status: 'estimate',
      complaint: complaint.trim() || undefined,
      mileageIn: mileageIn ? parseInt(mileageIn.replace(/[^0-9]/g, ''), 10) : undefined,
      lineItems: [],
      declinedItems: [],
      shopSuppliesPct: settings.shopSuppliesPct,
      taxRatePct: settings.defaultTaxRatePct,
    })
    navigate(`/jobs/${wo.id}`)
  }

  if (customers === undefined) return <p className="text-sm text-slate-400">Loading…</p>

  if (customers.length === 0) {
    return (
      <div>
        <PageHeader title="New job" />
        <EmptyState
          title="Add a customer first"
          body="A job is tied to a customer and their vehicle. Create a customer, then start the job."
          action={<Link to="/customers/new"><Button className="mt-2">+ Add customer</Button></Link>}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="New job" subtitle="Start an estimate / repair order" />
      <div className="space-y-4">
        <Field label="Customer" htmlFor="cust">
          <select id="cust" className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">— Select customer —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.firstName} {c.lastName}{c.company ? ` · ${c.company}` : ''}</option>
            ))}
          </select>
        </Field>

        {customerId && (
          <Field label="Vehicle" htmlFor="veh" hint={vehicles && vehicles.length === 0 ? 'This customer has no vehicles yet.' : undefined}>
            {vehicles && vehicles.length > 0 ? (
              <select id="veh" className="input" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                <option value="">— Select vehicle —</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}{v.licensePlate ? ` · ${v.licensePlate}` : ''}</option>
                ))}
              </select>
            ) : (
              <Link to={`/customers/${customerId}/vehicles/new`}>
                <Button variant="secondary" size="sm">+ Add a vehicle</Button>
              </Link>
            )}
          </Field>
        )}

        <Field label="Complaint / concern" htmlFor="complaint">
          <TextArea id="complaint" rows={3} value={complaint} onChange={(e) => setComplaint(e.target.value)}
            placeholder="What did the customer report?" />
        </Field>

        <Field label="Mileage in" htmlFor="mileage">
          <TextInput id="mileage" inputMode="numeric" value={mileageIn} onChange={(e) => setMileageIn(e.target.value)} />
        </Field>

        <div className="flex gap-3 pt-2">
          <Button full disabled={!canCreate} onClick={create}>Create estimate</Button>
          <Button variant="secondary" onClick={() => navigate('/jobs')}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}
