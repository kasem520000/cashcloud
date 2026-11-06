import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const BRANCH_KINDS = ["store", "warehouse", "kiosk"] as const;

/** GET — قائمة الفروع مع إحصائيات كل فرع (مبيعات، فواتير، مخزون ورديات) */
export async function GET() {
  try {
    const g = await guard("products:read");
    if (!g.ok) return g.response;

    const branches = await db.branch.findMany({
      where: { companyId: g.ctx.company.id },
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { sales: true, purchases: true, shifts: true } },
      },
    });

    // مبيعات كل فرع (فواتير نهائية فقط)
    const salesAgg = await db.sale.groupBy({
      by: ["branchId"],
      where: {
        companyId: g.ctx.company.id,
        status: "final",
        kind: "invoice",
      },
      _sum: { total: true },
    });
    const salesMap = new Map(salesAgg.map((s) => [s.branchId ?? "", s._sum.total ?? 0]));

    const openShifts = await db.posShift.findMany({
      where: { companyId: g.ctx.company.id, status: "open" },
      select: { branchId: true, id: true, openedAt: true },
    });
    const openShiftsMap = new Map<string, number>();
    for (const sh of openShifts) {
      if (sh.branchId) openShiftsMap.set(sh.branchId, (openShiftsMap.get(sh.branchId) ?? 0) + 1);
    }

    return NextResponse.json({
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        kind: b.kind,
        phone: b.phone,
        address: b.address,
        city: b.city,
        isActive: b.isActive,
        createdAt: b.createdAt,
        salesCount: b._count.sales,
        purchasesCount: b._count.purchases,
        shiftsCount: b._count.shifts,
        salesTotal: salesMap.get(b.id) ?? 0,
        openShifts: openShiftsMap.get(b.id) ?? 0,
      })),
    });
  } catch (error) {
    console.error("[branches:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل الفروع" }, { status: 500 });
  }
}

/** POST — إنشاء فرع جديد */
export async function POST(req: NextRequest) {
  try {
    const g = await guard("team:manage");
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
    const kind = BRANCH_KINDS.includes(body?.kind) ? body.kind : "store";

    if (name.length < 2) {
      return NextResponse.json({ error: "اسم الفرع مطلوب (حرفان على الأقل)" }, { status: 400 });
    }
    if (!/^[A-Z0-9-]{2,10}$/.test(code)) {
      return NextResponse.json(
        { error: "رمز الفرع غير صالح — حروف إنجليزية/أرقام (2-10 خانات) مثل: RYD-01" },
        { status: 400 }
      );
    }

    const exists = await db.branch.findFirst({
      where: { companyId: g.ctx.company.id, OR: [{ code }, { name }] },
    });
    if (exists) {
      return NextResponse.json(
        { error: exists.code === code ? "رمز الفرع مستخدم مسبقاً" : "اسم الفرع مستخدم مسبقاً" },
        { status: 400 }
      );
    }

    const branch = await db.branch.create({
      data: {
        companyId: g.ctx.company.id,
        name,
        code,
        kind,
        phone: body?.phone?.trim() || null,
        address: body?.address?.trim() || null,
        city: body?.city?.trim() || null,
        isActive: body?.isActive === false ? false : true,
      },
    });

    await notify({
      companyId: g.ctx.company.id,
      title: "فرع جديد",
      message: `تم إنشاء الفرع «${branch.name}» برمز ${branch.code}`,
      type: "system",
      link: "branches",
    });

    await logAudit({
      companyId: g.ctx.company.id,
      userId: g.ctx.user.id,
      username: g.ctx.user.username,
      action: "branch.create",
      entity: "branch",
      entityId: branch.id,
      details: { name: branch.name, code: branch.code },
    });

    return NextResponse.json(branch, { status: 201 });
  } catch (error) {
    console.error("[branches:POST]", error);
    return NextResponse.json({ error: "تعذر إنشاء الفرع" }, { status: 500 });
  }
}
