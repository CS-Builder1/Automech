import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { customersRepo } from '@/repositories/customers'
import { displayCustomer, displayVehicle, isArchivedJob, lastMileage, vehiclePath } from '@/lib/records'
import { PageHeader } from '@/components/ui/Page'
import { Button } from '@/components/ui/Button'
import { ServiceHistory } from '@/components/ServiceHistory'

export function CustomerDetail() {
  const { id = '' } = useParams()
  const [error, setError] = useState('')
  const records = useLiveQuery(async () => {
    const [customer, vehicles, jobs] = await Promise.all([
      db.customers.get(id), db.vehicles.where('customerId').equals(id).toArray(), db.workOrders.where('customerId').equals(id).toArray(),
    ])
    return { customer, vehicles, jobs: jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
  }, [id])
  if (!records) return <p>Loading…</p>
  const { customer, vehicles, jobs } = records
  if (!customer) return <p>Customer not found. <Link to="/customers" className="underline">Back to customers</Link></p>
  const archived = Boolean(customer.deletedAt)
  const vehiclesById = new Map(vehicles.map(v => [v.id, v]))

  async function changeArchive() {
    const activeVehicles = vehicles.filter(v => !v.deletedAt).length
    const activeJobs = jobs.filter(job => !isArchivedJob(job, customer, vehiclesById.get(job.vehicleId))).length
    if (!archived && !confirm(`Archive this customer with ${activeVehicles} vehicle(s) and ${activeJobs} job(s)? Their history will stay available in Archived. Restore the customer to resume work.`)) return
    try { await customersRepo.setArchived(id, !archived); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update this customer.') }
  }
  return <div className="mx-auto max-w-2xl space-y-5">
    <PageHeader title={displayCustomer(customer)} subtitle={customer.company !== displayCustomer(customer) ? customer.company : undefined}
      action={!archived && <Link className="rounded-xl bg-slate-200 px-3 py-2 font-semibold dark:bg-slate-800" to={`/customers/${id}/edit`}>Edit customer</Link>} />
    {archived && <p className="card p-3">Archived customer. Restore this record to make changes or start a job.</p>}
    <div className="card divide-y divide-slate-100 dark:divide-slate-800">
      <ContactRow label="Phone" value={customer.phone} href={customer.phone ? `tel:${customer.phone}` : undefined} />
      <ContactRow label="Email" value={customer.email} href={customer.email ? `mailto:${customer.email}` : undefined} />
      <ContactRow label="Address" value={customer.address} />
      <ContactRow label="Notes" value={customer.notes} />
    </div>
    <section>
      <div className="mb-2 flex items-center justify-between gap-2"><h2 className="font-semibold">Vehicles</h2>
        {!archived && <Link className="rounded-xl bg-brand-600 px-3 py-2 font-semibold text-white" to={`/customers/${id}/vehicles/new`}>+ Add vehicle</Link>}
      </div>
      {vehicles.length ? <ul className="space-y-2">{vehicles.map((v) => {
        const mileage = lastMileage(v, jobs.filter((w) => w.vehicleId === v.id))
        return <li key={v.id}><Link className="card block break-words px-4 py-3 hover:border-brand-300" to={vehiclePath(v)}>
          <strong>{displayVehicle(v)}{(v.deletedAt || archived) && ' · Archived'}</strong>
          <p className="text-sm text-slate-500">{[v.licensePlate && `Plate ${v.licensePlate}`, v.vin && `VIN ${v.vin}`, mileage !== undefined && `${mileage.toLocaleString()} mi`].filter(Boolean).join(' · ')}</p>
        </Link></li>
      })}</ul> : <p className="card p-4 text-sm text-slate-500">No vehicles yet.</p>}
    </section>
    <section>
      <div className="mb-2 flex items-center justify-between gap-2"><h2 className="font-semibold">Service history</h2>
        {!archived && <Link className="rounded-xl bg-slate-200 px-3 py-2 font-semibold dark:bg-slate-800" to={`/jobs/new?customerId=${id}`}>+ Start job</Link>}
      </div>
      <ServiceHistory jobs={jobs} vehicles={vehiclesById} />
    </section>
    <Button variant="secondary" onClick={changeArchive}>{archived ? 'Restore customer' : 'Archive customer'}</Button>
    {error && <p role="alert">{error}</p>}
  </div>
}

function ContactRow({ label, value, href }: { label: string; value?: string; href?: string }) {
  if (!value) return null
  return <div className="flex items-start justify-between gap-3 px-4 py-3">
    <span className="shrink-0 text-sm text-slate-500">{label}</span>
    {href ? <a href={href} className="min-w-0 break-all text-right font-medium text-brand-600 dark:text-brand-400">{value}</a>
      : <span className="min-w-0 whitespace-pre-wrap break-words text-right">{value}</span>}
  </div>
}
