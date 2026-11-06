import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { postAutoJournal } from "@/lib/accounting";
import { moveStock, ensureDefaultWarehouse } from "@/lib/stock";
import { moveStock, ensureDefaultWarehouse } from "@/lib/stock";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round(n * 100) / 100;

type ItemInput = {
  productId?: string | null;
  name?: string;
  qty?: number;
  unitCost?: number;
};

export async function GET(req: NextRequest) {
  try {
    const g = await guard("purchases:read");
    if (!g.ok) return g.response;

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const kind = searchParams.get("kind")?.trim() ?? "";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(searchParams.get("pageSize")) || 25));

    const where: Record<string, unknown> = { companyId: g.ctx.company.id };
    if (q) where.refNo = { contains: q };
    if (kind === "invoice" || kind === "return") where.kind = kind;

    const [total, purchases] = await Promise.all([
      db.purchase.count({ where }),
      db.purchase.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          contact: { select: { name: true } },
          items: true,
          warehouse: { select: { name: true, code: true } },
        },
      }),
    ]);

    return NextResponse.json({
      purchases,
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    console.error("[purchases:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل المشتريات" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await guard("purchases:write");
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const kind = body?.kind === "return" ? "return" : "invoice";
    const items: ItemInput[] = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "أضف صنفاً واحداً على الأقل" }, { status: 400 });
    }

    // ===== تعدد العملات: عملة فاتورة الشراء وسعر التحويل إلى عملة المنشأة =====
    const currency =
      typeof body?.currency === "string" && body.currency.trim()
        ? body.currency.trim().toUpperCase()
        : "SAR";
    if (!/^[A-Z]{3}$/.test(currency)) {
      return NextResponse.json({ error: "رمز عملة غير صالح" }, { status: 400 });
    }
    let exchangeRate = 1;
    if (body?.exchangeRate !== undefined && body?.exchangeRate !== null && body?.exchangeRate !== "") {
      const er = Number(body.exchangeRate);
      if (isNaN(er) || er <= 0) {
        return NextResponse.json({ error: "سعر صرف غير صالح — يجب أن يكون رقماً أكبر من صفر" }, { status: 400 });
      }
      exchangeRate = Math.round(er * 1000000) / 1000000;
    }

    // التحقق من ملكية الأصناف
    const productIds = [...new Set(items.map((it) => it.productId).filter(Boolean))] as string[];
    if (productIds.length > 0) {
      const owned = await db.product.count({
        where: { id: { in: productIds }, companyId: g.ctx.company.id },
      });
      if (owned !== productIds.length) {
        return NextResponse.json(
          { error: "أحد الأصناف غير تابع لمنشأتك" },
          { status: 400 }
        );
      }
    }

    // ===== تعدد المستودعات: المستودع المستلم للبضاعة =====
    let warehouseId: string | null = null;
    if (body?.warehouseId) {
      const wh = await db.warehouse.findFirst({
        where: { id: body.warehouseId, companyId: g.ctx.company.id, isActive: true },
        select: { id: true },
      });
      if (!wh) {
        return NextResponse.json({ error: "المستودع غير موجود أو معطّل" }, { status: 400 });
      }
      warehouseId = wh.id;
    } else {
      const defaultWh = await ensureDefaultWarehouse(g.ctx.company.id);
      warehouseId = defaultWh.id;
    }

    // ===== تعدد المستودعات: المستودع المستلم للبضاعة =====
    let warehouseId: string | null = null;
    if (body?.warehouseId) {
      const wh = await db.warehouse.findFirst({
        where: { id: body.warehouseId, companyId: g.ctx.company.id, isActive: true },
        select: { id: true },
      });
      if (!wh) {
        return NextResponse.json({ error: "المستودع غير موجود أو معطّل" }, { status: 400 });
      }
      warehouseId = wh.id;
    } else {
      const defaultWh = await ensureDefaultWarehouse(g.ctx.company.id);
      warehouseId = defaultWh.id;
    }

    const subtotal = items.reduce(
      (s, it) => s + (Number(it.qty) || 0) * (Number(it.unitCost) || 0),
      0
    );
    const discount = Math.max(0, Number(body?.discount) || 0);
    const taxRate = Math.max(0, Math.min(100, Number(body?.taxRate) || 0));
    const taxable = Math.max(0, subtotal - discount);
    const tax = Math.round(taxable * taxRate) / 100;
    const total = Math.round((taxable + tax) * 100) / 100;

    // ===== مرتجع مشتريات =====
    if (kind === "return") {
      const originalRefNo =
        typeof body?.originalRefNo === "string" ? body.originalRefNo.trim() : "";
      if (!originalRefNo) {
        return NextResponse.json(
          { error: "حدد فاتورة الشراء الأصلية للمرتجع" },
          { status: 400 }
        );
      }
      const original = await db.purchase.findFirst({
        where: { companyId: g.ctx.company.id, refNo: originalRefNo },
        select: { id: true, contactId: true },
      });
      if (!original) {
        return NextResponse.json(
          { error: "فاتورة الشراء الأصلية غير موجودة" },
          { status: 400 }
        );
      }
      const contactId = body?.contactId || original.contactId;

      const purchase = await db.$transaction(async (tx) => {
        const count = await tx.purchase.count({ where: { companyId: g.ctx.company.id } });
        const refNo = `PRN-${String(count + 1).padStart(5, "0")}`;

        const created = await tx.purchase.create({
          data: {
            companyId: g.ctx.company.id,
            refNo,
            kind: "return",
            originalRefNo,
            warehouseId,
            contactId,
            subtotal,
            discount,
            tax,
            total,
            paid: 0,
            status: "received",
            currency,
            exchangeRate,
            note: body?.note?.trim() || null,
            items: {
              create: items.map((it) => ({
                productId: it.productId || null,
                name: it.name || "صنف",
                qty: Number(it.qty) || 1,
                unitCost: Number(it.unitCost) || 0,
                total: (Number(it.qty) || 0) * (Number(it.unitCost) || 0),
              })),
            },
          },
          include: { items: true, contact: { select: { name: true } } },
        });

        // إخراج البضاعة المرتجعة من المستودع + تسجيل الحركات
        for (const it of items) {
          if (it.productId) {
            await moveStock(tx, {
              companyId: g.ctx.company.id,
              productId: it.productId,
              warehouseId: warehouseId!,
              delta: -(Number(it.qty) || 0),
              type: "purchase-return",
              refType: "purchase",
              refNo,
              userId: g.ctx.user.id,
            });
          }
        }

        return created;
      });

      // قيد المرتجع: موردون ← مخزون + ضريبة مدخلات (بقيم SAR عبر سعر الصرف)
      await postAutoJournal({
        companyId: g.ctx.company.id,
        date: purchase.date,
        description: `مرتجع مشتريات ${purchase.refNo}`,
        reference: `PURCHASE-${purchase.refNo}`,
        source: "auto-purchase",
        lines: [
          { code: "2010", debit: r2(total * exchangeRate), description: "مرتجع مشتريات" },
          { code: "1300", credit: r2(taxable * exchangeRate), description: "مرتجع مشتريات" },
          { code: "1140", credit: r2(tax * exchangeRate), description: "مرتجع مشتريات" },
        ],
      });

      await notify({
        companyId: g.ctx.company.id,
        title: "مرتجع مشتريات",
        message: `تم تسجيل مرتجع ${purchase.refNo} لفاتورة ${originalRefNo} بمبلغ ${total.toFixed(2)} ${g.ctx.company.currency}`,
        type: "purchase",
        link: "purchases",
      });

      await logAudit({
        companyId: g.ctx.company.id,
        userId: g.ctx.user.id,
        username: g.ctx.user.username,
        action: "purchase.return",
        entity: "purchase",
        entityId: purchase.id,
        details: { refNo: purchase.refNo, originalRefNo, total },
      });

      return NextResponse.json(purchase, { status: 201 });
    }

    // ===== فاتورة شراء =====
    const paid = Math.min(Math.max(0, Number(body?.paid) || 0), total);
    const status = body?.status === "pending" ? "pending" : "received";

    const purchase = await db.$transaction(async (tx) => {
      const count = await tx.purchase.count({ where: { companyId: g.ctx.company.id } });
      const refNo = `PO-${String(count + 1).padStart(5, "0")}`;

      const created = await tx.purchase.create({
        data: {
          companyId: g.ctx.company.id,
          refNo,
          warehouseId,
          contactId: body?.contactId || null,
          subtotal,
          discount,
          tax,
          total,
          paid,
          status,
          currency,
          exchangeRate,
          note: body?.note?.trim() || null,
          items: {
            create: items.map((it) => ({
              productId: it.productId || null,
              name: it.name || "صنف",
              qty: Number(it.qty) || 1,
              unitCost: Number(it.unitCost) || 0,
              total: (Number(it.qty) || 0) * (Number(it.unitCost) || 0),
            })),
          },
        },
        include: { items: true, contact: { select: { name: true } } },
      });

      if (created.status === "received") {
        // إدخال البضاعة للمستودع المستلم + تسجيل الحركات
        for (const it of items) {
          if (it.productId) {
            await moveStock(tx, {
              companyId: g.ctx.company.id,
              productId: it.productId,
              warehouseId: warehouseId!,
              delta: Number(it.qty) || 0,
              type: "purchase",
              refType: "purchase",
              refNo,
              userId: g.ctx.user.id,
            });
          }
        }
      }

      return created;
    });

    // قيد الشراء: المخزون + ضريبة المدخلات ← نقدية/بنك + موردون (بقيم SAR عبر سعر الصرف)
    if (purchase.status === "received") {
      await postAutoJournal({
        companyId: g.ctx.company.id,
        date: purchase.date,
        description: `فاتورة شراء ${purchase.refNo}`,
        reference: `PURCHASE-${purchase.refNo}`,
        source: "auto-purchase",
        lines: [
          { code: "1300", debit: r2(taxable * exchangeRate), description: "إضافة للمخزون" },
          ...(tax > 0
            ? [{ code: "1140", debit: r2(tax * exchangeRate), description: "ضريبة مدخلات" }]
            : []),
          { code: "1010", credit: r2(paid * exchangeRate), description: "مدفوعات نقدية" },
          { code: "2010", credit: r2((total - paid) * exchangeRate), description: "مستحق للموردين" },
        ],
      });
    }

    // إشعار عملية الشراء
    await notify({
      companyId: g.ctx.company.id,
      title: "فاتورة شراء جديدة",
      message: `تم تسجيل فاتورة الشراء ${purchase.refNo} بإجمالي ${purchase.total.toFixed(2)} ${g.ctx.company.currency}${purchase.contact?.name ? ` من ${purchase.contact.name}` : ""}`,
      type: "purchase",
      link: "purchases",
    });

    await logAudit({
      companyId: g.ctx.company.id,
      userId: g.ctx.user.id,
      username: g.ctx.user.username,
      action: "purchase.create",
      entity: "purchase",
      entityId: purchase.id,
      details: { refNo: purchase.refNo, total, status },
    });

    return NextResponse.json(purchase, { status: 201 });
  } catch (error) {
    console.error("[purchases:POST]", error);
    return NextResponse.json({ error: "تعذر تسجيل عملية الشراء" }, { status: 500 });
  }
}
