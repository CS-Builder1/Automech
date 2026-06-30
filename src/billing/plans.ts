// Subscription tiers. Prices are USD minor units; the app can also show a pegged
// local price (e.g. XCD) via the shared money formatter. No annual lock-in — a
// deliberate differentiator against the incumbents.

export type PlanId = 'free' | 'pro' | 'enterprise'

export interface Entitlements {
  /** Caps — Infinity means unlimited. */
  customers: number
  invoicesPerMonth: number
  inspectionsPerMonth: number
  /** Feature flags. */
  onlineBooking: boolean
  customBranding: boolean
  advancedReporting: boolean
  team: boolean
  videoInspections: boolean
}

export interface Plan {
  id: PlanId
  name: string
  priceMinorUSD: number
  tagline: string
  highlights: string[]
  entitlements: Entitlements
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMinorUSD: 0,
    tagline: 'For hobbyists & side-hustle mechanics',
    highlights: ['Up to 25 customers', '10 invoices / month', '3 inspections / month', 'VIN decode & offline'],
    entitlements: {
      customers: 25,
      invoicesPerMonth: 10,
      inspectionsPerMonth: 3,
      onlineBooking: false,
      customBranding: false,
      advancedReporting: false,
      team: false,
      videoInspections: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMinorUSD: 2900,
    tagline: 'For the solo professional',
    highlights: ['Unlimited customers, invoices & DVI', 'Photos + video inspections', 'Reminders & online booking', 'Branding & profit reporting'],
    entitlements: {
      customers: Infinity,
      invoicesPerMonth: Infinity,
      inspectionsPerMonth: Infinity,
      onlineBooking: true,
      customBranding: true,
      advancedReporting: true,
      team: false,
      videoInspections: true,
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Team',
    priceMinorUSD: 7900,
    tagline: 'For shops with employees',
    highlights: ['Everything in Pro', 'Multi-tech roles & dispatch', 'Custom templates & API', 'Priority support'],
    entitlements: {
      customers: Infinity,
      invoicesPerMonth: Infinity,
      inspectionsPerMonth: Infinity,
      onlineBooking: true,
      customBranding: true,
      advancedReporting: true,
      team: true,
      videoInspections: true,
    },
  },
}

export const PLAN_ORDER: PlanId[] = ['free', 'pro', 'enterprise']

export function entitlementsFor(plan: PlanId | undefined): Entitlements {
  return PLANS[plan ?? 'free'].entitlements
}
