import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { customersRepo } from '@/repositories/customers'
import { useEntitlements } from '@/billing/entitlements'
import { PLANS } from '@/billing/plans'
import { PageHeader } from '@/components/ui/Page'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, TextArea } from '@/components/ui/Field'
import { UpgradeSheet } from '@/components/UpgradeSheet'

export function CustomerForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()

  const [form, setForm] = useState({
    firstName: '', lastName: '', company: '', phone: '', email: '', address: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const { canAddCustomer } = useEntitlements()

  useEffect(() => {
    if (!id) return
    customersRepo.get(id).then((c) => {
      if (c) {
        setForm({
          firstName: c.firstName, lastName: c.lastName ?? '', company: c.company ?? '',
          phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '', notes: c.notes ?? '',
        })
      }
    })
  }, [id])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.firstName.trim() && !form.lastName.trim()) return
    if (!editing && !canAddCustomer) { setUpgradeOpen(true); return }
    setSaving(true)
    if (editing && id) {
      await customersRepo.update(id, form)
      navigate(`/customers/${id}`)
    } else {
      const created = await customersRepo.create(form)
      navigate(`/customers/${created.id}`)
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={editing ? 'Edit customer' : 'New customer'} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" htmlFor="firstName">
            <TextInput id="firstName" value={form.firstName} onChange={set('firstName')} autoFocus />
          </Field>
          <Field label="Last name" htmlFor="lastName">
            <TextInput id="lastName" value={form.lastName} onChange={set('lastName')} />
          </Field>
        </div>
        <Field label="Company (optional)" htmlFor="company">
          <TextInput id="company" value={form.company} onChange={set('company')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" htmlFor="phone">
            <TextInput id="phone" type="tel" value={form.phone} onChange={set('phone')} />
          </Field>
          <Field label="Email" htmlFor="email">
            <TextInput id="email" type="email" value={form.email} onChange={set('email')} />
          </Field>
        </div>
        <Field label="Address" htmlFor="address">
          <TextInput id="address" value={form.address} onChange={set('address')} />
        </Field>
        <Field label="Notes" htmlFor="notes">
          <TextArea id="notes" rows={3} value={form.notes} onChange={set('notes')} />
        </Field>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={saving} full>{editing ? 'Save changes' : 'Create customer'}</Button>
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
        </div>
      </form>

      <UpgradeSheet
        open={upgradeOpen}
        title="Customer limit reached"
        body={`The Free plan includes up to ${PLANS.free.entitlements.customers} customers. Upgrade to Pro for unlimited customers, invoices and inspections.`}
        onClose={() => setUpgradeOpen(false)}
      />
    </div>
  )
}
