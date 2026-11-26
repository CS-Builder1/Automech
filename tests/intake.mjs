import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const base = process.env.APP_URL || 'http://127.0.0.1:5173'
const profile = await mkdtemp(join(tmpdir(), 'automech-intake-'))
const launch = () => chromium.launchPersistentContext(profile, {
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
})
async function editAndReload(page, selector, value) {
  const field = page.locator(selector)
  await Promise.all([page.waitForNavigation(), field.evaluate((element, text) => {
    // Reload in the input event's turn, before an IndexedDB write can complete.
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set
    setter.call(element, text)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    location.reload()
  }, value)])
  assert.equal(await field.inputValue(), value)
}

let context = await launch()
try {
  const page = await context.newPage()
  page.setDefaultTimeout(3000)
  const button = (name) => page.getByRole('button', { name, exact: true })
  await page.goto(base + '/jobs/new')
  await editAndReload(page, '#complaint', 'Shudder during braking')
  await page.locator('#mileage').fill('40,012')
  await page.getByRole('link', { name: /add customer/i }).click()
  await button('Create customer').click()
  assert.match(await page.getByRole('alert').innerText(), /name|company/i)
  await page.locator('#company').fill('Harbor Fleet')
  await page.reload()
  assert.equal(await page.locator('#company').inputValue(), 'Harbor Fleet')
  await button('Create customer').click()
  await page.waitForURL(/\/jobs\/new/)
  await page.reload()
  assert.equal(await page.locator('#complaint').inputValue(), 'Shudder during braking')
  assert.equal(await page.locator('#mileage').inputValue(), '40,012')
  await page.locator('#cust option:checked', { hasText: 'Harbor Fleet' }).waitFor({ state: 'attached' })
  const customerId = await page.locator('#cust').inputValue()
  await page.getByRole('link', { name: /add (a )?vehicle/i }).click()
  await editAndReload(page, '#plate', 'FLEET-16')
  assert.equal(await page.locator('#plate').inputValue(), 'FLEET-16')
  await button('Add vehicle').click()
  await page.waitForURL(/\/jobs\/new/)
  await page.locator('#veh option:checked', { hasText: 'FLEET-16' }).waitFor({ state: 'attached' })
  await page.reload()
  await button('Create estimate').click()
  await page.waitForURL(/\/jobs\/(?!new)[^/?]+$/)
  assert.equal(await page.getByLabel('Complaint / concern').inputValue(), 'Shudder during braking')
  assert.equal(await page.getByLabel('Mileage in', { exact: true }).inputValue(), '40012')
  await page.goto(base + '/jobs/new?customerId=' + customerId)
  await page.locator('#complaint').fill('A second job for Harbor Fleet')
  await page.locator('#mileage').fill('100.5')
  await button('Create estimate').click()
  assert.match(await page.getByRole('alert').innerText(), /whole number/i)
  await page.goto(base + '/customers/new')
  await page.locator('#firstName').fill('Dana')
  await button('Create customer').click()
  await page.waitForURL(/\/customers\/(?!new)[^/?]+$/)
  const secondCustomerId = new URL(page.url()).pathname.split('/').pop()
  await page.goto(base + '/jobs/new?customerId=' + secondCustomerId)
  await page.locator('#cust option:checked', { hasText: 'Dana' }).waitFor({ state: 'attached' })
  assert.equal(await page.locator('#complaint').inputValue(), '')
  await page.getByRole('link', { name: /Resume intake.*Harbor Fleet/ }).click()
  assert.equal(await page.locator('#complaint').inputValue(), 'A second job for Harbor Fleet')
  await page.goto(base + '/customers/missing/vehicles/new')
  assert.match(await page.getByRole('alert').innerText(), /unavailable/i)
  assert.equal(await button('Add vehicle').count(), 0)
  await page.goto(base + '/customers/missing/edit')
  assert.match(await page.getByRole('alert').innerText(), /unavailable/i)
  assert.equal(await button('Save changes').count(), 0)
  const independentTab = await context.newPage()
  await independentTab.goto(base + '/jobs/new')
  assert.equal(await independentTab.locator('#complaint').inputValue(), '')
  await independentTab.locator('#complaint').fill('Inspect air conditioning')

  const expiredTab = await context.newPage()
  await expiredTab.clock.setFixedTime(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000))
  await expiredTab.goto(base + '/jobs/new?customerId=' + customerId)
  await expiredTab.locator('#complaint').fill('Old oil change')
  const expiredURL = expiredTab.url()
  const expiredId = new URL(expiredURL).searchParams.get('draft')
  await expiredTab.getByRole('link', { name: /add customer/i }).click()
  await expiredTab.locator('#company').fill('Old name')
  await expiredTab.goto(expiredURL)
  await expiredTab.getByRole('link', { name: /add a vehicle/i }).click()
  await expiredTab.locator('#plate').fill('OLD-PLATE')
  const expiredKeys = await expiredTab.evaluate(id =>
    Object.keys(localStorage).filter(key => key.startsWith('automech.intake.' + id)), expiredId)
  assert.ok(expiredKeys.some(key => key.endsWith('.customer')))
  assert.ok(expiredKeys.some(key => key.includes('.vehicle.')))

  await context.close()
  context = await launch()
  const reopened = await context.newPage()
  await reopened.goto(base + '/jobs')
  await reopened.getByRole('heading', { name: 'Jobs', exact: true }).waitFor()
  assert.deepEqual(await reopened.evaluate(keys => keys.filter(key => localStorage.getItem(key) !== null), expiredKeys), [])
  await reopened.goto(base + '/jobs/new')
  await reopened.getByRole('link', { name: /Resume intake.*Inspect air conditioning/ }).click()
  assert.equal(await reopened.locator('#complaint').inputValue(), 'Inspect air conditioning')
  await reopened.getByRole('link', { name: /Resume intake.*Harbor Fleet/ }).click()
  assert.equal(await reopened.locator('#complaint').inputValue(), 'A second job for Harbor Fleet')
  assert.equal(await reopened.locator('#mileage').inputValue(), '100.5')
  const sharedURL = reopened.url()
  const sharedId = new URL(sharedURL).searchParams.get('draft')
  const vehicleEditor = await context.newPage()
  await vehicleEditor.goto(base + '/customers/' + customerId + '/vehicles/new?draft=' + sharedId)
  await vehicleEditor.locator('#plate').fill('STALE-OWNER')
  await vehicleEditor.evaluate(() => {
    let transaction
    const add = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === 'vehicles') transaction = this.transaction
      return add.apply(this, args)
    }
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      setItem.call(this, key, value)
      if (key.endsWith('.recordId') && transaction) {
        transaction.abort()
        IDBObjectStore.prototype.add = add
        Storage.prototype.setItem = setItem
      }
    }
  })
  await vehicleEditor.getByRole('button', { name: 'Add vehicle', exact: true }).click()
  await vehicleEditor.getByRole('alert').waitFor()
  const afterAbort = await reopened.evaluate(id => JSON.parse(localStorage.getItem('automech.intake.' + id)), sharedId)
  assert.equal(afterAbort.customerId, customerId)
  assert.equal(afterAbort.vehicleId, '')
  await vehicleEditor.reload()
  assert.equal(await vehicleEditor.locator('#plate').inputValue(), 'STALE-OWNER')
  await reopened.locator('#cust').selectOption(secondCustomerId)
  await vehicleEditor.getByRole('button', { name: 'Add vehicle', exact: true }).click()
  await vehicleEditor.getByRole('alert').filter({ hasText: /another tab/ }).waitFor()
  assert.equal(await reopened.locator('#cust').inputValue(), secondCustomerId)
  await reopened.locator('#cust').selectOption(customerId)
  const competing = await context.newPage()
  await competing.goto(sharedURL)
  await competing.locator('#mileage').fill('45000')
  // This tab still has the old form in memory.
  await reopened.locator('#complaint').fill('Superseded edit')
  await reopened.getByRole('alert').filter({ hasText: /another tab/ }).waitFor()
  const shared = await competing.evaluate(id => JSON.parse(localStorage.getItem('automech.intake.' + id)), sharedId)
  assert.equal(shared.mileageIn, '45000')
  assert.equal(shared.complaint, 'A second job for Harbor Fleet')
  const submitting = await context.newPage()
  await submitting.goto(sharedURL)
  await Promise.all([competing, submitting].map(tab => tab.getByRole('button', { name: 'Create estimate' }).click()))
  await competing.waitForURL(/\/jobs\/(?!new)[^/?]+$/)
  await submitting.waitForURL(competing.url())
  await reopened.locator('#mileage').fill('49000')
  await reopened.getByRole('alert').filter({ hasText: /closed/ }).waitFor()
  await reopened.getByRole('button', { name: 'Create estimate' }).click()
  await reopened.waitForURL(competing.url())
  assert.equal(await reopened.evaluate(id => localStorage.getItem('automech.intake.' + id), sharedId), null)
  const [orders, vehicles] = await competing.evaluate(async () => {
    const open = indexedDB.open('automech')
    const db = await new Promise((resolve, reject) => {
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    try {
      return await Promise.all(['workOrders', 'vehicles'].map(table => new Promise((resolve, reject) => {
        const read = db.transaction(table).objectStore(table).getAll()
        read.onsuccess = () => resolve(read.result)
        read.onerror = () => reject(read.error)
      })))
    } finally { db.close() }
  })
  assert.equal(vehicles.length, 1)
  assert.equal(orders.length, 2)
  assert.equal(orders.find(order => order.id === sharedId).mileageIn, 45000)
  console.log('A superseded intake cannot overwrite, resurrect or convert the active tab’s draft.')
  console.log('Browser restart recovers independent intakes and discards expired drafts and child forms.')
  console.log('Intake retained complaint, mileage and selections across customer/vehicle creation and reload.')
} finally {
  await context.close()
  await rm(profile, { recursive: true, force: true })
}
