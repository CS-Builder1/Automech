import { useEffect, useRef, useState } from 'react'
import { loadPayPalSdk, PAYPAL_CURRENCY } from '@/billing/paypal'

type Props =
  | { mode: 'subscription'; planId: string; onApproved: (ref: string) => void }
  | { mode: 'order'; amountMinor: number; onApproved: (ref: string) => void }

/** Renders PayPal Smart Buttons for a subscription or a one-off invoice payment. */
export function PayPalButton(props: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadPayPalSdk(props.mode)
      .then((paypal: any) => {
        if (cancelled || !ref.current) return
        ref.current.innerHTML = ''
        const buttons =
          props.mode === 'subscription'
            ? paypal.Buttons({
                style: { layout: 'horizontal', height: 40, label: 'subscribe' },
                createSubscription: (_d: unknown, actions: any) => actions.subscription.create({ plan_id: props.planId }),
                onApprove: (data: any) => props.onApproved(data.subscriptionID),
                onError: () => setError('PayPal had a problem. Please try again.'),
              })
            : paypal.Buttons({
                style: { layout: 'horizontal', height: 40, label: 'pay' },
                createOrder: (_d: unknown, actions: any) =>
                  actions.order.create({
                    purchase_units: [{ amount: { value: (props.amountMinor / 100).toFixed(2), currency_code: PAYPAL_CURRENCY } }],
                  }),
                onApprove: async (_data: any, actions: any) => {
                  const order = await actions.order.capture()
                  props.onApproved(order.id)
                },
                onError: () => setError('PayPal had a problem. Please try again.'),
              })
        buttons.render(ref.current)
      })
      .catch(() => setError('Could not load PayPal.'))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <div ref={ref} />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
