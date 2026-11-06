import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard, ROLES } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// قائمة أعضاء المنشأة النشطة
export async function GET() {
  try {
    const g = await guard("team:read");
    if (!g.ok) return g.response;

    const members = await db.membership.findMany({
      where: { companyId: g.ctx.company.id },
      include: {
        user: { select: { id: true, username: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      members: members.map((m) => ({
        id: m.id,
        userId: m.user.id,
        name: m.user.name ?? m.user.username,
        username: m.user.username,
        email: m.user.email,
        role: m.role,
        roleLabel: ROLES[m.role] ?? m.role,
        joinedAt: m.createdAt,
        isSelf: m.user.id === g.ctx.user.id,
      })),
      myRole: g.ctx.role,
    });
  } catch (error) {
    console.error("[team:GET] error:", error);
    return NextResponse.json({ error: "تعذر تحميل الفريق" }, { status: 500 });
  }
}

// إضافة عضو / تغيير دور / إزالة عضو
export async function POST(req: NextRequest) {
  try {
    const g = await guard("team:manage");
    if (!g.ok) return g.response;
    const companyId = g.ctx.company.id;

    const body = await req.json().catch(() => null);
    const action = typeof body?.action === "string" ? body.action : "";

    if (action === "add") {
      const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
      const role = typeof body?.role === "string" && ROLES[body.role] ? body.role : "VIEWER";
      if (!username) {
        return NextResponse.json({ error: "اسم المستخدم مطلوب" }, { status: 400 });
      }
      const user = await db.user.findUnique({ where: { username } });
      if (!user) {
        return NextResponse.json(
          { error: "لا يوجد مستخدم بهذا الاسم — يجب أن يسجل حساباً أولاً ثم تضيفه" },
          { status: 404 }
        );
      }
      const exists = await db.membership.findUnique({
        where: { userId_companyId: { userId: user.id, companyId } },
      });
      if (exists) {
        return NextResponse.json({ error: "هذا المستخدم عضو مسبقاً" }, { status: 409 });
      }
      await db.membership.create({ data: { userId: user.id, companyId, role } });
      await logAudit({
        companyId,
        userId: g.ctx.user.id,
        username: g.ctx.user.username,
        action: "team.add",
        entity: "membership",
        entityId: user.id,
        details: { username: user.username, role },
      });
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    if (action === "role") {
      const userId = typeof body?.userId === "string" ? body.userId : "";
      const role = typeof body?.role === "string" && ROLES[body.role] ? body.role : "";
      if (!userId || !role) {
        return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
      }
      const membership = await db.membership.findUnique({
        where: { userId_companyId: { userId, companyId } },
      });
      if (!membership) {
        return NextResponse.json({ error: "العضو غير موجود" }, { status: 404 });
      }
      if (membership.role === "OWNER") {
        return NextResponse.json(
          { error: "لا يمكن تغيير دور المالك" },
          { status: 400 }
        );
      }
      await db.membership.update({ where: { id: membership.id }, data: { role } });
      await logAudit({
        companyId,
        userId: g.ctx.user.id,
        username: g.ctx.user.username,
        action: "team.role",
        entity: "membership",
        entityId: userId,
        details: { from: membership.role, to: role },
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "remove") {
      const userId = typeof body?.userId === "string" ? body.userId : "";
      if (!userId) {
        return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
      }
      if (userId === g.ctx.user.id) {
        return NextResponse.json(
          { error: "لا يمكنك إزالة نفسك من الفريق" },
          { status: 400 }
        );
      }
      const membership = await db.membership.findUnique({
        where: { userId_companyId: { userId, companyId } },
      });
      if (!membership) {
        return NextResponse.json({ error: "العضو غير موجود" }, { status: 404 });
      }
      if (membership.role === "OWNER") {
        return NextResponse.json(
          { error: "لا يمكن إزالة مالك المنشأة" },
          { status: 400 }
        );
      }
      await db.membership.delete({ where: { id: membership.id } });
      await logAudit({
        companyId,
        userId: g.ctx.user.id,
        username: g.ctx.user.username,
        action: "team.remove",
        entity: "membership",
        entityId: userId,
        details: { role: membership.role },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  } catch (error) {
    console.error("[team:POST] error:", error);
    return NextResponse.json({ error: "تعذر تنفيذ الإجراء" }, { status: 500 });
  }
}
