/**
 * Seed — بيانات تجريبية لنظام ERP SaaS متعدد المستأجرين
 * تشغيل: bun run scripts/seed.ts
 */
import crypto from "node:crypto";
import { db } from "../src/lib/db";
import { DEFAULT_COA, postAutoJournal, expenseAccountCode } from "../src/lib/accounting";
import { generateQrPayload } from "../src/lib/zatca";
import { seedMarketing } from "./seed-marketing";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
const hoursAgo = (n: number) => new Date(Date.now() - n * 3600000);
const minutesAfter = (d: Date, m: number) => new Date(d.getTime() + m * 60000);

async function main() {
  console.log("🧹 مسح البيانات القديمة...");
  await db.journalLine.deleteMany();
  await db.journalEntry.deleteMany();
  await db.account.deleteMany();
  await db.expense.deleteMany();
  // النماذج المالية الجديدة (تُمسح قبل فواتير البيع/الشراء — مراجع FK)
  await db.payment.deleteMany();
  await db.quotationItem.deleteMany();
  await db.quotation.deleteMany();
  await db.auditLog.deleteMany();
  // وحدات النسخة الأعلى (رواتب / أصول / فواتير متكررة)
  await db.payslip.deleteMany();
  await db.payrollRun.deleteMany();
  await db.employee.deleteMany();
  await db.depreciationEntry.deleteMany();
  await db.fixedAsset.deleteMany();
  await db.recurringItem.deleteMany();
  await db.recurringInvoice.deleteMany();
  await db.purchaseItem.deleteMany();
  await db.purchase.deleteMany();
  await db.saleItem.deleteMany();
  await db.sale.deleteMany();
  // الجداول التي تحمي المنتجات/المستودعات بقيود FK — تُحذف أولاً دائماً
  await db.stockMovement.deleteMany();
  await db.stockLevel.deleteMany();
  await db.posShift.deleteMany();
  await db.branch.deleteMany();
  await db.warehouse.deleteMany();
  await db.contact.deleteMany();
  await db.product.deleteMany();
  await db.membership.deleteMany();
  // النماذج الجديدة (تُمسح قبل الشركات والمستخدمين — الأبناء أولاً)
  await db.aiMessage.deleteMany();
  await db.aiConversation.deleteMany();
  await db.supportMessage.deleteMany();
  await db.supportTicket.deleteMany();
  await db.notification.deleteMany();
  await db.emailLog.deleteMany();
  await db.whatsAppLog.deleteMany();
  await db.vatDeclaration.deleteMany();
  await db.company.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();

  // ============ المستخدمون ============
  console.log("👥 إنشاء المستخدمين...");
  const admin = await db.user.create({
    data: {
      username: "admin",
      name: "أحمد عبدالله",
      email: "admin@alofoq.sa",
      passwordHash: hashPassword("admin123"),
      isPlatformAdmin: true, // مدير المنصة (Super Admin)
    },
  });
  const sara = await db.user.create({
    data: {
      username: "sara",
      name: "سارة الحسابي",
      email: "sara@alofoq.sa",
      passwordHash: hashPassword("sara123"),
    },
  });
  const khaled = await db.user.create({
    data: {
      username: "khaled",
      name: "خالد المبيعات",
      email: "khaled@alofoq.sa",
      passwordHash: hashPassword("khaled123"),
    },
  });
  const mona = await db.user.create({
    data: {
      username: "mona",
      name: "منى العتيبي",
      email: "mona@waha.store",
      passwordHash: hashPassword("mona123"),
    },
  });

  // ============ المنشأة 1: شركة الأفق للتجارة ============
  console.log("🏢 إنشاء المنشأة الأولى (شركة الأفق للتجارة)...");
  const co1 = await db.company.create({
    data: {
      name: "شركة الأفق للتجارة",
      slug: "alofoq-trade",
      currency: "SAR",
      taxNumber: "310122393500003",
      crNumber: "1010123456",
      phone: "0112345678",
      email: "info@alofoq.sa",
      address: "الرياض - العليا - شارع الملك فهد",
      plan: "pro",
      // العنوان الوطني
      buildingNo: "2834",
      streetName: "شارع الملك فهد",
      district: "العليا",
      city: "الرياض",
      postalCode: "12211",
      additionalNo: "654",
      // وحدة الفاتورة EGS (زتكا — للإرسال الفعلي)
      egsSerial: "1|شركة الأفق للتجارة|POS-001",
    },
  });

  await db.membership.create({ data: { userId: admin.id, companyId: co1.id, role: "OWNER" } });
  await db.membership.create({ data: { userId: sara.id, companyId: co1.id, role: "ACCOUNTANT" } });
  await db.membership.create({ data: { userId: khaled.id, companyId: co1.id, role: "SALES" } });

  await db.account.createMany({
    data: DEFAULT_COA.map((a) => ({ ...a, companyId: co1.id })),
  });

  // الفروع
  console.log("🏬 الفروع والورديات...");
  const branchRiyadh = await db.branch.create({
    data: { companyId: co1.id, name: "الفرع الرئيسي — العليا", code: "RIY", kind: "store", phone: "0112345678", city: "الرياض" },
  });
  const branchMalaz = await db.branch.create({
    data: { companyId: co1.id, name: "فرع الملز", code: "MLZ", kind: "store", phone: "0114778899", city: "الرياض" },
  });

  // المستودعات
  console.log("🏪 المستودعات وأرصدة المخزون...");
  const whMain = await db.warehouse.create({
    data: { companyId: co1.id, branchId: branchRiyadh.id, name: "المستودع الرئيسي", code: "WH01", location: "الرياض — العليا", keeper: "منى العتيبي", isDefault: true },
  });
  const whBackup = await db.warehouse.create({
    data: { companyId: co1.id, branchId: branchMalaz.id, name: "مستودع الملز الاحتياطي", code: "WH02", location: "الرياض — الملز", keeper: "سعود الدوسري" },
  });

  // المنتجات
  console.log("📦 المنتجات...");
  const productDefs = [
    { name: "لابتوب ديل Latitude 5540", sku: "LAP-DEL-5540", category: "إلكترونيات", brand: "Dell", unit: "قطعة", salePrice: 5250, purchasePrice: 4100, stock: 14, alertQuantity: 3 },
    { name: "طابعة HP LaserJet Pro", sku: "PRN-HP-4020", category: "إلكترونيات", brand: "HP", unit: "قطعة", salePrice: 1780, purchasePrice: 1320, stock: 9, alertQuantity: 3 },
    { name: "شاشة سامسونج 27 بوصة", sku: "MON-SAM-27", category: "إلكترونيات", brand: "Samsung", unit: "قطعة", salePrice: 1050, purchasePrice: 760, stock: 22, alertQuantity: 5 },
    { name: "كيبورد لاسلكي Logitech", sku: "KBD-LOG-W60", category: "ملحقات", brand: "Logitech", unit: "قطعة", salePrice: 185, purchasePrice: 120, stock: 40, alertQuantity: 8 },
    { name: "ماوس Logitech MX Master", sku: "MOU-LOG-MX", category: "ملحقات", brand: "Logitech", unit: "قطعة", salePrice: 340, purchasePrice: 245, stock: 31, alertQuantity: 6 },
    { name: "كرسي مكتبي طبي", sku: "CHR-OFC-01", category: "أثاث مكتبي", unit: "قطعة", salePrice: 1390, purchasePrice: 890, stock: 12, alertQuantity: 2 },
    { name: "مكتب خشبي 160سم", sku: "DSK-WD-160", category: "أثاث مكتبي", unit: "قطعة", salePrice: 1590, purchasePrice: 1080, stock: 5, alertQuantity: 2 },
    { name: "ورق تصوير A4 (كرتون)", sku: "PPR-A4-CTN", category: "قرطاسية", unit: "كرتون", salePrice: 145, purchasePrice: 112, stock: 60, alertQuantity: 15 },
    { name: "حبر طابعة HP 26A", sku: "INK-HP-26A", category: "قرطاسية", brand: "HP", unit: "قطعة", salePrice: 320, purchasePrice: 240, stock: 2, alertQuantity: 6 },
    { name: "جهاز توجيه WiFi 6", sku: "NET-TPL-AX", category: "شبكات", brand: "TP-Link", unit: "قطعة", salePrice: 420, purchasePrice: 310, stock: 12, alertQuantity: 4 },
    { name: "كابل شبكة CAT6 (متر)", sku: "CAB-CAT6-M", category: "شبكات", unit: "متر", salePrice: 6.5, purchasePrice: 4, stock: 500, alertQuantity: 100 },
    { name: "يو إس بي فلاش 64GB", sku: "USB-64G", category: "ملحقات", unit: "قطعة", salePrice: 55, purchasePrice: 35, stock: 4, alertQuantity: 10 },
  ];
  const products = await Promise.all(
    productDefs.map((p) => db.product.create({ data: { ...p, companyId: co1.id } }))
  );
  const P = (sku: string) => products.find((p) => p.sku === sku)!;

  // أرصدة المخزون بالمستودع الرئيسي + حركة افتتاحية لكل صنف
  await Promise.all(
    products.map((p) =>
      db.stockLevel.create({
        data: { companyId: co1.id, productId: p.id, warehouseId: whMain.id, quantity: p.stock },
      })
    )
  );
  await Promise.all(
    products.map((p) =>
      db.stockMovement.create({
        data: {
          companyId: co1.id,
          productId: p.id,
          warehouseId: whMain.id,
          type: "purchase",
          qty: p.stock,
          balanceAfter: p.stock,
          refType: "adjustment",
          refNo: "OPENING",
          note: "رصيد افتتاحي",
          userId: admin.id,
        },
      })
    )
  );
  // جزء من الأصناف موجود أيضاً بالمستودع الاحتياطي
  const backupQtys: Record<string, number> = { "LAP-DEL-5540": 3, "MON-SAM-27": 6, "KBD-LOG-W60": 10, "PPR-A4-CTN": 20 };
  for (const [sku, qty] of Object.entries(backupQtys)) {
    const prod = P(sku);
    await db.stockLevel.create({
      data: { companyId: co1.id, productId: prod.id, warehouseId: whBackup.id, quantity: qty },
    });
    await db.stockMovement.create({
      data: {
        companyId: co1.id,
        productId: prod.id,
        warehouseId: whBackup.id,
        type: "purchase",
        qty,
        balanceAfter: qty,
        refType: "adjustment",
        refNo: "OPENING",
        note: "رصيد افتتاحي",
        userId: admin.id,
      },
    });
  }

  // العملاء والموردون
  console.log("🤝 العملاء والموردون...");
  const customerDefs = [
    {
      name: "مؤسسة الرياض للتقنية", phone: "0551112222", email: "info@riyadh-tech.sa", taxNumber: "310987654100003",
      address: "الرياض — حي الملقا",
      buildingNo: "6721", streetName: "شارع الأمير محمد بن سلمان", district: "الملقا", city: "الرياض", postalCode: "13521", additionalNo: "443",
    },
    {
      name: "شركة الخليج للمقاولات", phone: "0553334444", email: "contact@gulf-cont.sa",
      address: "الدمام — حي الجلوية",
      buildingNo: "3215", streetName: "شارع الأمير محمد بن فهد", district: "الجلوية", city: "الدمام", postalCode: "32441", additionalNo: "621",
    },
    {
      name: "مكتب النور للاستشارات", phone: "0555556666", email: "noor@consult.sa",
      address: "جدة — حي الحمراء",
      buildingNo: "7214", streetName: "شارع الأندلس", district: "الحمراء", city: "جدة", postalCode: "22247", additionalNo: "187",
    },
    {
      name: "مدرسة الأمل الأهلية", phone: "0557778888",
      address: "الرياض — حي النرجس",
      buildingNo: "8542", streetName: "شارع أنس بن مالك", district: "النرجس", city: "الرياض", postalCode: "14761", additionalNo: "932",
    },
    { name: "عميل نقدي — مباشر", phone: "—" },
    {
      name: "شركة البحر الأحمر للسياحة", phone: "0559990000", email: "info@redsea.sa",
      address: "جدة — حي الشاطئ",
      buildingNo: "4110", streetName: "طريق الكورنيش", district: "الشاطئ", city: "جدة", postalCode: "23218", additionalNo: "274",
    },
  ];
  const customers = await Promise.all(
    customerDefs.map((c) => db.contact.create({ data: { ...c, type: "customer", companyId: co1.id } }))
  );

  const supplierDefs = [
    {
      name: "مؤسسة التقنية المتقدمة للتوريد", phone: "0551212121", email: "sales@adv-tech.sa",
      address: "الخبر — حي العقربية",
      buildingNo: "6523", streetName: "شارع الملك سعود", district: "العقربية", city: "الخبر", postalCode: "34721", additionalNo: "445",
    },
    {
      name: "شركة الإمداد الدولية", phone: "0553434343", email: "info@supply-intl.com",
      address: "الرياض — حي الورود",
      buildingNo: "8102", streetName: "طريق الملك عبدالله", district: "الورود", city: "الرياض", postalCode: "12244", additionalNo: "318",
    },
    {
      name: "مكتب القرطاسية المتحدة", phone: "0555656565",
      address: "الرياض — حي النسيم",
      buildingNo: "2917", streetName: "شارع الحسن بن علي", district: "النسيم", city: "الرياض", postalCode: "14261", additionalNo: "726",
    },
    {
      name: "أثاث المكاتب الحديثة", phone: "0557878787",
      address: "جدة — حي الصفا",
      buildingNo: "5328", streetName: "شارع حائل", district: "الصفا", city: "جدة", postalCode: "23432", additionalNo: "651",
    },
  ];
  const suppliers = await Promise.all(
    supplierDefs.map((s) => db.contact.create({ data: { ...s, type: "supplier", companyId: co1.id } }))
  );

  // المشتريات (مع ضريبة مدخلات 15% وقيود تلقائية)
  console.log("🛒 المشتريات والقيود...");
  const purchaseDefs = [
    { ref: 1, supplier: 0, days: 75, taxRate: 15, items: [{ p: "LAP-DEL-5540", qty: 6, cost: 4100 }, { p: "MON-SAM-27", qty: 10, cost: 760 }], paidRatio: 1 },
    { ref: 2, supplier: 0, days: 55, taxRate: 15, items: [{ p: "PRN-HP-4020", qty: 6, cost: 1320 }], paidRatio: 1 },
    { ref: 3, supplier: 2, days: 40, taxRate: 0, items: [{ p: "PPR-A4-CTN", qty: 50, cost: 112 }, { p: "INK-HP-26A", qty: 10, cost: 240 }], paidRatio: 0.5 }, // مورد غير مسجل بالضريبة
    { ref: 4, supplier: 3, days: 30, taxRate: 15, items: [{ p: "CHR-OFC-01", qty: 8, cost: 890 }, { p: "DSK-WD-160", qty: 6, cost: 1080 }], paidRatio: 1 },
    { ref: 5, supplier: 1, days: 15, taxRate: 15, items: [{ p: "KBD-LOG-W60", qty: 40, cost: 120 }, { p: "MOU-LOG-MX", qty: 30, cost: 245 }, { p: "USB-64G", qty: 60, cost: 35 }], paidRatio: 0.6 },
    { ref: 6, supplier: 1, days: 6, taxRate: 15, items: [{ p: "NET-TPL-AX", qty: 12, cost: 310 }, { p: "CAB-CAT6-M", qty: 500, cost: 4 }], paidRatio: 1 },
  ];
  for (const pd of purchaseDefs) {
    const subtotal = pd.items.reduce((s, it) => s + it.qty * it.cost, 0);
    const taxRate = pd.taxRate ?? 0;
    const tax = r2((subtotal * taxRate) / 100); // ضريبة القيمة المضافة — مدخلات
    const total = r2(subtotal + tax);
    const paid = r2(total * pd.paidRatio);
    const date = daysAgo(pd.days);
    const refNo = `PO-${String(pd.ref).padStart(5, "0")}`;
    await db.purchase.create({
      data: {
        companyId: co1.id,
        refNo,
        contactId: suppliers[pd.supplier].id,
        date,
        subtotal,
        discount: 0,
        tax,
        total,
        paid,
        status: "received",
        items: {
          create: pd.items.map((it) => ({
            productId: P(it.p).id,
            name: P(it.p).name,
            qty: it.qty,
            unitCost: it.cost,
            total: r2(it.qty * it.cost),
          })),
        },
      },
    });
    await postAutoJournal({
      companyId: co1.id,
      date,
      description: `فاتورة شراء ${refNo}`,
      reference: `PURCHASE-${refNo}`,
      source: "auto-purchase",
      lines: [
        { code: "1300", debit: subtotal, description: "إضافة للمخزون" },
        { code: "1140", debit: tax, description: "ضريبة القيمة المضافة — مدخلات" },
        { code: "1010", credit: paid, description: "مدفوعات نقدية" },
        { code: "2010", credit: r2(total - paid), description: "مستحق للموردين" },
      ],
    });
  }

  // المبيعات (مع قيود تلقائية)
  console.log("💰 المبيعات والقيود...");
  const saleDefs: {
    ref: number; customer: number; days: number; method: string; paidRatio: number;
    items: { p: string; qty: number; price: number }[]; status?: string; taxRate?: number;
  }[] = [
    { ref: 1, customer: 0, days: 68, method: "transfer", paidRatio: 1, items: [{ p: "LAP-DEL-5540", qty: 3, price: 5250 }, { p: "MOU-LOG-MX", qty: 3, price: 340 }] },
    { ref: 2, customer: 1, days: 62, method: "credit", paidRatio: 0.4, items: [{ p: "CHR-OFC-01", qty: 4, price: 1390 }, { p: "DSK-WD-160", qty: 3, price: 1590 }], taxRate: 15 },
    { ref: 3, customer: 4, days: 57, method: "cash", paidRatio: 1, items: [{ p: "PPR-A4-CTN", qty: 6, price: 145 }, { p: "INK-HP-26A", qty: 2, price: 320 }] },
    { ref: 4, customer: 2, days: 50, method: "card", paidRatio: 1, items: [{ p: "PRN-HP-4020", qty: 2, price: 1780 }] },
    { ref: 5, customer: 3, days: 45, method: "transfer", paidRatio: 1, items: [{ p: "MON-SAM-27", qty: 5, price: 1050 }, { p: "KBD-LOG-W60", qty: 5, price: 185 }, { p: "MOU-LOG-MX", qty: 5, price: 340 }] },
    { ref: 6, customer: 0, days: 38, method: "credit", paidRatio: 0, items: [{ p: "LAP-DEL-5540", qty: 2, price: 5250 }, { p: "MON-SAM-27", qty: 2, price: 1050 }], taxRate: 15 },
    { ref: 7, customer: 5, days: 33, method: "cash", paidRatio: 1, items: [{ p: "NET-TPL-AX", qty: 3, price: 420 }, { p: "CAB-CAT6-M", qty: 120, price: 6.5 }] },
    { ref: 8, customer: 1, days: 27, method: "transfer", paidRatio: 1, items: [{ p: "CHR-OFC-01", qty: 2, price: 1390 }] },
    { ref: 9, customer: 4, days: 22, method: "cash", paidRatio: 1, items: [{ p: "USB-64G", qty: 15, price: 55 }, { p: "KBD-LOG-W60", qty: 4, price: 185 }] },
    { ref: 10, customer: 2, days: 18, method: "credit", paidRatio: 0.5, items: [{ p: "PRN-HP-4020", qty: 3, price: 1780 }, { p: "INK-HP-26A", qty: 4, price: 320 }] },
    { ref: 11, customer: 3, days: 12, method: "card", paidRatio: 1, items: [{ p: "MON-SAM-27", qty: 4, price: 1050 }] },
    { ref: 12, customer: 0, days: 8, method: "transfer", paidRatio: 1, items: [{ p: "MOU-LOG-MX", qty: 6, price: 340 }, { p: "KBD-LOG-W60", qty: 10, price: 185 }] },
    { ref: 13, customer: 5, days: 5, method: "credit", paidRatio: 0.25, items: [{ p: "DSK-WD-160", qty: 2, price: 1590 }, { p: "CHR-OFC-01", qty: 1, price: 1390 }], taxRate: 15 },
    { ref: 14, customer: 4, days: 2, method: "cash", paidRatio: 1, items: [{ p: "PPR-A4-CTN", qty: 4, price: 145 }] },
    { ref: 15, customer: 1, days: 0, method: "cash", paidRatio: 1, items: [{ p: "LAP-DEL-5540", qty: 1, price: 5250 }, { p: "USB-64G", qty: 5, price: 55 }], status: "draft" },
    { ref: 16, customer: 0, days: 26, method: "transfer", paidRatio: 1, items: [{ p: "LAP-DEL-5540", qty: 4, price: 5250 }, { p: "PRN-HP-4020", qty: 2, price: 1780 }] },
    { ref: 17, customer: 1, days: 21, method: "cash", paidRatio: 1, items: [{ p: "CHR-OFC-01", qty: 10, price: 1390 }, { p: "DSK-WD-160", qty: 4, price: 1590 }] },
    { ref: 18, customer: 4, days: 14, method: "card", paidRatio: 1, items: [{ p: "KBD-LOG-W60", qty: 25, price: 185 }, { p: "MOU-LOG-MX", qty: 20, price: 340 }, { p: "USB-64G", qty: 40, price: 55 }] },
    { ref: 19, customer: 3, days: 9, method: "transfer", paidRatio: 1, items: [{ p: "MON-SAM-27", qty: 10, price: 1050 }] },
    { ref: 20, customer: 2, days: 4, method: "transfer", paidRatio: 1, items: [{ p: "PRN-HP-4020", qty: 5, price: 1780 }] },
  ];

  for (const sd of saleDefs) {
    const subtotal = sd.items.reduce((s, it) => s + it.qty * it.price, 0);
    const taxRate = sd.taxRate ?? 0;
    const tax = r2((subtotal * taxRate) / 100);
    const total = r2(subtotal + tax);
    const isFinal = sd.status !== "draft";
    const paid = !isFinal ? 0 : sd.method === "credit" ? r2(total * sd.paidRatio) : total;
    const date = daysAgo(sd.days);
    const invoiceNo = `INV-${String(sd.ref).padStart(5, "0")}`;

    await db.sale.create({
      data: {
        companyId: co1.id,
        invoiceNo,
        contactId: customers[sd.customer].id,
        userId: sd.ref % 3 === 0 ? khaled.id : admin.id,
        date,
        subtotal,
        discount: 0,
        tax,
        total,
        paid,
        status: isFinal ? "final" : "draft",
        paymentMethod: sd.method,
        items: {
          create: sd.items.map((it) => ({
            productId: P(it.p).id,
            name: P(it.p).name,
            qty: it.qty,
            unitPrice: it.price,
            total: r2(it.qty * it.price),
          })),
        },
      },
    });

    if (isFinal) {
      const cashCode = sd.method === "transfer" ? "1020" : "1010";
      const cogs = sd.items.reduce((s, it) => s + it.qty * P(it.p).purchasePrice, 0);
      await postAutoJournal({
        companyId: co1.id,
        date,
        description: `فاتورة بيع ${invoiceNo}`,
        reference: `SALE-${invoiceNo}`,
        source: "auto-sale",
        lines: [
          { code: cashCode, debit: paid, description: "المقبوضات" },
          { code: "1200", debit: r2(total - paid), description: "مبيعات آجلة" },
          { code: "4010", credit: subtotal, description: "إيرادات مبيعات" },
          { code: "2100", credit: tax, description: "ضريبة القيمة المضافة" },
        ],
      });
      if (cogs > 0) {
        await postAutoJournal({
          companyId: co1.id,
          date,
          description: `تكلفة بضاعة فاتورة ${invoiceNo}`,
          reference: `SALE-${invoiceNo}`,
          source: "auto-sale",
          lines: [
            { code: "5010", debit: r2(cogs), description: "تكلفة البضاعة المباعة" },
            { code: "1300", credit: r2(cogs), description: "صرف من المخزون" },
          ],
        });
      }
    }
  }

  // حالات زتكا لبعض الفواتير (مُبلَّغ عنها مع QR و UUID وتجزئة)
  console.log("🛡️ حالات زتكا...");
  const zatcaReportedRefs = [1, 2, 4, 5];
  for (const ref of zatcaReportedRefs) {
    const invoiceNo = `INV-${String(ref).padStart(5, "0")}`;
    const sale = await db.sale.findFirst({ where: { companyId: co1.id, invoiceNo } });
    if (!sale) continue;
    const qrData = generateQrPayload({
      sellerName: co1.name,
      vatNumber: co1.taxNumber!,
      timestamp: sale.date,
      total: sale.total,
      vatTotal: sale.tax,
    });
    const uuid = crypto.randomUUID();
    const hash = crypto.createHash("sha256").update(`${invoiceNo}|${sale.total.toFixed(2)}|${uuid}`).digest("hex");
    await db.sale.update({
      where: { id: sale.id },
      data: {
        qrData,
        zatcaStatus: "REPORTED",
        zatcaUuid: uuid,
        zatcaHash: hash,
        zatcaSubmittedAt: sale.date,
      },
    });
  }
  // فواتير حديثة: QR مُولَّد لكن بانتظار الإرسال (لتجربة زر الإبلاغ)
  for (const ref of [12, 14, 20]) {
    const invoiceNo = `INV-${String(ref).padStart(5, "0")}`;
    const sale = await db.sale.findFirst({ where: { companyId: co1.id, invoiceNo } });
    if (!sale) continue;
    const qrData = generateQrPayload({
      sellerName: co1.name,
      vatNumber: co1.taxNumber!,
      timestamp: sale.date,
      total: sale.total,
      vatTotal: sale.tax,
    });
    await db.sale.update({ where: { id: sale.id }, data: { qrData } });
  }

  // تعديل المخزون الفعلي (المشتريات - المبيعات)
  console.log("📊 ضبط أرصدة المخزون...");
  const stockAdjustments: Record<string, number> = {};
  for (const pd of purchaseDefs) for (const it of pd.items) stockAdjustments[it.p] = (stockAdjustments[it.p] ?? 0) + it.qty;
  for (const sd of saleDefs) if (sd.status !== "draft") for (const it of sd.items) stockAdjustments[it.p] = (stockAdjustments[it.p] ?? 0) - it.qty;
  for (const [sku, delta] of Object.entries(stockAdjustments)) {
    const current = await db.product.findFirst({ where: { companyId: co1.id, sku } });
    if (current) {
      await db.product.update({
        where: { id: current.id },
        data: { stock: Math.max(0, r2(current.stock + delta)) },
      });
    }
  }

  // المصروفات (مع قيود تلقائية)
  console.log("🧾 المصروفات والقيود...");
  const expenseDefs = [
    { category: "إيجار", amount: 6000, days: 70, note: "إيجار المعرض — دفعة أولى" },
    { category: "رواتب وأجور", amount: 6500, days: 65, note: "رواتب الموظفين" },
    { category: "مرافق وكهرباء", amount: 1500, days: 60, note: "فاتورة الكهرباء" },
    { category: "تسويق وإعلان", amount: 2000, days: 55, note: "حملة إعلانية رقمية" },
    { category: "إيجار", amount: 6000, days: 40, note: "إيجار المعرض — دفعة ثانية" },
    { category: "رواتب وأجور", amount: 6500, days: 35, note: "رواتب الموظفين" },
    { category: "صيانة", amount: 750, days: 30, note: "صيانة مكيفات المعرض" },
    { category: "نقل وشحن", amount: 1200, days: 25, note: "شحن طلبية جدة" },
    { category: "مرافق وكهرباء", amount: 1400, days: 20, note: "فاتورة الكهرباء" },
    { category: "تسويق وإعلان", amount: 1500, days: 15, note: "إعلانات جوجل" },
    { category: "رواتب وأجور", amount: 6500, days: 5, note: "رواتب الموظفين" },
    { category: "عام", amount: 550, days: 3, note: "مستلزمات مكتبية متفرقة" },
  ];
  let expIdx = 0;
  for (const ed of expenseDefs) {
    expIdx++;
    const refNo = `EXP-${String(expIdx).padStart(4, "0")}`;
    const date = daysAgo(ed.days);
    await db.expense.create({
      data: { companyId: co1.id, category: ed.category, amount: ed.amount, date, refNo, note: ed.note },
    });
    await postAutoJournal({
      companyId: co1.id,
      date,
      description: `مصروف ${ed.category} — ${refNo}`,
      reference: `EXPENSE-${refNo}`,
      source: "auto-expense",
      lines: [
        { code: expenseAccountCode(ed.category), debit: ed.amount, description: ed.category },
        { code: "1010", credit: ed.amount, description: "دفع نقدي" },
      ],
    });
  }

  // قيد افتتاحي يدوي: رأس المال
  console.log("📒 القيود اليدوية...");
  const capitalCount = await db.journalEntry.count({ where: { companyId: co1.id } });
  await db.journalEntry.create({
    data: {
      companyId: co1.id,
      number: `JE-${String(capitalCount + 1).padStart(4, "0")}`,
      date: daysAgo(80),
      description: "قيد افتتاحي — رأس المال النقدي",
      reference: "OPENING",
      source: "manual",
      status: "posted",
      lines: {
        create: [
          { accountId: (await db.account.findFirst({ where: { companyId: co1.id, code: "1010" } }))!.id, debit: 120000, description: "نقدية بالصندوق" },
          { accountId: (await db.account.findFirst({ where: { companyId: co1.id, code: "1020" } }))!.id, debit: 180000, description: "نقدية بالبنك" },
          { accountId: (await db.account.findFirst({ where: { companyId: co1.id, code: "3010" } }))!.id, credit: 300000, description: "رأس المال" },
        ],
      },
    },
  });

  // مسودة قيد يدوي غير مترحلة (لتجربة ميزة الترحيل)
  const draftCount = await db.journalEntry.count({ where: { companyId: co1.id } });
  await db.journalEntry.create({
    data: {
      companyId: co1.id,
      number: `JE-${String(draftCount + 1).padStart(4, "0")}`,
      date: daysAgo(1),
      description: "مسودة — شراء أصول ثابتة (جهاز تكييف)",
      reference: null,
      source: "manual",
      status: "draft",
      lines: {
        create: [
          { accountId: (await db.account.findFirst({ where: { companyId: co1.id, code: "1500" } }))!.id, debit: 4200, description: "أصول ثابتة" },
          { accountId: (await db.account.findFirst({ where: { companyId: co1.id, code: "1010" } }))!.id, credit: 4200, description: "دفع نقدي" },
        ],
      },
    },
  });

  // ============ الإشعارات (شركة الأفق) ============
  console.log("🔔 الإشعارات...");
  const notificationDefs: {
    title: string;
    message: string;
    type: string;
    link: string;
    isRead?: boolean;
    hours: number;
  }[] = [
    { title: "دفعة محصلة", message: "تم تحصيل دفعة بقيمة 3,310.00 ر.س من الفاتورة INV-00010 الخاصة بعضو «مكتب النور للاستشارات»، والمتبقي على الفاتورة 3,310.00 ر.س.", type: "payment", link: "sales", hours: 26 },
    { title: "تنبيه مخزون منخفض", message: "صنفان وصلت إلى حد التنبيه: «يو إس بي فلاش 64GB» (المتوفر 9 والحد 10) و«مكتب خشبي 160سم» (المتوفر 2 والحد 2). يُنصح بإنشاء أمر شراء لتجديد المخزون.", type: "stock", link: "products", hours: 50 },
    { title: "فاتورة مبيعات جديدة", message: "تم إنشاء الفاتورة الضريبية INV-00020 بمبلغ 8,900.00 ر.س لعميل «مكتب النور للاستشارات» — تحويل بنكي.", type: "invoice", link: "sales", hours: 97 },
    { title: "مصروف جديد", message: "تم تسجيل مصروف «رواتب وأجور» بمبلغ 6,500.00 ر.س بمرجع EXP-0011.", type: "expense", link: "expenses", hours: 121 },
    { title: "المساعد الذكي جاهز", message: "يمكنك الآن سؤال المساعد الذكي عن مبيعاتك ومصروفاتك وأرصدة عملائك بلغة طبيعية — جرّبه من قسم «المساعد الذكي».", type: "system", link: "ai", hours: 130 },
    { title: "فاتورة شراء جديدة", message: "تم تسجيل فاتورة الشراء PO-00006 بمبلغ 6,578.00 ر.س (شاملة ضريبة القيمة المضافة) من مورد «شركة الإمداد الدولية».", type: "purchase", link: "purchases", hours: 147 },
    { title: "تذكير: موعد تقديم الإقرار الضريبي الشهري", message: "لا تنسَ تقديم إقرار ضريبة القيمة المضافة للشهر الحالي قبل انتهاء المهلة (30 يوماً من نهاية الفترة) لتجنب غرامات التأخير.", type: "vat", link: "vat", hours: 160 },
    { title: "فاتورة مبيعات جديدة", message: "تم إنشاء الفاتورة الضريبية INV-00019 بمبلغ 10,500.00 ر.س لعميل «مدرسة الأمل الأهلية» — تحويل بنكي.", type: "invoice", link: "sales", hours: 218 },
    { title: "تم تفعيل الفاتورة الإلكترونية (زتكا)", message: "تم تفعيل تكامل الفاتورة الإلكترونية مع منصة «فاتورة» في بيئة التجربة (Simulation) — فواتيرك الجديدة تتضمن رمز QR بصيغة TLV-Base64.", type: "system", link: "settings", isRead: true, hours: 240 },
    { title: "ترقية الباقة إلى الاحترافية", message: "تمت ترقية باقة «شركة الأفق للتجارة» من الأساسية إلى الاحترافية بنجاح. استمتع بالمساعد الذكي والتقارير المتقدمة وحدود أعلى للفواتير والمستخدمين.", type: "subscription", link: "plans", isRead: true, hours: 290 },
    { title: "رد فريق الدعم على تذكرتك", message: "رد فريق الدعم على تذكرتك «كيف أصدّر تقرير أعمار الذمم؟» — يمكنك مراجعة الرد من مركز الدعم الفني.", type: "support", link: "support", hours: 358 },
    { title: "مرحباً بك في النظام", message: "مرحباً بك في منصة إدارة الأعمال! ابدأ بإكمال بيانات منشأتك من «الإعدادات» ثم أنشئ أول فاتورة مبيعات من قسم الفواتير.", type: "system", link: "settings", isRead: true, hours: 1080 },
  ];
  await db.notification.createMany({
    data: notificationDefs.map((n) => ({
      companyId: co1.id,
      userId: null,
      title: n.title,
      message: n.message,
      type: n.type,
      link: n.link,
      isRead: n.isRead ?? false,
      createdAt: hoursAgo(n.hours),
    })),
  });

  // ============ الدعم الفني (شركة الأفق) ============
  console.log("🎫 تذاكر الدعم الفني...");
  const t1Date = daysAgo(16);
  await db.supportTicket.create({
    data: {
      companyId: co1.id,
      userId: sara.id,
      subject: "كيف أصدّر تقرير أعمار الذمم؟",
      category: "general",
      priority: "normal",
      status: "resolved",
      createdAt: t1Date,
      updatedAt: daysAgo(15),
      messages: {
        create: [
          {
            senderId: sara.id,
            message: "السلام عليكم، أحتاج تقرير أعمار الذمم (AR Aging) لأرصدة العملاء لغاية نهاية الشهر لأغراض المراجعة الداخلية. من أي قسم أستخرجه؟ وهل يمكن تصديره بصيغة Excel؟",
            createdAt: t1Date,
          },
          {
            isStaff: true,
            message: "🤖 وعليكم السلام ورحمة الله،\nتقرير أعمار الذمم متاح ضمن «مركز التقارير» في القائمة الجانبية، ويعرض أرصدة العملاء موزعة على فترات التقادم (0-30، 31-60، 61-90، أكثر من 90 يوماً).\nيمكنك تصديره بصيغتي Excel وPDF من زر «تصدير» أعلى الجدول بعد تحديد تاريخ نهاية الفترة.\nإن احتجت تقسيماً إضافياً (حسب مندوب المبيعات مثلاً) فسيتابع معك فريق الدعم البشري خلال ساعات العمل.",
            createdAt: minutesAfter(t1Date, 3),
          },
          {
            senderId: admin.id,
            isStaff: true,
            message: "أهلاً سارة، تأكيداً للرد الآلي: افتحي «مركز التقارير» ← «أعمار الذمم»، وحدّدي تاريخ النهاية المطلوب ثم اضغطي «تصدير Excel».\nالتقرير يشمل الرصيد الافتتاحي والفواتير والتحصيلات لكل عميل مع إجمالي كل فترة تقادم.\nأضفنا طلب الميزة الخاصة بالتقسيم حسب مندوب المبيعات وستصلك في التحديث القادم.\nنأمل إغلاق التذكرة إذا استوفى الرد طلبك، ونحن معك دائماً.",
            createdAt: daysAgo(15),
          },
        ],
      },
    },
  });

  const t2Date = daysAgo(4);
  await db.supportTicket.create({
    data: {
      companyId: co1.id,
      userId: sara.id,
      subject: "الفاتورة الإلكترونية لا تظهر رمز QR",
      category: "zatca",
      priority: "high",
      status: "answered",
      createdAt: t2Date,
      updatedAt: minutesAfter(t2Date, 2),
      messages: {
        create: [
          {
            senderId: sara.id,
            message: "عند طباعة الفاتورة الإلكترونية INV-00004 لا يظهر رمز QR في النسخة المطبوعة رغم أن حالة الفاتورة «مُبلَّغ عنها». ما الحل؟",
            createdAt: t2Date,
          },
          {
            isStaff: true,
            message: "🤖 أهلاً بك، جربي الخطوات التالية لحل مشكلة اختفاء رمز QR:\n1) حدّثي الصفحة وافتحي المعاينة من فاتورة حالتها «مُبلَّغ عنها» وليست مسودة.\n2) من نافذة الطباعة فعّلي خيار «طباعة الخلفيات والرسومات» وامسحي ذاكرة التخزين المؤقت للمتصفح.\n3) إن استمرت المشكلة فقد تكون مرتبطة بتأخر توليد الهاش في بيئة التجربة (Simulation) — سيراجع فريق الدعم التقني سجل الفاتورة ويتواصل معك خلال ساعات العمل.",
            createdAt: minutesAfter(t2Date, 2),
          },
        ],
      },
    },
  });

  await db.supportTicket.create({
    data: {
      companyId: co1.id,
      userId: admin.id,
      subject: "استفسار عن ترقية الباقة",
      category: "billing",
      priority: "normal",
      status: "open",
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
      messages: {
        create: [
          {
            senderId: admin.id,
            message: "السلام عليكم، نرغب في الاستفسار عن ترقية باقة المنشأة من الاحترافية إلى باقة المؤسسات: ما الميزات الإضافية بالضبط؟ وهل يمكن الدفع سنوياً بالتحويل البنكي؟ وشكراً.",
            createdAt: daysAgo(1),
          },
        ],
      },
    },
  });

  // ============ الإقرارات الضريبية (شركة الأفق) ============
  console.log("🧮 الإقرارات الضريبية...");
  const nowDate = new Date();
  const lastMonthStart = new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 1);
  const lastMonthEnd = new Date(nowDate.getFullYear(), nowDate.getMonth(), 0, 23, 59, 59, 999);
  const prevMonthStart = new Date(nowDate.getFullYear(), nowDate.getMonth() - 2, 1);
  const prevMonthEnd = new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 0, 23, 59, 59, 999);
  // منتصف الشهر الحالي (أو الآن إن لم يحن بعد — حتى لا يكون تاريخ تقديم مستقبلياً)
  const midThisMonth = new Date(nowDate.getFullYear(), nowDate.getMonth(), 15, 12, 0, 0);
  const filedAtLast = midThisMonth.getTime() > nowDate.getTime() ? nowDate : midThisMonth;
  const midPrevMonth = new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 15, 12, 0, 0);

  await db.vatDeclaration.create({
    data: {
      companyId: co1.id,
      periodStart: lastMonthStart,
      periodEnd: lastMonthEnd,
      status: "filed",
      salesAmount: 45000,
      outputVat: 6750,
      purchasesAmount: 18000,
      inputVat: 2700,
      netVat: 4050,
      filedAt: filedAtLast,
      notes: "إقرار شهري قُدّم عبر بوابة هيئة الزكاة والضريبة والجمارك.",
    },
  });
  await db.vatDeclaration.create({
    data: {
      companyId: co1.id,
      periodStart: prevMonthStart,
      periodEnd: prevMonthEnd,
      status: "filed",
      salesAmount: 42600,
      outputVat: 6390,
      purchasesAmount: 17300,
      inputVat: 2595,
      netVat: 3795,
      filedAt: midPrevMonth,
      notes: "إقرار شهري قُدّم عبر بوابة هيئة الزكاة والضريبة والجمارك.",
    },
  });

  // ============ سجلات البريد والواتساب (شركة الأفق) ============
  console.log("📧📨 سجلات البريد والواتساب...");
  await db.emailLog.create({
    data: {
      companyId: co1.id,
      toEmail: "info@riyadh-tech.sa",
      subject: "فاتورة ضريبية INV-00019 — شركة الأفق للتجارة",
      body: "<p>السلام عليكم،</p><p>مرفق نسخة من الفاتورة الضريبية INV-00019 بمبلغ 10,500.00 ر.س الصادرة بتاريخ اليوم.</p><p>شاكرين لكم حسن تعاونكم.</p><p>شركة الأفق للتجارة</p>",
      status: "simulated",
      createdAt: daysAgo(9),
    },
  });
  await db.emailLog.create({
    data: {
      companyId: co1.id,
      toEmail: "noor@consult.sa",
      subject: "فاتورة ضريبية INV-00020 — شركة الأفق للتجارة",
      body: "<p>فاتورة ضريبية INV-00020 بمبلغ 8,900.00 ر.س — مكتب النور للاستشارات.</p><p>يرجى السداد خلال مهلة الاتفاق.</p>",
      status: "simulated",
      createdAt: daysAgo(4),
    },
  });
  await db.whatsAppLog.create({
    data: {
      companyId: co1.id,
      toPhone: "966551112222",
      message: "شركة الأفق للتجارة: تم إصدار الفاتورة الضريبية INV-00019 بمبلغ 10,500.00 ر.س. شكراً لتعاملكم معنا.",
      status: "simulated",
      createdAt: daysAgo(9),
    },
  });
  await db.whatsAppLog.create({
    data: {
      companyId: co1.id,
      toPhone: "966555556666",
      message: "شركة الأفق للتجارة: تم إصدار الفاتورة الضريبية INV-00020 بمبلغ 8,900.00 ر.س. للاستفسار يرجى التواصل معنا. شكراً لتعاملكم معنا.",
      status: "simulated",
      createdAt: daysAgo(4),
    },
  });

  // ============ محادثة المساعد الذكي (شركة الأفق) ============
  console.log("🤖 محادثة المساعد الذكي...");
  await db.aiConversation.create({
    data: {
      companyId: co1.id,
      userId: admin.id,
      title: "تحليل المبيعات",
      createdAt: daysAgo(3),
      messages: {
        create: [
          { role: "user", content: "ما إجمالي مبيعاتي هذا الشهر؟", createdAt: daysAgo(3) },
          {
            role: "assistant",
            content: "بناءً على بيانات منشأتك، إجمالي مبيعاتك المسجلة حوالي 38,500 ر.س عبر 9 فواتير نهائية خلال آخر 30 يوماً، بمتوسط فاتورة يقارب 4,280 ر.س.\n\nأبرز الملاحظات:\n• أعلى الإيرادات من فئة الإلكترونيات (لابتوب وشاشات).\n• 3 فواتير آجلة لم تُحصّل بالكامل بعد بمتبقٍ يقارب 9,200 ر.س.\n• المبيعات أعلى بنحو 12% مقارنة بالشهر الماضي.\n\nهل تريد تفصيلاً حسب الصنف أو حسب العميل؟",
            createdAt: minutesAfter(daysAgo(3), 1),
          },
        ],
      },
    },
  });

  // ============ المرتجعات والمدفوعات وعروض الأسعار وسجل التدقيق (شركة الأفق) ============
  console.log("↩️ المرتجعات (إشعار دائن + مرتجع مشتريات)...");

  // إشعار دائن: مرتجع وحدة واحدة من أول بند بفاتورة INV-00010 (مكتب النور)
  const crnOriginal = await db.sale.findFirst({
    where: { companyId: co1.id, invoiceNo: "INV-00010" },
    include: { items: true },
  });
  if (crnOriginal && crnOriginal.items.length > 0) {
    const crnItem = crnOriginal.items[0];
    const crnSubtotal = r2(crnItem.unitPrice);
    const crnTax = r2((crnSubtotal * 15) / 100);
    const crnTotal = r2(crnSubtotal + crnTax);
    const crnDate = daysAgo(7);
    const crnProduct = crnItem.productId
      ? await db.product.findUnique({ where: { id: crnItem.productId } })
      : null;
    const crnCogs = crnProduct ? r2(crnProduct.purchasePrice) : 0;

    await db.sale.create({
      data: {
        companyId: co1.id,
        invoiceNo: "CRN-00001",
        kind: "credit-note",
        originalInvoiceNo: crnOriginal.invoiceNo,
        contactId: crnOriginal.contactId,
        userId: admin.id,
        date: crnDate,
        subtotal: crnSubtotal,
        discount: 0,
        tax: crnTax,
        total: crnTotal,
        paid: 0,
        status: "final",
        paymentMethod: "credit",
        note: "مرتجع جزئي — وحدة معيبة من الفاتورة INV-00010",
        items: {
          create: [
            {
              productId: crnItem.productId,
              name: crnItem.name,
              qty: 1,
              unitPrice: crnItem.unitPrice,
              total: crnSubtotal,
            },
          ],
        },
      },
    });

    // إرجاع الوحدة المرتجعة للمخزون
    if (crnItem.productId) {
      await db.product.update({
        where: { id: crnItem.productId },
        data: { stock: { increment: 1 } },
      });
    }

    // القيد المعكوس: إيراد + ضريبة مخرجات (مدين) ← عملاء (دائن)
    await postAutoJournal({
      companyId: co1.id,
      date: crnDate,
      description: "إشعار دائن CRN-00001 — مرتجع مبيعات",
      reference: "SALE-CRN-00001",
      source: "auto-sale",
      lines: [
        { code: "4010", debit: crnSubtotal, description: "إشعار دائن — مرتجع مبيعات" },
        { code: "2100", debit: crnTax, description: "إشعار دائن — مرتجع مبيعات" },
        { code: "1200", credit: crnTotal, description: "إشعار دائن — مرتجع مبيعات" },
      ],
    });
    // عكس تكلفة البضاعة المباعة
    if (crnCogs > 0) {
      await postAutoJournal({
        companyId: co1.id,
        date: crnDate,
        description: "عكس تكلفة بضاعة مرتجعة CRN-00001",
        reference: "SALE-CRN-00001",
        source: "auto-sale",
        lines: [
          { code: "1300", debit: crnCogs, description: "إرجاع للمخزون" },
          { code: "5010", credit: crnCogs, description: "عكس تكلفة البضاعة المباعة" },
        ],
      });
    }
  }

  // مرتجع مشتريات: إرجاع وحدة واحدة لأول بند بفاتورة PO-00002
  const prnOriginal = await db.purchase.findFirst({
    where: { companyId: co1.id, refNo: "PO-00002" },
    include: { items: true },
  });
  if (prnOriginal && prnOriginal.items.length > 0) {
    const prnItem = prnOriginal.items[0];
    const prnSubtotal = r2(prnItem.unitCost);
    const prnTax = r2((prnSubtotal * 15) / 100);
    const prnTotal = r2(prnSubtotal + prnTax);
    const prnDate = daysAgo(5);

    await db.purchase.create({
      data: {
        companyId: co1.id,
        refNo: "PRN-00001",
        kind: "return",
        originalRefNo: prnOriginal.refNo,
        contactId: prnOriginal.contactId,
        date: prnDate,
        subtotal: prnSubtotal,
        discount: 0,
        tax: prnTax,
        total: prnTotal,
        paid: 0,
        status: "received",
        note: "إرجاع وحدة معيبة لفاتورة الشراء PO-00002",
        items: {
          create: [
            {
              productId: prnItem.productId,
              name: prnItem.name,
              qty: 1,
              unitCost: prnItem.unitCost,
              total: prnSubtotal,
            },
          ],
        },
      },
    });

    // إخراج الوحدة المرتجعة من المخزون
    if (prnItem.productId) {
      await db.product.update({
        where: { id: prnItem.productId },
        data: { stock: { decrement: 1 } },
      });
    }

    // قيد المرتجع: موردون (مدين) ← مخزون + ضريبة مدخلات (دائن)
    await postAutoJournal({
      companyId: co1.id,
      date: prnDate,
      description: "مرتجع مشتريات PRN-00001",
      reference: "PURCHASE-PRN-00001",
      source: "auto-purchase",
      lines: [
        { code: "2010", debit: prnTotal, description: "مرتجع مشتريات" },
        { code: "1300", credit: prnSubtotal, description: "مرتجع مشتريات" },
        { code: "1140", credit: prnTax, description: "مرتجع مشتريات" },
      ],
    });
  }

  // ============ المدفوعات (سندات القبض والصرف) ============
  console.log("💳 المدفوعات (سندات القبض والصرف)...");
  const inv6 = await db.sale.findFirst({ where: { companyId: co1.id, invoiceNo: "INV-00006" } });
  const po3 = await db.purchase.findFirst({ where: { companyId: co1.id, refNo: "PO-00003" } });

  // RV-00001: تحصيل 5,000 من فاتورة آجلة (INV-00006) بتحويل بنكي
  if (inv6) {
    const rv1Amount = 5000;
    await db.payment.create({
      data: {
        companyId: co1.id,
        voucherNo: "RV-00001",
        direction: "receipt",
        contactId: inv6.contactId,
        saleId: inv6.id,
        amount: rv1Amount,
        method: "transfer",
        date: daysAgo(4),
        note: "دفعة من الفاتورة INV-00006",
      },
    });
    await db.sale.update({ where: { id: inv6.id }, data: { paid: r2(inv6.paid + rv1Amount) } });
    await postAutoJournal({
      companyId: co1.id,
      date: daysAgo(4),
      description: "سند قبض RV-00001",
      reference: "PAY-RV-00001",
      source: "auto-payment",
      lines: [
        { code: "1020", debit: rv1Amount, description: "تحصيل من عميل" },
        { code: "1200", credit: rv1Amount, description: "تحصيل من عميل" },
      ],
    });
  }

  // RV-00002: دفعة مقدمة نقدي من مدرسة الأمل بدون فاتورة
  await db.payment.create({
    data: {
      companyId: co1.id,
      voucherNo: "RV-00002",
      direction: "receipt",
      contactId: customers[3].id,
      amount: 2000,
      method: "cash",
      date: daysAgo(3),
      note: "دفعة مقدمة على مشتريات مستقبلية",
    },
  });
  await postAutoJournal({
    companyId: co1.id,
    date: daysAgo(3),
    description: "سند قبض RV-00002",
    reference: "PAY-RV-00002",
    source: "auto-payment",
    lines: [
      { code: "1010", debit: 2000, description: "تحصيل من عميل" },
      { code: "1200", credit: 2000, description: "تحصيل من عميل" },
    ],
  });

  // PV-00001: سداد نقدي 2,000 من فاتورة الشراء PO-00003
  if (po3) {
    const pv1Amount = 2000;
    await db.payment.create({
      data: {
        companyId: co1.id,
        voucherNo: "PV-00001",
        direction: "payment",
        contactId: po3.contactId,
        purchaseId: po3.id,
        amount: pv1Amount,
        method: "cash",
        date: daysAgo(3),
        note: "سداد جزئي لفاتورة الشراء PO-00003",
      },
    });
    await db.purchase.update({ where: { id: po3.id }, data: { paid: r2(po3.paid + pv1Amount) } });
    await postAutoJournal({
      companyId: co1.id,
      date: daysAgo(3),
      description: "سند صرف PV-00001",
      reference: "PAY-PV-00001",
      source: "auto-payment",
      lines: [
        { code: "2010", debit: pv1Amount, description: "دفع لمورد" },
        { code: "1010", credit: pv1Amount, description: "دفع لمورد" },
      ],
    });
  }

  // PV-00002: دفع تحويل بنكي 1,500 لمورد الأثاث على الحساب
  await db.payment.create({
    data: {
      companyId: co1.id,
      voucherNo: "PV-00002",
      direction: "payment",
      contactId: suppliers[3].id,
      amount: 1500,
      method: "transfer",
      date: daysAgo(2),
      note: "دفعة على الحساب",
    },
  });
  await postAutoJournal({
    companyId: co1.id,
    date: daysAgo(2),
    description: "سند صرف PV-00002",
    reference: "PAY-PV-00002",
    source: "auto-payment",
    lines: [
      { code: "2010", debit: 1500, description: "دفع لمورد" },
      { code: "1020", credit: 1500, description: "دفع لمورد" },
    ],
  });

  // ============ عروض الأسعار ============
  console.log("📄 عروض الأسعار...");
  const quotationDefs: {
    ref: number; customer: number; days: number; validDays: number; status: string;
    discount?: number; items: { p: string; qty: number; price: number }[];
  }[] = [
    {
      ref: 1, customer: 0, days: 6, validDays: 24, status: "draft",
      items: [{ p: "LAP-DEL-5540", qty: 2, price: 5250 }, { p: "MON-SAM-27", qty: 2, price: 1050 }],
    },
    {
      ref: 2, customer: 1, days: 4, validDays: 20, status: "sent", discount: 340,
      items: [{ p: "CHR-OFC-01", qty: 6, price: 1390 }],
    },
    {
      ref: 3, customer: 2, days: 9, validDays: 10, status: "accepted",
      items: [{ p: "PRN-HP-4020", qty: 2, price: 1780 }, { p: "INK-HP-26A", qty: 4, price: 320 }],
    },
  ];
  for (const qd of quotationDefs) {
    const qtSubtotal = qd.items.reduce((s, it) => s + it.qty * it.price, 0);
    const qtDiscount = qd.discount ?? 0;
    const qtTaxable = Math.max(0, qtSubtotal - qtDiscount);
    const qtTax = r2((qtTaxable * 15) / 100);
    const qtTotal = r2(qtTaxable + qtTax);
    await db.quotation.create({
      data: {
        companyId: co1.id,
        quoteNo: `QT-${String(qd.ref).padStart(5, "0")}`,
        contactId: customers[qd.customer].id,
        userId: khaled.id,
        date: daysAgo(qd.days),
        validUntil: new Date(Date.now() + qd.validDays * 86400000),
        subtotal: r2(qtSubtotal),
        discount: qtDiscount,
        tax: qtTax,
        total: qtTotal,
        status: qd.status,
        note: qd.status === "draft" ? "بانتظار مراجعة التسعير" : null,
        items: {
          create: qd.items.map((it) => ({
            productId: P(it.p).id,
            name: P(it.p).name,
            qty: it.qty,
            unitPrice: it.price,
            total: r2(it.qty * it.price),
          })),
        },
      },
    });
  }

  // ============ الوحدات المتقدمة: تعدد العملات + الرواتب + الأصول + الفواتير المتكررة ============
  const daysFromNow = (n: number) => new Date(Date.now() + n * 86400000);

  // فاتورة تصدير بالدولار الأمريكي — القيود تُرحَّل بمعادل الريال تلقائياً
  console.log("💱 فاتورة تصدير بعملة أجنبية (USD)...");
  const usdRate = 3.75;
  const usdSubtotal = 1400; // دولار — لابتوب واحد
  const usdSar = r2(usdSubtotal * usdRate);
  const usdDate = daysAgo(3);
  await db.sale.create({
    data: {
      companyId: co1.id,
      invoiceNo: "INV-00022",
      contactId: customers[5].id,
      userId: admin.id,
      date: usdDate,
      subtotal: usdSubtotal,
      discount: 0,
      tax: 0, // صادرات — معدل صفري
      total: usdSubtotal,
      paid: usdSubtotal,
      status: "final",
      paymentMethod: "transfer",
      currency: "USD",
      exchangeRate: usdRate,
      note: "فاتورة تصدير بالدولار الأمريكي — القيود مرحّلة بمعادل الريال",
      items: {
        create: [
          { productId: P("LAP-DEL-5540").id, name: P("LAP-DEL-5540").name, qty: 1, unitPrice: usdSubtotal, total: usdSubtotal },
        ],
      },
    },
  });
  await db.product.update({ where: { id: P("LAP-DEL-5540").id }, data: { stock: { decrement: 1 } } });
  await postAutoJournal({
    companyId: co1.id,
    date: usdDate,
    description: "فاتورة تصدير INV-00022 (USD)",
    reference: "SALE-INV-00022",
    source: "auto-sale",
    lines: [
      { code: "1020", debit: usdSar, description: `مقبوضات تصدير (${usdSubtotal}$ × ${usdRate})` },
      { code: "4010", credit: usdSar, description: "إيرادات مبيعات — معادل بالريال" },
    ],
  });
  await postAutoJournal({
    companyId: co1.id,
    date: usdDate,
    description: "تكلفة بضاعة فاتورة INV-00022",
    reference: "SALE-INV-00022",
    source: "auto-sale",
    lines: [
      { code: "5010", debit: P("LAP-DEL-5540").purchasePrice, description: "تكلفة البضاعة المباعة" },
      { code: "1300", credit: P("LAP-DEL-5540").purchasePrice, description: "صرف من المخزون" },
    ],
  });
  {
    const usdSale = await db.sale.findFirst({ where: { companyId: co1.id, invoiceNo: "INV-00022" } });
    if (usdSale) {
      await db.sale.update({
        where: { id: usdSale.id },
        data: {
          qrData: generateQrPayload({
            sellerName: co1.name,
            vatNumber: co1.taxNumber!,
            timestamp: usdSale.date,
            total: usdSale.total,
            vatTotal: usdSale.tax,
          }),
        },
      });
    }
  }

  // فاتورة شراء استيراد بالدولار الأمريكي
  console.log("🧳 فاتورة شراء استيراد بعملة أجنبية (USD)...");
  const impSubtotal = 90; // دولار — 10 وحدات USB
  const impSar = r2(impSubtotal * usdRate);
  const impDate = daysAgo(10);
  await db.purchase.create({
    data: {
      companyId: co1.id,
      refNo: "PO-00008",
      contactId: suppliers[1].id,
      date: impDate,
      subtotal: impSubtotal,
      discount: 0,
      tax: 0,
      total: impSubtotal,
      paid: impSubtotal,
      status: "received",
      currency: "USD",
      exchangeRate: usdRate,
      note: "استيراد بالدولار الأمريكي — القيود بمعادل الريال",
      items: {
        create: [
          { productId: P("USB-64G").id, name: P("USB-64G").name, qty: 10, unitCost: 9, total: impSubtotal },
        ],
      },
    },
  });
  await db.product.update({ where: { id: P("USB-64G").id }, data: { stock: { increment: 10 } } });
  await postAutoJournal({
    companyId: co1.id,
    date: impDate,
    description: "فاتورة شراء استيراد PO-00008 (USD)",
    reference: "PURCHASE-PO-00008",
    source: "auto-purchase",
    lines: [
      { code: "1300", debit: impSar, description: `استيراد مخزون (${impSubtotal}$ × ${usdRate})` },
      { code: "1020", credit: impSar, description: "سداد استيراد — معادل بالريال" },
    ],
  });

  // ============ الرواتب (الموارد البشرية) ============
  console.log("👥 الرواتب — الموظفون ومسير الشهر الماضي...");
  const employeeDefs = [
    { name: "محمد الغامدي", nationalId: "1023456789", position: "المدير التنفيذي", baseSalary: 15000, housingAllowance: 3750, otherAllowance: 0, otherDeduction: 0, gosiApplicable: true, phone: "0551230001", iban: "SA0380000000608010167519", bankName: "مصرف الراجحي" },
    { name: "فاطمة الزهراني", nationalId: "1098765432", position: "محاسب أول", baseSalary: 9000, housingAllowance: 2250, otherAllowance: 500, otherDeduction: 0, gosiApplicable: true, phone: "0551230002", iban: "SA4420000001234567891234", bankName: "البنك الأهلي" },
    { name: "سعيد العتيبي", nationalId: "1045678901", position: "مندوب مبيعات", baseSalary: 7000, housingAllowance: 1750, otherAllowance: 1000, otherDeduction: 0, gosiApplicable: true, phone: "0551230003", iban: "SA5530000004567891234567", bankName: "بنك الرياض" },
    { name: "راميش كومار", nationalId: "2345678901", position: "أمين مستودع", baseSalary: 4500, housingAllowance: 900, otherAllowance: 0, otherDeduction: 0, gosiApplicable: false, phone: "0551230004", iban: "SA6640000007890123456789", bankName: "بنك ساب" },
    { name: "إبراهيم حسن", nationalId: "2567890123", position: "سائق", baseSalary: 3500, housingAllowance: 700, otherAllowance: 0, otherDeduction: 200, gosiApplicable: false, phone: "0551230005", iban: null, bankName: null },
  ];
  const employees = await Promise.all(
    employeeDefs.map((e) => db.employee.create({ data: { ...e, companyId: co1.id } }))
  );

  // مسير رواتب الشهر الماضي — معالج بقيد آلي متوازن
  const lastMonth = new Date();
  lastMonth.setDate(1);
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const prMonth = lastMonth.getMonth() + 1;
  const prYear = lastMonth.getFullYear();
  const periodLabel = `${prYear}-${String(prMonth).padStart(2, "0")}`;

  const slipDefs = employeeDefs.map((e) => {
    const allowances = e.housingAllowance + e.otherAllowance;
    const gosiBase = e.baseSalary + e.housingAllowance;
    const gosiEmployee = e.gosiApplicable ? r2(gosiBase * 0.0975) : 0; // حصة الموظف 9.75%
    const gosiEmployer = e.gosiApplicable ? r2(gosiBase * 0.1175) : 0; // حصة المنشأة 11.75%
    return {
      allowances,
      gosiEmployee,
      gosiEmployer,
      netPay: r2(e.baseSalary + allowances - e.otherDeduction - gosiEmployee),
    };
  });
  const prGross = r2(slipDefs.reduce((s, x, i) => s + employeeDefs[i].baseSalary + x.allowances, 0));
  const prDeductions = r2(slipDefs.reduce((s, x, i) => s + employeeDefs[i].otherDeduction, 0));
  const prGosiEE = r2(slipDefs.reduce((s, x) => s + x.gosiEmployee, 0));
  const prGosiER = r2(slipDefs.reduce((s, x) => s + x.gosiEmployer, 0));
  const prNet = r2(slipDefs.reduce((s, x) => s + x.netPay, 0));

  const payrollRun = await db.payrollRun.create({
    data: {
      companyId: co1.id,
      month: prMonth,
      year: prYear,
      status: "processed",
      note: "مسير الشهر الماضي — بيانات تجريبية",
      processedAt: daysAgo(12),
      payslips: {
        create: slipDefs.map((x, i) => ({
          employeeId: employees[i].id,
          baseSalary: employeeDefs[i].baseSalary,
          allowances: x.allowances,
          deductions: employeeDefs[i].otherDeduction,
          gosiEmployee: x.gosiEmployee,
          gosiEmployer: x.gosiEmployer,
          netPay: x.netPay,
        })),
      },
    },
  });
  await postAutoJournal({
    companyId: co1.id,
    date: daysAgo(12),
    description: `مسير رواتب ${periodLabel}`,
    reference: `PAYRUN-${periodLabel}`,
    source: "auto-payroll",
    lines: [
      { code: "5100", debit: prGross, description: "رواتب وأجور مستحقة" },
      { code: "5110", debit: prGosiER, description: "التأمينات — حصة المنشأة" },
      { code: "2110", credit: r2(prGosiEE + prGosiER), description: "مستحقات التأمينات GOSI" },
      { code: "2120", credit: prNet, description: "رواتب مستحقة الدفع" },
      { code: "2130", credit: prDeductions, description: "سلف واستقطاعات موظفين" },
    ],
  });

  // ============ الأصول الثابتة والإهلاك ============
  console.log("🏭 الأصول الثابتة والإهلاك...");
  const assetDefs = [
    { name: "سيارة نقل تويوتا هايس", category: "سيارات", days: 300, cost: 135000, salvageValue: 25000, usefulLifeYears: 5, note: "لنقل البضائع بين الفروع" },
    { name: "أجهزة حاسب ومخدّمات", category: "أجهزة حاسب", days: 210, cost: 48000, salvageValue: 6000, usefulLifeYears: 3, note: "تجهيز قسم المحاسبة والدعم" },
    { name: "أثاث وتجهيزات مكتبية", category: "أثاث", days: 120, cost: 22000, salvageValue: 2000, usefulLifeYears: 6, note: null },
  ];
  const assets = await Promise.all(
    assetDefs.map((a) =>
      db.fixedAsset.create({
        data: {
          companyId: co1.id,
          name: a.name,
          category: a.category,
          purchaseDate: daysAgo(a.days),
          cost: a.cost,
          salvageValue: a.salvageValue,
          usefulLifeYears: a.usefulLifeYears,
          note: a.note,
        },
      })
    )
  );
  // قيود شراء الأصول (نقداً)
  for (const a of assets) {
    await postAutoJournal({
      companyId: co1.id,
      date: a.purchaseDate,
      description: `شراء أصل ثابت: ${a.name}`,
      reference: `ASSET-ACQ-${a.id}`,
      source: "auto-depreciation",
      lines: [
        { code: "1500", debit: a.cost, description: "أصول ثابتة" },
        { code: "1010", credit: a.cost, description: "شراء نقدي" },
      ],
    });
  }

  // ترحيل إهلاك الشهر الماضي (قسط شهري لكل أصل نشط)
  let depTotal = 0;
  for (const a of assets) {
    const monthly = r2((a.cost - a.salvageValue) / (a.usefulLifeYears * 12));
    await db.depreciationEntry.create({
      data: { companyId: co1.id, assetId: a.id, period: periodLabel, amount: monthly, date: daysAgo(12) },
    });
    await db.fixedAsset.update({ where: { id: a.id }, data: { accumulated: monthly } });
    depTotal = r2(depTotal + monthly);
  }
  await postAutoJournal({
    companyId: co1.id,
    date: daysAgo(12),
    description: `إهلاك الأصول الثابتة لفترة ${periodLabel}`,
    reference: `DEPR-${periodLabel}`,
    source: "auto-depreciation",
    lines: [
      { code: "5500", debit: depTotal, description: "مصروف إهلاك الفترة" },
      { code: "1510", credit: depTotal, description: "مجمع إهلاك الأصول" },
    ],
  });

  // ============ الفواتير المتكررة ============
  console.log("🔁 الفواتير المتكررة...");
  await db.recurringInvoice.create({
    data: {
      companyId: co1.id,
      contactId: customers[2].id,
      frequency: "monthly",
      nextRunAt: daysFromNow(12),
      lastRunAt: daysAgo(18),
      generatedCount: 3,
      taxRate: 15,
      discount: 0,
      paymentMethod: "transfer",
      note: "عقد صيانة أجهزة سنوي — يُفوتر شهرياً",
      isActive: true,
      items: {
        create: [
          { name: "عقد صيانة وقائية شهري (10 أجهزة)", qty: 1, unitPrice: 1500 },
          { name: "زيارة فحص ميدانية", qty: 1, unitPrice: 250 },
        ],
      },
    },
  });
  await db.recurringInvoice.create({
    data: {
      companyId: co1.id,
      contactId: customers[0].id,
      frequency: "quarterly",
      nextRunAt: daysFromNow(45),
      lastRunAt: daysAgo(46),
      generatedCount: 1,
      taxRate: 15,
      discount: 0,
      paymentMethod: "credit",
      note: "تجهيزات واشتراك دعم فني ربع سنوي",
      isActive: true,
      items: {
        create: [
          { productId: P("USB-64G").id, name: P("USB-64G").name, qty: 10, unitPrice: 55 },
          { name: "حزمة دعم فني (ربع سنوي)", qty: 1, unitPrice: 800 },
        ],
      },
    },
  });

  // سجلات تدقيق وإشعار للوحدات الجديدة
  await db.auditLog.createMany({
    data: [
      {
        companyId: co1.id, userId: sara.id, username: "sara",
        action: "payroll.run", entity: "payrollRun", entityId: payrollRun.id,
        details: JSON.stringify({ month: prMonth, year: prYear, employeesCount: employees.length, netTotal: prNet }),
        createdAt: daysAgo(12),
      },
      {
        companyId: co1.id, userId: sara.id, username: "sara",
        action: "asset.depreciation.run", entity: "period", entityId: periodLabel,
        details: JSON.stringify({ period: periodLabel, totalAmount: depTotal, assetsCount: assets.length }),
        createdAt: daysAgo(12),
      },
      {
        companyId: co1.id, userId: admin.id, username: "admin",
        action: "recurring.create", entity: "recurring", entityId: "monthly-maintenance",
        details: JSON.stringify({ frequency: "monthly", note: "عقد صيانة شهري" }),
        createdAt: daysAgo(40),
      },
    ],
  });
  await db.notification.create({
    data: {
      companyId: co1.id,
      title: "اكتمل مسير الرواتب",
      message: `تم ترحيل مسير رواتب ${periodLabel} لعدد ${employees.length} موظفين بصافي ${prNet.toLocaleString("ar-EG")} ر.س`,
      type: "system",
      link: "payroll",
    },
  });

  // ============ سجل التدقيق ============
  console.log("🕵️ سجل التدقيق...");
  await db.auditLog.createMany({
    data: [
      {
        companyId: co1.id, userId: admin.id, username: "admin",
        action: "auth.login", entity: "user", entityId: admin.id,
        details: JSON.stringify({ ip: "192.168.1.10", device: "ويب" }),
        createdAt: hoursAgo(30),
      },
      {
        companyId: co1.id, userId: admin.id, username: "admin",
        action: "sale.create", entity: "sale", entityId: "INV-00020",
        details: JSON.stringify({ invoiceNo: "INV-00020", total: 8900, status: "final" }),
        createdAt: hoursAgo(97),
      },
      {
        companyId: co1.id, userId: sara.id, username: "sara",
        action: "settings.update", entity: "company", entityId: co1.id,
        details: JSON.stringify({ fields: ["taxNumber", "crNumber"] }),
        createdAt: hoursAgo(200),
      },
      {
        companyId: co1.id, userId: admin.id, username: "admin",
        action: "payment.create", entity: "payment", entityId: "RV-00001",
        details: JSON.stringify({ voucherNo: "RV-00001", direction: "receipt", amount: 5000, method: "transfer" }),
        createdAt: hoursAgo(96),
      },
      {
        companyId: co1.id, userId: khaled.id, username: "khaled",
        action: "quotation.create", entity: "quotation", entityId: "QT-00001",
        details: JSON.stringify({ quoteNo: "QT-00001", total: 14490, status: "draft" }),
        createdAt: hoursAgo(144),
      },
    ],
  });

  // ============ المنشأة 2: مؤسسة النخبة للمقاولات ============
  console.log("🏢 إنشاء المنشأة الثانية (مؤسسة النخبة للمقاولات)...");
  const co2 = await db.company.create({
    data: {
      name: "مؤسسة النخبة للمقاولات",
      slug: "nokhba-contracting",
      currency: "SAR",
      phone: "0559876543",
      email: "info@nokhba.sa",
      address: "جدة — حي الروضة، شارع الأمير سلطان",
      plan: "trial",
      // العنوان الوطني
      buildingNo: "2341",
      streetName: "شارع الأمير سلطان",
      district: "الروضة",
      city: "جدة",
      postalCode: "23433",
      additionalNo: "732",
    },
  });
  await db.membership.create({ data: { userId: admin.id, companyId: co2.id, role: "OWNER" } });
  await db.membership.create({ data: { userId: sara.id, companyId: co2.id, role: "ADMIN" } });
  await db.account.createMany({ data: DEFAULT_COA.map((a) => ({ ...a, companyId: co2.id })) });

  const p2 = await Promise.all(
    [
      { name: "أسمنت مقاوم 50كجم", sku: "CEM-50", category: "مواد بناء", unit: "كيس", salePrice: 22, purchasePrice: 16, stock: 800, alertQuantity: 200 },
      { name: "حديد تسليح 12مم (طن)", sku: "STEEL-12", category: "مواد بناء", unit: "طن", salePrice: 3450, purchasePrice: 3150, stock: 12, alertQuantity: 3 },
      { name: "طلاء أبيض 20لتر", sku: "PNT-W20", category: "دهانات", unit: "علبة", salePrice: 145, purchasePrice: 105, stock: 60, alertQuantity: 15 },
    ].map((p) => db.product.create({ data: { ...p, companyId: co2.id } }))
  );

  const c2 = await db.contact.create({
    data: { name: "شركة تطوير الإسكان", phone: "0554445555", type: "customer", companyId: co2.id },
  });
  await db.contact.create({
    data: { name: "مصنع جدة للحديد", phone: "0556667777", type: "supplier", companyId: co2.id },
  });

  const s2subtotal = 30 * 22 + 4 * 3450;
  await db.sale.create({
    data: {
      companyId: co2.id,
      invoiceNo: "INV-00001",
      contactId: c2.id,
      userId: admin.id,
      date: daysAgo(10),
      subtotal: s2subtotal,
      discount: 0,
      tax: 0,
      total: r2(s2subtotal),
      paid: r2(s2subtotal * 0.7),
      status: "final",
      paymentMethod: "credit",
      items: {
        create: [
          { productId: p2[0].id, name: p2[0].name, qty: 30, unitPrice: 22, total: 660 },
          { productId: p2[1].id, name: p2[1].name, qty: 4, unitPrice: 3450, total: 13800 },
        ],
      },
    },
  });
  await postAutoJournal({
    companyId: co2.id,
    date: daysAgo(10),
    description: "فاتورة بيع INV-00001",
    reference: "SALE-INV-00001",
    source: "auto-sale",
    lines: [
      { code: "1010", debit: r2(s2subtotal * 0.7), description: "المقبوضات" },
      { code: "1200", debit: r2(s2subtotal * 0.3), description: "مبيعات آجلة" },
      { code: "4010", credit: s2subtotal, description: "إيرادات مبيعات" },
    ],
  });

  await db.expense.create({
    data: { companyId: co2.id, category: "نقل وشحن", amount: 900, date: daysAgo(5), refNo: "EXP-0001", note: "نقل مواد للموقع" },
  });
  await postAutoJournal({
    companyId: co2.id,
    date: daysAgo(5),
    description: "مصروف نقل وشحن — EXP-0001",
    reference: "EXPENSE-EXP-0001",
    source: "auto-expense",
    lines: [
      { code: "5900", debit: 900, description: "نقل وشحن" },
      { code: "1010", credit: 900, description: "دفع نقدي" },
    ],
  });

  // ============ المنشأة 3: متجر الواحة الإلكتروني (معلّقة — لإدارة المنصة) ============
  console.log("🏢 إنشاء المنشأة الثالثة (متجر الواحة — معلّقة)...");
  const co3 = await db.company.create({
    data: {
      name: "متجر الواحة الإلكتروني",
      slug: "waha-store",
      currency: "SAR",
      taxNumber: "310555888800003",
      crNumber: "4030112233",
      status: "suspended",
      phone: "0553219876",
      email: "support@waha.store",
      address: "الدمام — حي الفيصلية",
      plan: "basic",
      // العنوان الوطني
      buildingNo: "4521",
      streetName: "شارع الأمير محمد بن فهد",
      district: "الفيصلية",
      city: "الدمام",
      postalCode: "32241",
      additionalNo: "419",
    },
  });
  await db.membership.create({ data: { userId: mona.id, companyId: co3.id, role: "OWNER" } });
  await db.account.createMany({ data: DEFAULT_COA.map((a) => ({ ...a, companyId: co3.id })) });

  const p3 = await Promise.all(
    [
      { name: "عبوة عصير مانجو 1لتر", sku: "JCE-MNG-1L", category: "مشروبات", unit: "عبوة", salePrice: 9, purchasePrice: 6, stock: 320, alertQuantity: 60 },
      { name: "شوكولاتة داكنة 85%", sku: "CHC-DK-85", category: "حلويات", unit: "قطعة", salePrice: 12, purchasePrice: 7.5, stock: 150, alertQuantity: 30 },
    ].map((p) => db.product.create({ data: { ...p, companyId: co3.id } }))
  );
  const c3 = await db.contact.create({
    data: { name: "بقالة الحي الشمالي", phone: "0552223333", type: "customer", companyId: co3.id },
  });
  const s3subtotal = 40 * 9 + 25 * 12;
  const s3tax = r2(s3subtotal * 0.15);
  const s3total = r2(s3subtotal + s3tax);
  await db.sale.create({
    data: {
      companyId: co3.id,
      invoiceNo: "INV-00001",
      contactId: c3.id,
      userId: mona.id,
      date: daysAgo(12),
      subtotal: s3subtotal,
      discount: 0,
      tax: s3tax,
      total: s3total,
      paid: s3total,
      status: "final",
      paymentMethod: "cash",
      items: {
        create: [
          { productId: p3[0].id, name: p3[0].name, qty: 40, unitPrice: 9, total: 360 },
          { productId: p3[1].id, name: p3[1].name, qty: 25, unitPrice: 12, total: 300 },
        ],
      },
    },
  });
  await postAutoJournal({
    companyId: co3.id,
    date: daysAgo(12),
    description: "فاتورة بيع INV-00001",
    reference: "SALE-INV-00001",
    source: "auto-sale",
    lines: [
      { code: "1010", debit: s3total, description: "المقبوضات" },
      { code: "4010", credit: s3subtotal, description: "إيرادات مبيعات" },
      { code: "2100", credit: s3tax, description: "ضريبة القيمة المضافة" },
    ],
  });

  // ============ ورديات كاشير تجريبية (مغلقة) ============
  console.log("💳 ورديات الكاشير...");
  await db.posShift.create({
    data: {
      companyId: co1.id,
      branchId: branchRiyadh.id,
      userId: khaled.id,
      openedAt: hoursAgo(26),
      closedAt: hoursAgo(18),
      status: "closed",
      openingCash: 300,
      countedCash: 3420,
      expectedCash: 3410,
      cashDifference: 10,
      salesCount: 6,
      salesTotal: 3110,
      note: "وردية أمس — أغلقها خالد",
    },
  });
  await db.posShift.create({
    data: {
      companyId: co1.id,
      branchId: branchMalaz.id,
      userId: sara.id,
      openedAt: hoursAgo(50),
      closedAt: hoursAgo(42),
      status: "closed",
      openingCash: 200,
      countedCash: 1560,
      expectedCash: 1560,
      cashDifference: 0,
      salesCount: 4,
      salesTotal: 1360,
      note: "وردية فرع الملز",
    },
  });

  // ============ الصفحات التسويقية العامة ============
  await seedMarketing();

  // ============ ملخص ============
  const [users, companies, sales, purchases, expenses, entries, accounts, notifications, tickets, declarations, emailLogs, whatsappLogs, payments, quotations, auditLogs, employeesCount, payrollRuns, assetsCount, recurringCount] = await Promise.all([
    db.user.count(),
    db.company.count(),
    db.sale.count(),
    db.purchase.count(),
    db.expense.count(),
    db.journalEntry.count(),
    db.account.count(),
    db.notification.count(),
    db.supportTicket.count(),
    db.vatDeclaration.count(),
    db.emailLog.count(),
    db.whatsAppLog.count(),
    db.payment.count(),
    db.quotation.count(),
    db.auditLog.count(),
    db.employee.count(),
    db.payrollRun.count(),
    db.fixedAsset.count(),
    db.recurringInvoice.count(),
  ]);

  console.log("\n✅ اكتمل الزرع:");
  console.table({
    المستخدمون: users,
    المنشآت: companies,
    فواتير_البيع: sales,
    فواتير_الشراء: purchases,
    المصروفات: expenses,
    القيود_المحاسبية: entries,
    الحسابات: accounts,
    الإشعارات: notifications,
    تذاكر_الدعم: tickets,
    الإقرارات_الضريبية: declarations,
    سجلات_البريد: emailLogs,
    سجلات_الواتساب: whatsappLogs,
    المدفوعات: payments,
    عروض_الأسعار: quotations,
    سجل_التدقيق: auditLogs,
    الموظفون: employeesCount,
    مسيرات_الرواتب: payrollRuns,
    الأصول_الثابتة: assetsCount,
    القوالب_المتكررة: recurringCount,
  });
  console.log("\n🔑 حسابات الدخول:");
  console.log("   admin / admin123  → المالك + مدير المنصة (منشآت: الأفق + النخبة)");
  console.log("   sara  / sara123   → محاسب في الأفق + مدير في النخبة");
  console.log("   khaled/ khaled123 → مبيعات في الأفق");
  console.log("   mona  / mona123   → مالكة متجر الواحة (منشأة معلّقة)");
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error("فشل الزرع:", e);
    await db.$disconnect();
    process.exit(1);
  });
