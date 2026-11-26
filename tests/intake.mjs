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

async function failNextDraftSave(page, suffix = '') {
  const id = new URL(page.url()).searchParams.get('draft')
  assert.ok(id)
  await page.evaluate(draftKey => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === draftKey) {
        Storage.prototype.setItem = setItem
        throw new DOMException('Device storage is full', 'QuotaExceededError')
      }
      return setItem.call(this, key, value)
    }
  }, 'automech.intake.' + id + suffix)
}

let context = await launch()
try {
  const page = await context.newPage()
  page.setDefaultTimeout(3000)
  page.setDefaultNavigationTimeout(15000)
  const button = (name) => page.getByRole('button', { name, exact: true })
  await page.goto(base + '/jobs/new')
  await editAndReload(page, '#complaint', 'Shudder during braking')
  await page.locator('#mileage').fill('40,012')
  await page.getByRole('link', { name: /add customer/i }).click()
  await button('Create customer').click()
  assert.match(await page.getByRole('alert').innerText(), /name|company/i)
  await failNextDraftSave(page, '.customer')
  await page.locator('#company').fill('Harbor')
  await page.getByRole('alert').filter({ hasText: /storage is full/i }).waitFor()
  assert.equal(await page.locator('#company').inputValue(), 'Harbor')
  await page.locator('#company').pressSequentially(' Depot')
  await page.waitForFunction(() => {
    const id = new URL(location.href).searchParams.get('draft')
    return JSON.parse(localStorage.getItem('automech.intake.' + id + '.customer'))?.company === 'Harbor Depot'
  }, undefined, { timeout: 3000 })
  await page.reload()
  assert.equal(await page.locator('#company').inputValue(), 'Harbor Depot')
  await failNextDraftSave(page, '.customer')
  await page.locator('#company').fill('Harbor Fleet')
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
  async function startDecode(vin) {
    let accept
    const request = new Promise(resolve => { accept = resolve })
    await page.route('https://vpic.nhtsa.dot.gov/**', route => accept(route), {times: 1})
    await page.locator('#vin').fill(vin)
    await button('Decode').click()
    return request
  }
  const decodeReply = {json: {Results: [{Make: 'Honda', Model: 'Accord', ModelYear: '2003'}]},
    headers: {'access-control-allow-origin': '*'}}
  const obsolete = await startDecode('1HGCM82633A004353')
  assert.equal(await page.locator('#vin').isEditable(), true)
  await page.locator('#vin').fill('1HGCM82633A004352')
  await obsolete.fulfill(decodeReply)
  const pending = await startDecode('1HGCM82633A004352')
  assert.equal(await page.locator('#make').inputValue(), '')
  await page.locator('#plate').fill('FLEET-17')
  await page.locator('#model').fill('Accord EX')
  await pending.fulfill(decodeReply)
  await button('Decode').waitFor()
  assert.equal(await page.locator('#year').inputValue(), '2003')
  assert.equal(await page.locator('#make').inputValue(), 'Honda')
  assert.equal(await page.locator('#model').inputValue(), 'Accord EX')
  assert.equal(await page.locator('#plate').inputValue(), 'FLEET-17')
  await failNextDraftSave(page, '.vehicle.' + customerId)
  await page.locator('#plate').fill('FLEET-18')
  await button('Add vehicle').click()
  await page.waitForURL(/\/jobs\/new/)
  await page.locator('#veh option:checked', { hasText: 'Accord EX · FLEET-18' }).waitFor({ state: 'attached' })
  await page.reload()
  await failNextDraftSave(page)
  await page.locator('#complaint').fill('Shudder during braking at speed')
  await button('Create estimate').click()
  await page.waitForURL(/\/jobs\/(?!new)[^/?]+$/)
  assert.equal(await page.getByLabel('Complaint / concern').inputValue(), 'Shudder during braking at speed')
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
    const add = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = function (...args) {
      const request = add.apply(this, args)
      if (this.name === 'vehicles') {
        request.addEventListener('success', () => this.transaction.abort(), {once: true})
        IDBObjectStore.prototype.add = add
      }
      return request
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
  await failNextDraftSave(reopened)
  await reopened.locator('#complaint').fill('Unsaved brake inspection')
  await reopened.getByRole('alert').filter({ hasText: /storage is full/i }).waitFor()
  await competing.locator('#mileage').fill('45000')
  // This tab still has the old form in memory.
  await reopened.locator('#complaint').fill('Superseded edit')
  await reopened.getByRole('alert').filter({ hasText: /another tab/ }).waitFor()
  const shared = await competing.evaluate(id => JSON.parse(localStorage.getItem('automech.intake.' + id)), sharedId)
  assert.equal(shared.mileageIn, '45000')
  assert.equal(shared.complaint, 'A second job for Harbor Fleet')
  const submitting = await context.newPage()
  await submitting.goto(sharedURL)
  await submitting.waitForFunction(() => document.querySelector('button[type="submit"]')?.disabled === false)
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
  // The second renderer can still see the old draft after the first tab has committed.
  const firstChild = await context.newPage()
  await firstChild.goto(base + '/jobs/new')
  for (const item of [
    {link: /add customer/i, field: '#company', value: 'Two-tab Fleet', submit: 'Create customer', table: 'customers', property: 'company'},
    {link: /add a vehicle/i, field: '#plate', value: 'TWOTAB', submit: 'Add vehicle', table: 'vehicles', property: 'licensePlate'},
  ]) {
    await firstChild.getByRole('link', {name: item.link}).click()
    await firstChild.locator(item.field).fill(item.value)
    const staleChild = await context.newPage()
    await staleChild.goto(firstChild.url())
    assert.equal(await staleChild.locator(item.field).inputValue(), item.value)
    await staleChild.evaluate(() => {
      const read = Storage.prototype.getItem
      const cached = new Map(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]))
      Storage.prototype.getItem = function (key) {
        if (this === localStorage && key.startsWith('automech.intake.')) return cached.get(key) ?? null
        return read.call(this, key)
      }
    })
    await firstChild.getByRole('button', {name: item.submit, exact: true}).click()
    await firstChild.waitForURL(/\/jobs\/new/)
    await staleChild.getByRole('button', {name: item.submit, exact: true}).click()
    await staleChild.waitForURL(url => !url.pathname.endsWith('/new') || url.pathname === '/jobs/new')
    const count = await firstChild.evaluate(async ({table, property, value}) => {
      const db = await new Promise(resolve => {
        const request = indexedDB.open('automech')
        request.onsuccess = () => resolve(request.result)
      })
      try {
        const rows = await new Promise(resolve => {
          const request = db.transaction(table).objectStore(table).getAll()
          request.onsuccess = () => resolve(request.result)
        })
        return rows.filter(row => row[property] === value).length
      } finally { db.close() }
    }, {table: item.table, property: item.property, value: item.value})
    assert.equal(count, 1, 'duplicate intake ' + item.table)
    await staleChild.close()
  }
  // A later Add vehicle action within the same intake must still create a fresh record.
  await firstChild.getByRole('link', {name: /add a vehicle/i}).click()
  await firstChild.locator('#plate').fill('NEW-REQUEST')
  await firstChild.getByRole('button', {name: 'Add vehicle', exact: true}).click()
  await firstChild.locator('#veh option:checked', {hasText: 'NEW-REQUEST'}).waitFor({state: 'attached'})
  console.log('Stale tabs reuse committed intake customers and vehicles; separate requests create new records.')
  console.log('A superseded intake cannot overwrite, resurrect or convert the active tab’s draft.')
  console.log('Browser restart recovers independent intakes and discards expired drafts and child forms.')
  console.log('Intake retained complaint, mileage and selections across customer/vehicle creation and reload.')
} finally {
  await context.close()
  await rm(profile, { recursive: true, force: true })
}
