import { Link } from 'react-router-dom'
import { useEntitlements } from '@/billing/entitlements'
import { PLANS } from '@/billing/plans'

export function PlanCard() {
  const { plan, usage } = useEntitlements()
  const p = PLANS[plan]
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Plan</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            You’re on <span className="font-medium text-slate-700 dark:text-slate-200">{p.name}</span>
            {plan === 'free' && ` · ${usage.customers}/${PLANS.free.entitlements.customers} customers used`}
          </p>
        </div>
        <Link to="/plans" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          {plan === 'free' ? 'Upgrade' : 'Manage'}
        </Link>
      </div>
    </section>
  )
}
