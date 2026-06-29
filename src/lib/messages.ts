// Client-side messaging via device deep links. Live two-way SMS (Twilio) needs a
// backend and lands once Supabase edge functions arrive (Sprint 6); until then a
// mechanic can text/call/WhatsApp in one tap with a pre-filled, editable message.

function clean(phone: string): string {
  return phone.replace(/[^\d+]/g, '')
}

export function telLink(phone: string): string {
  return `tel:${clean(phone)}`
}

export function smsLink(phone: string, body: string): string {
  // The `?&body=` form works on both iOS and Android.
  return `sms:${clean(phone)}?&body=${encodeURIComponent(body)}`
}

export function whatsappLink(phone: string, body: string): string {
  return `https://wa.me/${clean(phone).replace(/^\+/, '')}?text=${encodeURIComponent(body)}`
}

export interface MessageContext {
  shopName: string
  customerName: string
  vehicle?: string
}

export function declinedWorkMessage(ctx: MessageContext, items: string[]): string {
  const list = items.map((i) => `• ${i}`).join('\n')
  return `Hi ${ctx.customerName}, it's ${ctx.shopName}. When you're ready, we still recommend this work for your ${ctx.vehicle ?? 'vehicle'}:\n${list}\nHappy to book you in — just let us know.`
}

export function reminderMessage(ctx: MessageContext, title: string): string {
  return `Hi ${ctx.customerName}, a reminder from ${ctx.shopName}: ${title}${ctx.vehicle ? ` for your ${ctx.vehicle}` : ''} is due. Give us a shout to schedule it.`
}

export function appointmentMessage(ctx: MessageContext, whenLabel: string): string {
  return `Hi ${ctx.customerName}, confirming your appointment at ${ctx.shopName} on ${whenLabel}${ctx.vehicle ? ` for your ${ctx.vehicle}` : ''}. See you then!`
}
