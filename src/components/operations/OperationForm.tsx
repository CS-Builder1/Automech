import { useRef, useState, type ReactNode } from 'react'

interface Props {
  className: string
  onSubmit: (form: HTMLFormElement) => Promise<void>
  children: ReactNode
}

export function OperationForm({ className, onSubmit, children }: Props) {
  const pending = useRef(false)
  const [saving, setSaving] = useState(false)
  return (
    <form onSubmit={async event => {
      event.preventDefault()
      if (pending.current) return
      pending.current = true
      setSaving(true)
      try {
        await onSubmit(event.currentTarget)
      } finally {
        pending.current = false
        setSaving(false)
      }
    }}>
      <fieldset className={className} disabled={saving}>{children}</fieldset>
    </form>
  )
}
