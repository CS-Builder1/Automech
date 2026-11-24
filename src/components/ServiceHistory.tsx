import { Link } from 'react-router-dom'
import type { Vehicle, WorkOrder } from '@/db/types'
import { useMoney } from '@/hooks/useMoney'
import { computeTotals } from '@/lib/calc'
import { displayVehicle } from '@/lib/records'
import { STATUS_META } from '@/lib/status'

export function ServiceHistory({ jobs, vehicles }: { jobs: WorkOrder[]; vehicles?: Map<string, Vehicle> }) {
  const money = useMoney()
  if (!jobs.length) return <p className="card p-4 text-sm text-slate-500">No service history yet.</p>
  return <ul className="space-y-2">
    {jobs.map((job) => {
      const vehicle = vehicles?.get(job.vehicleId)
      const work = job.lineItems.map((item) => item.description).filter(Boolean).join(', ')
      const deferred = job.declinedItems?.map((item) => item.description).filter(Boolean).join(', ')
      const mileage = [
        job.mileageIn !== undefined && `${job.mileageIn.toLocaleString()} mi in`,
        job.mileageOut !== undefined && `${job.mileageOut.toLocaleString()} mi out`,
      ].filter(Boolean).join(' · ')
      return <li key={job.id}><Link className="card block break-words px-4 py-3 hover:border-brand-300" to={`/jobs/${job.id}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <strong>{job.number} · {STATUS_META[job.status].label}{job.deletedAt && ' · Archived'}</strong>
          <span>{money(computeTotals(job).total, job.currency)}</span>
        </div>
        <p className="text-sm text-slate-500">{[new Date(job.createdAt).toLocaleDateString(), vehicle && displayVehicle(vehicle), vehicle?.licensePlate, mileage].filter(Boolean).join(' · ')}</p>
        {job.complaint && <p className="mt-1 text-sm">Concern: {job.complaint}</p>}
        {job.diagnosis && <p className="text-sm">Diagnosis: {job.diagnosis}</p>}
        {work && <p className="text-sm">Work: {work}</p>}
        {deferred && <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Deferred: {deferred}</p>}
      </Link></li>
    })}
  </ul>
}
