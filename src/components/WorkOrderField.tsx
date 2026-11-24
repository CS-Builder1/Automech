import { useEffect, useRef, useState } from 'react'
import type { WorkOrder } from '@/db/types'
import { workOrdersRepo } from '@/repositories/workOrders'

type Field = 'complaint' | 'diagnosis' | 'mileageIn' | 'mileageOut'

/** The same-tab draft covers reloads that interrupt the IndexedDB transaction. */
export function WorkOrderField({ order, field, label, readOnly, restoreEpoch }: {
  order: WorkOrder; field: Field; label: string; readOnly: boolean; restoreEpoch: string
}) {
  const draftKey = `automech:job-draft:${restoreEpoch}:${order.id}:${field}`
  const mileage = field === 'mileageIn' || field === 'mileageOut'
  const persisted = String(order[field] ?? '')
  const [value, setValue] = useState(() => readOnly ? persisted : sessionStorage.getItem(draftKey) ?? persisted)
  const [error, setError] = useState('')
  const writing = useRef(0)

  async function persist(raw: string) {
    const version = ++writing.current
    try {
      if (mileage && raw && (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))) {
        throw new Error('Enter a whole, nonnegative odometer reading.')
      }
      await workOrdersRepo.update(order.id, { [field]: raw === '' ? undefined : mileage ? Number(raw) : raw }, restoreEpoch)
      if (writing.current === version && sessionStorage.getItem(draftKey) === raw) {
        sessionStorage.removeItem(draftKey)
      }
    } catch (cause) {
      if (writing.current === version) setError((cause as Error).message)
    }
  }
  useEffect(() => {
    const draft = sessionStorage.getItem(draftKey)
    if (draft !== null && !readOnly) void persist(draft)
  }, [draftKey, readOnly])
  useEffect(() => {
    if (readOnly || sessionStorage.getItem(draftKey) === null) setValue(persisted)
  }, [persisted, readOnly, draftKey])
  function change(raw: string) {
    setValue(raw)
    setError('')
    sessionStorage.setItem(draftKey, raw)
    void persist(raw)
  }
  return (
    <label className="block">
      <span className="label">{label}</span>
      {mileage
        ? <input className="input" readOnly={readOnly} inputMode="numeric" value={value} onChange={e => change(e.target.value)} />
        : <textarea className="input" readOnly={readOnly} rows={2} value={value} onChange={e => change(e.target.value)} />}
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </label>
  )
}
