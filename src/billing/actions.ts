import { saveSettings } from '@/hooks/useSettings'
import type { PlanId } from './plans'

/**
 * Set the active plan. In production this is only reached after a successful
 * PayPal subscription approval; a backend webhook should ultimately be the
 * authoritative source (a later hardening step).
 */
export async function setPlan(plan: PlanId, subscriptionRef?: string): Promise<void> {
  await saveSettings({ plan, subscriptionRef })
}
