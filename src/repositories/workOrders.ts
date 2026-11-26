import { db, ensureSettings } from '@/db/database'
import type { AuthorizationRecord, EstimateSnapshot, LineItem, WorkOrder, WorkOrderStatus } from '@/db/types'
import { newId, nowISO } from '@/lib/id'
import { approvalHistory, approvalIssue, estimateSnapshot, needsApproval, sameEstimate } from '@/lib/approval'
import { computeTotals } from '@/lib/calc'
import { displayPair } from '@/lib/money'

export type NewWorkOrder = Omit<WorkOrder, 'id' | 'number' | 'createdAt' | 'updatedAt' | 'deletedAt'>

export type ApprovalInput = Pick<AuthorizationRecord, 'authorizedBy' | 'method' | 'note' | 'signatureDataUrl'>
type EditableFields = Pick<WorkOrder, 'complaint' | 'diagnosis' | 'mileageIn' | 'mileageOut'>

export class WorkOrderFieldConflict extends Error {
  constructor(readonly currentValue: string) {
    super('This field changed. Review the latest value before editing.')
  }
}

async function activeParents(customerId: string, vehicleId: string) {
  const customer = await db.customers.get(customerId)
  const vehicle = await db.vehicles.get(vehicleId)
  if (!customer || customer.deletedAt || !vehicle || vehicle.deletedAt || vehicle.customerId !== customerId) {
    throw new Error('An active customer and matching vehicle are required.')
  }
  return vehicle
}

async function editable(id: string) {
  const order = await db.workOrders.get(id)
  if (!order || order.deletedAt) throw new Error('This job is archived or missing.')
  await activeParents(order.customerId, order.vehicleId)
  if (order.status === 'invoiced') throw new Error('An invoiced job is read-only.')
  return order
}

function transaction<T>(action: () => Promise<T>): Promise<T> {
  return db.transaction('rw', [db.workOrders, db.vehicles, db.customers], action)
}

export const workOrdersRepo = {
  async list(): Promise<WorkOrder[]> {
    const all = await db.workOrders.toArray()
    return all
      .filter((w) => !w.deletedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },

  async get(id: string): Promise<WorkOrder | undefined> {
    return db.workOrders.get(id)
  },

  async forCustomer(customerId: string): Promise<WorkOrder[]> {
    const all = await db.workOrders.where('customerId').equals(customerId).toArray()
    return all.filter((w) => !w.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },

  async forVehicle(vehicleId: string): Promise<WorkOrder[]> {
    const all = await db.workOrders.where('vehicleId').equals(vehicleId).toArray()
    return all.filter((w) => !w.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },

  async create(input: NewWorkOrder): Promise<WorkOrder> {
    return db.transaction('rw', [db.workOrders, db.settings, db.customers, db.vehicles], async () => {
      await activeParents(input.customerId, input.vehicleId)
      const settings = await ensureSettings()
      const counter = (settings.roCounter ?? 1000) + 1
      const ts = nowISO()
      const order: WorkOrder = {
        ...input, ...displayPair(settings.currency, settings.displayCurrency, settings.pegRate), status: 'estimate', currency: settings.currency, id: newId(), number: `RO-${counter}`,
        authorizations: [], authorization: undefined, createdAt: ts, updatedAt: ts, deletedAt: null,
      }
      await db.workOrders.add(order)
      await db.settings.update('singleton', {roCounter: counter, updatedAt: ts})
      return order
    })
  },

  async update(id: string, patch: Partial<EditableFields>, restoreEpoch?: string,
    expected?: { field: keyof EditableFields; value: string }): Promise<void> {
    const keys: (keyof EditableFields)[] = ['complaint', 'diagnosis', 'mileageIn', 'mileageOut']
    if (Object.keys(patch).some(key => !keys.some(editableKey => editableKey === key))) {
      throw new Error('This field cannot be edited directly.')
    }
    await db.transaction('rw', [db.workOrders, db.vehicles, db.customers, db.settings], async () => {
      if (restoreEpoch !== undefined) {
        const current = (await db.settings.get('singleton'))?.restoreEpoch ?? 'initial'
        if (restoreEpoch !== current) throw new Error('A backup was restored. Review the restored job before editing.')
      }
      const order = await editable(id)
      if (order.status === 'completed') throw new Error('Reopen this job before editing.')
      if (expected && String(order[expected.field] ?? '') !== expected.value) {
        throw new WorkOrderFieldConflict(String(order[expected.field] ?? ''))
      }
      await db.workOrders.update(id, { ...patch, updatedAt: nowISO() })
    })
  },

  async changeLine(id: string, action: 'save' | 'remove' | 'decline' | 'restore', item: LineItem, expected?: LineItem) {
    await transaction(async () => {
      const order = await editable(id)
      if (order.status === 'completed') throw new Error('Reopen this job before editing.')
      const lines = order.lineItems
      const declined = order.declinedItems ?? []
      const current = (action === 'restore' ? declined : lines).find(line => line.id === item.id)
      if (JSON.stringify(current) !== JSON.stringify(expected)) throw new Error('This line changed. Reopen it to see the latest details.')
      const lineItems = lines.filter(line => line.id !== item.id)
      let declinedItems = declined
      if (action === 'restore') {
        declinedItems = declined.filter(line => line.id !== item.id)
        lineItems.push(item)
      } else if (action === 'decline') {
        declinedItems = [...declined, item]
      } else if (action === 'save') {
        lineItems.splice(current ? lines.indexOf(current) : lines.length, 0, item)
      }
      const changed = { ...order, lineItems, declinedItems }
      const status = needsApproval(order.status) && approvalIssue(changed) ? 'awaiting_approval' : order.status
      await db.workOrders.update(id, {lineItems, declinedItems, status, updatedAt: nowISO()})
    })
  },

  async recordApproval(id: string, input: ApprovalInput, displayed: EstimateSnapshot, expectedRevision: number) {
    return transaction(async () => {
      const order = await editable(id)
      const history = approvalHistory(order)
      const customer = await db.customers.get(order.customerId)
      const vehicle = await db.vehicles.get(order.vehicleId)
      const snapshot = estimateSnapshot(order, customer, vehicle)
      if ((displayed.customerLabel !== undefined && displayed.customerLabel !== snapshot.customerLabel) ||
          (displayed.vehicleLabel !== undefined && (displayed.vehicleLabel !== snapshot.vehicleLabel || displayed.vehiclePlate !== snapshot.vehiclePlate))) {
        throw new Error('The customer or vehicle details changed. Review the estimate again.')
      }
      if (!sameEstimate(displayed, snapshot) || expectedRevision !== history.length) {
        throw new Error('This estimate changed. Close the approval and review the latest version.')
      }
      if (!snapshot.lineItems.length) throw new Error('Add the work to be approved first.')
      const total = computeTotals(order).total
      if (total < 0 || !Number.isSafeInteger(total)) throw new Error('Review the estimate total before approving.')
      if (!input.authorizedBy.trim()) throw new Error('Enter the name of the person approving this work.')
      if (input.method === 'signature' && !input.signatureDataUrl) throw new Error('A new signature is required.')
      const record: AuthorizationRecord = {
        id: newId(), revision: history.length + 1, snapshot, currency: snapshot.currency,
        authorizedBy: input.authorizedBy.trim(), method: input.method, note: input.note?.trim() || undefined,
        authorizedAt: nowISO(), amountAuthorized: total,
        signatureDataUrl: input.method === 'signature' || input.method === 'in_person' ? input.signatureDataUrl : undefined,
      }
      const status = order.status === 'estimate' || order.status === 'awaiting_approval' ? 'approved' : order.status
      await db.workOrders.update(id, {authorization: record, authorizations: [...history, record], status, updatedAt: nowISO()})
      return record
    })
  },

  async setStatus(id: string, status: WorkOrderStatus): Promise<void> {
    await transaction(async () => {
      const order = await editable(id)
      if (status === 'invoiced') throw new Error('Issue an invoice to mark this job invoiced.')
      const issue = needsApproval(status) && approvalIssue(order)
      if (issue) throw new Error(issue)
      if (status === 'completed') {
        const vehicle = await db.vehicles.get(order.vehicleId)
        const reading = order.mileageOut ?? order.mileageIn
        if (vehicle && reading !== undefined && reading > (vehicle.mileage ?? -1)) {
          await db.vehicles.update(vehicle.id, {mileage: reading, updatedAt: nowISO()})
        }
      }
      await db.workOrders.update(id, { status, updatedAt: nowISO() })
    })
  },

  async softDelete(id: string): Promise<void> {
    await transaction(async () => {
      await editable(id)
      await db.workOrders.update(id, { deletedAt: nowISO(), updatedAt: nowISO() })
    })
  },

  async restore(id: string): Promise<void> {
    await transaction(async () => {
      const order = await db.workOrders.get(id)
      if (!order) throw new Error('Job not found.')
      await activeParents(order.customerId, order.vehicleId)
      await db.workOrders.update(id, { deletedAt: null, updatedAt: nowISO() })
    })
  },
}
