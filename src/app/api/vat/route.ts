import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { notify } from "@/lib/notify";

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** الفترة الافتراضية: الشهر الماضي كاملاً */
function defaultPeriod(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  return { from, to };
}

/** آخر موعد للإقرار: نهاية الشهر التالي لنهاية الفترة (قاعدة زتكا: خلال 30 يوماً) */
function dueDate(periodEnd: Date): Date {
  const d = new Date(periodEnd);
  return new Date(d.getFullYear(), d.getMonth() + 1 + 1, 0);
}

/** حساب بيانات الإقرار لفترة محددة من المبيعات والمشتريات الفعلية (مع خصم المرتجعات) */
async function computeDeclaration(companyId: string, from: Date, to: Date) {
  const [sales, purchases] = await Promise.all([
    db.sale.findMany({
      where: { companyId, status: "final", date: { gte: from, lte: to } },
      select: { subtotal: true, discount: true, tax: true, kind: true },
    }),
    db.purchase.findMany({
      where: { companyId, status: "received", date: { gte: from, lte: to } },
      select: { subtotal: true, discount: true, tax: true, kind: true },
    }),
  ]);

  // فصل الفواتير عن المرتجعات (الإشعارات الدائنة ومرتجعات المشتريات)
  const salesInvoices = sales.filter((s) => s.kind !== "credit-note");
  const creditNotes = sales.filter((s) => s.kind === "credit-note");
  const purchaseInvoices = purchases.filter((p) => p.kind !== "return");
  const purchaseReturns = purchases.filter((p) => p.kind === "return");

  const salesAmount = r2(
    salesInvoices.reduce((s, x) => s + Math.max(0, x.subtotal - x.discount), 0) -
      creditNotes.reduce((s, x) => s + Math.max(0, x.subtotal - x.discount), 0)
  );
  const outputVat = r2(
    salesInvoices.reduce((s, x) => s + x.tax, 0) -
      creditNotes.reduce((s, x) => s + x.tax, 0)
  );
  const purchasesAmount = r2(
    purchaseInvoices.reduce((s, x) => s + Math.max(0, x.subtotal - x.discount), 0) -
      purchaseReturns.reduce((s, x) => s + Math.max(0, x.subtotal - x.discount), 0)
  );
  const inputVat = r2(
    purchaseInvoices.reduce((s, x) => s + x.tax, 0) -
      purchaseReturns.reduce((s, x) => s + x.tax, 0)
  );
  const netVat = r2(outputVat - inputVat);

  return {
    period: { from, to },
    salesCount: salesInvoices.length,
    purchasesCount: purchaseInvoices.length,
    salesAmount,
    outputVat,
    purchasesAmount,
    inputVat,
    netVat,
    dueDate: dueDate(to),
    // ملاحظة المرتجعات المخصومة من الوعاءين
    adjustments: {
      creditNotes: creditNotes.length,
      purchaseReturns: purchaseReturns.length,
    },
  };
}

/** GET — حساب الإقرار للفترة (?from=&to=) + سجل الإقرارات المقدمة */
export async function GET(req: NextRequest) {
  try {
    const g = await guard("accounting:read");
    if (!g.ok) return g.response;

    const { searchParams } = new URL(req.url);
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");
    const { from, to } = defaultPeriod();
    const periodFrom = fromStr ? new Date(fromStr) : from;
    const periodTo = toStr ? new Date(toStr + "T23:59:59.999") : to;
    if (isNaN(periodFrom.getTime()) || isNaN(periodTo.getTime()) || periodFrom > periodTo) {
      return NextResponse.json({ error: "فترة غير صالحة" }, { status: 400 });
    }

    const [declaration, history] = await Promise.all([
      computeDeclaration(g.ctx.company.id, periodFrom, periodTo),
      db.vatDeclaration.findMany({
        where: { companyId: g.ctx.company.id },
        orderBy: { periodEnd: "desc" },
        take: 24,
      }),
    ]);

    const filed = history.find(
      (h) =>
        new Date(h.periodStart).getTime() === periodFrom.getTime() ||
        (new Date(h.periodStart) <= periodFrom && new Date(h.periodEnd) >= periodFrom)
    );

    return NextResponse.json({
      declaration,
      filed: filed ?? null,
      history,
      currency: g.ctx.company.currency,
      taxNumber: g.ctx.company.taxNumber,
    });
  } catch (error) {
    console.error("[vat:GET]", error);
    return NextResponse.json({ error: "تعذر حساب الإقرار الضريبي" }, { status: 500 });
  }
}

/** POST — تقديم/حفظ الإقرار الضريبي للفترة { from, to, notes? } */
export async function POST(req: NextRequest) {
  try {
    const g = await guard("accounting:write");
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const from = body?.from ? new Date(body.from) : null;
    const to = body?.to ? new Date(body.to + "T23:59:59.999") : null;
    if (!from || !to || isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
      return NextResponse.json({ error: "فترة غير صالحة" }, { status: 400 });
    }

    const computed = await computeDeclaration(g.ctx.company.id, from, to);
    const notes = typeof body?.notes === "string" && body.notes.trim()
      ? body.notes.trim().slice(0, 500)
      : null;

    const declaration = await db.vatDeclaration.upsert({
      where: {
        companyId_periodStart_periodEnd: {
          companyId: g.ctx.company.id,
          periodStart: from,
          periodEnd: to,
        },
      },
      update: {
        salesAmount: computed.salesAmount,
        outputVat: computed.outputVat,
        purchasesAmount: computed.purchasesAmount,
        inputVat: computed.inputVat,
        netVat: computed.netVat,
        notes,
        filedAt: new Date(),
      },
      create: {
        companyId: g.ctx.company.id,
        periodStart: from,
        periodEnd: to,
        salesAmount: computed.salesAmount,
        outputVat: computed.outputVat,
        purchasesAmount: computed.purchasesAmount,
        inputVat: computed.inputVat,
        netVat: computed.netVat,
        notes,
      },
    });

    await notify({
      companyId: g.ctx.company.id,
      title: "تم تقديم الإقرار الضريبي",
      message: `قُدّم إقرار ضريبة القيمة المضافة للفترة ${from.toLocaleDateString("ar-EG")} — ${to.toLocaleDateString("ar-EG")} بصافي ضريبة ${computed.netVat.toFixed(2)} ${g.ctx.company.currency}${computed.netVat >= 0 ? " (مستحق للهيئة)" : " (رصيد مسترد)"}.`,
      type: "vat",
      link: "vat",
    });

    return NextResponse.json({ ok: true, declaration }, { status: 201 });
  } catch (error) {
    console.error("[vat:POST]", error);
    return NextResponse.json({ error: "تعذر تقديم الإقرار الضريبي" }, { status: 500 });
  }
}
