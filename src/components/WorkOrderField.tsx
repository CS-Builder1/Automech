import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { WorkOrder } from '@/db/types'
import { WorkOrderEditRejected, WorkOrderFieldConflict, workOrdersRepo } from '@/repositories/workOrders'

type Field = 'complaint' | 'diagnosis' | 'mileageIn' | 'mileageOut'

interface Draft {
  base: string
  value: string
}

function readDraft(key: string): Draft | string | null {
  let raw: string | null
  try { raw = sessionStorage.getItem(key) } catch { return null }
  if (raw === null) return null
  try {
    const draft = JSON.parse(raw)
    if (typeof draft?.base === 'string' && typeof draft.value === 'string') return draft
  } catch { /* Older drafts stored only the edited text. */ }
  return raw
}

function clearDraft(key: string) {
  try { sessionStorage.removeItem(key) } catch { /* IndexedDB is the source of truth. */ }
}

function writeDraft(key: string, draft: Draft) {
  try { sessionStorage.setItem(key, JSON.stringify(draft)) } catch { /* Keep the previous recovery copy if Web Storage is full. */ }
}

/** The same-tab draft covers reloads that interrupt the IndexedDB transaction. */
export function WorkOrderField({ order, field, label, readOnly, restoreEpoch }: {
  order: WorkOrder; field: Field; label: string; readOnly: boolean; restoreEpoch: string
}) {
  const draftKey = `automech:job-draft:${restoreEpoch}:${order.id}:${field}`
  const mileage = field === 'mileageIn' || field === 'mileageOut'
  const persisted = String(order[field] ?? '')
  const [value, setValue] = useState(persisted)
  const [error, setError] = useState<{ message: string; retry?: boolean }>()
  const [recovered, setRecovered] = useState<string | null>(null)
  const base = useRef(persisted)
  const pending = useRef<Draft | null>(null)
  const writing = useRef(false)

  async function persist() {
    if (writing.current) return
    writing.current = true
    setError(undefined)
    try {
      while (pending.current) {
        const draft = pending.current
        const raw = draft.value
        if (mileage && raw && (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))) {
          setError({message: 'Enter a whole, nonnegative odometer reading.'})
          return
        }
        const next = raw === '' ? undefined : mileage ? Number(raw) : raw
        await workOrdersRepo.update(order.id, { [field]: next }, restoreEpoch, {field, value: draft.base})
        base.current = String(next ?? '')
        if (pending.current === draft) {
          pending.current = null
          clearDraft(draftKey)
          setValue(base.current)
        } else if (pending.current) {
          // Keystrokes received during this write now build on its committed value.
          pending.current.base = base.current
          writeDraft(draftKey, pending.current)
        }
      }
    } catch (cause) {
      if (cause instanceof WorkOrderEditRejected) {
        pending.current = null
        clearDraft(draftKey)
        if (cause instanceof WorkOrderFieldConflict) base.current = cause.currentValue
        setValue(base.current)
        setError({message: cause.message})
      } else if (pending.current) {
        // Edits typed during the failed write are already in pending and in the journal when available.
        setError({message: 'Could not save this edit. Keep this tab open and retry.', retry: true})
      }
    } finally {
      writing.current = false
    }
  }
  useEffect(() => {
    base.current = persisted
    if (!pending.current || readOnly) setValue(persisted)
  }, [persisted, readOnly])
  useEffect(() => {
    const draft = pending.current ?? readDraft(draftKey)
    if (typeof draft === 'string') {
      setRecovered(draft)
      return
    }
    if (!draft) return
    if (readOnly || draft.base !== persisted) {
      pending.current = null
      clearDraft(draftKey)
      setValue(persisted)
      if (draft.value !== persisted) setError({message: readOnly ? 'This job is read-only.' : new WorkOrderFieldConflict(persisted).message})
    } else if (!writing.current) {
      pending.current = draft
      setValue(draft.value)
      void persist()
    }
  }, [draftKey, readOnly])
  function change(raw: string) {
    setValue(raw)
    setError(undefined)
    const draft = {base: pending.current?.base ?? base.current, value: raw}
    pending.current = draft
    writeDraft(draftKey, draft)
    void persist()
  }
  return (
    <div>
      <label className="block">
        <span className="label">{label}</span>
        {mileage
          ? <input className="input" readOnly={readOnly || recovered !== null} inputMode="numeric" value={value} onChange={e => change(e.target.value)} />
          : <textarea className="input" readOnly={readOnly || recovered !== null} rows={2} value={value} onChange={e => change(e.target.value)} />}
      </label>
      {error && <span role="alert" className="text-xs text-red-700">{error.message}</span>}
      {error?.retry && !readOnly && <Button type="button" variant="secondary" size="sm" onClick={() => void persist()}>Retry save</Button>}
      {recovered !== null && <div className="mt-2 space-y-2 text-sm">
        <p>Unsaved edit from an earlier version</p>
        <pre className="whitespace-pre-wrap break-words font-sans">{recovered || '(empty field)'}</pre>
        <div className="flex flex-wrap gap-2">
          {!readOnly && <Button type="button" size="sm" onClick={() => {
            setRecovered(null)
            change(recovered)
          }}>Use recovered edit</Button>}
          <Button type="button" size="sm" variant="secondary" onClick={() => {
            clearDraft(draftKey)
            setRecovered(null)
          }}>Discard recovered edit</Button>
        </div>
      </div>}
    </div>
  )
}
