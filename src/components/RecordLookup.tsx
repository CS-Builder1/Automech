import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useRecordIndex } from '@/hooks/useRecordIndex'
import { formatJobTotal } from '@/hooks/useMoney'
import { displayCustomer, displayVehicle, findRecords, isArchivedVehicle, vehiclePath } from '@/lib/records'
import { STATUS_META } from '@/lib/status'
import { EmptyState } from './ui/Page'

type Scope = 'all' | 'customers' | 'vehicles' | 'jobs'
const scopes: Scope[] = ['all', 'customers', 'vehicles', 'jobs']
const labels = { all: 'All records', customers: 'Customers', vehicles: 'Vehicles', jobs: 'Jobs' }

export function RecordLookup({ section }: { section?: 'customers' | 'jobs' }) {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') || ''
  const archived = params.get('archived') === '1'
  const group = params.get('type') as Scope
  const scope = section || (scopes.includes(group) ? group : 'all')
  const jobFilter = params.get('status') || (query || archived ? 'all' : 'open')
  const index = useRecordIndex()
  const matches = useMemo(() => index && findRecords(index, query, archived), [index, query, archived])
  function change(key: string, value: string) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
  }
  const customers = scope === 'all' || scope === 'customers' ? matches?.customers ?? [] : []
  const vehicles = scope === 'all' || scope === 'vehicles' ? matches?.vehicles ?? [] : []
  const jobs = scope === 'all' || scope === 'jobs' ? (matches?.jobs ?? []).filter((w) => {
    if (section !== 'jobs' || jobFilter === 'all') return true
    if (jobFilter === 'open') return !['invoiced', 'cancelled'].includes(w.status)
    return jobFilter === w.status
  }) : []
  const hasResults = customers.length + vehicles.length + jobs.length > 0
  const card = 'card block min-w-0 break-words px-4 py-3 hover:border-brand-300'
  const sub = 'text-sm text-slate-500 dark:text-slate-400'
  return (
    <div className="space-y-4">
      <input type="search" aria-label="Search records" className="input" value={query}
        placeholder="Name, phone, email, plate, VIN or RO number" onChange={(e) => change('q', e.target.value)} />
      <div className="flex flex-wrap items-center gap-3">
        {!section && <select aria-label="Record type" value={scope} onChange={(e) => change('type', e.target.value)} className="input !w-auto">
          {scopes.map((s) => <option key={s} value={s}>{labels[s]}</option>)}
        </select>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={archived}
          onChange={(e) => change('archived', e.target.checked ? '1' : '')} /> Show archived</label>
      </div>
      {section === 'jobs' && <div className="flex flex-wrap gap-2">
        {Object.entries({open:'Open', all:'All', estimate:'Estimates', completed:'Completed'}).map(([key, label]) => (
          <button type="button" key={key} aria-pressed={jobFilter === key}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${jobFilter === key ? 'bg-brand-600 text-white' : 'bg-slate-200 dark:bg-slate-800'}`}
            onClick={() => change('status', key)}>{label}</button>
        ))}
      </div>}
      {!matches || !index ? <p>Loading…</p> : !hasResults ? (
        <EmptyState title={query ? 'No matches' : archived ? 'No archived records' : section === 'customers' ? 'No customers yet' : section === 'jobs' && jobFilter === 'open' ? 'No open jobs' : 'No records found'}
          body={query ? 'Try another name, number or vehicle identifier.' : undefined} />
      ) : <>
        {customers.length > 0 && <section className="space-y-2">
          {scope === 'all' && <h2 className="font-semibold">Customers</h2>}
          {customers.map((c) => {
            const count = (index.customerVehicles.get(c.id) ?? []).filter((v) => isArchivedVehicle(v, c) === archived).length
            return <Link className={card} key={c.id} to={`/customers/${c.id}`}>
              <span className="font-semibold">{displayCustomer(c)}</span>
              <p className={sub}>{[c.company !== displayCustomer(c) && c.company, c.phone || c.email, `${count} vehicle${count === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</p>
            </Link>
          })}
        </section>}
        {vehicles.length > 0 && <section className="space-y-2">
          {scope === 'all' && <h2 className="font-semibold">Vehicles</h2>}
          {vehicles.map((v) => <Link className={card} key={v.id} to={vehiclePath(v)}>
            <span className="font-semibold">{displayVehicle(v)}</span>
            <p className={sub}>{[displayCustomer(index.customerById.get(v.customerId)), v.licensePlate, v.vin].filter(Boolean).join(' · ')}</p>
          </Link>)}
        </section>}
        {jobs.length > 0 && <section className="space-y-2">
          {scope === 'all' && <h2 className="font-semibold">Jobs</h2>}
          {jobs.map((w) => <Link className={card} key={w.id} to={`/jobs/${w.id}`}>
            <div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{w.number} · {STATUS_META[w.status].label}</span>
              <span className="font-semibold tabular-nums">{formatJobTotal(w, index.invoicesByJob.get(w.id))}</span></div>
            <p className={sub}>{[displayCustomer(index.customerById.get(w.customerId)), displayVehicle(index.vehicleById.get(w.vehicleId)), index.vehicleById.get(w.vehicleId)?.licensePlate].filter(Boolean).join(' · ')}</p>
            {w.complaint && <p className={sub}>{w.complaint}</p>}
          </Link>)}
        </section>}
      </>}
    </div>
  )
}
