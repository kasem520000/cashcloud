import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { postAutoJournal, expenseAccountCode } from "@/lib/accounting";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const g = await guard("expenses:read");
    if (!g.ok) return g.response;

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";

    const where: Record<string, unknown> = { companyId: g.ctx.company.id };
    if (q) {
      where.OR = [
        { note: { contains: q } },
        { refNo: { contains: q } },
        { category: { contains: q } },
      ];
    }

    const expenses = await db.expense.findMany({
      where,
      orderBy: { date: "desc" },
    });

    const categories = [
      ...new Set(expenses.map((e) => e.category).filter(Boolean)),
    ];
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTotal = expenses
      .filter((e) => new Date(e.date) >= today)
      .reduce((s, e) => s + e.amount, 0);

    return NextResponse.json({ expenses, categories, total, todayTotal });
  } catch (error) {
    console.error("[expenses:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل المصاريف" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await guard("expenses:write");
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const amount = Number(body?.amount);
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "المبلغ يجب أن يكون أكبر من صفر" }, { status: 400 });
    }

    const count = await db.expense.count({ where: { companyId: g.ctx.company.id } });
    const category = body?.category?.trim() || "عام";
    const expense = await db.expense.create({
      data: {
        companyId: g.ctx.company.id,
        category,
        amount,
        date: body?.date ? new Date(body.date) : new Date(),
        refNo: body?.refNo?.trim() || `EXP-${String(count + 1).padStart(4, "0")}`,
        note: body?.note?.trim() || null,
      },
    });

    // قيد المصروف: حساب المصروف ← النقدية
    await postAutoJournal({
      companyId: g.ctx.company.id,
      date: expense.date,
      description: `مصروف ${category} — ${expense.refNo}`,
      reference: `EXPENSE-${expense.refNo}`,
      source: "auto-expense",
      lines: [
        { code: expenseAccountCode(category), debit: amount, description: category },
        { code: "1010", credit: amount, description: "دفع نقدي" },
      ],
    });

    // إشعار المصروف
    await notify({
      companyId: g.ctx.company.id,
      title: "مصروف جديد",
      message: `تم تسجيل مصروف «${category}» بمبلغ ${amount.toFixed(2)} ${g.ctx.company.currency} — مرجع ${expense.refNo}`,
      type: "expense",
      link: "expenses",
    });

    await logAudit({
      companyId: g.ctx.company.id,
      userId: g.ctx.user.id,
      username: g.ctx.user.username,
      action: "expense.create",
      entity: "expense",
      entityId: expense.id,
      details: { category, amount, refNo: expense.refNo },
    });

    return NextResponse.json(expense, { status: 201 });
  } catch (error) {
    console.error("[expenses:POST]", error);
    return NextResponse.json({ error: "تعذر إضافة المصروف" }, { status: 500 });
  }
}
