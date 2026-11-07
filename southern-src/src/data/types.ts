// Southern Command — domain model. Permanent internal IDs on every record.
export type RoleKey = 'owner' | 'dispatch' | 'ops' | 'field' | 'shop' | 'safety' | 'payroll' | 'hr' | 'accounting' | 'sales' | 'frontdesk' | 'branch' | 'inventory' | 'der' | 'guest'

export type Craft =
  | 'Operator' | 'Rigger' | 'Oiler' | 'Truck Driver' | 'Supervisor' | 'Safety'
  | 'Mechanic' | 'Dispatcher' | 'Project Manager' | 'HR' | 'Payroll' | 'Sales' | 'Inventory' | 'Executive' | 'Front Desk' | 'Branch Manager' | 'Field Ops Manager' | 'Uptower Tech' | 'Millwright' | 'Accounting'

export type CrewPosition = 'Operator' | 'Rigger' | 'Oiler' | 'Truck Driver' | 'Supervisor' | 'Safety' | 'Uptower Tech' | 'Millwright'

export interface Division { id: string; name: string; short: string; color: string; tagline: string }
export interface Branch { travelEach?: number; id: string; code: string; name: string; city: string; state: string; lat: number; lng: number; hq?: boolean; divisionIds: string[] }
export interface Org { divisionId: string; branchId: string }

export interface Employee extends Org {
  id: string
  empNo: string
  first: string
  last: string
  craft: Craft
  phone: string
  email: string
  supervisorId?: string // field allocation team
  hallHand?: boolean
  homeCraneId?: string // permanent crane crew
  homeTruckId?: string
  pickupId?: string
  local?: string // union local
  status: 'Active' | 'Inactive' | 'Pending Onboarding'
  perDiemBlocked: PerDiem[]
  rate: number // hourly pay rate (demo)
  hireDate: string
  city: string
  shirt?: string
  boot?: string
  emergencyContact?: { name: string; relation: string; phone: string }
  /** Self-service (My Info). emergencyContacts supersedes emergencyContact. */
  emergencyContacts?: EmergencyContact[]
  mailingAddress?: string
  sizes?: Record<string, string | undefined>
  address?: string
 veteran?: { branch?: ServiceBranch; years?: number }
  /** dive2: separation record (status Inactive). */
  term?: { lastDay: string; reason: string; rehire: boolean; by: string; at: string; checklist?: Record<string, boolean> }
  /** dive2: not cleared for safety-sensitive work (set by the DER — reason never stored here). */
  ssHold?: string
  /** dive3 M3: activated by override without DOT clearance — no driving until the DER logs a negative pre-employment test + full Clearinghouse query. */
  noDrive?: string
}
export type ServiceBranch = 'Army' | 'Navy' | 'Air Force' | 'Marine Corps' | 'Coast Guard' | 'Space Force' | 'National Guard'

export type CertType =
  | 'OSHA 10' | 'OSHA 30' | 'CPR / First Aid' | 'Tower Rescue' | 'Forklift' | 'NCCCO Mobile Operator'
  | 'NCCCO Crawler Operator' | 'NCCCO Rigger II' | 'NCCCO Signalperson' | 'H2S Awareness' | 'Smith Driving' | 'CDL Class A' | 'DOT Medical Card' | 'TWIC'

export interface Cert {
  id: string
  employeeId: string
  type: CertType
  credentialNo: string
  provider: string
  issued: string
  expires: string
  verified: 'Verified' | 'Needs Review' | 'Rejected'
  /** Proof uploaded with the cert (file name; demo keeps the name only). */
  proof?: string
  /** dive2: renewal waiting for Safety to verify — the old `expires` stays in force until verified. */
  pendingExpires?: string; pendingProof?: string
}

export type EquipCategory = 'Crane' | 'Semi' | 'Pickup' | 'Trailer' | 'Support'
export type EquipStatus = 'Available' | 'On Job' | 'In Transit' | 'Maintenance' | 'Out of Service'

export interface Equipment extends Org {
  id: string
  unit: string // e.g. "1200"
  code: string // e.g. "LTM1200-1"
  category: EquipCategory
  type: string // e.g. "All-Terrain", "Crawler", "Lowboy"
  make: string
  model: string
  year: number
  capacity?: number // tons
  vin?: string
  serial?: string
  plate?: string
  status: EquipStatus
  yard: string
  lat: number
  lng: number
  heading?: number
  lastPing: string // ISO
  samsaraId?: string
  hours?: number
  miles?: number
  nextServiceAt?: number // hours or miles
  nextServiceDate: string
  dayRate?: number // customer bill rate / day (cranes)
  costDay?: number // internal cost rate / day (ownership + insurance + depreciation)
  costMile?: number // trucks: fuel+maintenance / mile
  notes?: string
  annualInspection: string
  route?: { from: [number, number]; to: [number, number]; fromName: string; toName: string; depart: string; eta: string; jobId?: string }
  assignedTo?: string // employee id (trucks/pickups)
}

export interface CraneConfig {
  id: string
  craneId: string
  name: string
  trailerIds: string[]
  /** Full load list (by load type) — company trailers cover some, third-party haulers the rest. */
  loads?: { kind: string; n: number }[]
  notes?: string
}

export interface Customer { id: string; name: string; contact: string; phone: string; industry: string }
export interface Site { travelEach?: number; id: string; name: string; city: string; state: string; lat: number; lng: number; gate?: string; hospital?: string; windFarmId?: string }

/** Turbine attached to a job — USWTDB case_id plus the site's own number (e.g. T-18). */
export interface JobTurbine { caseId: number; faaOrs?: string; label?: string; lat: number; lng: number; model?: string; hh?: number | null; /** Census county from the turbine's own lat/lon */ county?: string; countySt?: string }
export type SitePinKind = 'O&M' | 'Gate' | 'Laydown' | 'Substation' | 'Other'
export interface SitePin { id: string; kind: SitePinKind; label: string; lat: number; lng: number; demo?: boolean; by?: string; at?: string }
/** Company knowledge layered on a USWTDB farm. Shared with everyone (saved on the record, not per-user). */
export interface WindSite { farmId: string; notes?: string; gate?: string; contacts?: { name: string; role: string; phone: string }[]; pins: SitePin[]; labels: Record<string, string>; autoNumber?: boolean; demo?: boolean; updatedAt?: string; updatedBy?: string }

export type JobStatus = 'Planned' | 'Confirmed' | 'En Route' | 'On Site' | 'Complete' | 'Delayed'

/** Per-crane rig plan on a job: rig-up days before Hook Ready, travel (move-in) days before that, and rig-down at the end.
 *  Rig-down can be hours (a couple hours) or days (a week+). */
export interface RigPlan {
  craneId: string
  hookReady: string // date the crane is hook ready for the customer
  travelDays: number // move-in / travel days before rig-up starts
  upMode: 'days' | 'dates'
  upDays: number // rig-up days right before hook ready (upMode 'days')
  upDates?: string[] // specific rig-up dates (upMode 'dates')
  plannedMoveIn?: string // when we actually plan to start moving in
  downStart: string
  downAmount: number
  downUnit: 'h' | 'd'
  notes?: string
}

/** Outside crane company we hire (cover a job, or assist with rig-up / rig-down / the work). Not part of our fleet. */
export interface CraneVendor { id: string; name: string; contact?: string; phone?: string; notes?: string }
export type OutsideRole = 'Cover' | 'Rig-up assist' | 'Rig-down assist' | 'Work assist'
export type OutsideStatus = 'Requested' | 'Confirmed' | 'On site' | 'Done'
export interface OutsideCrane { id: string; vendorId: string; size: string; type?: string; operator?: string; phone?: string; role: OutsideRole; from: string; to: string; hours?: { from: string; to: string }; rate?: number; po?: string; status: OutsideStatus; notes?: string }

export type ExtraKind = 'person' | 'equipment'
export type CalloffStatus = 'Requested' | 'Acknowledged' | 'Pickup scheduled' | 'Picked up'
export interface JobExtra {
  id: string; kind: ExtraKind; role: string; qty: number
  action: 'add' | 'remove'
  from: string; fromTime?: string; to?: string
  reason?: string
  /** Billable to the customer (default). Non-billable = absorbed cost: in job costing / P&L, never on tickets, invoices or proposals. */
  billable: boolean
  rate: number; cost: number
  at: string; by: string
  calloff?: { status: CalloffStatus; at: string; by: string; history: { status: CalloffStatus; at: string; by: string }[] }
}
export interface BillingReview { id: string; jobId: string; at: string; by: string; what: string; reason?: string; flags: ('signed' | 'invoiced')[]; status: 'Open' | 'Reviewed'; reviewedBy?: string; billedOn?: string }
export interface Job extends Org {
  id: string
  jobNo: string
  name: string
  type: JobType
  customerId: string
  siteId: string
  startDate: string
  endDate: string
  startTime: string
  craneId?: string
  configId?: string
  trailerIds: string[]
  /** Rig up / rig down per crane (main crane + any assist cranes). */
  rig?: RigPlan[]
  /** More cranes on the same project (no limit) — craneId stays the lead crane. */
  craneIds?: string[]
  /** Hired outside cranes on this job (any number). */
  outside?: OutsideCrane[]
  /** Optional hours per crane on this job (a crane can do a morning pick here and an afternoon pick elsewhere). 'HH:MM' */
  craneHours?: Record<string, { from: string; to: string }>
  /** Days a truck / trailer is actually needed on this job (default: the whole job). */
  unitDays?: Record<string, { from: string; to: string }>
  /** Req H: extra (or removed) people and support equipment on top of the quoted crew, each charged or credited. */
  extras?: JobExtra[]
  extraEquipment: string[]
  requiredCerts: CertType[]
  pmId?: string
  supervisorId?: string
  status: JobStatus
  dayRate: number
  local?: string
  liftPlan: 'Approved' | 'In Review' | 'Not Required' | 'Missing'
  shift: 'Day' | 'Night'
  notes?: string
  positions: CrewPosition[] // required crew slots
  stage: JobStage
  quote: { revenue: number; costBudget: number; mobDemob: number; quotedAt: string; salesId?: string; /** dive3 M6/M8: itemized price and cost (every crane priced and costed). */ priceLines?: { k: string; v: number }[]; costLines?: { k: string; v: number }[] }
  invoiceNo?: string
  /** Older job already closed out in accounting (costs summarized). */
  closedOut?: boolean
  /** Paid travel allowance each way (hours) — overrides site/branch rule. */
  travelEach?: number
  quoteLost?: { at: string; reason: string; note?: string }
  quoteSentAt?: string
  lift?: { load: number; radius: number; boom: number; rigging: number; notes?: string }
  windFarmId?: string
  turbines?: JobTurbine[]
  docs: { id: string; name: string; kind: 'Lift Plan' | 'Permit' | 'Site Map' | 'Photo' | 'Customer PO' | 'Drawing' | 'Ticket'; added: string; by: string; dataUrl?: string; blobId?: string; size?: number }[]
}

export type JobType = 'Wind' | 'Industrial' | 'Refinery' | 'Commercial' | 'Power' | 'Infrastructure' | 'Heavy Haul' | 'Uptower' | 'Machine Moving' | 'Oil & Gas'
export type JobStage = 'Quote' | 'Awarded' | 'Scheduled' | 'In Progress' | 'Complete' | 'Invoiced' | 'Paid'

export type CostCategory = 'Labor' | 'Per Diem' | 'Crane' | 'Semis & Trucks' | 'Trailers' | 'Fuel' | 'Engineering / Lift Plan' | 'Permits & Escorts' | 'Subcontractors' | 'Materials' | 'Equipment Rental' | 'Other'
export interface JobCost {
  id: string
  jobId: string
  date: string
  category: CostCategory
  description: string
  amount: number
  qty?: number
  unit?: string
  source: 'Time Entry' | 'Per Diem' | 'Fuel Log' | 'Equipment Usage' | 'Vendor Bill' | 'Manual' | 'Inventory' | 'Expense'
  refId?: string
  by: string
}

export interface FuelLog { id: string; unitId: string; jobId?: string; employeeId: string; date: string; gallons: number; price: number; odometer?: number; vendor: string }

export interface Dvir {
  id: string; unitId: string; employeeId: string; date: string; at: string
  items: Record<string, 'ok' | 'defect'>; defects: string; safeToOperate: boolean; workOrderId?: string
}

export interface HistJob extends Org { id: string; year: number; month: number; craneId: string; customerId: string; type: JobType; revenue: number; cost: number; days: number }

export interface Assignment {
  id: string
  jobId: string
  date: string // yyyy-MM-dd
  employeeId: string
  position: CrewPosition
  source: 'Crane crew' | 'Dispatch' | 'Replacement'
}

export type AbsenceKind = 'Scheduled Off' | 'Vacation / PTO' | 'Training' | 'Unavailable'
export interface Absence { id: string; employeeId: string; from: string; to: string; kind: AbsenceKind; note?: string }

export type TravelDir = 'To Site' | 'From Site' | 'Between Sites' | 'To Yard' | 'Home'
export interface Travel { id: string; employeeId: string; date: string; direction: TravelDir; from: string; to: string; jobId?: string; truckId?: string; trailerId?: string }

export type Activity =
  | 'Crane Mobe' | 'Truck Mobe' | 'Crane A/D' | 'Lifting & Hoisting' | 'Onsite Standby' | 'Offsite Standby'
  | 'Rigging' | 'Oiling' | 'Yard / Shop' | 'Safety / Training' | 'Vacation' | 'Holiday'
export type PerDiem = 'Semi Truck' | 'Hotel' | 'Daily Truck'

export interface TimeEntry {
  id: string
  employeeId: string
  jobId?: string
  /** USWTDB case id of the turbine worked — pay uses that turbine's county/local */
  turbineId?: number
  date: string
  activity: Activity
  start: string
  end: string
  mealMin: number
  hours: number
  perDiems: PerDiem[]
  status: 'Submitted' | 'Approved' | 'Exported' | 'Flagged'
  note?: string
  approvedBy?: string
  submittedAt: string
  /** Clock-in / clock-out instants, ISO 8601 with UTC offset (set by the time clock). */
  inAt?: string
  outAt?: string
  /** Device time zone at clock-in (IANA), e.g. America/Chicago */
  tz?: string
}

export interface EodTicket {
  id: string
  jobId: string
  date: string
  supervisorId: string
  crewIds: string[]
  hours: Partial<Record<Activity, number>>
  work: string
  equipmentIn: string
  equipmentOut: string
  delays: string
  pctComplete: number
  expectedFinish: string
  status: 'Draft' | 'Signed' | 'Submitted' | 'Reviewed' | 'Needs Correction'
  correction?: string
  photos: number
  photoRefs?: string[] // field fixes: photos taken on the phone, stored in IndexedDB ("idb:…" refs)
  submittedAt: string
  signerName?: string
  signerTitle?: string
  signature?: string // PNG data URL captured on device
  signedAt?: string
}

export interface Contact { id: string; label: string; name: string; phone: string; group: 'Dispatch' | 'Office' | 'Shop' | 'Safety' | 'HR' | 'Payroll' | 'Sales' | 'Emergency'; primary?: boolean }

export interface ClockState { employeeId: string; jobId?: string; inAt: string; breakStart?: string; breakMin: number }

export type BreakdownKind = 'Tire Blowout' | 'Truck Issue' | 'Crane Issue' | 'Trailer Issue' | 'Equipment Issue' | 'Hydraulic Leak' | 'Electrical'
export interface Breakdown {
  id: string
  unitId: string
  kind: BreakdownKind
  severity: 'Down — Can’t Move' | 'Limping — Needs Service' | 'Safe — Schedule Repair'
  lat: number
  lng: number
  locationText: string
  contactName: string
  contactPhone: string
  notes: string
  photos: string[] // data URLs (demo)
  reportedBy: string
  reportedAt: string
  status: 'New' | 'Acknowledged' | 'Tech Dispatched' | 'Resolved'
  workOrderId?: string
}

export type WoStatus = 'Open' | 'In Progress' | 'Waiting Parts' | 'Ready for Release' | 'Closed'
export interface WorkOrder {
  id: string
  woNo: string
  unitId: string
  title: string
  complaint: string
  priority: 'Critical' | 'High' | 'Normal' | 'Low'
  techId?: string
  status: WoStatus
  opened: string
  due: string
  parts: { name: string; qty: number; cost: number }[]
  laborHrs: number
  laborRate: number
  source: 'Breakdown' | 'Service Plan' | 'Inspection' | 'Driver Report'
}

export type InvCategory = 'Parts' | 'Fluids & Oils' | 'Filters' | 'Tires' | 'Rigging' | 'Tools' | 'PPE & Safety' | 'Shop Consumables' | 'Office' | 'Swag'
export interface InventoryItem {
  id: string
  sku: string
  name: string
  category: InvCategory
  /** Finer grouping, e.g. 'Slings', 'Shackles', 'Radios', 'Hats'. */
  sub?: string
  /** Units sitting on the shelf right now (checked-out units are NOT counted here). */
  onHand: number
  /** Reorder point (min). Order when on-hand drops to this. */
  min: number
  /** Order up to this level (max). */
  max?: number
  reorderQty?: number
  unit: string
  /** Bin code, e.g. OKC-PS-A2-S3-B04 — printed on the bin QR label. */
  bin: string
  /** Visual location path: branch > building > aisle/rack > shelf > bin. */
  loc?: { building: string; aisle: string; shelf: string; bin: string }
  branchId?: string
  vendorId?: string
  wll?: string // working load limit
  manufacturer: string
  cost: number
  serialized: boolean
  /** Returnable gear (tools, rigging, radios) shows as Out with a due-back date. */
  returnable?: boolean
  serialNo?: string
  certDate?: string
  inspectionDue?: string
  oos?: { at: string; by: string; reason: string }
  sdsId?: string
  /** Hazardous chemical — an SDS is mandatory. */
  chemical?: boolean
  icon?: string
  photo?: string
  countedAt?: string
}
export type InvTargetKind = 'crane' | 'employee' | 'truckService' | 'craneService' | 'equipService' | 'job' | 'customer'
export interface InvTarget { kind: InvTargetKind; id: string }
/** One removal from stock. Open while qty − returnedQty − usedUp > 0. */
export interface Checkout {
  id: string
  itemId: string
  qty: number
  /** WHO took it (employee id; '' when the signed-in user isn't on the roster). */
  employeeId: string
  byName?: string
  jobId?: string
  target?: InvTarget
  reason?: string
  unitCost?: number
  returnable?: boolean
  signature?: string
  at?: string
  /** dive3 shop M10: the rigging tags (RG-xxxx) that physically went out */
  tags?: string[]
  out: string
  due: string
  /** Date the checkout was fully closed (all returned or used up). */
  returned?: string
  returnedQty?: number
  usedUp?: number
  condition?: 'Good' | 'Damaged' | 'Lost' | 'Used up'
}
export type InvMoveKind = 'Receive' | 'Check-out' | 'Return' | 'Adjust' | 'Transfer' | 'Write-off' | 'Count'
/** Immutable ledger line. qty is the signed change to shelf stock. */
export interface InvMove {
  id: string
  at: string
  itemId: string
  kind: InvMoveKind
  qty: number
  by: string
  byName: string
  branchId: string
  unitCost: number
  target?: InvTarget
  jobId?: string
  reason?: string
  checkoutId?: string
  poId?: string
  toBranchId?: string
  condition?: string
  bin?: string
}
/** Explanation / review of an employee-day where timecard ≠ signed tickets + travel. */
export interface TimeRec {
  id: string; employeeId: string; date: string
  reason: string; note?: string; unitId?: string; jobId?: string
  by: string; at: string
  status: 'Pending' | 'Approved' | 'Asked'
  question?: string; approvedBy?: string; approvedAt?: string; costPosted?: string
}
/** A cert packet sent (or shown) from the field. DEMO: nothing leaves the device — PDF is generated locally, share page reads local data. */
export interface CertShare {
  id: string; token: string
  employeeIds: string[]; certIds: string[]; jobId?: string
  to: { name?: string; email?: string; phone?: string; role?: string }
  channel: 'Email' | 'Text' | 'Wallet'
  note?: string; by: string; byId?: string; at: string
  status: 'Queued' | 'Sent' | 'Shown'; sentAt?: string; expires: string; demo: true
}
export interface EmergencyContact { name: string; relation: string; phone: string }
/** History of self-service profile changes; HR reviews, address changes flag payroll/tax. */
export interface InfoChange { id: string; employeeId: string; at: string; by: string; field: string; label: string; from: string; to: string; payroll?: boolean; hrSeen?: boolean }
export interface PurchaseOrder {
  id: string; poNo: string; vendorId: string; branchId: string; created: string; by: string
  status: 'Draft' | 'Sent' | 'Partially Received' | 'Received' | 'Closed'
  /** damaged = units that arrived unusable (not added to stock, not owed). jobId = bought for a job → cost flows to that job. */
  lines: { itemId: string; qty: number; received: number; cost: number; damaged?: number; jobId?: string }[]
  billIds?: string[]
  /** Whole PO bought for one job (direct job purchase). */
  jobId?: string
  sentAt?: string
  expected?: string
  closedAt?: string
  note?: string
  requestId?: string
  receipts?: { id: string; at: string; by: string; lines: { itemId: string; qty: number; damaged: number }[]; note?: string }[]
  /** Damaged on arrival: not stocked, not billed — a vendor credit / return is requested instead. */
  credits?: { id: string; at: string; itemId: string; qty: number; amount: number; status: 'Credit requested' | 'Credited' }[]
}
/** A field / shop / sales request for stock. The inventory person approves, picks and checks it out. */
export interface PartsRequest {
  id: string; no: string; at: string
  byId: string; byName: string
  from: 'Field' | 'Shop' | 'Sales' | 'Office'
  lines: { itemId: string; qty: number }[]
  target?: InvTarget
  reason: string
  needBy: string
  status: 'Waiting' | 'Approved' | 'Checked out' | 'Denied'
  decidedBy?: string; decidedAt?: string; note?: string
  checkoutIds?: string[]
}
/** Weekly count-a-shelf task. lines are filled when the count is posted. */
export interface CycleCount {
  id: string; shelf: string; label: string; due: string
  status: 'Due' | 'Done'
  countedBy?: string; countedAt?: string
  lines?: { itemId: string; expected: number; counted: number; reason?: string; note?: string; unitCost: number }[]
}

export interface Sds {
  id: string
  product: string
  manufacturer: string
  use: string
  signal: 'Danger' | 'Warning' | 'None'
  hazards: string[]
  ppe: string[]
  firstAid: string
  /** Spill / leak response. */
  spill?: string
  revised: string
  /** GHS pictograms: flame, exclamation, health, corrosion, environment, gas, skull, oxidizer, explosive */
  pictograms?: string[]
  storage?: string
  /** PDF of the sheet: data URL (uploaded) or app-relative path (seeded sample). */
  pdf?: string
  pdfName?: string
}

export interface Hire {
  id: string
  first: string
  last: string
  email: string
  empNo: string
  craft: Craft
  start: string
  phone: string
  supervisorId?: string
  /** Carried onto the employee record at activation (defaults: OKC / SLH Cranes / craft rate). */
  branchId?: string
  divisionId?: string
  rate?: number
  steps: Record<string, boolean>
  created: string
}

export interface Notice {
  id: string
  at: string
  severity: 'Urgent' | 'Action Required' | 'Upcoming' | 'Info'
  title: string
  body: string
  mandatory: boolean
  roles: RoleKey[]
  ref?: EntityRef
  read: boolean
  /** Crew notice: only these employees see it (in the field app). */
  empIds?: string[]
}

export interface AuditEvent { id: string; at: string; actor: string; role: RoleKey; action: string; entity: string; detail: string; diff?: { field: string; from: string; to: string }[] }

export type EntityRef =
  | { type: 'employee'; id: string }
  | { type: 'equipment'; id: string }
  | { type: 'job'; id: string; tab?: 'overview' | 'crew' | 'cost' | 'docs' | 'tickets' }
  | { type: 'item'; id: string }
  | { type: 'workorder'; id: string }
  | { type: 'invoice'; id: string }
  | { type: 'bill'; id: string }
  | { type: 'po'; id: string }
  | { type: 'request'; id: string }
  | { type: 'windfarm'; id: string }
  | { type: 'customer'; id: string }
  | { type: 'vendor'; id: string }
  | { type: 'cert'; id: string }
  | { type: 'ticket'; id: string }
  | { type: 'time'; id: string }
  | { type: 'branch'; id: string }
  | { type: 'division'; id: string }
  | { type: 'site'; id: string }
  | { type: 'list'; id: string }

export interface CompanyProfile {
  id: string
  name: string
  shortName: string
  /** Name used for the assistant ("Ask <assistantName>"). */
  assistantName: string
  phone: string
  logo?: string // data URL
  /** dive3 dispatch M7: schedule colours live on the company record so every device shows the same legend. */
  schedColors?: Record<string, string>
  modules: { craneRigging: boolean; /** Req H: field crews may call off support equipment (default OFF). */ fieldCalloff?: boolean }
}

export interface DB {
  version: number
  /** Tenant / company id — single tenant today; scopes every record in a multi-company backend. */
  tenantId?: string
  company?: CompanyProfile
  seededAt: string
  /** Monotonic stamp for the on-device save. A reload prefers the newer of IndexedDB and the pending snapshot. */
  savedRev?: number
  employees: Employee[]
  certs: Cert[]
  equipment: Equipment[]
  configs: CraneConfig[]
  customers: Customer[]
  sites: Site[]
  jobs: Job[]
  assignments: Assignment[]
  absences: Absence[]
  travel: Travel[]
  time: TimeEntry[]
  tickets: EodTicket[]
  /** Req H: changes that affect billing, for office review. */
  billingReview?: BillingReview[]
  breakdowns: Breakdown[]
  workOrders: WorkOrder[]
  items: InventoryItem[]
  checkouts: Checkout[]
  invLedger: InvMove[]
  pos: PurchaseOrder[]
  partsRequests?: PartsRequest[]
  cycleCounts?: CycleCount[]
  timeRecs?: TimeRec[]
  infoChanges?: InfoChange[]
  certShares?: CertShare[]
  /** Travel allowance rule (hours each way, scaled by miles from the yard). */
  reconRules?: { min: number; max: number; perMiles: number }
  sds: Sds[]
  hires: Hire[]
  notices: Notice[]
  audit: AuditEvent[]
  /** Company-level files not tied to a job (COIs, W-9s, MSAs, policies). Big files live in IndexedDB by blobId. */
  companyDocs?: { id: string; name: string; kind: string; added: string; by: string; dataUrl?: string; blobId?: string; size?: number }[]
  contacts: Contact[]
  clocks: ClockState[]
  costs: JobCost[]
  divisions: Division[]
  branches: Branch[]
  vendors: Vendor[]
  /** Outside crane companies (subcontract cover / assist). */
  craneVendors?: CraneVendor[]
  bills: VendorBill[]
  invoices: Invoice[]
  pto: PtoRequest[]
  hrRecords: HrRecord[]
  incidents: Incident[]
  talks: SafetyTalk[]
  inspections: Inspection[]
  fuel: FuelLog[]
  dvirs: Dvir[]
  history: HistJob[]
  windSites: Record<string, WindSite>
}

export interface Vendor { id: string; name: string; category: CostCategory; terms: number; phone: string; /** What we buy there, e.g. 'Rigging supply'. */ kind?: string; contact?: string; email?: string; account?: string; leadDays?: number }
export interface VendorBill {
  id: string; vendorId: string; billNo: string; date: string; due: string
  lines: { id: string; jobId?: string; category: CostCategory; description: string; amount: number }[]
  status: 'Needs Coding' | 'Pending Approval' | 'Approved' | 'Paid' | 'Rejected'
  approvedBy?: string; paidOn?: string; branchId: string
  /** dive3 M10: who keyed the bill in — they can't approve it themselves above SELF_APPROVE_MAX */
  enteredBy?: string; enteredById?: string
  /** PO handoff: the vendor's invoice lines, checked against the PO and what was received (3-way match). */
  poId?: string
  invoiceLines?: { itemId: string; qty: number; price: number }[]
  /** Payments made against this bill (partial payments allowed). Status goes to Paid once they cover the total. */
  payments?: { id: string; date: string; amount: number; method: string; ref: string; by?: string }[]
}
export interface Invoice {
  id: string; invNo: string; jobId: string; customerId: string; date: string; due: string
  lines: { description: string; qty: number; rate: number }[]
  amount: number; paid: number
  /** Customer PO # printed on the invoice. */
  customerPo?: string
  /** dive3 M4: a supplemental invoice or credit memo for changes made after the job was invoiced. */
  kind?: 'Supplemental' | 'Credit'; ofInvNo?: string
  status: 'Draft' | 'Sent' | 'Partial' | 'Paid' | 'Overdue'
  collections: 'Current' | 'Reminder Sent' | 'Call Scheduled' | 'Collections' | 'Paid'
  payments: { date: string; amount: number; method: string; ref: string }[]
  note?: string
}
export interface PtoRequest { id: string; employeeId: string; from: string; to: string; kind: 'Vacation' | 'Sick' | 'Personal' | 'Bereavement' | 'Unpaid'; hours: number; status: 'Pending' | 'Approved' | 'Denied'; note?: string; decidedBy?: string; requestedAt: string }
export interface HrRecord { id: string; employeeId: string; date: string; kind: 'Review' | 'Write-Up' | 'Commendation' | 'Document' | 'Pay Change'; title: string; detail: string; by: string; rating?: number; acknowledged?: boolean; confidential: boolean }
export interface Incident {
  id: string; no: string; date: string; jobId?: string; unitId?: string; employeeId?: string
  kind: 'Near Miss' | 'First Aid' | 'Recordable' | 'Property Damage' | 'Vehicle' | 'Environmental'
  severity: 'Low' | 'Medium' | 'High'; description: string; rootCause?: string; correctiveAction?: string
  status: 'Reported' | 'Investigating' | 'Corrective Action' | 'Closed'; reportedBy: string; photos: number
  photoRefs?: string[]; lat?: number; lng?: number // field fixes: real photos (IndexedDB refs) + GPS when the phone shares it
  /** dive2: investigation + OSHA 300 + workers' comp */
  time?: string; location?: string; witnesses?: string; injury?: string; treatment?: 'None' | 'First aid on site' | 'Clinic' | 'ER / hospital'
  daysAway?: number; daysRestricted?: number; closedBy?: string
  wc?: { claimNo?: string; carrier?: string; status?: 'Not filed' | 'Filed' | 'Open' | 'Closed'; reportedToCarrier?: string; medical?: number }
  derNotified?: string
}
export interface SafetyTalk { id: string; kind: 'JSA' | 'Toolbox Talk'; title: string; jobId?: string; date: string; leaderId: string; attendeeIds: string[]; hazards: string[]; controls: string[]; signed: boolean }
export interface Inspection { id: string; kind: 'Crane Annual' | 'Crane Frequent' | 'Rigging' | 'Fire Extinguisher' | 'Trailer' | 'Manlift' | 'Forklift'; unitId?: string; itemId?: string; date: string; due: string; inspectorId: string; result: 'Pass' | 'Fail' | 'Due'; notes?: string; /** dive2: every pass/fail kept */ history?: { date: string; result: 'Pass' | 'Fail'; notes?: string; by: string }[] }
