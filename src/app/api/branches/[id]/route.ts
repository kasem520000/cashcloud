import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const BRANCH_KINDS = ["store", "warehouse", "kiosk"] as const;

/** PATCH — تعديل فرع */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guard("team:manage");
    if (!g.ok) return g.response;

    const { id } = await params;
    const body = await req.json().catch(() => null);

    const branch = await db.branch.findFirst({
      where: { id, companyId: g.ctx.company.id },
    });
    if (!branch) {
      return NextResponse.json({ error: "الفرع غير موجود" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (typeof body?.name === "string" && body.name.trim().length >= 2) {
      data.name = body.name.trim();
    }
    if (typeof body?.kind === "string" && BRANCH_KINDS.includes(body.kind as never)) {
      data.kind = body.kind;
    }
    if (typeof body?.phone === "string") data.phone = body.phone.trim() || null;
    if (typeof body?.address === "string") data.address = body.address.trim() || null;
    if (typeof body?.city === "string") data.city = body.city.trim() || null;
    if (typeof body?.isActive === "boolean") data.isActive = body.isActive;

    const updated = await db.branch.update({ where: { id }, data });

    await logAudit({
      companyId: g.ctx.company.id,
      userId: g.ctx.user.id,
      username: g.ctx.user.username,
      action: "branch.update",
      entity: "branch",
      entityId: id,
      details: data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[branches:PATCH]", error);
    return NextResponse.json({ error: "تعذر تحديث الفرع" }, { status: 500 });
  }
}

/** DELETE — حذف فرع (يُمنع إن كان عليه فواتير أو ورديات) */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guard("team:manage");
    if (!g.ok) return g.response;

    const { id } = await params;
    const branch = await db.branch.findFirst({
      where: { id, companyId: g.ctx.company.id },
      include: { _count: { select: { sales: true, purchases: true, shifts: true } } },
    });
    if (!branch) {
      return NextResponse.json({ error: "الفرع غير موجود" }, { status: 404 });
    }
    if (branch._count.sales > 0 || branch._count.purchases > 0 || branch._count.shifts > 0) {
      return NextResponse.json(
        {
          error: `لا يمكن حذف الفرع — عليه ${branch._count.sales} فاتورة بيع و${branch._count.purchases} فاتورة شراء. عطّله بدلاً من حذفه`,
        },
        { status: 400 }
      );
    }

    await db.branch.delete({ where: { id } });

    await logAudit({
      companyId: g.ctx.company.id,
      userId: g.ctx.user.id,
      username: g.ctx.user.username,
      action: "branch.delete",
      entity: "branch",
      entityId: id,
      details: { name: branch.name },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[branches:DELETE]", error);
    return NextResponse.json({ error: "تعذر حذف الفرع" }, { status: 500 });
  }
}
