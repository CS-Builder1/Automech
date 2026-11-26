// Usage: start Vite (dev or preview), then node tests/shop-backup.mjs <origin>.
// Add --offline against a production preview to exercise the installed PWA offline.
// Set CHROMIUM_PATH if the local Chromium executable is elsewhere.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const origin = process.argv[2] || 'http://127.0.0.1:5173'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' })
const now = '2025-04-08T12:00:00.000Z'
const dates = { createdAt: now, updatedAt: now }
const line = { id: 'l', description: 'Oil change', kind: 'labor', taxable: true, quantity: 1, unitPrice: 4800 }
const approval = {
  authorizedBy: 'Test Driver', method: 'signature', authorizedAt: now, amountAuthorized: 4800,
  signatureDataUrl: 'data:image/png;base64,YWJj',
}
const fixtures = {
  settings: [{ id: 'singleton', shopName: 'Bay One', currency: 'USD', defaultLaborRate: 4800,
    defaultPartsMarkupPct: 10, defaultTaxRatePct: 0, shopSuppliesPct: 0, roCounter: 1042,
    invoiceCounter: 1045, receiptCounter: 1020, updatedAt: now }],
  customers: [{ id: 'c', firstName: 'Sam', lastName: 'Driver', ...dates },
    { id: 'c-deleted', firstName: 'Past', lastName: 'Driver', ...dates, deletedAt: now }],
  vehicles: [{ id: 'v', type: 'car', customerId: 'c', ...dates }],
  workOrders: [{ id: 'w', number: 'RO-1042', customerId: 'c', vehicleId: 'v', status: 'invoiced', currency: 'USD',
    lineItems: [line], declinedItems: [line], authorization: approval, authorizations: [approval], ...dates }],
  invoices: [{ id: 'i', number: 'INV-1045', customerId: 'c', vehicleId: 'v', workOrderId: 'w',
    issuedAt: now, lineItems: [line], subtotal: 4800, shopSupplies: 0, tax: 0, total: 4800, amountPaid: 1000, ...dates }],
  payments: [{ id: 'p', invoiceId: 'i', method: 'cash', status: 'paid', amount: 1000, createdAt: now }],
  appointments: [{ id: 'a', title: 'Oil change', customerId: 'c', vehicleId: 'v', startAt: now, ...dates }],
  inspections: [{ id: 'n', customerId: 'c', vehicleId: 'v', templateName: 'Arrival', workOrderId: 'w',
    items: [{ id: 'wheel', label: 'Wheel', rating: 'green', photoIds: ['photo'] }], ...dates }],
  media: [{ id: 'photo', mimeType: 'image/png', createdAt: now }],
  expenses: [{ id: 'exp', date: '2025-04-08', category: 'Supplies', description: 'Oil', amount: 700,
    currency: 'USD', method: 'cash', createdAt: now }],
}

async function settingsPage() {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(origin + '/settings')
  await page.getByRole('button', { name: 'Download backup' }).waitFor()
  if (process.argv.includes('--offline')) {
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload()
    await page.waitForFunction(() => !!navigator.serviceWorker.controller)
    await context.setOffline(true)
    await page.reload()
    await page.getByRole('button', { name: 'Download backup' }).waitFor()
  }
  return page
}

async function seed(page, records = fixtures) {
  return page.evaluate(async data => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('automech')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const names = [...db.objectStoreNames]
    const tx = db.transaction(names, 'readwrite')
    for (const name of names) for (const row of data[name] || []) {
      // Values the original numeric inputs could persist.
      if (name === 'vehicles') Object.assign(row, { year: -2003, mileage: Number.MAX_SAFE_INTEGER + 1 })
      if (name === 'workOrders') Object.assign(row, { mileageIn: NaN, mileageOut: 0, taxRatePct: Infinity })
      if (name === 'workOrders' || name === 'invoices') row.lineItems[0].unitCost = Number.MAX_SAFE_INTEGER + 1
      if (name === 'settings') Object.assign(row, { pegRate: Infinity, defaultLaborRate: -100, shopSuppliesPct: Infinity })
      if (name === 'media') row.blob = new Blob([Uint8Array.of(0, 255, 1)], { type: 'image/png' })
      tx.objectStore(name).put(row)
    }
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error) })
    db.close()
  }, records)
}

async function storedRow(page, table, id) {
  return page.evaluate(async ([table, id]) => new Promise((resolve, reject) => {
    const open = indexedDB.open('automech')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const get = db.transaction(table).objectStore(table).get(id)
      get.onsuccess = () => resolve(get.result)
      get.onerror = () => reject(get.error)
      db.close()
    }
  }), [table, id])
}

async function download(page, filename) {
  const started = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download backup' }).click()
  const file = await started
  if (filename) assert.match(file.suggestedFilename(), filename)
  return JSON.parse(await readFile(await file.path(), 'utf8'))
}

async function upload(page, archive) {
  await page.getByLabel('Restore from a backup file').setInputFiles({
    name: 'shop.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(archive)),
  })
}

function recalculate(archive) {
  archive.sha256 = createHash('sha256').update(JSON.stringify(archive.payload)).digest('hex')
  return archive
}

async function confirm(page) {
  await page.getByRole('checkbox', { name: /Replace all shop records/ }).check()
  await page.getByRole('button', { name: 'Restore shop records' }).click()
}

try {
  const source = await settingsPage()
  await seed(source)
  const archive = await download(source)
  const data = archive.payload.tables
  assert.equal(data.vehicles[0].year, undefined)
  assert.equal(data.vehicles[0].mileage, undefined)
  assert.equal(data.workOrders[0].mileageIn, undefined)
  assert.equal(data.workOrders[0].mileageOut, 0)
  assert.equal(data.workOrders[0].taxRatePct, undefined)
  assert.equal(data.workOrders[0].lineItems[0].unitCost, undefined)
  assert.equal(data.invoices[0].lineItems[0].unitCost, undefined)
  assert.equal(data.workOrders[0].lineItems[0].unitPrice, 4800)
  assert.equal(data.settings[0].defaultLaborRate, 0)
  assert.equal(data.settings[0].shopSuppliesPct, 0)
  assert.equal((await storedRow(source, 'vehicles', 'v')).year, -2003)
  assert.equal((await storedRow(source, 'settings', 'singleton')).pegRate, Infinity)
  assert.equal(data.settings[0].pegRate, undefined)
  assert.equal(data.media[0].blob.base64, 'AP8B')
  assert.deepEqual(data.workOrders[0].authorizations, [approval])
  assert.equal(data.customers.length, 2)
  assert.equal(data.settings[0].roCounter, 1042)
  assert.equal(archive.sha256, recalculate(structuredClone(archive)).sha256)
  console.log('PASS snapshot includes approvals, counters, photo bytes, and deleted records')

  const damaged = await settingsPage()
  const damagedRecords = structuredClone(fixtures)
  damagedRecords.workOrders[0].authorization.amountAuthorized = Infinity
  await seed(damaged, damagedRecords)
  const recovery = await download(damaged, /manual-recovery/)
  assert.equal(recovery.payload.format, 'automech-shop-recovery')
  assert.equal(recovery.sha256, recalculate(structuredClone(recovery)).sha256)
  const raw = recovery.payload.tables
  assert.equal(raw.workOrders[0].authorization.signatureDataUrl, approval.signatureDataUrl)
  assert.equal(raw.vehicles[0].year, -2003)
  assert.equal(raw.media[0].blob.base64, 'AP8B')
  assert.equal(raw.media[0].blob.type, 'image/png')
  for (const [name, rows] of Object.entries(fixtures)) assert.equal(raw[name].length, rows.length)
  for (const [path, value] of [
    [['workOrders', '0', 'authorization', 'amountAuthorized'], 'Infinity'],
    [['workOrders', '0', 'mileageIn'], 'NaN'],
    [['settings', '0', 'pegRate'], 'Infinity'],
  ]) {
    assert.ok(recovery.payload.specialValues.some(entry =>
      entry.value === value && JSON.stringify(entry.path) === JSON.stringify(path)))
  }
  const warning = damaged.getByRole('alert')
  await warning.filter({ hasText: /manual recovery/i }).waitFor()
  assert.match(await warning.textContent(), /workOrders.*w.*authorization.amountAuthorized/)
  assert.equal(await damaged.evaluate(() => localStorage.getItem('automech.lastBackupDownload')), null)
  assert.equal((await storedRow(damaged, 'workOrders', 'w')).authorization.amountAuthorized, Infinity)
  await upload(damaged, recovery)
  await warning.filter({ hasText: /manual recovery.*restore/i }).waitFor()
  assert.equal(await damaged.getByRole('button', { name: 'Restore shop records' }).count(), 0)
  await damaged.context().close()
  console.log('PASS an invalid signed amount produces a labeled lossless manual recovery file')

  const destination = await settingsPage()
  const before = await download(destination)
  assert.equal(before.payload.tables.customers.length, 0)

  for (const [mutate, expected] of [
    [a => { a.payload.tables.customers[0].followUps = { wiper: { outcome: {}, contactedAt: now } }; recalculate(a) }, 'Invalid customers record'],
    [a => { a.payload.tables.vehicles[0].year = -2003; recalculate(a) }, 'Invalid vehicles record (year)'],
    [a => { a.payload.tables.settings[0].defaultTaxRatePct = -1; recalculate(a) }, 'Invalid settings record (defaultTaxRatePct)'],
    [a => { a.payload.createdAt = now }, 'integrity check failed'],
    [a => { a.payload.version = 999; recalculate(a) }, 'Unsupported backup version'],
    [a => { delete a.payload.tables.invoices; recalculate(a) }, 'missing the invoices table'],
    [a => { a.payload.tables.settings[0].roCounter = 3; recalculate(a) }, 'behind an existing document number'],
    [a => { a.payload.tables.customers.push(a.payload.tables.customers[0]); recalculate(a) }, 'duplicate record ID'],
    [a => { a.payload.tables.workOrders[0].customerId = 'missing'; recalculate(a) }, 'references missing data'],
    [a => { a.payload.tables.workOrders[0].authorizations[0].snapshot = { currency: 'USD' }; recalculate(a) }, 'Invalid workOrders record'],
    [a => { a.payload.tables.workOrders[0].authorizations[0].snapshot = {
      currency: 'USD', lineItems: [line], shopSuppliesPct: 0, taxRatePct: 0, vehicleLabel: { invalid: true },
    }; recalculate(a) }, 'Invalid workOrders record'],
    [a => { a.payload.tables.media[0].blob.base64 = 'not@base64'; recalculate(a) }, 'Invalid photo content'],
  ]) {
    const invalid = structuredClone(archive)
    mutate(invalid)
    await upload(destination, invalid)
    await destination.getByRole('alert').filter({ hasText: expected }).waitFor()
    assert.equal(await destination.getByRole('button', { name: 'Restore shop records' }).count(), 0)
  }
  assert.deepEqual((await download(destination)).payload.tables, before.payload.tables)
  console.log('PASS invalid files rejected without changing the destination')

  await upload(destination, archive)
  const restore = destination.getByRole('button', { name: 'Restore shop records' })
  await restore.waitFor()
  assert.equal(await restore.isDisabled(), true)
  await destination.getByRole('button', { name: 'Cancel restore' }).click()
  assert.deepEqual((await download(destination)).payload.tables, before.payload.tables)

  const otherTab = await destination.context().newPage()
  await otherTab.goto(origin + '/settings')
  await otherTab.getByRole('button', { name: 'Download backup' }).waitFor()
  for (const tab of [destination, otherTab]) {
    await tab.evaluate(() => {
      sessionStorage.setItem('automech:job-draft:w:complaint', 'old notes')
      sessionStorage.setItem('automech.intake.current', 'old')
      localStorage.setItem('automech.intake.old', 'old intake')
      localStorage.setItem('unrelated-preference', 'keep')
    })
  }
  // Throw after the restore has issued clears/writes. All tables must roll back.
  await destination.evaluate(() => {
    const original = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === 'workOrders') throw new DOMException('Simulated full disk', 'QuotaExceededError')
      return original.apply(this, args)
    }
  })
  await upload(destination, archive)
  await confirm(destination)
  await destination.getByRole('alert').waitFor()
  assert.deepEqual((await download(destination)).payload.tables, before.payload.tables)
  assert.equal(await destination.evaluate(() => sessionStorage.getItem('automech:job-draft:w:complaint')), 'old notes')
  console.log('PASS cancellation and mid-transaction failure preserve existing records')

  await destination.reload()
  await upload(destination, archive)
  await confirm(destination)
  await destination.getByText(/Restore complete/).waitFor()
  for (const tab of [destination, otherTab]) {
    await tab.waitForFunction(() => !sessionStorage.getItem('automech:job-draft:w:complaint'))
    assert.equal(await tab.evaluate(() => sessionStorage.getItem('automech.intake.current')), null)
    assert.equal(await tab.evaluate(() => localStorage.getItem('automech.intake.old')), null)
    assert.equal(await tab.evaluate(() => localStorage.getItem('unrelated-preference')), 'keep')
  }
  await otherTab.close()
  console.log('PASS successful restore invalidates stale drafts in both tabs')
  await destination.reload()
  assert.deepEqual((await download(destination)).payload.tables, data)
  console.log('PASS fresh-device restore, reload and re-export preserve all populated stores')

  // Once newer schemas are installed, mirror a backup from the original schema.
  const historical = structuredClone(archive)
  historical.payload.schemaVersion = 1
  delete historical.payload.tables.expenses
  delete historical.payload.tables.workOrders[0].authorizations
  delete historical.payload.tables.workOrders[0].currency
  recalculate(historical)
  await upload(destination, historical)
  await confirm(destination)
  await destination.getByText(/Restore complete/).waitFor()
  const migrated = (await download(destination)).payload.tables
  for (const [field, value] of Object.entries(approval)) {
    assert.deepEqual(migrated.workOrders[0].authorization[field], value)
  }
  assert.equal(migrated.payments[0].id, 'p')
  if (archive.payload.schemaVersion > 1) {
    assert.equal(migrated.workOrders[0].currency, 'USD')
    assert.ok(migrated.workOrders[0].authorizations.length)
  }
  console.log('PASS historical single-approval backup restores successfully')
} finally {
  await browser.close()
}
