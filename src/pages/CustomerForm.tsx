import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { customersRepo } from '@/repositories/customers'
import { useIntakeAutosave } from '@/hooks/useIntakeAutosave'
import { db } from '@/db/database'
import { readDraft, createIntakeRecord, intakePath, readIntakeForm, saveIntakeForm } from '@/lib/intakeDraft'
import { PageHeader } from '@/components/ui/Page'
import { Button } from '@/components/ui/Button'
import { Field, TextInput, TextArea } from '@/components/ui/Field'

export function CustomerForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const draft = !id ? params.get('draft') : null
  return <CustomerEditor key={id ?? draft ?? 'new'} id={id} draft={draft} />
}

const blankCustomer = {
  firstName: '', lastName: '', company: '', phone: '', email: '', address: '', notes: '',
}

function CustomerEditor({ id, draft }: { id?: string; draft: string | null }) {
  const navigate = useNavigate()
  const editing = Boolean(id)
  const cacheKey = draft ? draft + '.customer' : null
  const [parent] = useState(() => draft ? readDraft(draft) : null)
  const [form, setForm] = useState(() => readIntakeForm(cacheKey, blankCustomer))
  const autosave = useIntakeAutosave(form, (expected, next) => saveIntakeForm(cacheKey, blankCustomer, expected, next))
  const [loaded, setLoaded] = useState(!id)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  useEffect(() => {
    if (!id) return
    let active = true
    customersRepo.get(id).then(c => {
      if (!active) return
      if (!c || c.deletedAt) setUnavailable(true)
      else setForm({
        firstName: c.firstName, lastName: c.lastName ?? '', company: c.company ?? '',
        phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '', notes: c.notes ?? '',
      })
      setLoaded(true)
    }).catch(() => { if (active) { setUnavailable(true); setLoaded(true) } })
    return () => { active = false }
  }, [id])

  const set = (k: keyof typeof form) => async (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = { ...form, [k]: e.target.value }
    setForm(next)
    try {
      await autosave.save(next)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this draft. Keep the page open until you create the customer.')
    }
  }

  async function cancel() {
    try {
      await saveIntakeForm(cacheKey, blankCustomer, await autosave.lastSaved(), null)
    } catch {
      // Cleanup may lose a race with another editor. Leave its saved draft intact.
      navigate('/jobs', { replace: true })
      return
    }
    navigate(draft ? intakePath(draft) : id ? '/customers/' + id : '/customers')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy.current) return
    const input = { ...form, firstName: form.firstName.trim(), lastName: form.lastName.trim(), company: form.company.trim() }
    if (!input.firstName && !input.lastName && !input.company) {
      setError('Enter a first name, last name or company name.')
      return
    }
    busy.current = true
    setSaving(true)
    try {
      if (id) {
        await customersRepo.update(id, input)
        navigate('/customers/' + id)
      } else {
        const path = await createIntakeRecord(cacheKey, blankCustomer, await autosave.lastSaved(), parent, {
          table: db.customers, create: id => customersRepo.create(input, id), path: c => '/customers/' + c.id,
          selection: c => ({ customerId: c.id, vehicleId: '' }),
        })
        navigate(path, { replace: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save customer. Please try again.')
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  if (!loaded) return <p>Loading…</p>
  if (unavailable) return <p role="alert">Customer unavailable for editing.</p>

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
        <Field label="Company" htmlFor="company">
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

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={saving} full>{editing ? 'Save changes' : 'Create customer'}</Button>
          <Button type="button" variant="secondary" disabled={saving} onClick={cancel}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}
