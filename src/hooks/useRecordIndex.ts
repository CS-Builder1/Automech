import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { indexRecords } from '@/lib/records'
import { invoicesForJobs } from '@/repositories/billing'

export function useRecordIndex() {
  return useLiveQuery(() => db.transaction('r', [db.customers, db.vehicles, db.workOrders, db.invoices], async () => {
    const [customers, vehicles, jobs] = await Promise.all([
      db.customers.toArray(), db.vehicles.toArray(), db.workOrders.toArray(),
    ])
    return { ...indexRecords(customers, vehicles, jobs), invoicesByJob: await invoicesForJobs(jobs) }
  }), [])
}
