import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const g = await guard("accounting:read");
    if (!g.ok) return g.response;

    const { id } = await params;
    const entry = await db.journalEntry.findFirst({
      where: { id, companyId: g.ctx.company.id },
      include: {
        lines: {
          include: { account: { select: { code: true, name: true, type: true } } },
          orderBy: { debit: "desc" },
        },
      },
    });
    if (!entry) {
      return NextResponse.json({ error: "القيد غير موجود" }, { status: 404 });
    }
    return NextResponse.json(entry);
  } catch (error) {
    console.error("[journal:id:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل القيد" }, { status: 500 });
  }
}

// ترحيل قيد مسودة
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const g = await guard("accounting:write");
    if (!g.ok) return g.response;

    const { id } = await params;
    const entry = await db.journalEntry.findFirst({
      where: { id, companyId: g.ctx.company.id },
      include: { lines: true },
    });
    if (!entry) {
      return NextResponse.json({ error: "القيد غير موجود" }, { status: 404 });
    }
    if (entry.status === "posted") {
      return NextResponse.json({ error: "القيد مُرحّل مسبقاً" }, { status: 400 });
    }

    const debit = entry.lines.reduce((s, l) => s + l.debit, 0);
    const credit = entry.lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(debit - credit) > 0.01) {
      return NextResponse.json(
        { error: "لا يمكن ترحيل قيد غير متوازن" },
        { status: 400 }
      );
    }

    await db.journalEntry.update({ where: { id }, data: { status: "posted" } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[journal:id:POST]", error);
    return NextResponse.json({ error: "تعذر ترحيل القيد" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const g = await guard("accounting:write");
    if (!g.ok) return g.response;

    const { id } = await params;
    const entry = await db.journalEntry.findFirst({
      where: { id, companyId: g.ctx.company.id },
    });
    if (!entry) {
      return NextResponse.json({ error: "القيد غير موجود" }, { status: 404 });
    }
    if (entry.source !== "manual") {
      return NextResponse.json(
        { error: "لا يمكن حذف قيد تلقائي — عدّل المستند الأصلي بدلاً منه" },
        { status: 400 }
      );
    }

    await db.journalEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[journal:id:DELETE]", error);
    return NextResponse.json({ error: "تعذر حذف القيد" }, { status: 500 });
  }
}
