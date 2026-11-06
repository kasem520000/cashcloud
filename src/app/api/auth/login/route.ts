import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!username || !password) {
      return NextResponse.json(
        { error: "يرجى إدخال اسم المستخدم وكلمة السر" },
        { status: 400 }
      );
    }

    const user = await db.user.findFirst({
      where: { OR: [{ username }, { email: username }] },
      include: { memberships: { include: { company: true }, orderBy: { createdAt: "asc" } } },
    });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json(
        { error: "اسم المستخدم أو كلمة السر غير صحيحة" },
        { status: 401 }
      );
    }

    if (user.memberships.length === 0) {
      return NextResponse.json(
        { error: "لا توجد منشأة مرتبطة بحسابك، تواصل مع الدعم" },
        { status: 403 }
      );
    }

    await createSession(user.id);

    // سجل التدقيق: تسجيل الدخول (بدون ctx — نأخذ أول عضوية للمستخدم)
    await logAudit({
      companyId: user.memberships[0]?.companyId ?? null,
      userId: user.id,
      username: user.username,
      action: "auth.login",
      entity: "user",
      entityId: user.id,
    });

    return NextResponse.json({
      ok: true,
      name: user.name ?? user.username,
      username: user.username,
      businessName: user.memberships[0].company.name,
    });
  } catch (error) {
    console.error("[login] error:", error);
    return NextResponse.json(
      { error: "حدث خطأ في الخادم، حاول مرة أخرى" },
      { status: 500 }
    );
  }
}
