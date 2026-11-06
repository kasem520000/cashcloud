import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { postAutoJournal } from "@/lib/accounting";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round(n * 100) / 100;

type PaymentWithRefs = Prisma.PaymentGetPayload<{
  include: {
    contact: { select: { name: true } };
    sale: { select: { invoiceNo: true } };
    purchase: { select: { refNo: true } };
  };
}>;

type PaymentRecord = {
  id: string;
  voucherNo: string;
  direction: string;
  amount: number;
  method: string;
  date: Date;
  note: string | null;
  contactId: string | null;
  contactName: string | null;
  saleId: string | null;
  saleInvoiceNo: string | null;
  purchaseId: string | null;
  purchaseRefNo: string | null;
};

function toRecord(p: PaymentWithRefs): PaymentRecord {
  return {
    id: p.id,
    voucherNo: p.voucherNo,
    direction: p.direction,
    amount: p.amount,
    method: p.method,
    date: p.date,
    note: p.note,
    contactId: p.contactId,
    contactName: p.contact?.name ?? null,
    saleId: p.saleId,
    saleInvoiceNo: p.sale?.invoiceNo ?? null,
    purchaseId: p.purchaseId,
    purchaseRefNo: p.purchase?.refNo ?? null,
  };
}

/** GET — قائمة سندات القبض والصرف (بحث + فلترة + ترقيم صفحات) */
export async function GET(req: NextRequest) {
  try {
    const g = await guard("sales:read");
    if (!g.ok) return g.response;

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const direction = searchParams.get("direction")?.trim() ?? "";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(searchParams.get("pageSize")) || 25));

    const where: Record<string, unknown> = { companyId: g.ctx.company.id };
    if (q) {
      where.OR = [{ voucherNo: { contains: q } }, { note: { contains: q } }];
    }
    if (direction === "receipt" || direction === "payment") {
      where.direction = direction;
    }

    const [total, payments] = await Promise.all([
      db.payment.count({ where }),
      db.payment.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          contact: { select: { name: true } },
          sale: { select: { invoiceNo: true } },
          purchase: { select: { refNo: true } },
        },
      }),
    ]);

    return NextResponse.json({
      payments: payments.map(toRecord),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    console.error("[payments:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل المدفوعات" }, { status: 500 });
  }
}

/** POST — إنشاء سند قبض (تحصيل من عميل) أو سند صرف (دفع لمورد) */
export async function POST(req: NextRequest) {
  try {
    const g = await guard("sales:write");
    if (!g.ok) return g.response;
    const companyId = g.ctx.company.id;

    const body = await req.json().catch(() => null);
    const direction = body?.direction === "payment" ? "payment" : body?.direction === "receipt" ? "receipt" : "";
    if (!direction) {
      return NextResponse.json({ error: "اتجاه السند غير صالح (قبض أو صرف)" }, { status: 400 });
    }

    const amount = Number(body?.amount);
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "المبلغ يجب أن يكون أكبر من صفر" }, { status: 400 });
    }

    const method = ["cash", "card", "transfer"].includes(body?.method) ? body.method : "cash";
    const date = body?.date ? new Date(body.date) : new Date();
    const validDate = isNaN(date.getTime()) ? new Date() : date;
    const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;

    let contactId: string | null =
      typeof body?.contactId === "string" && body.contactId ? body.contactId : null;
    let saleId: string | null = null;
    let purchaseId: string | null = null;

    // التحقق من جهة التعامل إذا مُررت يدوياً
    if (contactId) {
      const contact = await db.contact.findFirst({
        where: { id: contactId, companyId },
        select: { id: true },
      });
      if (!contact) {
        return NextResponse.json({ error: "جهة التعامل غير موجودة" }, { status: 400 });
      }
    }

    if (direction === "receipt") {
      if (body?.saleId) {
        const sale = await db.sale.findFirst({
          where: { id: body.saleId, companyId },
          select: { id: true, contactId: true, kind: true, status: true, total: true, paid: true },
        });
        if (!sale || sale.kind !== "invoice" || sale.status !== "final") {
          return NextResponse.json(
            { error: "سند القبض يتطلب فاتورة مبيعات صالحة" },
            { status: 400 }
          );
        }
        if (r2(sale.total - sale.paid) <= 0.009) {
          return NextResponse.json({ error: "الفاتورة مسددة بالكامل" }, { status: 400 });
        }
        saleId = sale.id;
        contactId = contactId ?? sale.contactId;
      } else if (!contactId) {
        return NextResponse.json(
          { error: "سند القبض يتطلب فاتورة مبيعات أو عميلاً" },
          { status: 400 }
        );
      }
    } else {
      if (body?.purchaseId) {
        const purchase = await db.purchase.findFirst({
          where: { id: body.purchaseId, companyId },
          select: { id: true, contactId: true, total: true, paid: true },
        });
        if (!purchase) {
          return NextResponse.json(
            { error: "سند الصرف يتطلب فاتورة مشتريات صالحة" },
            { status: 400 }
          );
        }
        if (r2(purchase.total - purchase.paid) <= 0.009) {
          return NextResponse.json({ error: "فاتورة الشراء مسددة بالكامل" }, { status: 400 });
        }
        purchaseId = purchase.id;
        contactId = contactId ?? purchase.contactId;
      } else if (!contactId) {
        return NextResponse.json(
          { error: "سند الصرف يتطلب فاتورة مشتريات أو مورداً" },
          { status: 400 }
        );
      }
    }

    const payment = await db.$transaction(async (tx) => {
      // تقييد المبلغ بالمتبقي على الفاتورة (قطع الزيادة)
      let effectiveAmount = r2(amount);
      if (saleId) {
        const sale = await tx.sale.findUnique({ where: { id: saleId } });
        if (sale) {
          effectiveAmount = Math.min(effectiveAmount, Math.max(0, r2(sale.total - sale.paid)));
          await tx.sale.update({
            where: { id: sale.id },
            data: { paid: Math.min(sale.total, r2(sale.paid + effectiveAmount)) },
          });
        }
      }
      if (purchaseId) {
        const purchase = await tx.purchase.findUnique({ where: { id: purchaseId } });
        if (purchase) {
          effectiveAmount = Math.min(effectiveAmount, Math.max(0, r2(purchase.total - purchase.paid)));
          await tx.purchase.update({
            where: { id: purchase.id },
            data: { paid: Math.min(purchase.total, r2(purchase.paid + effectiveAmount)) },
          });
        }
      }

      const count = await tx.payment.count({ where: { companyId } });
      const voucherNo = `${direction === "receipt" ? "RV" : "PV"}-${String(count + 1).padStart(5, "0")}`;

      return tx.payment.create({
        data: {
          companyId,
          voucherNo,
          direction,
          contactId,
          saleId,
          purchaseId,
          amount: effectiveAmount,
          method,
          date: validDate,
          note,
        },
        include: {
          contact: { select: { name: true } },
          sale: { select: { invoiceNo: true } },
          purchase: { select: { refNo: true } },
        },
      });
    });

    // القيد التلقائي: قبض (نقدية/بنك ← عملاء) أو صرف (موردون ← نقدية/بنك)
    const cashCode = method === "transfer" ? "1020" : "1010";
    await postAutoJournal({
      companyId,
      date: payment.date,
      description:
        payment.direction === "receipt"
          ? `سند قبض ${payment.voucherNo}`
          : `سند صرف ${payment.voucherNo}`,
      reference: `PAY-${payment.voucherNo}`,
      source: "auto-payment",
      lines:
        payment.direction === "receipt"
          ? [
              { code: cashCode, debit: payment.amount, description: "تحصيل من عميل" },
              { code: "1200", credit: payment.amount, description: "تحصيل من عميل" },
            ]
          : [
              { code: "2010", debit: payment.amount, description: "دفع لمورد" },
              { code: cashCode, credit: payment.amount, description: "دفع لمورد" },
            ],
    });

    // إشعار السند
    if (payment.direction === "receipt") {
      await notify({
        companyId,
        title: `سند قبض ${payment.voucherNo}`,
        message: `تم تحصيل ${payment.amount.toFixed(2)} ${g.ctx.company.currency} من ${payment.contact?.name ?? "العميل"}`,
        type: "payment",
        link: "payments",
      });
    } else {
      await notify({
        companyId,
        title: `سند صرف ${payment.voucherNo}`,
        message: `تم دفع ${payment.amount.toFixed(2)} ${g.ctx.company.currency} إلى ${payment.contact?.name ?? "المورد"}`,
        type: "payment",
        link: "payments",
      });
    }

    await logAudit({
      companyId,
      userId: g.ctx.user.id,
      username: g.ctx.user.username,
      action: "payment.create",
      entity: "payment",
      entityId: payment.id,
      details: {
        voucherNo: payment.voucherNo,
        direction: payment.direction,
        amount: payment.amount,
        method: payment.method,
        saleInvoiceNo: payment.sale?.invoiceNo ?? null,
        purchaseRefNo: payment.purchase?.refNo ?? null,
      },
    });

    return NextResponse.json(toRecord(payment), { status: 201 });
  } catch (error) {
    console.error("[payments:POST]", error);
    return NextResponse.json({ error: "تعذر تسجيل السند" }, { status: 500 });
  }
}
