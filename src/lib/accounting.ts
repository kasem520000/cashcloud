import { db } from "@/lib/db";

// ============ دليل الحسابات الافتراضي (عربي) ============

export const ACCOUNT_TYPES: Record<string, string> = {
  ASSET: "أصول",
  LIABILITY: "خصوم",
  EQUITY: "حقوق ملكية",
  REVENUE: "إيرادات",
  EXPENSE: "مصروفات",
};

export const DEFAULT_COA = [
  { code: "1010", name: "النقدية بالصندوق", type: "ASSET" },
  { code: "1020", name: "النقدية بالبنك", type: "ASSET" },
  { code: "1140", name: "ضريبة القيمة المضافة — مدخلات", type: "ASSET" },
  { code: "1200", name: "العملاء (ذمم مدينة)", type: "ASSET" },
  { code: "1300", name: "المخزون", type: "ASSET" },
  { code: "1500", name: "أصول ثابتة", type: "ASSET" },
  { code: "1510", name: "مجمع إهلاك الأصول الثابتة", type: "ASSET" },
  { code: "2010", name: "الموردون (ذمم دائنة)", type: "LIABILITY" },
  { code: "2100", name: "ضريبة القيمة المضافة — مخرجات", type: "LIABILITY" },
  { code: "2110", name: "مستحقات التأمينات الاجتماعية (GOSI)", type: "LIABILITY" },
  { code: "2120", name: "رواتب مستحقة الدفع", type: "LIABILITY" },
  { code: "2130", name: "سلف واستقطاعات الموظفين", type: "LIABILITY" },
  { code: "2200", name: "قروض قصيرة الأجل", type: "LIABILITY" },
  { code: "3010", name: "رأس المال", type: "EQUITY" },
  { code: "3020", name: "الأرباح المحتجزة", type: "EQUITY" },
  { code: "4010", name: "إيرادات المبيعات", type: "REVENUE" },
  { code: "4900", name: "إيرادات أخرى", type: "REVENUE" },
  { code: "5010", name: "تكلفة البضاعة المباعة", type: "EXPENSE" },
  { code: "5100", name: "مصروف الرواتب والأجور", type: "EXPENSE" },
  { code: "5110", name: "مصروف التأمينات الاجتماعية (حصة المنشأة)", type: "EXPENSE" },
  { code: "5200", name: "مصروف الإيجار", type: "EXPENSE" },
  { code: "5300", name: "مصروف المرافق والكهرباء", type: "EXPENSE" },
  { code: "5400", name: "مصروف التسويق والإعلان", type: "EXPENSE" },
  { code: "5500", name: "مصروف إهلاك الأصول الثابتة", type: "EXPENSE" },
  { code: "5900", name: "مصروفات أخرى", type: "EXPENSE" },
];

export async function seedCOA(companyId: string) {
  await db.account.createMany({
    data: DEFAULT_COA.map((a) => ({ ...a, companyId })),
  });
}

/** إنشاء أي حسابات افتراضية ناقصة لدى منشأة قائمة (ترقية سلسة) */
export async function ensureDefaultAccounts(companyId: string) {
  const existing = await db.account.findMany({ where: { companyId }, select: { code: true } });
  const have = new Set(existing.map((a) => a.code));
  const missing = DEFAULT_COA.filter((a) => !have.has(a.code));
  if (missing.length > 0) {
    await db.account.createMany({ data: missing.map((a) => ({ ...a, companyId })) });
  }
}

// ربط فئات المصروفات بحساباتها
export const EXPENSE_CATEGORY_CODES: Record<string, string> = {
  "رواتب وأجور": "5100",
  "إيجار": "5200",
  "مرافق وكهرباء": "5300",
  "تسويق وإعلان": "5400",
  "صيانة": "5900",
  "نقل وشحن": "5900",
  "عام": "5900",
};

export function expenseAccountCode(category: string): string {
  return EXPENSE_CATEGORY_CODES[category] ?? "5900";
}

// ============ الترقيم التلقائي ============

export async function nextJournalNumber(companyId: string): Promise<string> {
  const count = await db.journalEntry.count({ where: { companyId } });
  return `JE-${String(count + 1).padStart(4, "0")}`;
}

export async function nextInvoiceNumber(companyId: string): Promise<string> {
  const count = await db.sale.count({ where: { companyId } });
  return `INV-${String(count + 1).padStart(5, "0")}`;
}

export async function nextPurchaseNumber(companyId: string): Promise<string> {
  const count = await db.purchase.count({ where: { companyId } });
  return `PO-${String(count + 1).padStart(5, "0")}`;
}

// ============ الترحيل المحاسبي (القيد المزدوج) ============

export type JournalLineInput = {
  code: string;
  debit?: number;
  credit?: number;
  description?: string;
};

/**
 * ينشئ قيداً يومياً مُرحّلاً تلقائياً (متوازن) للمنشأة.
 * يتجاهل القيد إذا لم يكن متوازناً أو يحتوي أقل من سطرين.
 */
export async function postAutoJournal(opts: {
  companyId: string;
  date: Date;
  description: string;
  reference: string;
  source: string;
  lines: JournalLineInput[];
}) {
  const accounts = await db.account.findMany({ where: { companyId: opts.companyId } });
  const byCode = new Map(accounts.map((a) => [a.code, a]));

  const lines = opts.lines
    .map((l) => {
      const acc = byCode.get(l.code);
      return {
        accountId: acc?.id ?? "",
        debit: Math.round((l.debit ?? 0) * 100) / 100,
        credit: Math.round((l.credit ?? 0) * 100) / 100,
        description: l.description ?? null,
      };
    })
    .filter((l) => l.accountId && (l.debit > 0 || l.credit > 0));

  const debit = lines.reduce((s, l) => s + l.debit, 0);
  const credit = lines.reduce((s, l) => s + l.credit, 0);
  if (lines.length < 2 || Math.abs(debit - credit) > 0.01) return null;

  const number = await nextJournalNumber(opts.companyId);
  return db.journalEntry.create({
    data: {
      companyId: opts.companyId,
      number,
      date: opts.date,
      description: opts.description,
      reference: opts.reference,
      source: opts.source,
      status: "posted",
      lines: { create: lines },
    },
  });
}

/** حذف القيود التلقائية المرتبطة بمرجع (عند تعديل/حذف مستند أصلي) */
export async function deleteAutoJournals(companyId: string, reference: string) {
  await db.journalEntry.deleteMany({
    where: {
      companyId,
      reference,
      source: { startsWith: "auto" },
    },
  });
}

/** حساب رصيد كل حساب (مدين - دائن) مع إشارة النوع */
export async function accountsWithBalances(companyId: string) {
  const [accounts, lines] = await Promise.all([
    db.account.findMany({
      where: { companyId },
      orderBy: { code: "asc" },
    }),
    db.journalLine.findMany({
      where: { entry: { companyId, status: "posted" } },
      select: { accountId: true, debit: true, credit: true },
    }),
  ]);

  const sums = new Map<string, { debit: number; credit: number }>();
  for (const l of lines) {
    const cur = sums.get(l.accountId) ?? { debit: 0, credit: 0 };
    cur.debit += l.debit;
    cur.credit += l.credit;
    sums.set(l.accountId, cur);
  }

  return accounts.map((a) => {
    const s = sums.get(a.id) ?? { debit: 0, credit: 0 };
    return {
      ...a,
      debit: Math.round(s.debit * 100) / 100,
      credit: Math.round(s.credit * 100) / 100,
      balance: Math.round((s.debit - s.credit) * 100) / 100,
    };
  });
}
