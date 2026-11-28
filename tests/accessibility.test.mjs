import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

let server, browser, origin

before(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
  await server.listen()
  origin = server.resolvedUrls.local[0]
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  })
})

after(async () => {
  await browser?.close()
  await server?.close()
})

async function openEstimate(page) {
  await page.goto(origin)
  const id = await page.evaluate(async () => {
    const { customersRepo } = await import('/src/repositories/customers.ts')
    const { vehiclesRepo } = await import('/src/repositories/vehicles.ts')
    const { workOrdersRepo } = await import('/src/repositories/workOrders.ts')
    const customer = await customersRepo.create({ firstName: 'Robin', lastName: 'Diaz' })
    const vehicle = await vehiclesRepo.create({ customerId: customer.id, type: 'car', make: 'Honda', model: 'Civic' })
    const job = await workOrdersRepo.create({
      customerId: customer.id, vehicleId: vehicle.id, status: 'estimate', declinedItems: [],
      lineItems: [{ id: 'labor', kind: 'labor', description: 'Brake inspection', hours: 1, quantity: 1, unitPrice: 9000, taxable: false }],
      shopSuppliesPct: 0, taxRatePct: 0,
    })
    return job.id
  })
  await page.goto(new URL('jobs/' + id, origin).href)
}

test('keyboard approval stays in the labelled dialog and Escape returns to its trigger', async (t) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  t.after(() => page.close())
  await openEstimate(page)
  const trigger = page.getByRole('button', { name: 'Capture approval' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Capture approval' })
  await dialog.waitFor({ timeout: 2000 })
  const focusInside = () => dialog.evaluate(el => el.contains(document.activeElement))
  assert.ok(await focusInside(), 'opening sets focus inside the sheet')
  for (const key of ['Shift+Tab', 'Tab']) {
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press(key)
      assert.ok(await focusInside(), key + ' left the sheet')
    }
  }
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  assert.ok(await trigger.evaluate(el => el === document.activeElement), 'Escape returns focus to Capture approval')
})

test('a narrow touch screen can open, scroll and dismiss approval with a full-size close target', async (t) => {
  const page = await browser.newPage({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true })
  t.after(() => page.close())
  await openEstimate(page)
  const trigger = page.getByRole('button', { name: 'Capture approval' })
  const triggerBounds = await trigger.boundingBox()
  assert.ok(triggerBounds.height >= 44 && triggerBounds.width >= 44, 'Approval button meets the touch target')
  await trigger.tap()
  const sheet = page.getByRole('dialog')
  const close = sheet.getByRole('button', { name: 'Close', exact: true })
  const bounds = await close.boundingBox()
  assert.ok(bounds.width >= 44 && bounds.height >= 44, 'Close should be at least 44 × 44 CSS pixels')
  const save = sheet.getByRole('button', { name: 'Record approval' })
  await save.scrollIntoViewIfNeeded()
  const saveBounds = await save.boundingBox()
  assert.ok(saveBounds.y >= 0 && saveBounds.y + saveBounds.height <= 568, 'approval action can be scrolled fully into view')
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scrolling')
  await close.tap()
  await sheet.waitFor({ state: 'hidden' })
})

test('line item entry receives initial focus and its unsaved draft can be dismissed from the backdrop', async (t) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  t.after(() => page.close())
  await openEstimate(page)
  const trigger = page.getByRole('button', { name: /^\+ Add(?: line item)?$/i })
  await trigger.click()
  const sheet = page.getByRole('dialog', { name: 'Add line item' })
  await sheet.waitFor()
  const description = sheet.getByRole('textbox', { name: 'Description' })
  assert.ok(await description.evaluate(el => document.activeElement === el))
  await page.keyboard.type('Unsaved part')
  await page.mouse.click(10, 10)
  await sheet.waitFor({ state: 'hidden' })
  assert.equal(await page.getByText('Unsaved part').count(), 0)
  assert.ok(await trigger.evaluate(el => document.activeElement === el))
})

test('phone viewport allows pinch zoom', async (t) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  t.after(() => page.close())
  await page.goto(origin)
  const session = await page.context().newCDPSession(page)
  const fingers = distance => [
    { x: 180 - distance, y: 240, id: 1 },
    { x: 180 + distance, y: 240, id: 2 },
  ]
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(24) })
  for (const distance of [32, 42, 56, 75, 95]) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(distance) })
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForFunction(() => visualViewport.scale > 1.3, undefined, { timeout: 2000 })
})

test('the shop interface follows changes to the device color preference', async (t) => {
  const page = await browser.newPage({ colorScheme: 'light' })
  t.after(() => page.close())
  await page.goto(origin)
  await page.getByRole('main').waitFor()
  const background = () => page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor)
  const light = await background()
  await page.emulateMedia({ colorScheme: 'dark' })
  assert.notEqual(await background(), light, 'page colors respond to the device dark mode')
  await page.emulateMedia({ colorScheme: 'light' })
  assert.equal(await background(), light)
})
