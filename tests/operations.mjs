import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

const port = 15173
const origin = 'http://127.0.0.1:' + port
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { stdio: 'pipe' },
)
let browser
try {
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw Error('Vite failed to start')
    if (
      await fetch(origin)
        .then((r) => r.ok)
        .catch(() => false)
    )
      break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.setDefaultTimeout(5000)
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
  await page.getByLabel('Part status').selectOption('received')
  await page.getByRole('button', { name: 'Update part' }).click()
  await page.getByText('No outstanding parts.').waitFor()
  await page.getByRole('button', { name: 'Deferred work' }).click()
  await page.getByLabel('Follow-up outcome').fill('Booked for Friday')
  await page.getByRole('button', { name: 'Record contact' }).click()
  await page.getByText(/Last contact.*Booked for Friday/).waitFor()
  console.log(
    'PASS dispatch, inspection to estimate, pickup and approval queues, parts receiving, deferred follow-up',
  )
} finally {
  await browser?.close()
  if (server.exitCode === null) {
    const done = once(server, 'exit')
    server.kill()
    await done
  }
}
