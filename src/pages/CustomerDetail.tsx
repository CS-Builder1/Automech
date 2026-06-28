import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { customersRepo } from '@/repositories/customers'
import { vehiclesRepo } from '@/repositories/vehicles'
import { PageHeader } from '@/components/ui/Page'
import { Button } from '@/components/ui/Button'

export function CustomerDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const customer = useLiveQuery(() => db.customers.get(id), [id])
  const vehicles = useLiveQuery(async () => vehiclesRepo.forCustomer(id), [id])

  if (customer === undefined) return <p className="text-sm text-slate-400">Loading…</p>
  if (!customer || customer.deletedAt) return <p className="text-sm text-slate-400">Customer not found.</p>

  async function remove() {
    if (!confirm('Delete this customer? Their vehicles will be hidden too.')) return
    await customersRepo.softDelete(id)
    navigate('/customers')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={`${customer.firstName} ${customer.lastName}`}
        subtitle={customer.company || undefined}
        action={
          <Link to={`/customers/${id}/edit`}>
            <Button variant="secondary" size="sm">Edit</Button>
          </Link>
        }
      />

      <div className="card mb-5 divide-y divide-slate-100 dark:divide-slate-800">
        <ContactRow label="Phone" value={customer.phone} href={customer.phone ? `tel:${customer.phone}` : undefined} />
        <ContactRow label="Email" value={customer.email} href={customer.email ? `mailto:${customer.email}` : undefined} />
        <ContactRow label="Address" value={customer.address} />
        {customer.notes && <ContactRow label="Notes" value={customer.notes} />}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Vehicles</h2>
        <Link to={`/customers/${id}/vehicles/new`}>
          <Button size="sm">+ Add vehicle</Button>
        </Link>
      </div>

      {vehicles && vehicles.length > 0 ? (
        <ul className="space-y-2">
          {vehicles.map((v) => (
            <li key={v.id}>
              <Link to={`/customers/${id}/vehicles/${v.id}/edit`} className="card flex items-center justify-between px-4 py-3 hover:border-brand-300">
                <div>
                  <div className="font-semibold">
                    {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {[v.licensePlate && `Plate ${v.licensePlate}`, v.vin && `VIN ${v.vin}`, v.mileage && `${v.mileage.toLocaleString()} mi`]
                      .filter(Boolean).join(' · ') || 'No details yet'}
                  </div>
                </div>
                <span className="text-xl">{v.type === 'motorcycle' ? '🏍️' : v.type === 'truck' ? '🚚' : '🚗'}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          No vehicles yet. Add one and decode the VIN to auto-fill the details.
        </p>
      )}

      <div className="mt-8">
        <Button variant="ghost" size="sm" onClick={remove} className="!text-red-600">Delete customer</Button>
      </div>
    </div>
  )
}

function ContactRow({ label, value, href }: { label: string; value?: string; href?: string }) {
  if (!value) return null
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      {href ? (
        <a href={href} className="font-medium text-brand-600 dark:text-brand-400">{value}</a>
      ) : (
        <span className="text-right font-medium">{value}</span>
      )}
    </div>
  )
}
