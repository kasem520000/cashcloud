import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** GET — الوردية النشطة للمستخدم + سجل الورديات */
export async function GET(req: NextRequest) {
  try {
    const g = await guard("pos:read");
    if (!g.ok) return g.response;

    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branchId")?.trim() ?? "";

    // الوردية المفتوحة للمستخدم الحالي (وردية واحدة نشطة كحد أقصى)
    const active = await db.posShift.findFirst({
      where: { companyId: g.ctx.company.id, status: "open", userId: g.ctx.user.id },
      include: { branch: { select: { name: true, code: true } } },
    });

    // ملخص الوردية النشطة: مبيعاتها حسب طريقة الدفع
    let activeSummary = null;
    if (active) {
      const sales = await db.sale.findMany({
        where: {
          companyId: g.ctx.company.id,
          posShiftId: active.id,
          status: "final",
        },
        select: { total: true, tax: true, paymentMethod: true, kind: true },
      });
      const invoices = sales.filter((s) => s.kind === "invoice");
      const returns = sales.filter((s) => s.kind === "credit-note");
      const byMethod: Record<string, number> = {};
      for (const s of invoices) {
        byMethod[s.paymentMethod] = r2((byMethod[s.paymentMethod] ?? 0) + s.total);
      }
      activeSummary = {
        salesCount: invoices.length,
        returnsCount: returns.length,
        salesTotal: r2(invoices.reduce((s, x) => s + x.total, 0)),
        returnsTotal: r2(returns.reduce((s, x) => s + x.total, 0)),
        taxTotal: r2(sales.reduce((s, x) => s + x.tax, 0)),
        byMethod,
        expectedCash: r2((byMethod.cash ?? 0) + active.openingCash),
      };
    }

    // سجل الورديات (آخر 30)
    const where: Record<string, unknown> = { companyId: g.ctx.company.id };
    if (branchId) where.branchId = branchId;
    const history = await db.posShift.findMany({
      where,
      orderBy: { openedAt: "desc" },
      take: 30,
      include: { branch: { select: { name: true, code: true } } },
    });

    // اسم الكاشير لكل وردية
    const userIds = [...new Set(history.map((h) => h.userId).filter(Boolean))] as string[];
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, username: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.name || u.username]));

    return NextResponse.json({
      active: active
        ? {
            id: active.id,
            branchId: active.branchId,
            branchName: active.branch?.name ?? null,
            branchCode: active.branch?.code ?? null,
            openedAt: active.openedAt,
            openingCash: active.openingCash,
            status: active.status,
            summary: activeSummary,
          }
        : null,
      history: history.map((h) => ({
        id: h.id,
        branchName: h.branch?.name ?? "بدون فرع",
        cashier: userMap.get(h.userId ?? "") ?? "—",
        openedAt: h.openedAt,
        closedAt: h.closedAt,
        status: h.status,
        openingCash: h.openingCash,
        countedCash: h.countedCash,
        expectedCash: h.expectedCash,
        cashDifference: h.cashDifference,
        salesCount: h.salesCount,
        salesTotal: h.salesTotal,
        note: h.note,
      })),
    });
  } catch (error) {
    console.error("[pos-shifts:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل الورديات" }, { status: 500 });
  }
}

/** POST — فتح وردية جديدة */
export async function POST(req: NextRequest) {
  try {
    const g = await guard("pos:write");
    if (!g.ok) return g.response;

    // وردية واحدة نشطة لكل مستخدم
    const existing = await db.posShift.findFirst({
      where: { companyId: g.ctx.company.id, status: "open", userId: g.ctx.user.id },
    });
    if (existing) {
      return NextResponse.json(
        { error: "لديك وردية مفتوحة بالفعل — أغلقها أولاً" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    const openingCash = Math.max(0, Number(body?.openingCash) || 0);
    let branchId: string | null = null;

    if (body?.branchId) {
      const branch = await db.branch.findFirst({
        where: { id: body.branchId, companyId: g.ctx.company.id, isActive: true },
      });
      if (!branch) {
        return NextResponse.json({ error: "الفرع غير موجود أو معطّل" }, { status: 400 });
      }
      branchId = branch.id;
    }

    const shift = await db.posShift.create({
      data: {
        companyId: g.ctx.company.id,
        branchId,
        userId: g.ctx.user.id,
        openingCash: r2(openingCash),
      },
    });

    await logAudit({
      companyId: g.ctx.company.id,
      userId: g.ctx.user.id,
      username: g.ctx.user.username,
      action: "posshift.open",
      entity: "posshift",
      entityId: shift.id,
      details: { branchId, openingCash },
    });

    return NextResponse.json(shift, { status: 201 });
  } catch (error) {
    console.error("[pos-shifts:POST]", error);
    return NextResponse.json({ error: "تعذر فتح الوردية" }, { status: 500 });
  }
}

/** PATCH — إغلاق الوردية الجارية (مع تحصرة الصندوق وحساب الفرق) */
export async function PATCH(req: NextRequest) {
  try {
    const g = await guard("pos:write");
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const shiftId = typeof body?.shiftId === "string" ? body.shiftId : "";
    const countedCash = Number(body?.countedCash);

    const shift = await db.posShift.findFirst({
      where: { id: shiftId, companyId: g.ctx.company.id, status: "open", userId: g.ctx.user.id },
    });
    if (!shift) {
      return NextResponse.json({ error: "الوردية غير موجودة أو مغلقة مسبقاً" }, { status: 404 });
    }
    if (isNaN(countedCash) || countedCash < 0) {
      return NextResponse.json({ error: "أدخل المحصور النقدي الصحيح" }, { status: 400 });
    }

    // إحصاء مبيعات الوردية من السجل
    const sales = await db.sale.findMany({
      where: { posShiftId: shift.id, status: "final" },
      select: { total: true, paymentMethod: true, kind: true },
    });
    const invoices = sales.filter((s) => s.kind === "invoice");
    const cashSales = invoices
      .filter((s) => s.paymentMethod === "cash")
      .reduce((s, x) => s + x.total, 0);
    const expectedCash = r2(shift.openingCash + cashSales);
    const cashDifference = r2(countedCash - expectedCash);

    const closed = await db.posShift.update({
      where: { id: shift.id },
      data: {
        status: "closed",
        closedAt: new Date(),
        countedCash: r2(countedCash),
        expectedCash,
        cashDifference,
        salesCount: invoices.length,
        salesTotal: r2(invoices.reduce((s, x) => s + x.total, 0)),
        note: body?.note?.trim() || null,
      },
    });

    if (Math.abs(cashDifference) >= 0.01) {
      await notify({
        companyId: g.ctx.company.id,
        title: "فرق في إغلاق صندوق",
        message: `أُغلقت وردية ${g.ctx.user.name ?? g.ctx.user.username} بفرق ${cashDifference > 0 ? "زيادة" : "عجز"} ${Math.abs(cashDifference).toFixed(2)} ${g.ctx.company.currency}`,
        type: "system",
        link: "pos",
      });
    }

    await logAudit({
      companyId: g.ctx.company.id,
      userId: g.ctx.user.id,
      username: g.ctx.user.username,
      action: "posshift.close",
      entity: "posshift",
      entityId: shift.id,
      details: { countedCash, expectedCash, cashDifference, salesCount: invoices.length },
    });

    return NextResponse.json({
      shift: closed,
      report: {
        expectedCash,
        countedCash: r2(countedCash),
        cashDifference,
        salesCount: invoices.length,
        salesTotal: r2(invoices.reduce((s, x) => s + x.total, 0)),
      },
    });
  } catch (error) {
    console.error("[pos-shifts:PATCH]", error);
    return NextResponse.json({ error: "تعذر إغلاق الوردية" }, { status: 500 });
  }
}
