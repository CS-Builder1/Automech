import { useState } from 'react'
import type { AuthMethod, AuthorizationRecord } from '@/db/types'
import { nowISO } from '@/lib/id'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { Field, TextInput } from './ui/Field'
import { SignaturePad } from './SignaturePad'

const METHODS: { value: AuthMethod; label: string }[] = [
  { value: 'in_person', label: 'In person' },
  { value: 'signature', label: 'Signature' },
  { value: 'phone', label: 'Phone' },
  { value: 'sms', label: 'Text / SMS' },
  { value: 'email', label: 'Email' },
  { value: 'online', label: 'Online' },
]

interface Props {
  open: boolean
  /** Current RO total — becomes the authorized cap. */
  totalMinor: number
  customerName: string
  initial?: AuthorizationRecord
  onClose: () => void
  onSave: (record: AuthorizationRecord) => void
}

export function AuthorizationSheet({ open, totalMinor, customerName, initial, onClose, onSave }: Props) {
  const [authorizedBy, setAuthorizedBy] = useState(initial?.authorizedBy ?? customerName)
  const [method, setMethod] = useState<AuthMethod>(initial?.method ?? 'in_person')
  const [note, setNote] = useState(initial?.note ?? '')
  const [signature, setSignature] = useState<string | null>(initial?.signatureDataUrl ?? null)

  function save() {
    const record: AuthorizationRecord = {
      authorizedBy: authorizedBy.trim() || customerName,
      method,
      authorizedAt: nowISO(),
      amountAuthorized: totalMinor,
      signatureDataUrl: signature ?? undefined,
      note: note.trim() || undefined,
    }
    onSave(record)
  }

  return (
    <Sheet open={open} onClose={onClose} title="Capture approval">
      <div className="space-y-4">
        <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          This records who approved the work, when, and how — your protection if the bill is later disputed.
          Work beyond this amount will prompt for re-approval.
        </p>

        <Field label="Authorized by" htmlFor="by">
          <TextInput id="by" value={authorizedBy} onChange={(e) => setAuthorizedBy(e.target.value)} />
        </Field>

        <Field label="How was it authorized?" htmlFor="method">
          <select id="method" className="input" value={method} onChange={(e) => setMethod(e.target.value as AuthMethod)}>
            {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>

        <Field label="Note (optional)" htmlFor="note">
          <TextInput id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Approved verbally, declined wipers" />
        </Field>

        {(method === 'signature' || method === 'in_person') && (
          <Field label="Customer signature">
            <SignaturePad initial={initial?.signatureDataUrl} onChange={setSignature} />
          </Field>
        )}

        <Button type="button" full onClick={save}>Record approval</Button>
      </div>
    </Sheet>
  )
}
