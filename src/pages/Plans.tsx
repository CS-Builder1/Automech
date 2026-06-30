import { useState } from 'react'
import { PLANS, PLAN_ORDER, type PlanId } from '@/billing/plans'
import { setPlan } from '@/billing/actions'
import { useEntitlements } from '@/billing/entitlements'
import { isPaypalConfigured, hasPlanId, PAYPAL_PLAN_IDS } from '@/billing/paypal'
import { useMoney } from '@/hooks/useMoney'
import { PageHeader } from '@/components/ui/Page'
import { Button } from '@/components/ui/Button'
import { PayPalButton } from '@/components/PayPalButton'

export function Plans() {
  const money = useMoney()
  const { plan: current, usage } = useEntitlements()
  const [confirming, setConfirming] = useState<PlanId | null>(null)

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Plans" subtitle="Simple pricing. No contracts — cancel anytime." />

      <div className="mb-4 rounded-xl bg-slate-100 px-4 py-3 text-sm dark:bg-slate-800">
        You’re on the <span className="font-semibold">{PLANS[current].name}</span> plan.
        {current === 'free' && (
          <> Using {usage.customers}/{PLANS.free.entitlements.customers} customers, {usage.invoicesThisMonth}/{PLANS.free.entitlements.invoicesPerMonth} invoices and {usage.inspectionsThisMonth}/{PLANS.free.entitlements.inspectionsPerMonth} inspections this month.</>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLAN_ORDER.map((id) => {
          const plan = PLANS[id]
          const isCurrent = id === current
          const paid = id !== 'free'
          return (
            <div key={id} className={`card flex flex-col p-5 ${isCurrent ? 'ring-2 ring-brand-500' : ''}`}>
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-bold">{plan.name}</h2>
                {id === 'pro' && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">Popular</span>}
              </div>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{plan.tagline}</p>
              <div className="mt-3 text-2xl font-bold">
                {plan.priceMinorUSD === 0 ? 'Free' : <>{money(plan.priceMinorUSD)}<span className="text-sm font-normal text-slate-500">/mo</span></>}
              </div>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex gap-2"><span className="text-emerald-600">✓</span>{h}</li>
                ))}
              </ul>

              <div className="mt-5">
                {isCurrent ? (
                  <Button full variant="secondary" disabled>Current plan</Button>
                ) : !paid ? (
                  <Button full variant="secondary" onClick={() => void setPlan('free')}>Downgrade to Free</Button>
                ) : confirming === id ? (
                  <PaidCta planId={id} onDone={() => setConfirming(null)} />
                ) : (
                  <Button full onClick={() => setConfirming(id)}>Choose {plan.name}</Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        Prices shown in your shop currency. Billed monthly via PayPal — no annual lock-in.
      </p>
    </div>
  )
}

function PaidCta({ planId, onDone }: { planId: 'pro' | 'enterprise'; onDone: () => void }) {
  const configured = isPaypalConfigured() && hasPlanId(planId)

  if (configured) {
    return (
      <PayPalButton
        mode="subscription"
        planId={PAYPAL_PLAN_IDS[planId]!}
        onApproved={async (ref) => { await setPlan(planId, ref); onDone() }}
      />
    )
  }

  // PayPal not wired yet: explain, and in dev allow simulating the upgrade.
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Online checkout isn’t connected yet. Add your PayPal client ID and plan IDs to enable subscriptions.
      </p>
      {import.meta.env.DEV && (
        <Button full size="sm" variant="secondary" onClick={async () => { await setPlan(planId); onDone() }}>
          Simulate upgrade (dev)
        </Button>
      )}
      <Button full size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
    </div>
  )
}
