import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** PATCH — تعديل مستودع (الاسم، الموقع، أمين المستودع، الفرع، التفعيل، الافتراضي) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guard("products:write");
    if (!g.ok) return g.response;

    const { id } = await params;
    const body = await req.json().catch(() => null);

    const warehouse = await db.warehouse.findFirst({
      where: { id, companyId: g.ctx.company.id },
    });
    if (!warehouse) {
      return NextResponse.json({ error: "المستودع غير موجود" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (typeof body?.name === "string" && body.name.trim().length >= 2) {
      const name = body.name.trim();
      const dup = await db.warehouse.findFirst({
        where: { companyId: g.ctx.company.id, name, id: { not: id } },
      });
      if (dup) {
        return NextResponse.json({ error: "الاسم مستخدم لمستودع آخر" }, { status: 400 });
      }
      data.name = name;
    }
    if (typeof body?.location === "string") data.location = body.location.trim() || null;
    if (typeof body?.keeper === "string") data.keeper = body.keeper.trim() || null;
    if (typeof body?.isActive === "boolean") data.isActive = body.isActive;

    // ربط بفرع (أو فك الربط)
    if (body?.branchId !== undefined) {
      if (body.branchId === null || body.branchId === "") {
        data.branchId = null;
      } else {
        const branch = await db.branch.findFirst({
          where: { id: body.branchId, companyId: g.ctx.company.id },
          select: { id: true },
        });
        if (!branch) {
          return NextResponse.json({ error: "الفرع التابع غير موجود" }, { status: 400 });
        }
        data.branchId = branch.id;
      }
    }

    // تعيينه افتراضياً
    if (body?.isDefault === true) {
      data.isDefault = true;
      data.isActive = true;
    }

    const updated = await db.$transaction(async (tx) => {
      const result = await tx.warehouse.update({ where: { id }, data });
      if (data.isDefault === true) {
        await tx.warehouse.updateMany({
          where: { companyId: g.ctx.company.id, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return result;
    });

    await logAudit({
      companyId: g.ctx.company.id,
      userId: g.ctx.user.id,
      username: g.ctx.user.username,
      action: "warehouse.update",
      entity: "warehouse",
      entityId: id,
      details: data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[warehouses:PATCH]", error);
    return NextResponse.json({ error: "تعذر تحديث المستودع" }, { status: 500 });
  }
}

/** DELETE — حذف مستودع (ممنوع إن كان افتراضياً أو يحتوي أرصدة) */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guard("products:write");
    if (!g.ok) return g.response;

    const { id } = await params;
    const warehouse = await db.warehouse.findFirst({
      where: { id, companyId: g.ctx.company.id },
      include: { stockLevels: { where: { quantity: { not: 0 } }, select: { quantity: true } } },
    });
    if (!warehouse) {
      return NextResponse.json({ error: "المستودع غير موجود" }, { status: 404 });
    }
    if (warehouse.isDefault) {
      return NextResponse.json(
        { error: "لا يمكن حذف المستودع الافتراضي — عيّن مستودعاً آخر كافتراضي أولاً" },
        { status: 400 }
      );
    }
    if (warehouse.stockLevels.length > 0) {
      return NextResponse.json(
        { error: "لا يمكن حذف مستودع يحتوي أرصدة — أفرغه بالتحويل لمستودع آخر أولاً" },
        { status: 400 }
      );
    }

    await db.warehouse.delete({ where: { id } });

    await logAudit({
      companyId: g.ctx.company.id,
      userId: g.ctx.user.id,
      username: g.ctx.user.username,
      action: "warehouse.delete",
      entity: "warehouse",
      entityId: id,
      details: { name: warehouse.name, code: warehouse.code },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[warehouses:DELETE]", error);
    return NextResponse.json({ error: "تعذر حذف المستودع" }, { status: 500 });
  }
}
