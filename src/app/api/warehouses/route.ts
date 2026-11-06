import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";
import { ensureDefaultWarehouse } from "@/lib/stock";

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** GET — المستودعات مع إحصائياتها، أو أرصدة صنف بمستودع، أو سجل الحركات */
export async function GET(req: NextRequest) {
  try {
    const g = await guard("products:read");
    if (!g.ok) return g.response;

    // ضمان وجود مستودع افتراضي + ترحيل الأرصدة القائمة (مرة واحدة تلقائياً)
    const defaultWh = await ensureDefaultWarehouse(g.ctx.company.id);

    const { searchParams } = new URL(req.url);
    const warehouseId = searchParams.get("warehouseId")?.trim() ?? "";

    // ===== أرصدة الأصناف في مستودع محدد =====
    if (searchParams.get("levels") === "1" && warehouseId) {
      const warehouse = await db.warehouse.findFirst({
        where: { id: warehouseId, companyId: g.ctx.company.id },
      });
      if (!warehouse) {
        return NextResponse.json({ error: "المستودع غير موجود" }, { status: 404 });
      }
      const levels = await db.stockLevel.findMany({
        where: { warehouseId, quantity: { not: 0 } },
        include: {
          product: {
            select: { id: true, name: true, sku: true, unit: true, purchasePrice: true, alertQuantity: true },
          },
        },
        orderBy: { quantity: "desc" },
      });
      return NextResponse.json({
        levels: levels.map((l) => ({
          productId: l.productId,
          name: l.product.name,
          sku: l.product.sku,
          unit: l.product.unit,
          quantity: l.quantity,
          value: r2(l.quantity * l.product.purchasePrice),
          low: l.quantity <= l.product.alertQuantity,
        })),
      });
    }

    // ===== سجل حركات المخزون =====
    if (searchParams.get("movements") === "1") {
      const where: Record<string, unknown> = { companyId: g.ctx.company.id };
      if (warehouseId) where.warehouseId = warehouseId;
      const productId = searchParams.get("productId")?.trim() ?? "";
      if (productId) where.productId = productId;
      const movements = await db.stockMovement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: Math.min(200, Math.max(10, Number(searchParams.get("limit")) || 50)),
        include: {
          product: { select: { name: true, sku: true } },
          warehouse: { select: { name: true, code: true } },
        },
      });
      return NextResponse.json({ movements });
    }

    // ===== القائمة الافتراضية: المستودعات + إحصائيات =====
    const warehouses = await db.warehouse.findMany({
      where: { companyId: g.ctx.company.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      include: {
        branch: { select: { name: true, code: true } },
        stockLevels: {
          where: { quantity: { gt: 0 } },
          select: { quantity: true, product: { select: { purchasePrice: true } } },
        },
        _count: { select: { sales: true, purchases: true } },
      },
    });

    return NextResponse.json({
      warehouses: warehouses.map((w) => {
        const itemsCount = w.stockLevels.length;
        const totalQty = w.stockLevels.reduce((s, l) => s + l.quantity, 0);
        const totalValue = w.stockLevels.reduce(
          (s, l) => s + l.quantity * l.product.purchasePrice,
          0
        );
        return {
          id: w.id,
          name: w.name,
          code: w.code,
          location: w.location,
          keeper: w.keeper,
          isActive: w.isActive,
          isDefault: w.isDefault,
          branch: w.branch,
          itemsCount,
          totalQty: r2(totalQty),
          totalValue: r2(totalValue),
          salesCount: w._count.sales,
          purchasesCount: w._count.purchases,
          createdAt: w.createdAt,
        };
      }),
      defaultWarehouseId: defaultWh.id,
    });
  } catch (error) {
    console.error("[warehouses:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل المستودعات" }, { status: 500 });
  }
}

/** POST — إنشاء مستودع جديد */
export async function POST(req: NextRequest) {
  try {
    const g = await guard("products:write");
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";

    if (name.length < 2) {
      return NextResponse.json({ error: "اسم المستودع مطلوب (حرفان على الأقل)" }, { status: 400 });
    }
    if (!/^[A-Z0-9-]{2,10}$/.test(code)) {
      return NextResponse.json(
        { error: "رمز المستودع غير صالح — حروف إنجليزية/أرقام (2-10 خانات) مثل: WH-01" },
        { status: 400 }
      );
    }

    // الفرع التابع له (اختياري)
    let branchId: string | null = null;
    if (body?.branchId) {
      const branch = await db.branch.findFirst({
        where: { id: body.branchId, companyId: g.ctx.company.id },
        select: { id: true },
      });
      if (!branch) {
        return NextResponse.json({ error: "الفرع التابع غير موجود" }, { status: 400 });
      }
      branchId = branch.id;
    }

    const exists = await db.warehouse.findFirst({
      where: { companyId: g.ctx.company.id, OR: [{ code }, { name }] },
    });
    if (exists) {
      return NextResponse.json(
        { error: exists.code === code ? "رمز المستودع مستخدم مسبقاً" : "اسم المستودع مستخدم مسبقاً" },
        { status: 400 }
      );
    }

    // أول مستودعات الشركة غير الافتراضية يصبح هو الافتراضي تلقائياً
    const count = await db.warehouse.count({ where: { companyId: g.ctx.company.id } });

    const warehouse = await db.warehouse.create({
      data: {
        companyId: g.ctx.company.id,
        name,
        code,
        branchId,
        location: body?.location?.trim() || null,
        keeper: body?.keeper?.trim() || null,
        isActive: body?.isActive === false ? false : true,
        isDefault: count === 0 ? true : body?.isDefault === true,
      },
    });

    // إذا طُلب جعله افتراضياً — إزالة الافتراضية عن البقية
    if (warehouse.isDefault) {
      await db.warehouse.updateMany({
        where: { companyId: g.ctx.company.id, id: { not: warehouse.id } },
        data: { isDefault: false },
      });
    }

    await notify({
      companyId: g.ctx.company.id,
      title: "مستودع جديد",
      message: `تم إنشاء المستودع «${warehouse.name}» برمز ${warehouse.code}`,
      type: "stock",
      link: "warehouses",
    });

    await logAudit({
      companyId: g.ctx.company.id,
      userId: g.ctx.user.id,
      username: g.ctx.user.username,
      action: "warehouse.create",
      entity: "warehouse",
      entityId: warehouse.id,
      details: { name: warehouse.name, code: warehouse.code, branchId },
    });

    return NextResponse.json(warehouse, { status: 201 });
  } catch (error) {
    console.error("[warehouses:POST]", error);
    return NextResponse.json({ error: "تعذر إنشاء المستودع" }, { status: 500 });
  }
}
