import type { WorkOrderStatus } from '@/db/types'

export const STATUS_META: Record<WorkOrderStatus, { label: string; color: string }> = {
  estimate: { label: 'Estimate', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  awaiting_approval: { label: 'Awaiting approval', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  approved: { label: 'Approved', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  in_progress: { label: 'In progress', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300' },
  awaiting_parts: { label: 'Awaiting parts', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  quality_check: { label: 'Quality check', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  invoiced: { label: 'Invoiced', color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
}

/** Sensible ordering for status pickers / progression. */
export const STATUS_ORDER: WorkOrderStatus[] = [
  'estimate', 'awaiting_approval', 'approved', 'in_progress',
  'awaiting_parts', 'quality_check', 'completed', 'invoiced', 'cancelled',
]
