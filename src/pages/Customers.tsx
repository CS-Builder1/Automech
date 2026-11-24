import { Link } from 'react-router-dom'
import { RecordLookup } from '@/components/RecordLookup'
import { PageHeader } from '@/components/ui/Page'

export function Customers() {
  return <div><PageHeader title="Customers" action={<Link to="/customers/new" className="rounded-xl bg-brand-600 px-3 py-2 font-semibold text-white">+ Add customer</Link>} />
    <RecordLookup section="customers" /></div>
}
