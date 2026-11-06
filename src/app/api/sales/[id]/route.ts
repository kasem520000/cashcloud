import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { deleteAutoJournals, postAutoJournal } from "@/lib/accounting";
import { notify } from "@/lib/notify";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const g = await guard("sales:read");
    if (!g.ok) return g.response;

    const { id } = await params;
    const sale = await db.sale.findFirst({
      where: { id, companyId: g.ctx.company.id },
      include: {
        items: true,
        contact: true,
        user: { select: { name: true, username: true } },
      },
    });
    if (!sale) {
      return NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 });
    }
    return NextResponse.json(sale);
  } catch (error) {
    console.error("[sale:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل الفاتورة" }, { status: 500 });
  }
}

/** تسجيل دفعة على فاتورة آجلة (يُرحّل قيداً محاسبياً) */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const g = await guard("sales:write");
    if (!g.ok) return g.response;

    const { id } = await params;
    const body = await req.json().catch(() => null);
    const amount = Number(body?.amount) || 0;

    const sale = await db.sale.findFirst({
      where: { id, companyId: g.ctx.company.id },
    });
    if (!sale) {
      return NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 });
    }
    if (sale.status !== "final") {
      return NextResponse.json(
        { error: "لا يمكن تسجيل دفعة على مسودة" },
        { status: 400 }
      );
    }

    const remaining = sale.total - sale.paid;
    if (remaining <= 0) {
      return NextResponse.json({ error: "الفاتورة مسددة بالكامل" }, { status: 400 });
    }
    if (amount <= 0 || amount > remaining + 0.01) {
      return NextResponse.json(
        { error: `المبلغ يجب أن يكون بين 0 والمتبقي ${remaining.toFixed(2)}` },
        { status: 400 }
      );
    }

    const updated = await db.sale.update({
      where: { id },
      data: { paid: Math.round((sale.paid + amount) * 100) / 100 },
    });

    await postAutoJournal({
      companyId: g.ctx.company.id,
      date: new Date(),
      description: `تحصيل دفعة من فاتورة ${sale.invoiceNo}`,
      reference: `PAY-${sale.invoiceNo}`,
      source: "auto-payment",
      lines: [
        { code: "1010", debit: amount, description: "تحصيل نقدي" },
        { code: "1200", credit: amount, description: "تسوية ذمم العميل" },
      ],
    });

    // إشعار التحصيل
    await notify({
      companyId: g.ctx.company.id,
      title: updated.paid >= updated.total - 0.01 ? "تم سداد الفاتورة بالكامل" : "دفعة محصّلة",
      message: `تم تحصيل ${amount.toFixed(2)} ${g.ctx.company.currency} من فاتورة ${sale.invoiceNo} — المتبقي ${Math.max(0, updated.total - updated.paid).toFixed(2)}`,
      type: "payment",
      link: "sales",
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[sale:PUT]", error);
    return NextResponse.json({ error: "تعذر تسجيل الدفعة" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const g = await guard("sales:write");
    if (!g.ok) return g.response;

    const { id } = await params;
    const sale = await db.sale.findFirst({
      where: { id, companyId: g.ctx.company.id },
      include: { items: true },
    });
    if (!sale) {
      return NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 });
    }

    await db.$transaction(async (tx) => {
      if (sale.status === "final") {
        for (const it of sale.items) {
          if (it.productId) {
            // فاتورة: استرجاع البضاعة للمخزون | إشعار دائن: عكس إرجاع المرتجع
            await tx.product.update({
              where: { id: it.productId },
              data:
                sale.kind === "credit-note"
                  ? { stock: { decrement: it.qty } }
                  : { stock: { increment: it.qty } },
            });
          }
        }
      }
      await tx.sale.delete({ where: { id } });
    });

    // حذف القيود التلقائية المرتبطة
    await deleteAutoJournals(g.ctx.company.id, `SALE-${sale.invoiceNo}`);
    await deleteAutoJournals(g.ctx.company.id, `PAY-${sale.invoiceNo}`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[sale:DELETE]", error);
    return NextResponse.json({ error: "تعذر حذف الفاتورة" }, { status: 500 });
  }
}
