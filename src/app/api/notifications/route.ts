import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET — إشعارات المنشأة للمستخدم الحالي + عدد غير المقروء */
export async function GET(req: NextRequest) {
  try {
    const g = await guard();
    if (!g.ok) return g.response;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(5, Number(searchParams.get("limit")) || 30));

    const where = {
      companyId: g.ctx.company.id,
      OR: [{ userId: null }, { userId: g.ctx.user.id }],
    };

    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      db.notification.count({ where: { ...where, isRead: false } }),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error("[notifications:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل الإشعارات" }, { status: 500 });
  }
}

/** PUT — تعليم مقروء: { id } أو { all: true } */
export async function PUT(req: NextRequest) {
  try {
    const g = await guard();
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const scope = {
      companyId: g.ctx.company.id,
      OR: [{ userId: null }, { userId: g.ctx.user.id }],
    };

    if (body?.all) {
      await db.notification.updateMany({ where: { ...scope, isRead: false }, data: { isRead: true } });
      return NextResponse.json({ ok: true });
    }

    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) {
      return NextResponse.json({ error: "معرّف الإشعار مطلوب" }, { status: 400 });
    }
    await db.notification.updateMany({ where: { ...scope, id }, data: { isRead: true } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[notifications:PUT]", error);
    return NextResponse.json({ error: "تعذر تحديث الإشعار" }, { status: 500 });
  }
}
