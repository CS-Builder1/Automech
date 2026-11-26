import { useState } from 'react'
import type { LineItem, LineItemKind, PartStatus } from '@/db/types'
import { newId } from '@/lib/id'
import { parseAmountToMinor, parseQuantity, minorToDecimal } from '@/lib/money'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { Field, TextInput } from './ui/Field'

const KINDS: { value: LineItemKind; label: string }[] = [
  { value: 'labor', label: 'Labor' },
  { value: 'part', label: 'Part' },
  { value: 'sublet', label: 'Sublet' },
  { value: 'fee', label: 'Fee' },
  { value: 'discount', label: 'Discount' },
]

const PART_STATUSES: PartStatus[] = ['needed', 'quoted', 'ordered', 'received']

interface Props {
  open: boolean
  initial?: LineItem
  defaultLaborRate: number
  defaultMarkupPct: number
  defaultTaxRatePct: number
  onClose: () => void
  onSave: (item: LineItem) => Promise<void>
  onDelete?: () => Promise<void>
}

export function LineItemEditor({ open, initial, defaultLaborRate, defaultMarkupPct, defaultTaxRatePct, onClose, onSave, onDelete }: Props) {
  const [kind, setKind] = useState<LineItemKind>(initial?.kind ?? 'labor')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [partNumber, setPartNumber] = useState(initial?.partNumber ?? '')
  const [supplier, setSupplier] = useState(initial?.supplier ?? '')
  const [partStatus, setPartStatus] = useState<PartStatus>(initial?.partStatus ?? 'needed')
  const [hours, setHours] = useState((initial?.hours ?? initial?.quantity ?? 1).toString())
  const [actualHours, setActualHours] = useState(initial?.actualHours?.toString() ?? '')
  const [hourlyCost, setHourlyCost] = useState(initial?.hourlyCost === undefined ? '' : minorToDecimal(initial.hourlyCost).toString())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [quantity, setQuantity] = useState(initial?.quantity?.toString() ?? '1')
  const [unitCost, setUnitCost] = useState(initial?.unitCost ? minorToDecimal(initial.unitCost).toString() : '')
  const [unitPrice, setUnitPrice] = useState(
    initial ? minorToDecimal(initial.unitPrice).toString() : minorToDecimal(defaultLaborRate).toString(),
  )
  const [taxable, setTaxable] = useState(initial?.taxable ?? (defaultTaxRatePct > 0))

  const isLabor = kind === 'labor'
  const isPart = kind === 'part'

  function changeKind(next: LineItemKind) {
    setKind(next)
    if (next === 'labor' || kind === 'labor') setUnitPrice(next === 'labor' ? minorToDecimal(defaultLaborRate).toString() : '')
    setError('')
  }

  function applyMarkup() {
    try {
      const priced = Math.round(parseAmountToMinor(unitCost) * (1 + defaultMarkupPct / 100))
      setUnitPrice(minorToDecimal(priced).toString())
      setError('')
    } catch (cause) { setError((cause as Error).message) }
  }

  async function save() {
    try {
      setError('')
      if (!description.trim()) throw new Error('Describe the work or item.')
      const qty = parseQuantity(isLabor ? hours : quantity)
      if (qty <= 0) throw new Error('Billed hours or quantity must be greater than zero.')
      if (isLabor && hourlyCost && !actualHours) {
        throw new Error('Enter actual hours to calculate direct labor cost.')
      }
      const item: LineItem = {
        id: initial?.id ?? newId(), kind, description: description.trim(), quantity: qty,
        unitPrice: parseAmountToMinor(unitPrice),
        hours: isLabor ? qty : undefined,
        actualHours: isLabor && actualHours ? parseQuantity(actualHours) : undefined,
        hourlyCost: isLabor && hourlyCost ? parseAmountToMinor(hourlyCost) : undefined,
        partNumber: isPart ? partNumber.trim() || undefined : undefined,
        supplier: isPart ? supplier.trim() || undefined : undefined,
        expectedAt: isPart ? initial?.expectedAt : undefined,
        partStatus: isPart ? partStatus : undefined,
        unitCost: (isPart || kind === 'sublet') && unitCost ? parseAmountToMinor(unitCost) : undefined,
        taxable: kind === 'discount' ? false : taxable,
      }
      if (!Number.isSafeInteger(Math.round(item.quantity * item.unitPrice))) throw new Error('Line total is too large.')
      setSaving(true)
      await onSave(item)
    } catch (cause) { setError((cause as Error).message) }
    finally { setSaving(false) }
  }
  return (
    <Sheet open={open} onClose={onClose} title={initial ? 'Edit line item' : 'Add line item'}>
      <div className="space-y-4">
        <Field label="Type" htmlFor="kind">
          <select id="kind" className="input" value={kind} onChange={(e) => changeKind(e.target.value as LineItemKind)}>
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </Field>

        <Field label="Description" htmlFor="desc">
          <TextInput id="desc" value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder={isLabor ? 'e.g. Front brake pads & rotors' : isPart ? 'e.g. Brake pad set' : 'Description'} data-initial-focus />
        </Field>

        {isPart && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Part #" htmlFor="pn">
                <TextInput id="pn" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} />
              </Field>
              <Field label="Supplier" htmlFor="sup">
                <TextInput id="sup" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
              </Field>
            </div>
            <Field label="Status" htmlFor="ps">
              <select id="ps" className="input" value={partStatus} onChange={(e) => setPartStatus(e.target.value as PartStatus)}>
                {PART_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
              </select>
            </Field>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          {isLabor ? (
            <Field label="Billed hours" htmlFor="hrs">
              <TextInput id="hrs" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
            </Field>
          ) : (
            <Field label="Quantity" htmlFor="qty">
              <TextInput id="qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </Field>
          )}
          <Field label={isLabor ? 'Rate / hr' : 'Price each'} htmlFor="price">
            <TextInput id="price" inputMode="decimal" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          </Field>
        </div>

        {isLabor && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Actual hours (optional)" htmlFor="actual-hours">
              <TextInput id="actual-hours" inputMode="decimal" value={actualHours} onChange={e => setActualHours(e.target.value)} />
            </Field>
            <Field label="Direct cost / hour" htmlFor="hourly-cost">
              <TextInput id="hourly-cost" inputMode="decimal" value={hourlyCost} onChange={e => setHourlyCost(e.target.value)} />
            </Field>
          </div>
        )}

        {(isPart || kind === 'sublet') && (
          <Field label="Your cost (optional)" htmlFor="cost" hint={isPart ? 'Use markup to calculate the selling price.' : undefined}>
            <div className="flex gap-2">
              <TextInput id="cost" inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
              {isPart && (
                <Button type="button" variant="secondary" onClick={applyMarkup}>+{defaultMarkupPct}%</Button>
              )}
            </div>
          </Field>
        )}

        {kind !== 'discount' && (
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" className="h-5 w-5 rounded" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} />
            Taxable
          </label>
        )}

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button type="button" full disabled={saving} onClick={save}>{initial ? 'Save' : 'Add'}</Button>
          {initial && onDelete && (
            <Button type="button" variant="danger" disabled={saving} onClick={() => onDelete().catch(cause => setError(cause.message))}>Remove</Button>
          )}
        </div>
      </div>
    </Sheet>
  )
}
