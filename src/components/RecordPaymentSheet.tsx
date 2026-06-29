import { useState } from 'react'
import type { PaymentMethod } from '@/db/types'
import { parseAmountToMinor, minorToDecimal } from '@/lib/money'
import { PAYMENT_PROVIDERS, getProvider } from '@/payments/providers'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { Field, TextInput } from './ui/Field'

interface Props {
  open: boolean
  balanceMinor: number
  onClose: () => void
  onSave: (input: { method: PaymentMethod; amount: number; isDeposit: boolean; reference?: string; note?: string }) => void
}

export function RecordPaymentSheet({ open, balanceMinor, onClose, onSave }: Props) {
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [amount, setAmount] = useState(balanceMinor > 0 ? minorToDecimal(balanceMinor).toString() : '')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [isDeposit, setIsDeposit] = useState(false)

  const provider = getProvider(method)

  function save() {
    const minor = parseAmountToMinor(amount)
    if (minor <= 0) return
    onSave({
      method,
      amount: minor,
      isDeposit,
      reference: reference.trim() || undefined,
      note: note.trim() || undefined,
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title="Record payment">
      <div className="space-y-4">
        <Field label="Method">
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_PROVIDERS.filter((p) => p.method !== 'other').map((p) => (
              <button
                key={p.method}
                type="button"
                onClick={() => setMethod(p.method)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  method === p.method
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-slate-800 dark:text-brand-300'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <span>{p.emoji}</span>
                <span className="truncate">{p.label}</span>
              </button>
            ))}
          </div>
        </Field>

        {provider.mode === 'gateway' && !provider.configured && (
          <p className="rounded-xl bg-slate-100 px-3 py-2.5 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {provider.emoji} {provider.label} isn’t connected yet — this records the payment manually. Online checkout
            arrives once it’s configured.
          </p>
        )}

        <Field label="Amount" htmlFor="amt" hint={balanceMinor > 0 ? `Balance due: ${minorToDecimal(balanceMinor).toFixed(2)}` : undefined}>
          <TextInput id="amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>

        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" className="h-5 w-5 rounded" checked={isDeposit} onChange={(e) => setIsDeposit(e.target.checked)} />
          This is a deposit / part-payment
        </label>

        <Field label="Reference (optional)" htmlFor="ref" hint="Cheque no., terminal ref, transaction id…">
          <TextInput id="ref" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>

        <Field label="Note (optional)" htmlFor="pnote">
          <TextInput id="pnote" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <Button type="button" full onClick={save}>Record payment</Button>
      </div>
    </Sheet>
  )
}
