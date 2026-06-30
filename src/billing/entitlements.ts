import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { useSettings } from '@/hooks/useSettings'
import { entitlementsFor, PLANS, type Entitlements, type PlanId } from './plans'

function monthStartISO(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

export interface Usage {
  customers: number
  invoicesThisMonth: number
  inspectionsThisMonth: number
}

export interface EntitlementInfo {
  plan: PlanId
  planName: string
  entitlements: Entitlements
  usage: Usage
  /** True if a new record of this kind can be created on the current plan. */
  canAddCustomer: boolean
  canAddInvoice: boolean
  canAddInspection: boolean
}

export function useEntitlements(): EntitlementInfo {
  const settings = useSettings()
  const plan: PlanId = settings?.plan ?? 'free'
  const ent = entitlementsFor(plan)
  const since = monthStartISO()

  const usage = useLiveQuery(async () => {
    const customers = (await db.customers.toArray()).filter((c) => !c.deletedAt).length
    const invoicesThisMonth = (await db.invoices.toArray()).filter((i) => !i.deletedAt && i.createdAt >= since).length
    const inspectionsThisMonth = (await db.inspections.toArray()).filter((i) => !i.deletedAt && i.createdAt >= since).length
    return { customers, invoicesThisMonth, inspectionsThisMonth }
  }, [since]) ?? { customers: 0, invoicesThisMonth: 0, inspectionsThisMonth: 0 }

  return {
    plan,
    planName: PLANS[plan].name,
    entitlements: ent,
    usage,
    canAddCustomer: usage.customers < ent.customers,
    canAddInvoice: usage.invoicesThisMonth < ent.invoicesPerMonth,
    canAddInspection: usage.inspectionsThisMonth < ent.inspectionsPerMonth,
  }
}
