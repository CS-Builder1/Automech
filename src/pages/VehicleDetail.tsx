import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { vehiclesRepo } from '@/repositories/vehicles'
import { displayCustomer, displayVehicle, lastMileage, vehiclePath } from '@/lib/records'
import { PageHeader } from '@/components/ui/Page'
import { Button } from '@/components/ui/Button'
import { ServiceHistory } from '@/components/ServiceHistory'

export function VehicleDetail() {
  const { customerId = '', vehicleId = '' } = useParams()
  const [error, setError] = useState('')
  const record = useLiveQuery(async () => {
    const [vehicle, customer, jobs] = await Promise.all([
      db.vehicles.get(vehicleId), db.customers.get(customerId), db.workOrders.where('vehicleId').equals(vehicleId).toArray(),
    ])
    return { vehicle, customer, jobs: jobs.filter((w) => w.customerId === customerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
  }, [vehicleId, customerId])
  if (!record) return <p>Loading…</p>
  const { vehicle, customer, jobs } = record
  if (!vehicle || !customer || vehicle.customerId !== customerId) return <p>Vehicle not found. <Link className="underline" to="/search?type=vehicles">Find a vehicle</Link></p>
  const archived = Boolean(vehicle.deletedAt || customer.deletedAt)
  const mileage = lastMileage(vehicle, jobs)

  async function changeArchive() {
    if (!vehicle!.deletedAt && !confirm(`Archive this vehicle with ${jobs.length} job(s)? Its service history will remain available in Archived.`)) return
    try { await vehiclesRepo.setArchived(vehicleId, !vehicle!.deletedAt); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update this vehicle.') }
  }
  return <div className="mx-auto max-w-2xl space-y-5">
    <PageHeader title={displayVehicle(vehicle)} action={!archived && <Link className="rounded-xl bg-slate-200 px-3 py-2 font-semibold dark:bg-slate-800" to={`${vehiclePath(vehicle)}/edit`}>Edit vehicle</Link>} />
    <div className="card space-y-2 break-words p-4">
      <p><Link className="font-semibold text-brand-600 dark:text-brand-400" to={`/customers/${customer.id}`}>{displayCustomer(customer)}</Link></p>
      {archived && <p className="text-sm font-semibold">{customer.deletedAt ? 'Archived customer. Restore the customer to manage this vehicle.' : 'Archived vehicle'}</p>}
      {vehicle.licensePlate && <p>Plate {vehicle.licensePlate}</p>}
      {vehicle.vin && <p>VIN {vehicle.vin}</p>}
      {mileage !== undefined && <p>Last known odometer · {mileage.toLocaleString()} mi</p>}
      {[vehicle.trim, vehicle.engine, vehicle.color].some(Boolean) && <p>{[vehicle.trim, vehicle.engine, vehicle.color].filter(Boolean).join(' · ')}</p>}
      {vehicle.notes && <p className="whitespace-pre-wrap">{vehicle.notes}</p>}
    </div>
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Service history</h2>
        {!archived && <Link className="rounded-xl bg-brand-600 px-3 py-2 font-semibold text-white" to={`/jobs/new?customerId=${customerId}&vehicleId=${vehicleId}`}>+ Start job</Link>}
      </div>
      <ServiceHistory jobs={jobs} />
    </section>
    {!customer.deletedAt && <Button variant="secondary" onClick={changeArchive}>{vehicle.deletedAt ? 'Restore vehicle' : 'Archive vehicle'}</Button>}
    {error && <p role="alert">{error}</p>}
  </div>
}
