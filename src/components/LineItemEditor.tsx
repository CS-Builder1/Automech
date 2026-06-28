import { useState } from 'react'
import type { LineItem, LineItemKind, PartStatus } from '@/db/types'
import { newId } from '@/lib/id'
import { parseAmountToMinor, minorToDecimal } from '@/lib/money'
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
  onSave: (item: LineItem) => void
  onDelete?: () => void
}

export function LineItemEditor({ open, initial, defaultLaborRate, defaultMarkupPct, defaultTaxRatePct, onClose, onSave, onDelete }: Props) {
  const [kind, setKind] = useState<LineItemKind>(initial?.kind ?? 'labor')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [partNumber, setPartNumber] = useState(initial?.partNumber ?? '')
  const [supplier, setSupplier] = useState(initial?.supplier ?? '')
  const [partStatus, setPartStatus] = useState<PartStatus>(initial?.partStatus ?? 'needed')
  const [hours, setHours] = useState(initial?.hours?.toString() ?? '1')
  const [quantity, setQuantity] = useState(initial?.quantity?.toString() ?? '1')
  const [unitCost, setUnitCost] = useState(initial?.unitCost ? minorToDecimal(initial.unitCost).toString() : '')
  const [unitPrice, setUnitPrice] = useState(
    initial ? minorToDecimal(initial.unitPrice).toString() : minorToDecimal(defaultLaborRate).toString(),
  )
  const [taxable, setTaxable] = useState(initial?.taxable ?? (defaultTaxRatePct > 0))

  const isLabor = kind === 'labor'
  const isPart = kind === 'part'

  function applyMarkup() {
    const cost = parseAmountToMinor(unitCost)
    const priced = Math.round(cost * (1 + defaultMarkupPct / 100))
    setUnitPrice(minorToDecimal(priced).toString())
  }

  function save() {
    const qty = isLabor ? parseFloat(hours || '0') : parseFloat(quantity || '1')
    const item: LineItem = {
      id: initial?.id ?? newId(),
      kind,
      description: description.trim() || KINDS.find((k) => k.value === kind)!.label,
      quantity: Number.isFinite(qty) ? qty : 0,
      unitPrice: parseAmountToMinor(unitPrice),
      hours: isLabor ? (Number.isFinite(qty) ? qty : 0) : undefined,
      partNumber: isPart ? partNumber.trim() || undefined : undefined,
      supplier: isPart ? supplier.trim() || undefined : undefined,
      partStatus: isPart ? partStatus : undefined,
      unitCost: (isPart || kind === 'sublet') && unitCost ? parseAmountToMinor(unitCost) : undefined,
      taxable: kind === 'discount' ? false : taxable,
    }
    onSave(item)
  }

  return (
    <Sheet open={open} onClose={onClose} title={initial ? 'Edit line item' : 'Add line item'}>
      <div className="space-y-4">
        <Field label="Type" htmlFor="kind">
          <select id="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as LineItemKind)}>
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </Field>

        <Field label="Description" htmlFor="desc">
          <TextInput id="desc" value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder={isLabor ? 'e.g. Front brake pads & rotors' : isPart ? 'e.g. Brake pad set' : 'Description'} autoFocus />
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
            <Field label="Hours" htmlFor="hrs">
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

        {(isPart || kind === 'sublet') && (
          <Field label="Your cost (optional)" htmlFor="cost" hint="Tracks margin; tap “Apply markup” to price it.">
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

        <div className="flex gap-3 pt-2">
          <Button type="button" full onClick={save}>{initial ? 'Save' : 'Add'}</Button>
          {initial && onDelete && (
            <Button type="button" variant="danger" onClick={onDelete}>Remove</Button>
          )}
        </div>
      </div>
    </Sheet>
  )
}
