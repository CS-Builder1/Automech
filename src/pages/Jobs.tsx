import { PageHeader, EmptyState } from '@/components/ui/Page'

export function Jobs() {
  return (
    <div>
      <PageHeader title="Jobs" subtitle="Work orders, estimates & approvals" />
      <EmptyState
        title="Coming in the next sprint"
        body="Repair orders, estimates with customer approval capture, and itemized invoices land here. Sprint 1 covers your customer & vehicle records first."
      />
    </div>
  )
}
