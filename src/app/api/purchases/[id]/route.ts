import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { deleteAutoJournals } from "@/lib/accounting";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const g = await guard("purchases:write");
    if (!g.ok) return g.response;

    const { id } = await params;
    const purchase = await db.purchase.findFirst({
      where: { id, companyId: g.ctx.company.id },
      include: { items: true },
    });
    if (!purchase) {
      return NextResponse.json({ error: "عملية الشراء غير موجودة" }, { status: 404 });
    }

    await db.$transaction(async (tx) => {
      if (purchase.status === "received") {
        for (const it of purchase.items) {
          if (it.productId) {
            // فاتورة: عكس الاستقبال (إخراج البضاعة) | مرتجع: عكس الإخراج (إرجاع البضاعة)
            await tx.product.update({
              where: { id: it.productId },
              data:
                purchase.kind === "return"
                  ? { stock: { increment: it.qty } }
                  : { stock: { decrement: it.qty } },
            });
          }
        }
      }
      await tx.purchase.delete({ where: { id } });
    });

    await deleteAutoJournals(g.ctx.company.id, `PURCHASE-${purchase.refNo}`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[purchase:DELETE]", error);
    return NextResponse.json({ error: "تعذر حذف عملية الشراء" }, { status: 500 });
  }
}
