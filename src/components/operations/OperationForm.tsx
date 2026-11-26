import { useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'

interface Props {
  className: string
  fieldsClassName?: string
  submitLabel: string
  submitSize?: 'sm' | 'md'
  onSubmit: (form: HTMLFormElement) => Promise<void>
  children: ReactNode
}

export function OperationForm({
  className, fieldsClassName = 'contents', submitLabel, submitSize = 'sm', onSubmit, children,
}: Props) {
  const pending = useRef(false)
  const [saving, setSaving] = useState(false)
  return (
    <form className={className} aria-busy={saving} onSubmit={async event => {
      event.preventDefault()
      if (pending.current) return
      pending.current = true
      const form = event.currentTarget
      if (form.contains(document.activeElement)) {
        form.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus()
      }
      setSaving(true)
      try {
        await onSubmit(form)
      } finally {
        pending.current = false
        setSaving(false)
      }
    }}>
      <fieldset className={fieldsClassName} disabled={saving}>{children}</fieldset>
      <Button type="submit" size={submitSize} className="self-end aria-disabled:cursor-not-allowed aria-disabled:opacity-60" aria-disabled={saving}>
        {submitLabel}
      </Button>
    </form>
  )
}
