import test from 'node:test'
import assert from 'node:assert/strict'
import { findRecords, indexRecords, lastMileage } from '../src/lib/records.ts'

const archivedAt = '2025-04-10T10:00:00Z'
const customer = { id: 'C1', firstName: 'Alex', lastName: 'Stone' }
const fleet = { id: 'C2', firstName: '', lastName: '', company: 'Harbor Fleet' }
const car = { id: 'V1', customerId: 'C1', licensePlate: 'REG-123', mileage: 0 }
const archivedCar = { ...car, id: 'V2', licensePlate: 'REG-456', deletedAt: archivedAt }
const job = { id: 'J1', customerId: 'C1', vehicleId: 'V1', status: 'completed', number: 'RO-1010', updatedAt: archivedAt, mileageIn: 40000, mileageOut: 40012 }

test('inherited archive follows the owner while an independently archived vehicle stays archived after restore', () => {
  const lookup = (owner, archived) => findRecords(indexRecords([owner, fleet], [car, archivedCar], [job]), '', archived)
  const before = lookup({ ...customer, deletedAt: archivedAt }, true)
  assert.deepEqual(before.vehicles.map((v) => v.id), ['V1', 'V2'])
  assert.deepEqual(before.jobs.map((w) => w.id), ['J1'])
  const after = lookup(customer, false)
  assert.deepEqual(after.vehicles.map((v) => v.id), ['V1'])
  assert.deepEqual(after.jobs.map((w) => w.id), ['J1'])
  assert.deepEqual(lookup(customer, true).vehicles.map((v) => v.id), ['V2'])
})

test('job lookup uses the actual vehicle on the job and keeps unrelated fleet records separate', () => {
  const secondJob = { ...job, id: 'J2', vehicleId:'V2', number:'RO-1011' }
  const records = indexRecords([customer, fleet], [car, {...archivedCar, deletedAt:null}], [job, secondJob])
  assert.deepEqual(findRecords(records, 'reg123', false).jobs.map((w) => w.id), ['J1'])
  assert.deepEqual(findRecords(records, 'RO1011', false).vehicles.map((v) => v.id), ['V2'])
  assert.deepEqual(findRecords(records, 'Harbor Fleet', false).customers.map((c) => c.id), ['C2'])
})

test('last known odometer includes completed historical jobs while excluding archived or uncompleted readings', () => {
  assert.equal(lastMileage(car, []), 0)
  assert.equal(lastMileage(car, [job, {...job, mileageOut:100000, deletedAt:archivedAt}, {...job, status:'estimate', mileageOut:200000}]), 40012)
})
