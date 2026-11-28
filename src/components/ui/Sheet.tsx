import type { KeyboardEvent, ReactNode } from 'react'
import { useId, useLayoutEffect, useRef } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

function keepTabInDialog(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return
  const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
    'button, input, select, textarea, a[href], [tabindex]',
  )).filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length > 0)
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

/** The native modal keeps background controls inert for keyboards and assistive technology. */
export function Sheet({ open, onClose, title, children }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const pressedBackdrop = useRef(false)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    dialog.showModal()
    const first = dialog.querySelector<HTMLElement>('[data-initial-focus]') ?? dialog.querySelector('button')
    first?.focus()
    return () => dialog.close()
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none items-end justify-center bg-transparent p-0 text-inherit open:flex md:items-center backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      onCancel={event => { event.preventDefault(); onClose() }}
      onKeyDown={keepTabInDialog}
      onPointerDown={event => { pressedBackdrop.current = event.target === event.currentTarget }}
      onClick={event => {
        if (pressedBackdrop.current && event.target === event.currentTarget) onClose()
        pressedBackdrop.current = false
      }}
    >
      <div tabIndex={-1} className="max-h-[90dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-5 shadow-xl md:rounded-2xl dark:bg-slate-900"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id={titleId} className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Close">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
