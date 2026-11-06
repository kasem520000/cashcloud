import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { postAutoJournal } from "@/lib/accounting";
import { generateQrPayload, isValidSaudiVat } from "@/lib/zatca";
import { moveStock, getStockLevel, ensureDefaultWarehouse } from "@/lib/stock";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round(n * 100) / 100;

type ItemInput = {
  productId?: string | null;
  name?: string;
  qty?: number;
  unitPrice?: number;
};

/** ترحيل القيود المحاسبية لعملية بيع نهائية (المبالغ بعملة المنشأة SAR) */
async function postSaleJournals(opts: {
  companyId: string;
  invoiceNo: string;
  date: Date;
  paymentMethod: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  cogs: number;
  exchangeRate?: number; // سعر تحويل عملة الفاتورة إلى عملة المنشأة
}) {
  const reference = `SALE-${opts.invoiceNo}`;
  const cashCode = opts.paymentMethod === "transfer" ? "1020" : "1010";
  const taxable = Math.max(0, opts.subtotal - opts.discount);
  const er = opts.exchangeRate ?? 1;

  // قيد الإيراد: قبض/ذمم مدينة ← إيراد المبيعات + الضريبة (مضروبة بسعر الصرف إلى SAR)
  await postAutoJournal({
    companyId: opts.companyId,
    date: opts.date,
    description: `فاتورة بيع ${opts.invoiceNo}`,
    reference,
    source: "auto-sale",
    lines: [
      { code: cashCode, debit: r2(opts.paid * er), description: "المقبوضات" },
      { code: "1200", debit: r2((opts.total - opts.paid) * er), description: "مبيعات آجلة" },
      { code: "4010", credit: r2(taxable * er), description: "إيرادات مبيعات" },
      { code: "2100", credit: r2(opts.tax * er), description: "ضريبة القيمة المضافة" },
    ],
  });

  // قيد تكلفة البضاعة المباعة
  if (opts.cogs > 0) {
    await postAutoJournal({
      companyId: opts.companyId,
      date: opts.date,
      description: `تكلفة بضاعة فاتورة ${opts.invoiceNo}`,
      reference,
      source: "auto-sale",
      lines: [
        { code: "5010", debit: opts.cogs, description: "تكلفة البضاعة المباعة" },
        { code: "1300", credit: opts.cogs, description: "صرف من المخزون" },
      ],
    });
  }
}

export async function GET(req: NextRequest) {
  try {
    const g = await guard("sales:read");
    if (!g.ok) return g.response;

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const status = searchParams.get("status")?.trim() ?? "";
    const kind = searchParams.get("kind")?.trim() ?? "";
    const branchId = searchParams.get("branchId")?.trim() ?? "";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(searchParams.get("pageSize")) || 25));

    const where: Record<string, unknown> = { companyId: g.ctx.company.id };
    if (q) {
      where.OR = [{ invoiceNo: { contains: q } }, { note: { contains: q } }];
    }
    if (status === "draft" || status === "final") where.status = status;
    if (kind === "invoice" || kind === "credit-note") where.kind = kind;
    if (branchId) where.branchId = branchId;
    const warehouseId = searchParams.get("warehouseId")?.trim() ?? "";
    if (warehouseId) where.warehouseId = warehouseId;

    const [total, sales] = await Promise.all([
      db.sale.count({ where }),
      db.sale.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          contact: { select: { name: true } },
          items: true,
          branch: { select: { name: true, code: true } },
          warehouse: { select: { name: true, code: true } },
        },
      }),
    ]);

    return NextResponse.json({
      sales,
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    console.error("[sales:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل المبيعات" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await guard("sales:write");
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const kind = body?.kind === "credit-note" ? "credit-note" : "invoice";
    const items: ItemInput[] = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "أضف صنفاً واحداً على الأقل" }, { status: 400 });
    }

    // ===== الفرع والوردية (POS وتعدد المنافذ) =====
    let branchId: string | null = null;
    if (body?.branchId) {
      const branch = await db.branch.findFirst({
        where: { id: body.branchId, companyId: g.ctx.company.id, isActive: true },
        select: { id: true },
      });
      if (!branch) {
        return NextResponse.json({ error: "الفرع غير موجود أو معطّل" }, { status: 400 });
      }
      branchId = branch.id;
    }
    let posShiftId: string | null = null;
    if (body?.posShiftId) {
      const shift = await db.posShift.findFirst({
        where: { id: body.posShiftId, companyId: g.ctx.company.id, status: "open" },
        select: { id: true },
      });
      if (shift) posShiftId = shift.id;
    }

    // ===== تعدد المستودعات: تحديد المستودع المخصوم منه =====
    // إن حُدد مستودع → فحص صارم لكفاية الرصيد. وإلا → المستودع الافتراضي (متوافق مع السلوك السابق)
    let warehouseId: string | null = null;
    let strictStock = false;
    if (body?.warehouseId) {
      const wh = await db.warehouse.findFirst({
        where: { id: body.warehouseId, companyId: g.ctx.company.id, isActive: true },
        select: { id: true },
      });
      if (!wh) {
        return NextResponse.json({ error: "المستودع غير موجود أو معطّل" }, { status: 400 });
      }
      warehouseId = wh.id;
      strictStock = true;
    } else {
      const defaultWh = await ensureDefaultWarehouse(g.ctx.company.id);
      warehouseId = defaultWh.id;
    }

    // فحص كفاية الأرصدة عند تحديد مستودع (POS)
    if (strictStock) {
      const shortages: string[] = [];
      for (const it of items) {
        if (!it.productId) continue;
        const available = await getStockLevel(db, it.productId, warehouseId);
        const needed = Number(it.qty) || 0;
        if (available < needed) {
          shortages.push(`${it.name || it.productId} (المتاح ${available})`);
        }
      }
      if (shortages.length > 0) {
        return NextResponse.json(
          { error: `رصيد غير كافٍ في المستودع: ${shortages.join("، ")}` },
          { status: 400 }
        );
      }
    }

    // ===== تعدد العملات: عملة الفاتورة وسعر التحويل إلى عملة المنشأة =====
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

    // التحقق من ملكية الأصناف وحساب التكلفة
    const productIds = [...new Set(items.map((it) => it.productId).filter(Boolean))] as string[];
    const products = await db.product.findMany({
      where: { id: { in: productIds }, companyId: g.ctx.company.id },
      select: { id: true, purchasePrice: true },
    });
    const priceMap = new Map(products.map((p) => [p.id, p.purchasePrice]));

    const subtotal = items.reduce(
      (s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0),
      0
    );
    const discount = Math.max(0, Number(body?.discount) || 0);
    const taxRate = Math.max(0, Math.min(100, Number(body?.taxRate) || 0));
    const taxable = Math.max(0, subtotal - discount);
    const tax = Math.round(taxable * taxRate) / 100;
    const total = Math.round((taxable + tax) * 100) / 100;
    const date = body?.date ? new Date(body.date) : new Date();
    const validDate = isNaN(date.getTime()) ? new Date() : date;

    // ===== إشعار دائن — مرتجع مبيعات =====
    if (kind === "credit-note") {
      const originalInvoiceNo =
        typeof body?.originalInvoiceNo === "string" ? body.originalInvoiceNo.trim() : "";
      if (!originalInvoiceNo) {
        return NextResponse.json(
          { error: "حدد الفاتورة الأصلية للمرتجع" },
          { status: 400 }
        );
      }
      const original = await db.sale.findFirst({
        where: { companyId: g.ctx.company.id, invoiceNo: originalInvoiceNo },
        select: { id: true, contactId: true, kind: true },
      });
      if (!original || original.kind !== "invoice") {
        return NextResponse.json(
          { error: "الفاتورة الأصلية غير موجودة أو غير صالحة للمرتجع" },
          { status: 400 }
        );
      }
      const contactId = body?.contactId || original.contactId;
      const paymentMethod = ["cash", "card", "transfer", "credit"].includes(body?.paymentMethod)
        ? body.paymentMethod
        : "credit";

      // مستودع إرجاع المرتجع: المحدد ← وإلا مستودع الفاتورة الأصلية ← وإلا الافتراضي
      let returnWarehouseId = warehouseId;
      if (body?.warehouseId) {
        returnWarehouseId = warehouseId;
      } else {
        const originalFull = await db.sale.findFirst({
          where: { id: original.id },
          select: { warehouseId: true },
        });
        if (originalFull?.warehouseId) {
          returnWarehouseId = originalFull.warehouseId;
        }
      }

      const sale = await db.$transaction(async (tx) => {
        const count = await tx.sale.count({ where: { companyId: g.ctx.company.id } });
        const invoiceNo = `CRN-${String(count + 1).padStart(5, "0")}`;

        const created = await tx.sale.create({
          data: {
            companyId: g.ctx.company.id,
            invoiceNo,
            kind: "credit-note",
            originalInvoiceNo,
            branchId,
            posShiftId,
            warehouseId: returnWarehouseId,
            contactId,
            userId: g.ctx.user.id,
            date: validDate,
            subtotal,
            discount,
            tax,
            total,
            paid: 0,
            status: "final",
            paymentMethod,
            currency,
            exchangeRate,
            note: body?.note?.trim() || null,
            items: {
              create: items.map((it) => ({
                productId: it.productId || null,
                name: it.name || "صنف",
                qty: Number(it.qty) || 1,
                unitPrice: Number(it.unitPrice) || 0,
                total: (Number(it.qty) || 0) * (Number(it.unitPrice) || 0),
              })),
            },
          },
          include: { items: true, contact: { select: { name: true } } },
        });

        // إرجاع البضاعة المرتجعة للمخزون (المستودع المحدد/الأصلي + سجل الحركة)
        for (const it of items) {
          if (it.productId) {
            await moveStock(tx, {
              companyId: g.ctx.company.id,
              productId: it.productId,
              warehouseId: returnWarehouseId,
              delta: Number(it.qty) || 0,
              type: "sale-return",
              refType: "sale",
              refNo: invoiceNo,
              userId: g.ctx.user.id,
            });
          }
        }

        return created;
      });

      // القيد: عكس الإيراد والضريبة على حساب العملاء (بقيم SAR عبر سعر الصرف)
      await postAutoJournal({
        companyId: g.ctx.company.id,
        date: sale.date,
        description: `إشعار دائن ${sale.invoiceNo} — مرتجع مبيعات`,
        reference: `SALE-${sale.invoiceNo}`,
        source: "auto-sale",
        lines: [
          { code: "4010", debit: r2(taxable * exchangeRate), description: "إشعار دائن — مرتجع مبيعات" },
          { code: "2100", debit: r2(tax * exchangeRate), description: "إشعار دائن — مرتجع مبيعات" },
          { code: "1200", credit: r2(total * exchangeRate), description: "إشعار دائن — مرتجع مبيعات" },
        ],
      });

      // عكس تكلفة البضاعة المباعة للمرتجع
      const cogs = items.reduce(
        (s, it) => s + (Number(it.qty) || 0) * (priceMap.get(it.productId ?? "") ?? 0),
        0
      );
      if (cogs > 0) {
        await postAutoJournal({
          companyId: g.ctx.company.id,
          date: sale.date,
          description: `عكس تكلفة بضاعة مرتجعة ${sale.invoiceNo}`,
          reference: `SALE-${sale.invoiceNo}`,
          source: "auto-sale",
          lines: [
            { code: "1300", debit: r2(cogs), description: "إرجاع للمخزون" },
            { code: "5010", credit: r2(cogs), description: "عكس تكلفة البضاعة المباعة" },
          ],
        });
      }

      // رمز QR لزتكا مثل الفواتير
      if (isValidSaudiVat(g.ctx.company.taxNumber)) {
        const qrData = generateQrPayload({
          sellerName: g.ctx.company.name,
          vatNumber: g.ctx.company.taxNumber!,
          timestamp: sale.date,
          total: sale.total,
          vatTotal: tax,
        });
        await db.sale.update({ where: { id: sale.id }, data: { qrData } });
      }

      await notify({
        companyId: g.ctx.company.id,
        title: "إشعار دائن جديد",
        message: `تم إصدار إشعار دائن ${sale.invoiceNo} مرتجعاً للفاتورة ${originalInvoiceNo} بمبلغ ${total.toFixed(2)} ${g.ctx.company.currency}`,
        type: "invoice",
        link: "sales",
      });

      await logAudit({
        companyId: g.ctx.company.id,
        userId: g.ctx.user.id,
        username: g.ctx.user.username,
        action: "sale.credit-note",
        entity: "sale",
        entityId: sale.id,
        details: { invoiceNo: sale.invoiceNo, originalInvoiceNo, total },
      });

      return NextResponse.json(sale, { status: 201 });
    }

    // ===== فاتورة مبيعات =====
    const paymentMethod = ["cash", "card", "transfer", "credit"].includes(body?.paymentMethod)
      ? body.paymentMethod
      : "cash";
    const paid =
      paymentMethod === "credit"
        ? Math.min(Math.max(0, Number(body?.paid) || 0), total)
        : total;
    const status = body?.status === "draft" ? "draft" : "final";

    const sale = await db.$transaction(async (tx) => {
      const count = await tx.sale.count({ where: { companyId: g.ctx.company.id } });
      const invoiceNo = `INV-${String(count + 1).padStart(5, "0")}`;

      const created = await tx.sale.create({
        data: {
          companyId: g.ctx.company.id,
          invoiceNo,
          branchId,
          posShiftId,
          warehouseId,
          contactId: body?.contactId || null,
          userId: g.ctx.user.id,
          date: validDate,
          subtotal,
          discount,
          tax,
          total,
          paid,
          status,
          paymentMethod,
          currency,
          exchangeRate,
          note: body?.note?.trim() || null,
          items: {
            create: items.map((it) => ({
              productId: it.productId || null,
              name: it.name || "صنف",
              qty: Number(it.qty) || 1,
              unitPrice: Number(it.unitPrice) || 0,
              total: (Number(it.qty) || 0) * (Number(it.unitPrice) || 0),
            })),
          },
        },
        include: {
          items: true,
          contact: { select: { name: true } },
          branch: { select: { name: true, code: true } },
          warehouse: { select: { name: true, code: true } },
        },
      });

      if (status === "final") {
        // خصم المخزون من المستودع المحدد + تسجيل الحركات
        for (const it of items) {
          if (it.productId) {
            await moveStock(tx, {
              companyId: g.ctx.company.id,
              productId: it.productId,
              warehouseId: warehouseId!,
              delta: -(Number(it.qty) || 0),
              type: "sale",
              refType: "sale",
              refNo: invoiceNo,
              userId: g.ctx.user.id,
            });
          }
        }
      }

      return created;
    });

    // ترحيل القيود المحاسبية تلقائياً
    if (status === "final") {
      const cogs = items.reduce(
        (s, it) => s + (Number(it.qty) || 0) * (priceMap.get(it.productId ?? "") ?? 0),
        0
      );
      await postSaleJournals({
        companyId: g.ctx.company.id,
        invoiceNo: sale.invoiceNo,
        date: sale.date,
        paymentMethod,
        subtotal,
        discount,
        tax,
        total,
        paid,
        cogs: Math.round(cogs * 100) / 100,
        exchangeRate,
      });
    }

    // توليد رمز QR لزتكا تلقائياً (امتثال المرحلة الأولى) عند توفر رقم ضريبي صالح
    if (status === "final" && isValidSaudiVat(g.ctx.company.taxNumber)) {
      const qrData = generateQrPayload({
        sellerName: g.ctx.company.name,
        vatNumber: g.ctx.company.taxNumber!,
        timestamp: sale.date,
        total: sale.total,
        vatTotal: tax,
      });
      await db.sale.update({ where: { id: sale.id }, data: { qrData } });
    }

    // إشعار فاتورة جديدة + فحص المخزون المنخفض
    if (status === "final") {
      await notify({
        companyId: g.ctx.company.id,
        title: "فاتورة مبيعات جديدة",
        message: `تم إصدار الفاتورة ${sale.invoiceNo} بإجمالي ${total.toFixed(2)} ${g.ctx.company.currency}${sale.contact?.name ? ` للعميل ${sale.contact.name}` : ""}`,
        type: "invoice",
        link: "sales",
      });
      const soldProductIds = [
        ...new Set(items.map((it) => it.productId).filter(Boolean)),
      ] as string[];
      if (soldProductIds.length > 0) {
        const lowStock = await db.product.findMany({
          where: {
            id: { in: soldProductIds },
            companyId: g.ctx.company.id,
            isActive: true,
          },
          select: { name: true, stock: true, alertQuantity: true },
        });
        const alerts = lowStock.filter((p) => p.stock <= p.alertQuantity);
        if (alerts.length > 0) {
          await notify({
            companyId: g.ctx.company.id,
            title: "تنبيه: مخزون منخفض",
            message: `أصناف وصلت حد الطلب: ${alerts
              .map((p) => `${p.name} (المتوفر ${p.stock})`)
              .join("، ")}`,
            type: "stock",
            link: "products",
          });
        }
      }
    }

    await logAudit({
      companyId: g.ctx.company.id,
      userId: g.ctx.user.id,
      username: g.ctx.user.username,
      action: "sale.create",
      entity: "sale",
      entityId: sale.id,
      details: { invoiceNo: sale.invoiceNo, total, status },
    });

    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    console.error("[sales:POST]", error);
    return NextResponse.json({ error: "تعذر تسجيل عملية البيع" }, { status: 500 });
  }
}
