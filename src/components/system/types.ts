export type ViewKey =
  | "dashboard"
  | "pos"
  | "sales"
  | "quotations"
  | "recurring"
  | "purchases"
  | "expenses"
  | "contacts-customers"
  | "contacts-suppliers"
  | "products"
  | "branches"
  | "warehouses"
  | "accounting-accounts"
  | "accounting-journal"
  | "payments"
  | "payroll"
  | "assets"
  | "reports"
  | "zatca"
  | "vat"
  | "notifications"
  | "support"
  | "ai"
  | "team"
  | "plans"
  | "audit"
  | "settings"
  | "admin";

export type Session = {
  name: string;
  username: string;
  businessName: string;
  role: string;
  plan: string;
  isPlatformAdmin: boolean;
  companies: { id: string; name: string; role: string; plan: string }[];
  activeCompanyId: string;
};

// ============ الأدوار والصلاحيات (مطابقة للخادم) ============

export const ROLE_LABELS: Record<string, string> = {
  OWNER: "المالك",
  ADMIN: "مدير",
  ACCOUNTANT: "محاسب",
  SALES: "مبيعات",
  VIEWER: "مُشاهد",
};

export const PLAN_LABELS: Record<string, string> = {
  trial: "التجريبية",
  basic: "الأساسية",
  pro: "الاحترافية",
  enterprise: "المؤسسات",
};

const CLIENT_PERMS: Record<string, string[]> = {
  OWNER: ["*"],
  ADMIN: ["*"],
  ACCOUNTANT: [
    "*:read",
    "products:write",
    "sales:write",
    "purchases:write",
    "contacts:write",
    "expenses:write",
    "accounting:write",
    "pos:write",
  ],
  SALES: ["*:read", "sales:write", "contacts:write", "pos:write"],
  VIEWER: ["*:read"],
};

export function hasPerm(role: string, perm: string): boolean {
  const list = CLIENT_PERMS[role] ?? [];
  if (list.includes("*")) return true;
  if (list.includes(perm)) return true;
  const [, act] = perm.split(":");
  if (act === "read" && list.includes("*:read")) return true;
  return false;
}

// ============ المحاسبة ============

export type AccountRecord = {
  id: string;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
  debit: number;
  credit: number;
  balance: number;
};

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  ASSET: "أصول",
  LIABILITY: "خصوم",
  EQUITY: "حقوق ملكية",
  REVENUE: "إيرادات",
  EXPENSE: "مصروفات",
};

export type JournalLineRecord = {
  id: string;
  account: { code: string; name: string; type: string };
  debit: number;
  credit: number;
  description: string | null;
};

export type JournalEntrySummary = {
  id: string;
  number: string;
  date: string;
  description: string;
  reference: string | null;
  source: string;
  status: string;
  linesCount: number;
  totalDebit: number;
};

export type JournalEntryDetail = {
  id: string;
  number: string;
  date: string;
  description: string;
  reference: string | null;
  source: string;
  status: string;
  lines: JournalLineRecord[];
};

export const JOURNAL_SOURCE_LABELS: Record<string, string> = {
  manual: "يدوي",
  "auto-sale": "تلقائي — بيع",
  "auto-purchase": "تلقائي — شراء",
  "auto-expense": "تلقائي — مصروف",
  "auto-payment": "تلقائي — تحصيل",
  "auto-payroll": "تلقائي — رواتب",
  "auto-depreciation": "تلقائي — إهلاك",
};

// ============ الفريق ============

export type TeamMember = {
  id: string;
  userId: string;
  name: string;
  username: string;
  email: string | null;
  role: string;
  roleLabel: string;
  joinedAt: string;
  isSelf: boolean;
};

// ============ الباقات ============

export type PlanInfo = {
  key: string;
  name: string;
  price: number;
  period: string;
  features: string[];
};

export type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  brand: string | null;
  unit: string;
  salePrice: number;
  purchasePrice: number;
  stock: number;
  alertQuantity: number;
  isActive: boolean;
  /** توزيع الرصيد على المستودعات (يعيدها API الأصناف) */
  stockLevels?: { quantity: number; warehouse: { name: string } }[];
};

export type Contact = {
  id: string;
  name: string;
  type: string;
  phone: string | null;
  email: string | null;
  taxNumber: string | null;
  address: string | null;
  buildingNo: string | null;
  streetName: string | null;
  district: string | null;
  city: string | null;
  postalCode: string | null;
  additionalNo: string | null;
  totalSales: number;
  salesDue: number;
  totalPurchases: number;
  purchasesDue: number;
  balance: number;
};

export type SaleItem = {
  id?: string;
  productId: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
};

export type Sale = {
  id: string;
  invoiceNo: string;
  /** "invoice" للفاتورة العادية أو "credit-note" للإشعار الدائن (مرتجع المبيعات) */
  kind?: string;
  originalInvoiceNo?: string | null;
  branchId?: string | null;
  branch?: { name: string; code: string } | null;
  contactId: string | null;
  contact?: { name: string } | null;
  date: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  status: string;
  paymentMethod: string;
  note: string | null;
  items: SaleItem[];
  currency?: string;
  exchangeRate?: number;
  qrData?: string | null;
};

export type PurchaseItem = {
  id?: string;
  productId: string | null;
  name: string;
  qty: number;
  unitCost: number;
  total: number;
};

export type Purchase = {
  id: string;
  refNo: string;
  /** "invoice" لفاتورة الشراء العادية أو "return" لمرتجع المشتريات */
  kind?: string;
  originalRefNo?: string | null;
  contactId: string | null;
  contact?: { name: string } | null;
  date: string;
  subtotal: number;
  discount: number;
  tax?: number;
  total: number;
  paid: number;
  status: string;
  note: string | null;
  items: PurchaseItem[];
  currency?: string;
  exchangeRate?: number;
};

export type Expense = {
  id: string;
  category: string;
  amount: number;
  date: string;
  refNo: string | null;
  note: string | null;
};

export type DashboardData = {
  kpis: {
    totalSales: number;
    salesDue: number;
    saleReturnsTotal: number;
    totalPurchases: number;
    purchasesDue: number;
    purchaseReturnsTotal: number;
    totalExpenses: number;
    netIncome: number;
    todaySales: number;
    todayProfit: number;
  };
  counts: {
    products: number;
    lowStock: number;
    stockValue: number;
    customers: number;
    suppliers: number;
    branches?: number;
    openShifts?: number;
  };
  branchStats?: BranchStat[];
  salesSeries: { date: string; label: string; sales: number }[];
  topProducts: { name: string; qty: number; total: number }[];
  expensesByCategory: { name: string; value: number }[];
};

export type Settings = {
  businessName: string;
  currency: string;
  name: string | null;
  username: string;
  email: string | null;
  taxNumber: string | null;
  crNumber: string | null;
  address: string | null;
  phone: string | null;
  // العنوان الوطني
  buildingNo: string | null;
  streetName: string | null;
  district: string | null;
  city: string | null;
  postalCode: string | null;
  additionalNo: string | null;
  // حالة التكاملات
  emailConfigured: boolean;
  whatsappConfigured: boolean;
  // اعتماد زتكا للإرسال الفعلي (CSID)
  zatcaEnv: string;
  egsSerial: string | null;
  csidConfigured: boolean;
  zatcaSecretConfigured: boolean;
  zatcaCertConfigured: boolean;
  zatcaKeyConfigured: boolean;
};

export const CURRENCY_LABELS: Record<string, string> = {
  SAR: "ر.س",
  EGP: "ج.م",
  USD: "$",
  AED: "د.إ",
  EUR: "€",
  GBP: "£",
  QAR: "ر.ق",
  KWD: "د.ك",
  OMR: "ر.ع",
  YER: "ر.ي",
  JOD: "د.أ",
  IQD: "د.ع",
};

/** العملات المتاحة في محاور إنشاء الفواتير (تعدد العملات) */
export const INVOICE_CURRENCIES = ["SAR", "USD", "EGP", "AED", "EUR", "GBP"] as const;

// ============ المدفوعات (سندات القبض والصرف) ============

export type PaymentRecord = {
  id: string;
  voucherNo: string;
  direction: string;
  amount: number;
  method: string;
  date: string;
  note: string | null;
  contactId: string | null;
  contactName: string | null;
  saleId: string | null;
  saleInvoiceNo: string | null;
  purchaseId: string | null;
  purchaseRefNo: string | null;
};

export const PAYMENT_DIRECTION_LABELS: Record<string, string> = {
  receipt: "سند قبض",
  payment: "سند صرف",
};

// ============ عروض الأسعار ============

export type QuotationItem = {
  id: string;
  productId: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
};

export type QuotationListRecord = {
  id: string;
  quoteNo: string;
  date: string;
  validUntil: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  status: string;
  note: string | null;
  contactId: string | null;
  contactName: string | null;
  itemsCount: number;
};

export type QuotationDetail = QuotationListRecord & {
  items: QuotationItem[];
};

export const QUOTATION_STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  sent: "مُرسل",
  accepted: "مقبول",
  rejected: "مرفوض",
  converted: "محوّل لفاتورة",
};

export const SALE_KIND_LABELS: Record<string, string> = {
  invoice: "فاتورة",
  "credit-note": "إشعار دائن",
};

export const PURCHASE_KIND_LABELS: Record<string, string> = {
  invoice: "فاتورة شراء",
  return: "مرتجع مشتريات",
};

// ============ الرواتب والموظفون ============

export type EmployeeRecord = {
  id: string;
  name: string;
  nationalId: string | null;
  position: string;
  phone: string | null;
  iban: string | null;
  bankName: string | null;
  baseSalary: number;
  housingAllowance: number;
  otherAllowance: number;
  otherDeduction: number;
  gosiApplicable: boolean;
  isActive: boolean;
};

export type PayrollRunRecord = {
  id: string;
  month: number;
  year: number;
  status: string;
  note: string | null;
  processedAt: string | null;
  createdAt: string;
  employeesCount: number;
  grossTotal: number;
  deductionsTotal: number;
  gosiEmployeeTotal: number;
  gosiEmployerTotal: number;
  netTotal: number;
};

export type PayslipRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  position: string;
  baseSalary: number;
  allowances: number;
  deductions: number;
  gosiEmployee: number;
  gosiEmployer: number;
  netPay: number;
};

// ============ الأصول الثابتة والإهلاك ============

export type FixedAssetRecord = {
  id: string;
  name: string;
  category: string;
  purchaseDate: string;
  cost: number;
  salvageValue: number;
  usefulLifeYears: number;
  method: string;
  accumulated: number;
  status: string;
  disposedAt: string | null;
  disposalAmount: number | null;
  note: string | null;
  monthlyDepreciation: number;
  nbv: number;
  depreciableValue: number;
  fullyDepreciated: boolean;
};

export type DepreciationRecord = {
  id: string;
  assetId: string;
  assetName: string;
  period: string;
  amount: number;
  date: string;
};

export const ASSET_STATUS_LABELS: Record<string, string> = {
  active: "نشط",
  disposed: "مُخلَّد (تخريد)",
};

// ============ الفواتير المتكررة ============

export type RecurringItemRecord = {
  id: string;
  productId: string | null;
  name: string;
  qty: number;
  unitPrice: number;
};

export type RecurringTemplateRecord = {
  id: string;
  contactId: string | null;
  contactName: string | null;
  frequency: string;
  nextRunAt: string;
  lastRunAt: string | null;
  generatedCount: number;
  taxRate: number;
  discount: number;
  paymentMethod: string;
  note: string | null;
  isActive: boolean;
  items: RecurringItemRecord[];
  subtotal: number;
};

export const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "أسبوعي",
  monthly: "شهري",
  quarterly: "ربع سنوي",
  yearly: "سنوي",
};

// ============ الفروع (تعدد المنافذ ونقاط البيع) ============

export type BranchRecord = {
  id: string;
  name: string;
  code: string;
  kind: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  isActive: boolean;
  createdAt: string;
  salesCount: number;
  purchasesCount: number;
  shiftsCount: number;
  salesTotal: number;
  openShifts: number;
};

export const BRANCH_KIND_LABELS: Record<string, string> = {
  store: "متجر",
  warehouse: "مستودع",
  kiosk: "كشك / منفذ",
};

export type BranchStat = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  salesTotal: number;
  salesCount: number;
};

// ============ ورديات الكاشير (POS) ============

export type PosShiftSummary = {
  salesCount: number;
  returnsCount: number;
  salesTotal: number;
  returnsTotal: number;
  taxTotal: number;
  byMethod: Record<string, number>;
  expectedCash: number;
};

export type ActiveShift = {
  id: string;
  branchId: string | null;
  branchName: string | null;
  branchCode: string | null;
  openedAt: string;
  openingCash: number;
  status: string;
  summary: PosShiftSummary | null;
};

export type ShiftHistoryRecord = {
  id: string;
  branchName: string;
  cashier: string;
  openedAt: string;
  closedAt: string | null;
  status: string;
  openingCash: number;
  countedCash: number | null;
  expectedCash: number | null;
  cashDifference: number | null;
  salesCount: number;
  salesTotal: number;
  note: string | null;
};

// ============ إيصال طباعة POS ============

export type ReceiptData = {
  invoiceNo: string;
  kind: string;
  date: string;
  branchName: string | null;
  branchCode: string | null;
  contactName: string;
  contactTaxNumber: string | null;
  items: { name: string; qty: number; unitPrice: number; total: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  change: number;
  remaining: number;
  paymentMethod: string;
  currency: string;
  qrImage: string | null;
  qrData: string | null;
  zatcaStatus: string;
  zatcaUuid: string | null;
};

export type ReceiptCompany = {
  name: string;
  taxNumber: string | null;
  crNumber: string | null;
  phone: string | null;
  address: string | null;
  currency: string;
  zatcaEnv: string;
};

// ============ المستودعات (تعدد المستودعات) ============

export type WarehouseRecord = {
  id: string;
  name: string;
  code: string;
  location: string | null;
  keeper: string | null;
  isActive: boolean;
  isDefault: boolean;
  branch: { name: string; code: string } | null;
  itemsCount: number;
  totalQty: number;
  totalValue: number;
  salesCount: number;
  purchasesCount: number;
  createdAt: string;
};

export type StockLevelRecord = {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  value: number;
  low: boolean;
};

export type StockMovementRecord = {
  id: string;
  product: { name: string; sku: string };
  warehouse: { name: string; code: string };
  type: string;
  qty: number;
  balanceAfter: number;
  refType: string | null;
  refNo: string | null;
  note: string | null;
  createdAt: string;
};

export const STOCK_MOVEMENT_LABELS: Record<string, string> = {
  purchase: "إدخال مشتريات",
  sale: "خصم مبيعات",
  "sale-return": "مرتجع مبيعات",
  "purchase-return": "مرتجع مشتريات",
  "transfer-in": "تحويل وارد",
  "transfer-out": "تحويل صادر",
  adjustment: "تسوية جرد",
  opening: "رصيد افتتاحي",
};

// ============ سجل التدقيق ============

export type AuditLogRecord = {
  id: string;
  username: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  details: string | null;
  createdAt: string;
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "نقدي",
  card: "بطاقة",
  transfer: "تحويل بنكي",
  credit: "آجل (على الحساب)",
};

// ============ زتكا (الفاتورة الإلكترونية) ============

export const ZATCA_STATUS_LABELS: Record<string, string> = {
  PENDING: "بانتظار الإرسال",
  REPORTED: "مُبلَّغ عنها",
  REJECTED: "مرفوضة",
};

export type ZatcaInvoice = {
  id: string;
  invoiceNo: string;
  date: string;
  contactName: string;
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  hasQr: boolean;
  zatcaStatus: string;
  zatcaUuid: string | null;
  zatcaHash: string | null;
  zatcaSubmittedAt: string | null;
};

export type ZatcaData = {
  company: {
    name: string;
    taxNumber: string | null;
    crNumber: string | null;
    address: string | null;
    phone: string | null;
    currency: string;
    zatcaEnv: string;
    egsSerial: string | null;
    csidConfigured: boolean;
  };
  compliance: { key: string; label: string; passed: boolean; hint: string }[];
  stats: { total: number; withQr: number; submitted: number; rejected: number; pending: number };
  invoices: ZatcaInvoice[];
};

// ============ إدارة المنصة ============

export const PLAN_PRICES: Record<string, number> = {
  trial: 0,
  basic: 99,
  pro: 249,
  enterprise: 599,
};

export type AdminTenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  currency: string;
  taxNumber: string | null;
  createdAt: string;
  members: number;
  invoices: number;
  products: number;
  owner: string;
  ownerEmail: string | null;
};

export type AdminUser = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  isPlatformAdmin: boolean;
  memberships: number;
  createdAt: string;
};

export type AdminData = {
  stats: {
    tenants: number;
    active: number;
    suspended: number;
    users: number;
    platformAdmins: number;
    invoices: number;
    salesVolume: number;
    purchasesVolume: number;
    mrr: number;
    arr: number;
    planDistribution: Record<string, number>;
  };
  tenants: AdminTenant[];
  users: AdminUser[];
};

export function formatMoney(n: number, currency = "SAR") {
  const symbol = CURRENCY_LABELS[currency] ?? currency;
  return `${(Math.round(n * 100) / 100).toLocaleString("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${symbol}`;
}

export function formatDate(d: string | Date) {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatDateTime(d: string | Date) {
  const date = new Date(d);
  return `${formatDate(date)} ${date.toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}
