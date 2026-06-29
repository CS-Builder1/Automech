import type { PaymentMethod } from '@/db/types'

/**
 * Pluggable payment-provider layer.
 *
 * Every method is recorded the same way today (a Payment row with an optional
 * external reference) so cash-first shops work fully offline. Gateway providers
 * (Stripe, PayPal, WiPay, FAC) declare a `gateway` mode and an `initiateCheckout`
 * extension point that a later sprint fills in once API keys are configured —
 * the UI and data model already accommodate them.
 */

export type ProviderMode = 'manual' | 'gateway'

export interface CheckoutContext {
  invoiceId: string
  amount: number // minor units
  currency: string
  description: string
}

export interface CheckoutResult {
  reference: string
  redirectUrl?: string
}

export interface PaymentProvider {
  method: PaymentMethod
  label: string
  emoji: string
  mode: ProviderMode
  /** Informational — where this rail operates. */
  regions?: string
  /** True once live credentials are wired (gateways start false). */
  configured: boolean
  /** Short hint shown in the UI. */
  hint?: string
  /** Future hook for online checkout; throws until configured. */
  initiateCheckout?: (ctx: CheckoutContext) => Promise<CheckoutResult>
}

function notConfigured(name: string) {
  return async (): Promise<CheckoutResult> => {
    throw new Error(`${name} is not connected yet — record the payment manually for now.`)
  }
}

export const PAYMENT_PROVIDERS: PaymentProvider[] = [
  { method: 'cash', label: 'Cash', emoji: '💵', mode: 'manual', configured: true, hint: 'Most common locally — recorded instantly, works offline.' },
  { method: 'card', label: 'Card (in person)', emoji: '💳', mode: 'manual', configured: true, hint: 'Swiped/tapped on your own terminal — record the reference.' },
  { method: 'bank_transfer', label: 'Bank transfer', emoji: '🏦', mode: 'manual', configured: true },
  { method: 'stripe', label: 'Stripe', emoji: '🟣', mode: 'gateway', regions: 'US / global', configured: false, hint: 'Online card payments. Connect in a later sprint.', initiateCheckout: notConfigured('Stripe') },
  { method: 'paypal', label: 'PayPal', emoji: '🅿️', mode: 'gateway', regions: 'Global', configured: false, hint: 'Online checkout. Connect with your PayPal client ID/secret later.', initiateCheckout: notConfigured('PayPal') },
  { method: 'wipay', label: 'WiPay', emoji: '🌴', mode: 'gateway', regions: 'Caribbean / XCD', configured: false, hint: 'Eastern-Caribbean card rail. Connect in a later sprint.', initiateCheckout: notConfigured('WiPay') },
  { method: 'fac', label: 'First Atlantic Commerce', emoji: '🌊', mode: 'gateway', regions: 'Caribbean', configured: false, hint: 'Powertranz gateway via your acquiring bank.', initiateCheckout: notConfigured('First Atlantic Commerce') },
  { method: 'other', label: 'Other', emoji: '•', mode: 'manual', configured: true },
]

export function getProvider(method: PaymentMethod): PaymentProvider {
  return PAYMENT_PROVIDERS.find((p) => p.method === method) ?? PAYMENT_PROVIDERS[PAYMENT_PROVIDERS.length - 1]
}
