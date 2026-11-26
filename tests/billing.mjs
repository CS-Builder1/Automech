import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

// Exercise these feature routes in isolation as well as in the integrated app.
const fixture = {
  name: 'billing-test-routes',
  resolveId(id) { if (id === 'virtual:billing-pages') return '\0' + id },
  load(id) {
    if (id !== '\0virtual:billing-pages') return
    return `
      import React from 'react'
      import {createRoot} from 'react-dom/client'
      import {MemoryRouter, Routes, Route} from 'react-router-dom'
      import {Billing} from '/src/pages/Billing.tsx'
      import {InvoiceDetail} from '/src/pages/InvoiceDetail.tsx'
      const h = React.createElement
      export function mount() {
        const container = document.createElement('div')
        document.body.append(container)
        createRoot(container).render(h(MemoryRouter, { initialEntries:['/billing'] }, h(Routes, null,
          h(Route, { path:'/billing', element:h(Billing) }), h(Route, {path:'/billing/:id', element:h(InvoiceDetail)}))))
      }
    `
  }
}

const cacheDir = mkdtempSync(join(tmpdir(), 'automech-billing-test-'))
const server = await createServer({ cacheDir, plugins: [fixture], server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
await server.listen()
let browser
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    args: ['--no-sandbox'],
  })
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(server.resolvedUrls.local[0])
  const results = await page.evaluate(async () => {
    const { db, ensureSettings } = await import('/src/db/database.ts')
    const { issueInvoice, recordPayment, reversePayment, recordExpense, getDayClose, localDate } =
      await import('/src/repositories/billing.ts').catch(() => ({}))
    if (!issueInvoice) return { implemented: false }
    const { workOrdersRepo } = await import('/src/repositories/workOrders.ts')
    const date = new Date().toISOString()
    await ensureSettings()
    await db.settings.update('singleton', {displayCurrency: 'XCD', pegRate: 2.7})
    const customerId = 'customer', vehicleId = 'vehicle'
    await db.customers.add({ id: customerId, firstName: 'Ava', lastName: 'Young', updatedAt: date, createdAt: date })
    await db.vehicles.add({ id: vehicleId, customerId, type: 'car', licensePlate: 'SAMPLE', updatedAt: date, createdAt: date })
    const order = await workOrdersRepo.create({
      customerId, vehicleId, status: 'estimate', currency: 'USD', displayCurrency: 'XCD', pegRate: 2.7,
      lineItems: [{ id: 'lab', kind: 'labor', description: 'Diagnosis', quantity: 3, unitPrice: 10000, taxable: false }],
    })
    const refused = await issueInvoice(order.id).then(() => false, () => true)
    const deposit = { workOrderId: order.id, requestId: 'deposit', method: 'cash', amount: 10000, isDeposit: true }
    await Promise.all([recordPayment(deposit), recordPayment(deposit)])
    const noApproval = await db.workOrders.update(order.id, { status: 'completed' })
      .then(() => issueInvoice(order.id)).then(() => false, () => true)
    const { estimateSnapshot } = await import('/src/lib/approval.ts')
    await db.workOrders.update(order.id, { status: 'estimate' })
    await workOrdersRepo.recordApproval(order.id, { authorizedBy: 'Ava', method: 'phone' }, estimateSnapshot(await db.workOrders.get(order.id)), 0)
    await workOrdersRepo.setStatus(order.id, 'completed')
    await db.customers.update(customerId, { deletedAt: date })
    const archived = await Promise.all([
      issueInvoice(order.id).then(() => false, () => true),
      recordPayment({...deposit, requestId:'archived-parent', amount:1}).then(() => false, () => true),
    ])
    await db.customers.update(customerId, { deletedAt: null })
    const [invoice, same] = await Promise.all([issueInvoice(order.id), issueInvoice(order.id)])
    await db.settings.update('singleton', { currency: 'XCD', displayCurrency: 'EUR', pegRate: 0.5, shopName: 'Renamed' })
    await db.customers.update(customerId, { firstName: 'Changed' })
    const partial = { invoiceId: invoice.id, requestId: 'payment-1', method: 'bank_transfer', amount: 15000 }
    const duplicate = await Promise.all([recordPayment(partial), recordPayment(partial)])
    const [a, b] = await Promise.allSettled([
      recordPayment({ ...partial, amount: 5000, requestId: 'a' }), recordPayment({ ...partial, amount: 5000, requestId: 'b' }),
    ])
    const invoiceAfter = await db.invoices.get(invoice.id)
    await Promise.all([reversePayment(duplicate[0].id), reversePayment(duplicate[0].id)])
    const expense = { requestId: 'shop-expense', date: localDate(date), description: 'Gloves', category: 'Supplies', method: 'cash', amount: 1000, currency: 'USD' }
    await Promise.all([recordExpense(expense), recordExpense(expense)])
    const close = await getDayClose(expense.date)
    const latest = await db.invoices.get(invoice.id)
    const rows = await db.payments.toArray()
    return {
      implemented: true, refused, noApproval, archived, same: invoice.id === same.id, amountPaid: invoice.amountPaid,
      fullyPaid: invoiceAfter.amountPaid, balance: latest.total - latest.amountPaid, currency: latest.currency,
      customer: latest.customerName, shop: latest.shopName, deduped: duplicate[0].id === duplicate[1].id,
      collisions: [a, b].filter(x => x.status === 'rejected').length, receipts: rows.length,
      tied: rows.every(p => p.invoiceId === invoice.id), collections: close.movements.filter(x => x.kind !== 'expense').reduce((sum, x) => sum + x.amount, 0),
      expenses: close.movements.filter(x => x.kind === 'expense').map(x => x.amount),
      issuedSales: close.invoices?.map(i => i.total),
    }
  })
  assert.equal(results.implemented, true, 'Offline invoice issuance is available')
  assert.deepEqual(results, {
    implemented: true, refused: true, noApproval: true, archived: [true, true], same: true, amountPaid: 10000, fullyPaid: 30000, balance: 15000,
    currency: 'USD', customer: 'Ava Young', shop: 'My Shop', deduped: true, collisions: 1, receipts: 4,
    tied: true, collections: 15000, expenses: [-1000], issuedSales: [30000],
  })
  await page.evaluate(async () => { (await import('/@id/__x00__virtual:billing-pages')).mount() })
  await page.getByRole('heading', { name: 'Daily close' }).waitFor()
  for (const [name, refunds, expenses] of [
    [/^Cash /, '$0.00', '$10.00'],
    [/^Bank transfer /, '$150.00', '$0.00'],
  ]) {
    const cells = page.getByRole('row', {name}).getByRole('cell')
    assert.equal(await cells.nth(1).innerText(), refunds)
    assert.equal(await cells.nth(2).innerText(), expenses)
  }
  const csvDownload = page.waitForEvent('download')
  await page.getByRole('button',{ name: 'Export daily CSV' }).click()
  assert.match((await csvDownload).suggestedFilename(), /Automech-close-.*\.csv/)
  await page.getByRole('link', { name: /INV-1001/ }).click()
  await page.getByRole('heading', {name: 'Invoice INV-1001'}).waitFor()
  await page.getByRole('button', {name: 'Record payment'}).click()
  await page.getByLabel('Amount (USD)').fill('1.25')
  await page.getByRole('button', {name: 'Save receipt'}).click()
  await page.getByText('148.75', { exact: false }).first().waitFor()
  const docDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Share / download' }).click()
  assert.equal((await docDownload).suggestedFilename(), 'INV-1001.html')
  const sharedText = await page.evaluate(async () => {
    const {db} = await import('/src/db/database.ts')
    const {shareDocument, invoiceDocument} = await import('/src/lib/financialDocuments.ts')
    let shared
    Object.defineProperty(navigator, 'canShare', {configurable: true, value: () => false})
    Object.defineProperty(navigator, 'share', {configurable: true, value: async data => { shared = data.text }})
    await shareDocument(invoiceDocument(await db.invoices.toCollection().first()))
    return shared
  })
  assert.match(sharedText, /Diagnosis/)
  assert.match(sharedText, /Invoice total/)
  const docs = await page.evaluate(async () => {
    const { db } = await import('/src/db/database.ts')
    const { invoiceDocument, receiptDocument, customerHtml } = await import('/src/lib/financialDocuments.ts')
    const original = await db.invoices.toCollection().first()
    const i = { ...original, lineItems: [{ ...original.lineItems[0], description: '<oil & filter>', unitCost: 12345678, supplier: 'PRIVATE WHOLESALER' }] }
    const invoiceHtml = customerHtml(invoiceDocument(i))
    const deposit = await db.payments.get('deposit')
    const receiptHtml = customerHtml(receiptDocument(deposit))
    return {invoiceHtml, receiptHtml}
  })
  assert.match(docs.invoiceHtml, /810\.00/)
  assert.match(docs.receiptHtml, /270\.00/)
  assert.match(docs.invoiceHtml, /&lt;oil &amp; filter&gt;/)
  assert.doesNotMatch(docs.invoiceHtml, /PRIVATE WHOLESALER|12345678|<oil & filter>/)
  assert.match(docs.receiptHtml, /Deposit receipt RCT-/)
  assert.match(docs.receiptHtml, /200.00/)
  // Keep a settings edit open while the cashier records a receipt in the original tab.
  const settingsTab = await context.newPage()
  await settingsTab.goto(new URL('settings', server.resolvedUrls.local[0]).href)
  await settingsTab.getByLabel('Tax rate %').fill('7.25')
  const counter = await page.evaluate(async () => {
    const { db } = await import('/src/db/database.ts')
    const { recordPayment } = await import('/src/repositories/billing.ts')
    const invoice = await db.invoices.toCollection().first()
    const receipt = await recordPayment({ invoiceId: invoice.id, requestId: 'settings-open', method: 'cash', amount: 100 })
    await db.settings.update('singleton', { shopName: 'Cashier updated shop' })
    return Number(receipt.number.slice(4))
  })
  await settingsTab.waitForFunction(() => document.querySelector('#shopName')?.value === 'Cashier updated shop')
  assert.equal(await settingsTab.getByLabel('Tax rate %').inputValue(), '7.25')
  await settingsTab.getByRole('button', { name: 'Save settings' }).click()
  await settingsTab.getByText('Saved ✓').waitFor()
  const persisted = await page.evaluate(async () => {
    const { db } = await import('/src/db/database.ts')
    const saved = await db.settings.get('singleton')
    await db.settings.update('singleton', { defaultTaxRatePct: 8 })
    return [saved.defaultTaxRatePct, saved.receiptCounter, saved.shopName]
  })
  assert.deepEqual(persisted, [7.25, counter, 'Cashier updated shop'])
  await settingsTab.waitForFunction(() => document.querySelector('#tax')?.value === '8')
  await settingsTab.getByText('Saved ✓').waitFor({ state: 'hidden' })
  await settingsTab.evaluate(async () => {
    const { db } = await import('/src/db/database.ts')
    const get = db.settings.get.bind(db.settings)
    const gate = new Promise(resolve => { window.deliverSettings = resolve })
    db.settings.get = function (...args) {
      const result = get(...args)
      if (db.constructor.currentTransaction?.mode === 'readwrite') return result
      return result.then(async row => { await gate; return row })
    }
  })
  const tax = settingsTab.getByLabel('Tax rate %')
  await tax.fill('9.5')
  await settingsTab.getByRole('button', { name: 'Save settings' }).click()
  await settingsTab.getByText('Saved ✓').waitFor()
  assert.equal(await tax.inputValue(), '9.5', 'the prior tax rate flashed before the committed row arrived')
  await tax.press('End')
  await tax.press('2')
  assert.equal(await tax.inputValue(), '9.52')
  await settingsTab.evaluate(() => window.deliverSettings())

  // Restore the prior value while a second save is still writing.
  await settingsTab.evaluate(async () => {
    const { db } = await import('/src/db/database.ts')
    const update = db.settings.update.bind(db.settings)
    db.settings.update = async (...args) => {
      await new Promise(resolve => { window.finishSave = resolve })
      return update(...args)
    }
  })
  await settingsTab.getByRole('button', { name: 'Save settings' }).click()
  await settingsTab.waitForFunction(() => !!window.finishSave)
  await tax.fill('9.5')
  await settingsTab.evaluate(() => window.finishSave())
  await page.waitForFunction(async () => {
    const { db } = await import('/src/db/database.ts')
    return (await db.settings.get('singleton')).defaultTaxRatePct === 9.52
  })
  await page.evaluate(async () => {
    const { db } = await import('/src/db/database.ts')
    await db.settings.update('singleton', { shopName: 'Saved settings delivered' })
  })
  await settingsTab.waitForFunction(() => document.querySelector('#shopName')?.value === 'Saved settings delivered')
  assert.equal(await tax.inputValue(), '9.5', 'typing during save was lost')
  await settingsTab.close()

  const legacyPage = await browser.newPage()
  await legacyPage.goto(new URL('favicon.svg', server.resolvedUrls.local[0]).href)
  const upgraded = await legacyPage.evaluate(async () => {
    const { default: Dexie } = await import('/node_modules/dexie/dist/modern/dexie.mjs')
    const legacy = new Dexie('automech')
    legacy.version(1).stores({
      settings: 'id', customers: 'id, lastName, firstName, phone, email, updatedAt, deletedAt',
      vehicles: 'id, customerId, vin, licensePlate, make, model, updatedAt, deletedAt',
      workOrders: 'id, number, customerId, vehicleId, status, updatedAt, deletedAt',
      invoices: 'id, number, workOrderId, customerId, issuedAt, updatedAt, deletedAt',
      payments: 'id, invoiceId, method, status, createdAt',
      inspections: 'id, workOrderId, vehicleId, customerId, updatedAt, deletedAt', media: 'id, createdAt',
      appointments: 'id, customerId, vehicleId, workOrderId, startAt, updatedAt, deletedAt',
    })
    const date = new Date().toISOString()
    await legacy.settings.add({ id: 'singleton', currency: 'XCD', shopName: 'Legacy Shop', defaultLaborRate: 9000,
      defaultPartsMarkupPct: 0, defaultTaxRatePct: 0, shopSuppliesPct: 0, roCounter: 1000, invoiceCounter: 1002, updatedAt: date })
    await legacy.customers.add({ id: 'old-customer', firstName: 'Jo', lastName: 'Lee', createdAt: date, updatedAt: date })
    await legacy.vehicles.add({ id: 'old-vehicle', customerId: 'old-customer', type: 'car', createdAt: date, updatedAt: date })
    await legacy.workOrders.add({ id: 'old-ro', number: 'RO-1000', customerId: 'old-customer', vehicleId: 'old-vehicle',
      status: 'invoiced', lineItems: [], createdAt: date, updatedAt: date })
    await legacy.invoices.add({id:'old', number:'INV-1001', workOrderId:'old-ro', customerId:'old-customer', vehicleId:'old-vehicle',
      lineItems:[], subtotal:3000, shopSupplies:0, tax:0, total:3000, amountPaid:1000, issuedAt:date, createdAt:date, updatedAt:date})
    await legacy.payments.add({id:'old-payment', invoiceId:'old', method:'cash', status:'paid', amount:1000, createdAt:date})
    const undatedInvoice = { ...await legacy.invoices.get('old'), id: 'undated', number: 'INV-1002' }
    delete undatedInvoice.issuedAt
    await legacy.invoices.add(undatedInvoice)
    await legacy.payments.add({ id: 'undated-payment', invoiceId: 'undated', method: 'cash', status: 'paid', amount: 1000 })
    legacy.close()
    const { db } = await import('/src/db/database.ts')
    const { recordPayment, getDayClose, localDate } = await import('/src/repositories/billing.ts')
    await db.open()
    await db.settings.update('singleton',{currency:'CAD'})
    const oldPayment = await db.payments.get('old-payment')
    const next = await recordPayment({requestId:'new-payment', invoiceId:'old', amount:500, method:'cash'})
    const invoice = await db.invoices.get('old')
    const close = await getDayClose(localDate(new Date()))
    return {
      amounts: [oldPayment.currency, next.currency, invoice.currency, invoice.amountPaid],
      invoiceDate: (await db.invoices.get('undated')).issuedDate,
      receiptDate: (await db.payments.get('undated-payment')).recordedDate,
      invoices: close.invoices.map(i => i.id),
      movements: close.movements.map(m => m.id).sort(),
    }
  })
  assert.deepEqual(upgraded.amounts, ['XCD', 'XCD', 'XCD', 1500])
  assert.equal(upgraded.invoiceDate, undefined)
  assert.equal(upgraded.receiptDate, undefined)
  assert.deepEqual(upgraded.invoices, ['old'])
  assert.deepEqual(upgraded.movements, ['new-payment', 'old-payment'])

  await legacyPage.evaluate(async () => {
    const { createBackup, inspectBackup } = await import('/src/lib/backup.ts')
    const snapshot = await createBackup()
    await (await inspectBackup(new File([snapshot.blob], snapshot.filename))).replaceShop()
  })
  await legacyPage.goto(new URL('billing', server.resolvedUrls.local[0]).href)
  await legacyPage.getByRole('link', { name: /INV-1002.*Date unknown/ }).click()
  await legacyPage.getByRole('button', { name: /undated-payment.*Date unknown/ }).waitFor()
  await legacyPage.close()
  console.log('Billing passed: deposit, guarded issue, immutable snapshot, concurrent retries, reversal, local-day cash close.')
} finally {
  await browser?.close()
  await server.close()
  rmSync(cacheDir, { recursive: true, force: true })
}
