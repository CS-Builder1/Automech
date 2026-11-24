import type { Customer, Vehicle, WorkOrder } from '@/db/types'

export function displayCustomer(customer?: Customer) {
  if (!customer) return 'Unknown customer'
  return [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim() || customer.company || 'Customer'
}

export function displayVehicle(vehicle?: Vehicle) {
  if (!vehicle) return 'Unknown vehicle'
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.licensePlate || vehicle.vin || 'Vehicle'
}

export function vehiclePath(vehicle: Vehicle) {
  return `/customers/${vehicle.customerId}/vehicles/${vehicle.id}`
}

export function isArchivedVehicle(vehicle: Vehicle, customer?: Customer) {
  return Boolean(vehicle.deletedAt || !customer || customer.deletedAt)
}

export function isArchivedJob(job: WorkOrder, customer?: Customer, vehicle?: Vehicle) {
  return Boolean(job.deletedAt || !vehicle || isArchivedVehicle(vehicle, customer))
}

function normalize(value = '') {
  return value.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ')
}

function byParent<T>(rows: T[], key: (row: T) => string) {
  const result = new Map<string, T[]>()
  for (const row of rows) {
    const parent = key(row)
    if (!result.has(parent)) result.set(parent, [])
    result.get(parent)!.push(row)
  }
  return result
}

export function indexRecords(customers: Customer[], vehicles: Vehicle[], jobs: WorkOrder[]) {
  return {
    customers: customers.sort((a, b) => displayCustomer(a).localeCompare(displayCustomer(b))),
    vehicles: vehicles.sort((a, b) => displayVehicle(a).localeCompare(displayVehicle(b))),
    jobs: jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    customerById: new Map(customers.map((c) => [c.id, c])),
    vehicleById: new Map(vehicles.map((v) => [v.id, v])),
    customerVehicles: byParent(vehicles, (v) => v.customerId),
    customerJobs: byParent(jobs, (w) => w.customerId),
    vehicleJobs: byParent(jobs, (w) => w.vehicleId),
  }
}

export type RecordIndex = ReturnType<typeof indexRecords>

export function findRecords(records: RecordIndex, query: string, archived: boolean) {
  const q = normalize(query)
  const compact = (s: string) => normalize(s).replace(/[\s.-]/g, '')
  const key = compact(q)
  const digits = /^[\d\s()+.-]+$/.test(q) ? q.replace(/\D/g, '') : ''
  const textMatches = (...values: (string | undefined)[]) => values.some((s) => normalize(s).includes(q))
  const idMatches = (...ids: (string | undefined)[]) => Boolean(key && ids.some((s) => s && compact(s).includes(key)))
  const customerMatches = (c?: Customer) => Boolean(c && (
    textMatches(displayCustomer(c), c.company, c.email, c.phone) ||
    (digits && c.phone?.replace(/\D/g, '').includes(digits))
  ))
  const vehicleMatches = (v?: Vehicle) => Boolean(v && (textMatches(displayVehicle(v)) || idMatches(v.vin, v.licensePlate)))
  const jobMatches = (job: WorkOrder) => idMatches(job.number)
  const visibleVehicle = (v: Vehicle) => isArchivedVehicle(v, records.customerById.get(v.customerId)) === archived
  const visibleJob = (w: WorkOrder) => isArchivedJob(w, records.customerById.get(w.customerId), records.vehicleById.get(w.vehicleId)) === archived

  const customers = records.customers.filter((c) => Boolean(c.deletedAt) === archived && (
    !q || customerMatches(c) || records.customerVehicles.get(c.id)?.some((v) => visibleVehicle(v) && vehicleMatches(v)) ||
    records.customerJobs.get(c.id)?.some((w) => visibleJob(w) && jobMatches(w))
  ))
  const vehicles = records.vehicles.filter((v) => visibleVehicle(v) && (
    !q || vehicleMatches(v) || customerMatches(records.customerById.get(v.customerId)) ||
    records.vehicleJobs.get(v.id)?.some((w) => visibleJob(w) && jobMatches(w))
  ))
  const jobs = records.jobs.filter((w) => visibleJob(w) && (
    !q || jobMatches(w) || customerMatches(records.customerById.get(w.customerId)) || vehicleMatches(records.vehicleById.get(w.vehicleId))
  ))
  return { customers, vehicles, jobs }
}

export function lastMileage(vehicle: Vehicle, jobs: WorkOrder[]) {
  let mileage = vehicle.mileage
  for (const job of jobs) {
    if (job.deletedAt || (job.status !== 'completed' && job.status !== 'invoiced')) continue
    for (const value of [job.mileageIn, job.mileageOut]) {
      if (value !== undefined && Number.isFinite(value)) mileage = Math.max(mileage ?? 0, value)
    }
  }
  return mileage
}
