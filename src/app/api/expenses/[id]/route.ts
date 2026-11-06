import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { deleteAutoJournals } from "@/lib/accounting";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const g = await guard("expenses:write");
    if (!g.ok) return g.response;

    const { id } = await params;
    const existing = await db.expense.findFirst({
      where: { id, companyId: g.ctx.company.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "المصروف غير موجود" }, { status: 404 });
    }
    await db.expense.delete({ where: { id } });
    await deleteAutoJournals(g.ctx.company.id, `EXPENSE-${existing.refNo}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[expense:DELETE]", error);
    return NextResponse.json({ error: "تعذر حذف المصروف" }, { status: 500 });
  }
}
