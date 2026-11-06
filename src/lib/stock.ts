import { db } from "@/lib/db";

/** نوع معاملة Prisma قابل للتمرير (داخل $transaction أو خارجه) */
type Tx = Omit<typeof db, "$extends" | "$transaction">;

export type StockMoveType =
  | "purchase" // إدخال مشتريات
  | "sale" // خصم مبيعات
  | "sale-return" // إرجاع مبيعات للمخزون
  | "purchase-return" // إخراج مرتجع مشتريات
  | "transfer-in" // دخول تحويل من مستودع
  | "transfer-out" // خروج تحويل لمستودع
  | "adjustment" // تسوية جرد / ترحيل أرصدة افتتاحية
  | "opening"; // رصيد افتتاحي

export type MoveStockInput = {
  companyId: string;
  productId: string;
  warehouseId: string;
  delta: number; // موجب = دخول، سالب = خروج
  type: StockMoveType;
  refType?: string | null;
  refNo?: string | null;
  note?: string | null;
  userId?: string | null;
};

/**
 * تطبيق حركة مخزون واحدة:
 * 1) تحديث رصيد الصنف في المستودع المحدد (upsert)
 * 2) تحديث الرصيد الإجمالي للصنف (Product.stock)
 * 3) تسجيل الحركة في سجل التدقيق مع الرصيد بعد الحركة
 */
export async function moveStock(tx: Tx, input: MoveStockInput): Promise<number> {
  const delta = Number(input.delta) || 0;
  if (delta === 0) return 0;

  const level = await tx.stockLevel.upsert({
    where: {
      productId_warehouseId: {
        productId: input.productId,
        warehouseId: input.warehouseId,
      },
    },
    create: {
      companyId: input.companyId,
      productId: input.productId,
      warehouseId: input.warehouseId,
      quantity: delta,
    },
    update: { quantity: { increment: delta } },
  });

  await tx.product.update({
    where: { id: input.productId },
    data: { stock: { increment: delta } },
  });

  await tx.stockMovement.create({
    data: {
      companyId: input.companyId,
      productId: input.productId,
      warehouseId: input.warehouseId,
      type: input.type,
      qty: delta,
      balanceAfter: level.quantity,
      refType: input.refType ?? null,
      refNo: input.refNo ?? null,
      note: input.note ?? null,
      userId: input.userId ?? null,
    },
  });

  return level.quantity;
}

/** جلب رصيد صنف في مستودع محدد (0 إذا لم يوجد سجل) */
export async function getStockLevel(
  tx: Tx,
  productId: string,
  warehouseId: string
): Promise<number> {
  const level = await tx.stockLevel.findUnique({
    where: { productId_warehouseId: { productId, warehouseId } },
    select: { quantity: true },
  });
  return level?.quantity ?? 0;
}

/**
 * ضمان وجود مستودع افتراضي للشركة:
 * - يعيد المستودع الافتراضي إن وجد
 * - وإلا يعيد أول مستودع نشط
 * - وإلا ينشئ «المستودع الرئيسي» ويرحّل أرصدة الأصناف الحالية (Product.stock)
 *   إليه بحركات رصيد افتتاحي — ضمان توافق كامل مع البيانات القائمة
 */
export async function ensureDefaultWarehouse(companyId: string) {
  const existing = await db.warehouse.findFirst({
    where: { companyId, isDefault: true },
  });
  if (existing) return existing;

  const anyWarehouse = await db.warehouse.findFirst({
    where: { companyId },
    orderBy: { createdAt: "asc" },
  });
  if (anyWarehouse) return anyWarehouse;

  // إنشاء المستودع الرئيسي + ترحيل الأرصدة الحالية
  return db.$transaction(async (tx) => {
    const created = await tx.warehouse.create({
      data: {
        companyId,
        name: "المستودع الرئيسي",
        code: "MAIN",
        isDefault: true,
        isActive: true,
      },
    });

    const products = await tx.product.findMany({
      where: { companyId, stock: { gt: 0 } },
      select: { id: true, stock: true },
    });

    for (const p of products) {
      await moveStock(tx, {
        companyId,
        productId: p.id,
        warehouseId: created.id,
        delta: p.stock,
        type: "opening",
        refType: "migration",
        note: "ترحيل الرصيد الافتتاحي عند تفعيل تعدد المستودعات",
      });
    }

    return created;
  });
}

/** توليد رقم مستند تسلسلي للتحويلات والتسويات */
export async function nextRefNumber(
  tx: Tx,
  companyId: string,
  prefix: "TRF" | "ADJ"
): Promise<string> {
  const count = await tx.stockMovement.count({
    where: { companyId, refType: prefix.toLowerCase() },
  });
  return `${prefix}-${String(count + 1).padStart(5, "0")}`;
}
