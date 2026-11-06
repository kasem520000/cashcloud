import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { postAutoJournal } from "@/lib/accounting";
import { generateQrPayload, isValidSaudiVat } from "@/lib/zatca";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round(n * 100) / 100;

type Params = { params: Promise<{ id: string }> };

/** GET — تفاصيل عرض السعر مع البنود */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const g = await guard("sales:read");
    if (!g.ok) return g.response;

    const { id } = await params;
    const quotation = await db.quotation.findFirst({
      where: { id, companyId: g.ctx.company.id },
      include: { items: true, contact: { select: { name: true } } },
    });
    if (!quotation) {
      return NextResponse.json({ error: "عرض السعر غير موجود" }, { status: 404 });
    }

    return NextResponse.json({
      id: quotation.id,
      quoteNo: quotation.quoteNo,
      date: quotation.date,
      validUntil: quotation.validUntil,
      subtotal: quotation.subtotal,
      discount: quotation.discount,
      tax: quotation.tax,
      total: quotation.total,
      status: quotation.status,
      note: quotation.note,
      contactId: quotation.contactId,
      contactName: quotation.contact?.name ?? null,
      userId: quotation.userId,
      itemsCount: quotation.items.length,
      items: quotation.items.map((it) => ({
        id: it.id,
        productId: it.productId,
        name: it.name,
        qty: it.qty,
        unitPrice: it.unitPrice,
        total: it.total,
      })),
    });
  } catch (error) {
    console.error("[quotation:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل عرض السعر" }, { status: 500 });
  }
}

/** POST — إجراءات العرض: convert (تحويل لفاتورة) | status (تغيير الحالة) */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const g = await guard("sales:write");
    if (!g.ok) return g.response;
    const companyId = g.ctx.company.id;

    const { id } = await params;
    const body = await req.json().catch(() => null);
    const action = typeof body?.action === "string" ? body.action : "";

    const quotation = await db.quotation.findFirst({
      where: { id, companyId },
      include: { items: true },
    });
    if (!quotation) {
      return NextResponse.json({ error: "عرض السعر غير موجود" }, { status: 404 });
    }

    // ===== تحويل العرض إلى فاتورة مبيعات نهائية =====
    if (action === "convert") {
      if (!["draft", "sent", "accepted"].includes(quotation.status)) {
        return NextResponse.json({ error: "لا يمكن تحويل هذا العرض" }, { status: 400 });
      }

      const paymentMethod = ["cash", "card", "transfer", "credit"].includes(body?.paymentMethod)
        ? body.paymentMethod
        : "credit";

      // تكلفة البضاعة من أسعار شراء الأصناف المرتبطة
      const productIds = [
        ...new Set(quotation.items.map((it) => it.productId).filter(Boolean)),
      ] as string[];
      const products = productIds.length
        ? await db.product.findMany({
            where: { id: { in: productIds }, companyId },
            select: { id: true, purchasePrice: true },
          })
        : [];
      const priceMap = new Map(products.map((p) => [p.id, p.purchasePrice]));
      const cogs = r2(
        quotation.items.reduce(
          (s, it) => s + it.qty * (priceMap.get(it.productId ?? "") ?? 0),
          0
        )
      );

      const sale = await db.$transaction(async (tx) => {
        const count = await tx.sale.count({ where: { companyId } });
        const invoiceNo = `INV-${String(count + 1).padStart(5, "0")}`;

        const created = await tx.sale.create({
          data: {
            companyId,
            invoiceNo,
            kind: "invoice",
            contactId: quotation.contactId,
            userId: quotation.userId ?? g.ctx.user.id,
            date: new Date(),
            subtotal: quotation.subtotal,
            discount: quotation.discount,
            tax: quotation.tax,
            total: quotation.total,
            paid: 0,
            status: "final",
            paymentMethod,
            note: `محوّل من عرض السعر ${quotation.quoteNo}`,
            items: {
              create: quotation.items.map((it) => ({
                productId: it.productId,
                name: it.name,
                qty: it.qty,
                unitPrice: it.unitPrice,
                total: it.total,
              })),
            },
          },
        });

        // خصم المخزون للأصناف المرتبطة
        for (const it of quotation.items) {
          if (it.productId) {
            await tx.product.update({
              where: { id: it.productId },
              data: { stock: { decrement: it.qty } },
            });
          }
        }

        await tx.quotation.update({
          where: { id: quotation.id },
          data: { status: "converted" },
        });

        return created;
      });

      // قيد الإيراد (آجل بالكامل — paid = 0)
      const cashCode = paymentMethod === "transfer" ? "1020" : "1010";
      const taxable = Math.max(0, sale.subtotal - sale.discount);
      await postAutoJournal({
        companyId,
        date: sale.date,
        description: `فاتورة بيع ${sale.invoiceNo}`,
        reference: `SALE-${sale.invoiceNo}`,
        source: "auto-sale",
        lines: [
          { code: cashCode, debit: sale.paid, description: "المقبوضات" },
          { code: "1200", debit: r2(sale.total - sale.paid), description: "مبيعات آجلة" },
          { code: "4010", credit: taxable, description: "إيرادات مبيعات" },
          { code: "2100", credit: sale.tax, description: "ضريبة القيمة المضافة" },
        ],
      });

      // قيد تكلفة البضاعة المباعة
      if (cogs > 0) {
        await postAutoJournal({
          companyId,
          date: sale.date,
          description: `تكلفة بضاعة فاتورة ${sale.invoiceNo}`,
          reference: `SALE-${sale.invoiceNo}`,
          source: "auto-sale",
          lines: [
            { code: "5010", debit: cogs, description: "تكلفة البضاعة المباعة" },
            { code: "1300", credit: cogs, description: "صرف من المخزون" },
          ],
        });
      }

      // رمز QR لزتكا عند توفر رقم ضريبي صالح
      if (isValidSaudiVat(g.ctx.company.taxNumber)) {
        const qrData = generateQrPayload({
          sellerName: g.ctx.company.name,
          vatNumber: g.ctx.company.taxNumber!,
          timestamp: sale.date,
          total: sale.total,
          vatTotal: sale.tax,
        });
        await db.sale.update({ where: { id: sale.id }, data: { qrData } });
      }

      await notify({
        companyId,
        title: "فاتورة من عرض سعر",
        message: `تم تحويل العرض ${quotation.quoteNo} إلى الفاتورة ${sale.invoiceNo}`,
        type: "invoice",
        link: "sales",
      });

      await logAudit({
        companyId,
        userId: g.ctx.user.id,
        username: g.ctx.user.username,
        action: "quotation.convert",
        entity: "quotation",
        entityId: quotation.id,
        details: { quoteNo: quotation.quoteNo, invoiceNo: sale.invoiceNo, total: sale.total },
      });

      return NextResponse.json({ ok: true, sale: { id: sale.id, invoiceNo: sale.invoiceNo } });
    }

    // ===== تغيير حالة العرض =====
    if (action === "status") {
      const status = body?.status;
      if (!["sent", "accepted", "rejected"].includes(status)) {
        return NextResponse.json({ error: "حالة غير معروفة" }, { status: 400 });
      }
      await db.quotation.update({
        where: { id: quotation.id },
        data: { status },
      });
      await logAudit({
        companyId,
        userId: g.ctx.user.id,
        username: g.ctx.user.username,
        action: "quotation.status",
        entity: "quotation",
        entityId: quotation.id,
        details: { quoteNo: quotation.quoteNo, from: quotation.status, to: status },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  } catch (error) {
    console.error("[quotation:POST]", error);
    return NextResponse.json({ error: "تعذر تنفيذ الإجراء" }, { status: 500 });
  }
}

/** DELETE — حذف عرض (المسودات فقط) */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const g = await guard("sales:write");
    if (!g.ok) return g.response;

    const { id } = await params;
    const quotation = await db.quotation.findFirst({
      where: { id, companyId: g.ctx.company.id },
    });
    if (!quotation) {
      return NextResponse.json({ error: "عرض السعر غير موجود" }, { status: 404 });
    }
    if (quotation.status !== "draft") {
      return NextResponse.json({ error: "لا يمكن حذف عرض غير مسودة" }, { status: 400 });
    }

    await db.quotation.delete({ where: { id: quotation.id } });

    await logAudit({
      companyId: g.ctx.company.id,
      userId: g.ctx.user.id,
      username: g.ctx.user.username,
      action: "quotation.delete",
      entity: "quotation",
      entityId: quotation.id,
      details: { quoteNo: quotation.quoteNo, total: quotation.total },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[quotation:DELETE]", error);
    return NextResponse.json({ error: "تعذر حذف عرض السعر" }, { status: 500 });
  }
}
