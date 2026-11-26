import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const cacheDir = await mkdtemp(join(tmpdir(), 'automech-vite-'))
const server = await createServer({cacheDir, server:{host:'127.0.0.1',port:0}, logLevel:'error'})
let browser
try {
  await server.listen()
  const origin = new URL(server.resolvedUrls.local[0]).origin
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.setDefaultTimeout(15000)
  page.on('pageerror', e => console.error(e.message))
  await page.goto(origin)
  await page.getByRole('link', { name: 'Schedule', exact: true }).click()
  await page.getByRole('button', { name: 'Book appointment' }).click()
  await page.getByLabel('Visit description').fill('Brake diagnosis')
  await page.getByLabel('Bay').fill('Bay 1')
  await page.getByLabel('Starts').fill('2026-11-24T09:00')
  await page.getByLabel('Ends').fill('2026-11-24T10:00')
  await page.getByRole('button', { name: 'Save appointment' }).click()
  await page.getByRole('button', { name: 'Edit Brake diagnosis' }).waitFor()
  await page.getByRole('button', { name: 'Book appointment' }).click()
  await page.getByLabel('Visit description').fill('Conflict test')
  await page.getByLabel('Bay').fill('bay 1')
  await page.getByLabel('Starts').fill('2026-11-24T09:30')
  await page.getByLabel('Ends').fill('2026-11-24T10:30')
  await page.getByRole('button', { name: 'Save appointment' }).click()
  await page.getByText('This bay is already booked during that time.').waitFor()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Brake diagnosis' }).click()
  await page.getByLabel('Visit description').fill('Brake and tire diagnosis')
  await page.getByRole('button', { name: 'Save appointment' }).click()
  await page.getByRole('button', { name: 'Edit Brake and tire diagnosis' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Edit Brake diagnosis' }).count(), 0)
  console.log('PASS appointment create, edit, same-bay conflict and mobile access')
  // Create repeatable shop records, then exercise dispatch, inspection and contact in the UI.
  const jobId = await page.evaluate(async () => {
    const { db } = await import('/src/db/database.ts')
    const stamp = new Date().toISOString()
    const common = { createdAt: stamp, updatedAt: stamp }
    await db.customers.add({
      ...common,
      id: 'owner',
      firstName: 'Jo',
      lastName: 'Grant',
      phone: '555-0123',
    })
    await db.vehicles.add({
      ...common,
      id: 'car',
      customerId: 'owner',
      type: 'car',
      licensePlate: 'TEST23',
    })
    await db.workOrders.add({
      ...common,
      id: 'repair',
      number: 'RO-1200',
      customerId: 'owner',
      vehicleId: 'car',
      status: 'awaiting_approval',
      currency: 'USD',
      lineItems: [
        {
          id: 'hose',
          kind: 'part',
          description: 'Brake hose',
          partStatus: 'needed',
          quantity: 1,
          unitPrice: 3000,
          taxable: false,
        },
      ],
      declinedItems: [
        {
          id: 'wiper',
          kind: 'part',
          description: 'Rear wiper',
          quantity: 1,
          unitPrice: 1200,
          taxable: false,
        },
      ],
    })
    return 'repair'
  })
  await page.goto(origin + '/jobs/' + jobId)
  await page.getByText('Dispatch and inspection', { exact: true }).click()
  await page.getByLabel('Assigned technician').fill('Morgan')
  await page.getByLabel('Promised pickup').fill('2026-11-24T15:00')
  await page.getByRole('button', { name: 'Save dispatch' }).click()
  await page.getByText('Dispatch saved.').waitFor()
  await page.getByLabel('Inspection finding').fill('Inspect front caliper')
  await page.getByLabel('Condition', { exact: true }).selectOption('red')
  await page.getByRole('button', { name: 'Save finding' }).click()
  await page.getByLabel('Quoted labor for one hour').fill('32.50')
  await page.getByRole('button', { name: 'Add to estimate' }).click()
  await page.getByText('On estimate', { exact: true }).waitFor()
  await page.goto(origin + '/operations?view=pickups')
  await page.getByLabel('Day', { exact: true }).fill('2026-11-24')
  await page.getByText(/Morgan/).waitFor()
  await page.getByRole('button', { name: 'Awaiting approval' }).click()
  await page.getByRole('link', { name: 'Call customer' }).waitFor()
  await page.getByRole('button', { name: 'Parts', exact: true }).click()
  await page.getByLabel('Supplier').fill('Local Auto Parts')
  await page.getByLabel('Expected arrival').fill('2026-11-25')
  await page.getByLabel('Part status').selectOption('ordered')
  await page.getByRole('button', { name: 'Update part' }).click()
  await page.getByText('Part updated.').waitFor()
  await page.reload()
  assert.equal(await page.getByLabel('Supplier').inputValue(), 'Local Auto Parts')
  assert.equal(await page.getByLabel('Expected arrival').inputValue(), '2026-11-25')
  const approval = await page.evaluate(async (id) => {
    const { workOrdersRepo } = await import('/src/repositories/workOrders.ts')
    const { estimateSnapshot } = await import('/src/lib/approval.ts')
    const order = await workOrdersRepo.get(id)
    const record = await workOrdersRepo.recordApproval(id, { method: 'phone', authorizedBy: 'Jo Grant' }, estimateSnapshot(order), 0)
    await workOrdersRepo.setStatus(id, 'completed')
    return record
  }, jobId)
  await page.getByLabel('Part status').selectOption('received')
  await page.getByRole('button', { name: 'Update part' }).click()
  await page.getByRole('status').waitFor()
  assert.equal(await page.getByRole('status').innerText(), 'Part updated.')
  await page.getByText('No outstanding parts.').waitFor()
  const completedOrder = await page.evaluate(async (id) => {
    const { workOrdersRepo } = await import('/src/repositories/workOrders.ts')
    return workOrdersRepo.get(id)
  }, jobId)
  assert.equal(completedOrder.status, 'completed')
  assert.equal(completedOrder.lineItems.find(item => item.id === 'hose').partStatus, 'received')
  assert.deepEqual(completedOrder.authorization, approval)
  await assert.rejects(page.evaluate(async (id) => {
    const { updatePart } = await import('/src/repositories/operations.ts')
    await updatePart(id, 'hose', { unitPrice: 1 })
  }, jobId), /Only part receiving details/)
  await assert.rejects(page.evaluate(async (id) => {
    const { updateDispatch } = await import('/src/repositories/operations.ts')
    await updateDispatch(id, 'different technician', null)
  }, jobId), /closed or unavailable/)
  await page.getByRole('button', { name: 'Deferred work' }).click()
  await page.getByLabel('Follow-up outcome').fill('Booked for Friday')
  await page.getByRole('button', { name: 'Record contact' }).click()
  await page.getByText(/Last contact.*Booked for Friday/).waitFor()
  console.log(
    'PASS dispatch, inspection to estimate, pickup and approval queues, parts receiving, deferred follow-up',
  )
  await page.getByRole('button', { name: 'Schedule', exact: true }).click()
  await page.getByLabel('Day', { exact: true }).fill('2026-11-24')
  await page.getByRole('button', { name: 'Edit Brake and tire diagnosis' }).click()
  const linkedOrder = page.getByLabel('Linked repair order')
  await linkedOrder.selectOption(jobId)
  await page.getByRole('button', { name: 'Save appointment' }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })

  const readBooking = () => page.evaluate(async () => {
    const { db } = await import('/src/db/database.ts')
    return db.appointments.toCollection().first()
  })
  for (const [table, id] of [['workOrders', jobId], ['customers', 'owner'], ['vehicles', 'car']]) {
    await page.evaluate(async ([table, id]) => {
      const { db } = await import('/src/db/database.ts')
      await db.table(table).update(id, { deletedAt: new Date().toISOString() })
    }, [table, id])
    await page.getByRole('button', { name: 'Edit Brake and tire diagnosis' }).click()
    assert.equal(await linkedOrder.inputValue(), jobId)
    assert.match(await linkedOrder.locator('option:checked').textContent(), /RO-1200.*archived/i)
    await page.getByLabel('Contact and visit notes').fill('Rescheduled after archiving ' + table)
    await page.getByRole('button', { name: 'Save appointment' }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    const booking = await readBooking()
    assert.equal(booking.notes, 'Rescheduled after archiving ' + table)
    assert.deepEqual([booking.workOrderId, booking.customerId, booking.vehicleId], [jobId, 'owner', 'car'])
    if (table === 'vehicles') {
      await page.getByRole('button', { name: 'Edit Brake and tire diagnosis' }).click()
      await linkedOrder.selectOption('')
      await page.getByRole('button', { name: 'Save appointment' }).click()
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
      const unlinked = await readBooking()
      assert.deepEqual([unlinked.workOrderId, unlinked.customerId, unlinked.vehicleId], [undefined, undefined, undefined])
    }
    await page.evaluate(async ([table, id]) => {
      const { db } = await import('/src/db/database.ts')
      await db.table(table).update(id, { deletedAt: null })
    }, [table, id])
  }
  console.log('PASS bookings keep archived job, customer and vehicle links until explicitly removed')
} finally {
  await browser?.close()
  await server.close()
  await rm(cacheDir, { recursive:true, force:true })
}
