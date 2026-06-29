import { telLink, smsLink, whatsappLink } from '@/lib/messages'

interface Props {
  phone?: string
  message?: string
  size?: 'sm' | 'md'
}

/** Call / Text / WhatsApp quick actions via device deep links. */
export function ContactActions({ phone, message, size = 'md' }: Props) {
  if (!phone) return <span className="text-xs text-slate-400">No phone on file</span>
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'

  return (
    <div className="flex gap-2">
      <a href={telLink(phone)} className={`rounded-lg bg-slate-100 font-medium dark:bg-slate-800 ${pad}`}>Call</a>
      {message !== undefined && (
        <>
          <a href={smsLink(phone, message)} className={`rounded-lg bg-brand-600 font-medium text-white ${pad}`}>Text</a>
          <a href={whatsappLink(phone, message)} target="_blank" rel="noreferrer"
            className={`rounded-lg bg-emerald-600 font-medium text-white ${pad}`}>WhatsApp</a>
        </>
      )}
    </div>
  )
}
