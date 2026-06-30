// PayPal config + SDK loader. Config-gated like cloud sync: with no client id the
// app shows manual fallbacks and never loads PayPal. Client-side flows (subscribe
// + order capture) need only the public client id; webhook verification is a
// later backend hardening step.

const CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined
export const PAYPAL_CURRENCY = (import.meta.env.VITE_PAYPAL_CURRENCY as string | undefined) ?? 'USD'
export const PAYPAL_PLAN_IDS: Record<'pro' | 'enterprise', string | undefined> = {
  pro: import.meta.env.VITE_PAYPAL_PLAN_PRO as string | undefined,
  enterprise: import.meta.env.VITE_PAYPAL_PLAN_ENTERPRISE as string | undefined,
}

export function isPaypalConfigured(): boolean {
  return Boolean(CLIENT_ID)
}

export function hasPlanId(plan: 'pro' | 'enterprise'): boolean {
  return Boolean(PAYPAL_PLAN_IDS[plan])
}

declare global {
  interface Window { [key: string]: unknown }
}

/** Load a namespaced PayPal SDK instance so subscription + order configs coexist. */
export function loadPayPalSdk(mode: 'subscription' | 'order'): Promise<any> {
  if (!CLIENT_ID) return Promise.reject(new Error('PayPal is not configured.'))
  const namespace = mode === 'subscription' ? 'paypal_sub' : 'paypal_ord'
  const params = new URLSearchParams({ 'client-id': CLIENT_ID, currency: PAYPAL_CURRENCY, components: 'buttons' })
  if (mode === 'subscription') { params.set('intent', 'subscription'); params.set('vault', 'true') }
  const src = `https://www.paypal.com/sdk/js?${params.toString()}`

  const existingSdk = (window as Window)[namespace]
  if (existingSdk) return Promise.resolve(existingSdk)

  return new Promise((resolve, reject) => {
    const prior = document.querySelector<HTMLScriptElement>(`script[data-ns="${namespace}"]`)
    if (prior) {
      prior.addEventListener('load', () => resolve((window as Window)[namespace]))
      prior.addEventListener('error', reject)
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.dataset.ns = namespace
    script.setAttribute('data-namespace', namespace)
    script.onload = () => resolve((window as Window)[namespace])
    script.onerror = () => reject(new Error('Failed to load PayPal SDK'))
    document.head.appendChild(script)
  })
}
