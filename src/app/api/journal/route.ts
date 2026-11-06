import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { nextJournalNumber } from "@/lib/accounting";

export const dynamic = "force-dynamic";

type LineInput = { accountId: string; debit: number; credit: number; description?: string };

function parseLines(raw: unknown): LineInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l: Record<string, unknown>) => ({
      accountId: String(l?.accountId ?? ""),
      debit: Number(l?.debit) || 0,
      credit: Number(l?.credit) || 0,
      description: typeof l?.description === "string" && l.description.trim() ? l.description.trim() : undefined,
    }))
    .filter((l) => l.accountId && (l.debit > 0 || l.credit > 0))
    .map((l) => ({
      ...l,
      debit: Math.round(l.debit * 100) / 100,
      credit: Math.round(l.credit * 100) / 100,
    }));
}

export async function GET(req: NextRequest) {
  try {
    const g = await guard("accounting:read");
    if (!g.ok) return g.response;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = 20;
    const status = searchParams.get("status") ?? "";
    const q = searchParams.get("q")?.trim() ?? "";

    const where: Record<string, unknown> = { companyId: g.ctx.company.id };
    if (status === "draft" || status === "posted") where.status = status;
    if (q) {
      where.OR = [
        { description: { contains: q } },
        { number: { contains: q } },
        { reference: { contains: q } },
      ];
    }

    const [total, entries] = await Promise.all([
      db.journalEntry.count({ where }),
      db.journalEntry.findMany({
        where,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { lines: true },
      }),
    ]);

    return NextResponse.json({
      entries: entries.map((e) => ({
        id: e.id,
        number: e.number,
        date: e.date,
        description: e.description,
        reference: e.reference,
        source: e.source,
        status: e.status,
        linesCount: e.lines.length,
        totalDebit: Math.round(e.lines.reduce((s, l) => s + l.debit, 0) * 100) / 100,
      })),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    console.error("[journal:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل القيود" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await guard("accounting:write");
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    const date = body?.date ? new Date(body.date) : new Date();
    const reference = typeof body?.reference === "string" && body.reference.trim() ? body.reference.trim() : null;
    const status = body?.status === "posted" ? "posted" : "draft";
    const lines = parseLines(body?.lines);

    if (!description) {
      return NextResponse.json({ error: "وصف القيد مطلوب" }, { status: 400 });
    }
    if (lines.length < 2) {
      return NextResponse.json(
        { error: "القيد يحتاج سطرين على الأقل (مدين ودائن)" },
        { status: 400 }
      );
    }

    const debit = lines.reduce((s, l) => s + l.debit, 0);
    const credit = lines.reduce((s, l) => s + l.credit, 0);
    if (status === "posted" && Math.abs(debit - credit) > 0.01) {
      return NextResponse.json(
        { error: "القيد غير متوازن: يجب أن يتساوى المدين مع الدائن" },
        { status: 400 }
      );
    }

    // التحقق من ملكية الحسابات
    const accountIds = [...new Set(lines.map((l) => l.accountId))];
    const owned = await db.account.findMany({
      where: { id: { in: accountIds }, companyId: g.ctx.company.id },
      select: { id: true },
    });
    if (owned.length !== accountIds.length) {
      return NextResponse.json(
        { error: "أحد الحسابات المختارة غير تابع لمنشأتك" },
        { status: 400 }
      );
    }

    const number = await nextJournalNumber(g.ctx.company.id);
    const entry = await db.journalEntry.create({
      data: {
        companyId: g.ctx.company.id,
        number,
        date: isNaN(date.getTime()) ? new Date() : date,
        description,
        reference,
        source: "manual",
        status,
        lines: { create: lines },
      },
      include: { lines: true },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("[journal:POST]", error);
    return NextResponse.json({ error: "تعذر إنشاء القيد" }, { status: 500 });
  }
}
