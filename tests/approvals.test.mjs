import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

let server, browser, base
before(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
  await server.listen()
  base = server.resolvedUrls.local[0]
  const chrome = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)
  browser = await chromium.launch({ executablePath: chrome })
})
after(async () => { await browser?.close(); await server?.close() })

async function newJob(settings = {}, context = browser) {
  const page = await context.newPage()
  await page.goto(base)
  const order = await page.evaluate(async defaults => {
    const { db, ensureSettings } = await import('/src/db/database.ts')
    const { workOrdersRepo } = await import('/src/repositories/workOrders.ts')
    await ensureSettings()
    await db.settings.update('singleton',defaults)
    const date = new Date().toISOString()
    await db.customers.add({ id: 'c', firstName: 'Grace', lastName: 'Lee', createdAt: date, updatedAt: date })
    await db.vehicles.add({ id: 'v', customerId: 'c', type: 'car', year:2021, make:'Ford', model:'Focus', licensePlate:'TEST-1', mileage: 200, createdAt: date, updatedAt: date })
    return workOrdersRepo.create({ customerId: 'c', vehicleId: 'v', status: 'estimate',
      lineItems: [{ id: 'labor', kind: 'labor', description: 'Brake check', quantity: 1, unitPrice: 10000, taxable: false }] })
  },settings)
  await page.goto(new URL('jobs/' + order.id, base).href)
  await page.getByRole('heading', { name: order.number }).waitFor()
  return {page, order}
}

test('a price uses one decimal separator and rejects ambiguous prices', async () => {
  const {page} = await newJob()
  const result = await page.evaluate(async () => {
    const {parseAmountToMinor} = await import('/src/lib/money.ts')
    return ['12,50', '12.50', '1,250', '1.2.3', 'wrong', '0'].map(value => {
      try { return parseAmountToMinor(value) } catch { return null }
    })
  })
  assert.deepEqual(result, [1250,1250,null,null,null,0])
  await page.close()
})

test('part quantities reject ambiguous groups and accept ungrouped decimals and integers', async () => {
  const {page, order} = await newJob()
  const sheet = page.getByRole('dialog')
  for (const [index, quantity] of ['1,5', '1.5', '2'].entries()) {
    await page.getByRole('button', {name: '+ Add', exact: true}).click()
    await sheet.getByLabel('Type', {exact: true}).selectOption('part')
    await sheet.getByLabel('Description').fill('Washer')
    await sheet.getByLabel('Price each').fill('0.10')
    if (index === 0) {
      for (const ambiguous of ['1,000', '1,550']) {
        await sheet.getByLabel('Quantity').fill(ambiguous)
        await sheet.getByRole('button', {name: 'Add', exact: true}).click()
        await sheet.getByRole('alert').waitFor({timeout: 2500})
      }
    }
    await sheet.getByLabel('Quantity').fill(quantity)
    await sheet.getByRole('button', {name: 'Add', exact: true}).click()
    await sheet.waitFor({state: 'hidden'})
  }
  const saved = await page.evaluate(async id => {
    const {db} = await import('/src/db/database.ts')
    return (await db.workOrders.get(id)).lineItems.filter(i => i.kind === 'part').map(i => i.quantity)
  }, order.id)
  assert.deepEqual(saved, [1.5, 1.5, 2])
  await page.close()
})

test('signed revisions retain scope, currency and separate ink; signed work controls completion', async () => {
  const {page, order} = await newJob()
  await page.getByRole('button',{name:'Capture approval'}).click()
  const sheet = page.getByRole('dialog')
  assert.match(await sheet.innerText(), /Brake check/)
  assert.match(await sheet.innerText(), /USD/)
  await sheet.getByLabel('How was it authorized?').selectOption('signature')
  assert.equal(await sheet.getByRole('button',{name:'Record approval'}).isDisabled(), true)
  const box = await sheet.locator('canvas').boundingBox()
  await page.mouse.move(box.x+10,box.y+10); await page.mouse.down()
  await page.mouse.move(box.x+30,box.y+30,{steps:4}); await page.mouse.up()
  await sheet.getByRole('button',{name:'Record approval'}).click()
  await sheet.waitFor({state:'hidden'})
  await page.evaluate(async id => {
    const {db} = await import('/src/db/database.ts')
    const w = await db.workOrders.get(id)
    await db.workOrders.update(id, {lineItems: w.lineItems.map(li=>({...li,description:'Different repair'}))})
    await db.settings.update('singleton', {currency:'EUR'})
  },order.id)
  await page.getByText(/Re-approval required/).first().waitFor()
  const guarded = await page.evaluate(async id => {
    const {workOrdersRepo} = await import('/src/repositories/workOrders.ts')
    try { await workOrdersRepo.setStatus(id, 'completed'); return false } catch { return true }
  },order.id)
  assert.equal(guarded,true)
  await page.getByRole('button',{name:'Update',exact:true}).click()
  assert.equal(await sheet.getByRole('button',{name:'Record approval'}).isDisabled(),true)
  await sheet.getByLabel('How was it authorized?').selectOption('phone')
  await sheet.getByRole('button',{name:'Record approval'}).click()
  await sheet.waitFor({state:'hidden'})
  const history = await page.evaluate(async id => {
    const {db} = await import('/src/db/database.ts')
    const w = await db.workOrders.get(id)
    return w.authorizations.map(a=>[a.revision,a.currency,a.snapshot.lineItems[0].description,Boolean(a.signatureDataUrl)])
  },order.id)
  assert.deepEqual(history,[[1,'USD','Brake check',true],[2,'USD','Different repair',false]])
  await page.close()
})

test('typed diagnosis survives a reload and missing work orders show their empty state', async () => {
  const {page} = await newJob()
  await page.getByLabel('Diagnosis / notes').fill('Replace wheel bearing')
  await page.reload()
  await page.getByLabel('Diagnosis / notes').waitFor()
  assert.equal(await page.getByLabel('Diagnosis / notes').inputValue(),'Replace wheel bearing')
  await page.goto(new URL('jobs/missing',base).href)
  await page.getByText('Job not found.').waitFor({timeout:3000})
  await page.close()
})

test('labor direct cost uses actual hours, independent of billed hours', async () => {
  const {page} = await newJob()
  const totals = await page.evaluate(async () => {
    const {computeTotals,checkAuthorization} = await import('/src/lib/calc.ts')
    const computed = computeTotals({lineItems:[{kind:'labor',quantity:1.5,unitPrice:10000,actualHours:2,hourlyCost:2500}]})
    return [computed.total,computed.laborCost,computed.grossProfit,checkAuthorization(1,0).needsReauth]
  })
  assert.deepEqual(totals,[15000,5000,10000,true])
  await page.close()
})

test('discounts reduce the amount due after tax on the taxable subtotal', async () => {
  const page = await browser.newPage()
  await page.goto(new URL('favicon.svg', base).href)
  const results = await page.evaluate(async () => {
    const {computeTotals} = await import('/src/lib/calc.ts')
    // Older line items can carry a taxable flag even on a discount.
    return [false, true].map(discountTaxable => {
      const {itemsSubtotal, taxable, tax, total} = computeTotals({
        taxRatePct: 10,
        lineItems: [
          {kind: 'labor', quantity: 1, unitPrice: 10000, taxable: true},
          {kind: 'discount', quantity: 1, unitPrice: 1000, taxable: discountTaxable},
        ],
      })
      return {itemsSubtotal, taxable, tax, total}
    })
  })
  const expected = {itemsSubtotal: 9000, taxable: 10000, tax: 1000, total: 10000}
  assert.deepEqual(results, [expected, expected])
  await page.close()
})

test('approval history retains the signed tax and total when discounts are re-approved under a new tax rule', async () => {
  const {page, order} = await newJob()
  await page.evaluate(async job => {
    const {db} = await import('/src/db/database.ts')
    const {estimateSnapshot} = await import('/src/lib/approval.ts')
    const lineItems = [
      {...job.lineItems[0], taxable: true},
      {id: 'discount', kind: 'discount', description: 'Promotion', quantity: 1, unitPrice: 1000, taxable: true},
    ]
    const snapshot = estimateSnapshot({...job, lineItems, taxRatePct: 10})
    const record = {
      id: 'legacy', revision: 1, authorizedBy: 'Grace', method: 'phone', authorizedAt: job.createdAt,
      amountAuthorized: 9900, currency: 'USD', snapshot,
    }
    await db.workOrders.update(job.id, {status: 'approved', lineItems, taxRatePct: 10, authorization: record, authorizations: [record]})
  }, order)
  const history = revision => page.locator('details').filter({has: page.locator('summary', {hasText: 'Approval ' + revision})})
  const prior = history(1)
  await prior.waitFor()
  assert.match(await prior.getByRole('listitem').filter({hasText: 'Promotion'}).innerText(), /taxable/)
  assert.match(await prior.innerText(), /Tax \(10%\): \$9\.00/)
  assert.match(await prior.innerText(), /Authorized total \(USD\) \$99\.00/)

  await page.getByRole('button', {name: 'Update', exact: true}).click()
  const sheet = page.getByRole('dialog')
  assert.doesNotMatch(await sheet.getByRole('listitem').filter({hasText: 'Promotion'}).innerText(), /taxable/)
  assert.match(await sheet.innerText(), /Tax \(10%\): \$10\.00/)
  assert.match(await sheet.innerText(), /Authorized total \(USD\) \$100\.00/)
  await sheet.getByLabel('How was it authorized?').selectOption('phone')
  await sheet.getByRole('button', {name: 'Record approval'}).click()
  const current = history(2)
  await current.waitFor()
  assert.match(await current.innerText(), /Tax \(10%\): \$10\.00/)
  assert.match(await current.innerText(), /Authorized total \(USD\) \$100\.00/)
  await page.close()
})

test('v1 upgrade and approval checks work without Array.at and preserve legacy records', async () => {
  const page = await browser.newPage()
  // A resource with no app script opens this origin before v2 can create its database.
  await page.goto(new URL('favicon.svg', base).href)
  await page.evaluate(async () => {
    await new Promise((resolve,reject) => {
      const request = indexedDB.open('automech', 10)
      request.onupgradeneeded = () => {
        const db = request.result
        const schemas = {
          customers:'lastName firstName phone email updatedAt deletedAt', vehicles:'customerId vin licensePlate make model updatedAt deletedAt',
          workOrders:'number customerId vehicleId status updatedAt deletedAt', invoices:'number workOrderId customerId issuedAt updatedAt deletedAt',
          payments:'invoiceId method status createdAt', inspections:'workOrderId vehicleId customerId updatedAt deletedAt', media:'createdAt',
          appointments:'customerId vehicleId workOrderId startAt updatedAt deletedAt', settings:'',
        }
        for (const [table,keys] of Object.entries(schemas)) {
          const store = db.createObjectStore(table, {keyPath:'id'})
          for (const key of keys.split(' ').filter(Boolean)) store.createIndex(key,key)
        }
        const tx = request.transaction
        tx.objectStore('settings').put({id:'singleton',currency:'XCD',displayCurrency:'USD',pegRate:0.37})
        const legacy = {number:'RO-1',customerId:'c',vehicleId:'v',lineItems:[],status:'invoiced',
          authorization:{authorizedBy:'Pat',method:'signature',signatureDataUrl:'historical ink',authorizedAt:'2024-01-01',amountAuthorized:900}}
        tx.objectStore('workOrders').put({...legacy,id:'manual'})
        tx.objectStore('workOrders').put({...legacy,id:'issued'})
        tx.objectStore('invoices').put({id:'inv',workOrderId:'issued'})
      }
      request.onsuccess = () => {request.result.close(); resolve()}
      request.onerror = () => reject(request.error)
    })
  })
  const result = await page.evaluate(async () => {
    delete Array.prototype.at
    const {db} = await import('/src/db/database.ts')
    const {approvalIssue} = await import('/src/lib/approval.ts')
    const manual = await db.workOrders.get('manual')
    const issued = await db.workOrders.get('issued')
    return [manual.currency,manual.displayCurrency,manual.pegRate,manual.status,issued.status,manual.authorizations[0].signatureDataUrl,manual.authorizations[0].snapshot ?? null,approvalIssue(manual)]
  })
  assert.deepEqual(result,['XCD','USD',0.37,'completed','invoiced','historical ink',null,'Re-approval required. Confirm the itemized estimate for this legacy approval.'])
  await page.close()
})

test('concurrent changes stay atomic and completed mileage advances without reducing vehicle odometer', async () => {
  const {page,order} = await newJob()
  const result = await page.evaluate(async id => {
    const {workOrdersRepo: repo} = await import('/src/repositories/workOrders.ts')
    const {db} = await import('/src/db/database.ts')
    const {estimateSnapshot} = await import('/src/lib/approval.ts')
    const w = await repo.get(id)
    const results = await Promise.allSettled([1,2].map(()=>repo.recordApproval(id,{authorizedBy:'Pat',method:'phone'},estimateSnapshot(w),0)))
    const oldLine = w.lineItems[0]
    const changed = {...oldLine,description:'Replace brakes'}
    await repo.changeLine(id,'save',changed,oldLine)
    const stale = await Promise.allSettled([
      repo.changeLine(id,'remove',oldLine,oldLine),
      repo.recordApproval(id,{authorizedBy:'Pat',method:'phone'},estimateSnapshot(w),1),
      repo.setStatus(id,'completed'), repo.setStatus(id,'invoiced'),
    ])
    const latest = await repo.get(id)
    await repo.recordApproval(id,{authorizedBy:'Pat',method:'phone'},estimateSnapshot(latest),1)
    await repo.update(id,{mileageOut:300})
    await repo.setStatus(id,'completed')
    const mileage = (await db.vehicles.get('v')).mileage
    await repo.setStatus(id,'in_progress')
    await repo.update(id,{mileageOut:210})
    await repo.setStatus(id,'completed')
    await db.customers.update('c',{deletedAt:new Date().toISOString()})
    const archivedEdit = await Promise.allSettled([repo.setStatus(id,'estimate')])
    return [results.map(r=>r.status).sort(),stale.map(r=>r.status),latest.status,mileage,
      (await db.vehicles.get('v')).mileage,archivedEdit[0].status]
  },order.id)
  assert.deepEqual(result,[['fulfilled','rejected'],Array(4).fill('rejected'),'awaiting_approval',300,300,'rejected'])
  await page.close()
})

test('the line editor prices a new part independently and accepts actual hours without costing them', async () => {
  const {page} = await newJob()
  await page.getByRole('button',{name:'+ Add',exact:true}).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Type', {exact:true}).selectOption('part')
  assert.equal(await sheet.getByLabel('Price each').inputValue(),'')
  await sheet.getByLabel('Type', {exact:true}).selectOption('labor')
  await sheet.getByLabel('Description').fill('Service A')
  await sheet.getByLabel('Actual hours (optional)').fill('1.75')
  await sheet.getByRole('button',{name:'Add',exact:true}).click()
  await sheet.waitFor({state:'hidden',timeout:2500})
  await page.getByText(/1.75 actual hr/).waitFor()
  await page.close()
})

test('concurrent repair orders skip active and archived numbers above the counter', async () => {
  const {page, order} = await newJob()
  const result = await page.evaluate(async existing => {
    const {db} = await import('/src/db/database.ts')
    const {workOrdersRepo} = await import('/src/repositories/workOrders.ts')
    await db.workOrders.add({...existing, id: 'archived', number: 'RO-1002', deletedAt: existing.createdAt})
    await db.settings.update('singleton', {roCounter: 1000})
    const input = {customerId: 'c', vehicleId: 'v', status: 'estimate', lineItems: []}
    const created = await Promise.all([workOrdersRepo.create(input), workOrdersRepo.create(input)])
    return [created.map(job => job.number).sort(), (await db.settings.get('singleton')).roCounter]
  }, order)
  assert.deepEqual(result, [['RO-1003', 'RO-1004'], 1004])
  await page.close()
})

test('an old editor cannot replay a note across a committed backup restore', async () => {
  const {page,order} = await newJob()
  // Commit a restored epoch without notifying this tab's live query, leaving its editor stale.
  await page.evaluate(async id => {
    const {db} = await import('/src/db/database.ts')
    const tx = db.backendDB().transaction(['settings', 'workOrders'], 'readwrite')
    for (const [table, key, patch] of [
      ['settings', 'singleton', {restoreEpoch: 'restored'}],
      ['workOrders', id, {diagnosis: 'Restored diagnosis'}],
    ]) {
      const store = tx.objectStore(table)
      const read = store.get(key)
      read.onsuccess = () => store.put({...read.result, ...patch})
    }
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error) })
  },order.id)
  const notes = page.getByLabel('Diagnosis / notes')
  await notes.fill('Old draft')
  await page.getByRole('alert').filter({hasText: /backup was restored/i}).waitFor()
  assert.equal(await page.getByRole('button', {name: 'Retry save'}).count(), 0)
  assert.equal(await page.evaluate(id => sessionStorage.getItem('automech:job-draft:initial:' + id + ':diagnosis'), order.id), null)
  await page.reload()
  assert.equal(await notes.inputValue(), 'Restored diagnosis')
  await page.close()
})

test('a full browser draft journal still commits edits to IndexedDB', async () => {
  const {page,order} = await newJob()
  await page.evaluate(() => {
    // Find the actual per-origin quota without replacing the Storage API.
    let size = 1024 * 1024
    let key = 0
    while (size > 0) {
      try { sessionStorage.setItem('fill' + key++, 'x'.repeat(size)) }
      catch { size = Math.floor(size / 2) }
    }
  })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.getByLabel('Diagnosis / notes').fill('Replacement bearing')
  await page.waitForFunction(async id => {
    const {db} = await import('/src/db/database.ts')
    return (await db.workOrders.get(id)).diagnosis === 'Replacement bearing'
  },order.id,{timeout:3000})
  assert.equal(await page.evaluate(async id => {
    const {db} = await import('/src/db/database.ts')
    return (await db.workOrders.get(id)).diagnosis
  },order.id),'Replacement bearing')
  assert.deepEqual(errors,[])
  await page.close()
})

test('approval identifies the vehicle and preserves the quoted exchange rate', async () => {
  const {page,order} = await newJob({displayCurrency:'XCD',pegRate:2.7})
  await page.getByRole('button',{name:'Capture approval'}).click()
  const sheet = page.getByRole('dialog')
  assert.match(await sheet.innerText(), /2021 Ford Focus/)
  assert.match(await sheet.innerText(), /TEST-1/)
  assert.match(await sheet.innerText(), /270.00/)
  await sheet.getByLabel('How was it authorized?').selectOption('phone')
  await sheet.getByRole('button',{name:'Record approval'}).click()
  await sheet.waitFor({state:'hidden'})
  await page.evaluate(async () => {
    const {db} = await import('/src/db/database.ts')
    await db.settings.update('singleton',{displayCurrency:'EUR',pegRate:0.9})
    await db.vehicles.update('v',{licensePlate:'NEW'})
    await db.customers.update('c',{lastName:'Jones'})
  })
  await page.reload()
  const details = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Approval' }) }).first()
  await details.waitFor()
  const text = await details.innerText()
  assert.match(text,/Grace Lee/)
  assert.match(text,/TEST-1/)
  assert.match(text,/270.00/)
  assert.doesNotMatch(text,/Jones|NEW|€90/)
  const stored = await page.evaluate(async id => {
    const {db} = await import('/src/db/database.ts')
    const {snapshot} = (await db.workOrders.get(id)).authorization
    return [snapshot.currency,snapshot.displayCurrency,snapshot.pegRate]
  },order.id)
  assert.deepEqual(stored,['USD','XCD',2.7])
  await page.close()
})

test('a rejected edit cannot replay over notes from another tab after reopening', async () => {
  const context = await browser.newContext()
  const {page, order} = await newJob({}, context)
  const other = await context.newPage()
  await other.goto(page.url())
  const notes = other.getByLabel('Diagnosis / notes')
  await notes.waitFor()
  // A native write commits before Dexie's cross-tab notification reaches the open editor.
  const writeBeforeRefresh = patch => other.evaluate(async ({id, patch}) => {
    const {db} = await import('/src/db/database.ts')
    const tx = db.backendDB().transaction('workOrders', 'readwrite')
    const store = tx.objectStore('workOrders')
    const get = store.get(id)
    get.onsuccess = () => store.put({...get.result, ...patch})
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error) })
  }, {id: order.id, patch})
  await writeBeforeRefresh({status: 'completed'})
  await page.getByLabel('Diagnosis / notes').fill('Replace pads')
  await page.getByRole('alert').filter({hasText: 'Reopen this job'}).waitFor()
  const key = 'automech:job-draft:initial:' + order.id + ':diagnosis'
  assert.equal(await page.evaluate(key => sessionStorage.getItem(key), key), null)
  await other.reload()
  await other.getByLabel('Status', {exact: true}).selectOption('estimate')
  await notes.fill('Replace pads and rotors')
  await other.waitForFunction(async id => {
    const {db} = await import('/src/db/database.ts')
    return (await db.workOrders.get(id)).diagnosis === 'Replace pads and rotors'
  }, order.id)
  await page.reload()
  assert.equal(await page.getByLabel('Diagnosis / notes').inputValue(), 'Replace pads and rotors')

  // A tab killed before its write completed may still have its draft when the stored value has changed.
  await page.evaluate(key => sessionStorage.setItem(key, JSON.stringify({base: '', value: 'Replace pads'})), key)
  await page.reload()
  await page.getByRole('alert').filter({hasText: /changed/i}).waitFor()
  assert.equal(await page.getByLabel('Diagnosis / notes').inputValue(), 'Replace pads and rotors')
  assert.equal(await page.evaluate(key => sessionStorage.getItem(key), key), null)
  assert.equal(await other.evaluate(async id => {
    const {db} = await import('/src/db/database.ts')
    return (await db.workOrders.get(id)).diagnosis
  }, order.id), 'Replace pads and rotors')
  await writeBeforeRefresh({diagnosis: 'Rotors measured this morning'})
  await page.getByLabel('Diagnosis / notes').fill('Replace rear pads')
  await page.getByRole('alert').filter({hasText: /changed/i}).waitFor()
  assert.equal(await page.getByLabel('Diagnosis / notes').inputValue(), 'Rotors measured this morning')
  assert.equal(await page.evaluate(key => sessionStorage.getItem(key), key), null)
  await context.close()
})

test('a storage failure preserves in-flight typing across reload and allows retry', async () => {
  const {page, order} = await newJob()
  const key = 'automech:job-draft:initial:' + order.id + ':diagnosis'
  const latest = 'Inspect front rotors and calipers'
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'workOrders' && sessionStorage.getItem('simulate-full-database'))
        throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
      return put.apply(this, args)
    }
  })
  await page.reload()
  const notes = page.getByLabel('Diagnosis / notes')
  await notes.waitFor()
  await page.evaluate(async () => {
    const {db} = await import('/src/db/database.ts')
    sessionStorage.setItem('simulate-full-database', 'yes')
    // Hold the first autosave in the IndexedDB queue while the user continues editing.
    const store = db.backendDB().transaction('workOrders', 'readwrite').objectStore('workOrders')
    let held = true
    function keepAlive() { store.count().onsuccess = () => { if (held) keepAlive() } }
    keepAlive()
    window.releaseNoteWrite = () => { held = false }
  })
  await notes.fill('Inspect front rotors')
  await notes.fill(latest)
  await page.evaluate(() => window.releaseNoteWrite())
  const alert = page.getByRole('alert')
  await alert.waitFor()
  assert.equal(await notes.inputValue(), latest)
  assert.deepEqual(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), key), {base: '', value: latest})
  await page.reload()
  await alert.waitFor()
  assert.equal(await notes.inputValue(), latest)
  assert.equal(await page.evaluate(async id => {
    const {db} = await import('/src/db/database.ts')
    return (await db.workOrders.get(id)).diagnosis
  }, order.id), undefined)
  await page.evaluate(() => sessionStorage.removeItem('simulate-full-database'))
  await page.getByRole('button', {name: 'Retry save'}).click()
  await page.waitForFunction(async ({id, key, latest}) => {
    const {db} = await import('/src/db/database.ts')
    return (await db.workOrders.get(id)).diagnosis === latest && sessionStorage.getItem(key) === null
  }, {id: order.id, key, latest}, {timeout: 3000})
  assert.equal(await alert.count(), 0)
  await page.close()
})

test('an older draft without a base can be recovered without overwriting the saved note', async () => {
  const {page, order} = await newJob()
  const saved = 'Customer reports vibration'
  const recovered = 'Inspect front rotors'
  const key = 'automech:job-draft:initial:' + order.id + ':diagnosis'
  await page.evaluate(async ({id, key, saved, recovered}) => {
    const {db} = await import('/src/db/database.ts')
    await db.workOrders.update(id, {diagnosis: saved})
    sessionStorage.setItem(key, recovered)
  }, {id: order.id, key, saved, recovered})
  const notes = page.getByLabel('Diagnosis / notes')
  await page.reload()
  assert.equal(await notes.inputValue(), saved)
  await page.getByText(recovered, {exact: true}).waitFor({timeout: 2000})
  await page.reload()
  assert.equal(await notes.inputValue(), saved)
  await page.getByRole('button', {name: 'Use recovered edit'}).click()
  await page.waitForFunction(async ({id, recovered}) => {
    const {db} = await import('/src/db/database.ts')
    return (await db.workOrders.get(id)).diagnosis === recovered
  }, {id: order.id, recovered})
  assert.equal(await page.evaluate(key => sessionStorage.getItem(key), key), null)
  await page.close()
})

test('deposits received display the secondary currency quoted on the job', async () => {
  const {page} = await newJob({displayCurrency: 'XCD', pegRate: 2.7})
  await page.evaluate(async () => {
    const {db} = await import('/src/db/database.ts')
    await db.settings.update('singleton', {displayCurrency: 'EUR', pegRate: 0.9})
  })
  await page.getByRole('button', {name: 'Record deposit'}).click()
  await page.getByLabel('Amount (USD)').fill('10')
  await page.getByRole('button', {name: 'Save receipt'}).click()
  const summary = await page.getByText(/^Deposits received/).innerText()
  assert.equal(summary, 'Deposits received $10.00 (EC$27.00)')
  await page.close()
})
