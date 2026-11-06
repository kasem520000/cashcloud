import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { deleteAutoJournals } from "@/lib/accounting";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round(n * 100) / 100;

type Params = { params: Promise<{ id: string }> };

/** DELETE — حذف سند مع عكس آثاره (المسدد على الفواتير + القيد التلقائي) */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const g = await guard("sales:write");
    if (!g.ok) return g.response;

    const { id } = await params;
    const payment = await db.payment.findFirst({
      where: { id, companyId: g.ctx.company.id },
    });
    if (!payment) {
      return NextResponse.json({ error: "السند غير موجود" }, { status: 404 });
    }

    // عكس الآثار: تخفيض المسدد على الفاتورة/فاتورة الشراء ثم حذف السند
    await db.$transaction(async (tx) => {
      if (payment.saleId) {
        const sale = await tx.sale.findUnique({ where: { id: payment.saleId } });
        if (sale) {
          await tx.sale.update({
            where: { id: sale.id },
            data: { paid: Math.max(0, r2(sale.paid - payment.amount)) },
          });
        }
      }
      if (payment.purchaseId) {
        const purchase = await tx.purchase.findUnique({ where: { id: payment.purchaseId } });
        if (purchase) {
          await tx.purchase.update({
            where: { id: purchase.id },
            data: { paid: Math.max(0, r2(purchase.paid - payment.amount)) },
          });
        }
      }
      await tx.payment.delete({ where: { id: payment.id } });
    });

    // حذف القيد التلقائي المرتبط بالسند
    await deleteAutoJournals(g.ctx.company.id, `PAY-${payment.voucherNo}`);

    await logAudit({
      companyId: g.ctx.company.id,
      userId: g.ctx.user.id,
      username: g.ctx.user.username,
      action: "payment.delete",
      entity: "payment",
      entityId: payment.id,
      details: {
        voucherNo: payment.voucherNo,
        direction: payment.direction,
        amount: payment.amount,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[payment:DELETE]", error);
    return NextResponse.json({ error: "تعذر حذف السند" }, { status: 500 });
  }
}
