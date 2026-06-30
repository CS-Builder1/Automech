// Core domain model for Automech.
// Modeled from the repair-job lifecycle: a Repair Order (internal) converts to an
// Invoice (customer-facing legal/financial doc). Estimates carry an authorization
// audit trail for dispute-proofing. All money is stored in integer minor units
// (cents) in a single shop currency to avoid float drift.

export type ID = string
export type ISODate = string // ISO 8601 timestamp

/** Lifecycle status for a Repair Order / Work Order. */
export type WorkOrderStatus =
  | 'estimate'      // building a quote, not yet authorized
  | 'awaiting_approval'
  | 'approved'
  | 'in_progress'
  | 'awaiting_parts'
  | 'quality_check'
  | 'completed'     // work done, ready to invoice
  | 'invoiced'
  | 'cancelled'

export type LineItemKind = 'labor' | 'part' | 'sublet' | 'fee' | 'discount'

/** How a part moves from need to received. */
export type PartStatus = 'needed' | 'quoted' | 'ordered' | 'received'

export type VehicleType = 'car' | 'truck' | 'motorcycle' | 'other'

export type PaymentMethod =
  | 'cash'
  | 'card'
  | 'bank_transfer'
  | 'stripe'
  | 'wipay'
  | 'fac'      // First Atlantic Commerce / Powertranz
  | 'paypal'
  | 'other'

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

/** How a customer authorized an estimate — the dispute-proofing record. */
export type AuthMethod = 'in_person' | 'phone' | 'sms' | 'email' | 'signature' | 'online'

export interface Customer {
  id: ID
  firstName: string
  lastName: string
  company?: string
  phone?: string
  email?: string
  address?: string
  notes?: string
  taxExempt?: boolean
  /** Optional per-customer overrides (research §2). */
  laborRateOverride?: number // minor units / hour
  partsMarkupOverride?: number // percent, e.g. 30 = +30%
  createdAt: ISODate
  updatedAt: ISODate
  deletedAt?: ISODate | null
}

export interface Vehicle {
  id: ID
  customerId: ID
  type: VehicleType
  vin?: string
  licensePlate?: string
  year?: number
  make?: string
  model?: string
  trim?: string
  engine?: string
  color?: string
  mileage?: number // last known odometer
  /** Raw NHTSA vPIC decode result cached for offline reference. */
  vinDecode?: Record<string, string>
  notes?: string
  createdAt: ISODate
  updatedAt: ISODate
  deletedAt?: ISODate | null
}

export interface LineItem {
  id: ID
  kind: LineItemKind
  description: string
  // Parts
  partNumber?: string
  partStatus?: PartStatus
  supplier?: string
  unitCost?: number   // minor units (what the shop pays)
  // Labor
  hours?: number
  // Shared
  quantity: number
  unitPrice: number   // minor units (what the customer pays, per unit/hour)
  taxable: boolean
}

export interface AuthorizationRecord {
  authorizedBy: string      // name of person who approved
  method: AuthMethod
  authorizedAt: ISODate
  amountAuthorized: number  // minor units — the cap that triggers re-auth if exceeded
  signatureDataUrl?: string // captured e-signature image
  note?: string
}

export interface WorkOrder {
  id: ID
  number: string            // human-friendly RO number, e.g. RO-1042
  customerId: ID
  vehicleId: ID
  status: WorkOrderStatus
  complaint?: string        // customer's reported concern
  diagnosis?: string
  mileageIn?: number
  mileageOut?: number
  lineItems: LineItem[]
  /** Estimate authorization trail. Re-auth required if total exceeds amountAuthorized. */
  authorization?: AuthorizationRecord
  /** Work the customer declined — stored for future follow-up revenue. */
  declinedItems?: LineItem[]
  shopSuppliesPct?: number  // shop-supply fee as % of labor+parts
  taxRatePct?: number
  notes?: string
  /** Set when the owner has dealt with this RO's declined work, to clear it from follow-ups. */
  followUpDismissedAt?: ISODate | null
  promisedAt?: ISODate | null
  createdAt: ISODate
  updatedAt: ISODate
  deletedAt?: ISODate | null
}

export interface Invoice {
  id: ID
  number: string            // INV-1042
  workOrderId: ID
  customerId: ID
  vehicleId: ID
  lineItems: LineItem[]
  subtotal: number
  shopSupplies: number
  tax: number
  total: number
  amountPaid: number
  warrantyTerms?: string
  issuedAt: ISODate
  dueAt?: ISODate | null
  createdAt: ISODate
  updatedAt: ISODate
  deletedAt?: ISODate | null
}

export interface Payment {
  id: ID
  invoiceId: ID
  method: PaymentMethod
  status: PaymentStatus
  amount: number            // minor units
  isDeposit?: boolean
  reference?: string        // external txn id / cheque no.
  note?: string
  createdAt: ISODate
}

export type InspectionRating = 'green' | 'yellow' | 'red' | 'na'

export interface InspectionItem {
  id: ID
  category?: string
  label: string
  rating: InspectionRating
  note?: string
  photoIds?: ID[]
  /** Set once this finding has been pushed onto the linked RO as a line item. */
  addedToEstimate?: boolean
}

export interface Inspection {
  id: ID
  workOrderId?: ID
  vehicleId: ID
  customerId: ID
  templateName: string
  items: InspectionItem[]
  createdAt: ISODate
  updatedAt: ISODate
  deletedAt?: ISODate | null
}

/** Photos/blobs stored locally for offline DVI; synced to object storage later. */
export interface MediaAsset {
  id: ID
  blob: Blob
  mimeType: string
  createdAt: ISODate
}

export interface Appointment {
  id: ID
  customerId?: ID
  vehicleId?: ID
  workOrderId?: ID
  title: string
  startAt: ISODate
  endAt?: ISODate | null
  bay?: string        // capacity unit; overlapping bay+time flags a conflict
  notes?: string
  createdAt: ISODate
  updatedAt: ISODate
  deletedAt?: ISODate | null
}

export type ReminderType = 'service' | 'inspection' | 'custom'

/** Time- and/or mileage-based reminder (service due, state inspection, etc.). */
export interface Reminder {
  id: ID
  customerId?: ID
  vehicleId?: ID
  type: ReminderType
  title: string
  dueDate?: ISODate | null
  dueMileage?: number | null
  notes?: string
  completedAt?: ISODate | null
  createdAt: ISODate
  updatedAt: ISODate
  deletedAt?: ISODate | null
}

export type PlanId = 'free' | 'pro' | 'enterprise'

export interface ShopSettings {
  id: 'singleton'
  shopName: string
  /** Current subscription tier; entitlements derive from this. */
  plan?: PlanId
  /** External billing subscription reference (e.g. PayPal subscription id). */
  subscriptionRef?: string
  ownerName?: string
  phone?: string
  email?: string
  address?: string
  logoDataUrl?: string
  currency: string          // ISO 4217, e.g. 'USD', 'XCD'
  /** Display currency pegged to base, e.g. XCD pegged to USD at 2.70. */
  displayCurrency?: string
  pegRate?: number          // displayCurrency per 1 base currency unit
  defaultLaborRate: number  // minor units / hour
  defaultPartsMarkupPct: number
  defaultTaxRatePct: number
  shopSuppliesPct: number
  roCounter: number
  invoiceCounter: number
  updatedAt: ISODate
}
