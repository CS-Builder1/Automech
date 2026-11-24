import { Link } from 'react-router-dom'
import { RecordLookup } from '@/components/RecordLookup'
import { PageHeader } from '@/components/ui/Page'

export function Jobs() {
  return <div><PageHeader title="Jobs" subtitle="Estimates, repair orders & approvals"
    action={<Link to="/jobs/new" className="rounded-xl bg-brand-600 px-3 py-2 font-semibold text-white">+ New job</Link>} />
    <RecordLookup section="jobs" /></div>
}
