import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, createSession, uniqueSlug } from "@/lib/auth";
import { seedCOA } from "@/lib/accounting";
import { notifyMany } from "@/lib/notify";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const VALID_PLANS = ["trial", "basic", "pro", "enterprise"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
    const email = typeof body?.email === "string" && body.email.trim() ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const businessName = typeof body?.businessName === "string" ? body.businessName.trim() : "";
    const plan = VALID_PLANS.includes(body?.plan) ? body.plan : "trial";

    if (!name || !username || !password || !businessName) {
      return NextResponse.json(
        { error: "يرجى تعبئة جميع الحقول المطلوبة (الاسم، اسم المستخدم، اسم المنشأة، كلمة السر)" },
        { status: 400 }
      );
    }
    if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) {
      return NextResponse.json(
        { error: "اسم المستخدم يجب أن يكون بالإنجليزية 3-30 حرفاً (أحرف وأرقام و _ . -)" },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "كلمة السر يجب أن تكون 6 أحرف على الأقل" },
        { status: 400 }
      );
    }

    const exists = await db.user.findUnique({ where: { username } });
    if (exists) {
      return NextResponse.json({ error: "اسم المستخدم محجوز مسبقاً" }, { status: 409 });
    }
    if (email) {
      const emailTaken = await db.user.findUnique({ where: { email } });
      if (emailTaken) {
        return NextResponse.json({ error: "البريد الإلكتروني مستخدم مسبقاً" }, { status: 409 });
      }
    }

    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          email: email || null,
          name,
          passwordHash: hashPassword(password),
        },
      });

      const company = await tx.company.create({
        data: {
          name: businessName,
          slug: await uniqueSlug(businessName),
          plan,
          email: email || null,
        },
      });

      await tx.membership.create({
        data: { userId: user.id, companyId: company.id, role: "OWNER" },
      });

      return { user, company };
    });

    // زرع دليل الحسابات الافتراضي للمنشأة الجديدة
    await seedCOA(result.company.id);

    // إشعارات الترحيب لكل مشترك جديد
    await notifyMany(result.company.id, [
      {
        title: "مرحباً بك في نظامك المحاسبي 🎉",
        message: `تم إنشاء منشأة «${result.company.name}» بنجاح مع دليل حسابات كامل جاهز للعمل. ابدأ بإضافة أصنافك وعملائك ثم أصدر أول فاتورة.`,
        type: "system",
      },
      {
        title: "استكمل بيانات الامتثال الضريبي",
        message: "سجّل رقمك الضريبي (15 رقماً) والسجل التجاري والعنوان الوطني من الإعدادات لتفعيل الفاتورة الإلكترونية وزتكا.",
        type: "vat",
        link: "settings",
      },
      {
        title: "جرّب المساعد الذكي",
        message: "اسأل المساعد المحاسبي الذكي أي سؤال عن فواتيرك أو إقرارك الضريبي أو متطلبات زتكا.",
        type: "system",
        link: "ai",
      },
    ]);

    await createSession(result.user.id);

    // سجل التدقيق: تسجيل حساب ومنشأة جديدة
    await logAudit({
      companyId: result.company.id,
      userId: result.user.id,
      username: result.user.username,
      action: "auth.register",
      entity: "company",
      entityId: result.company.id,
      details: { businessName, plan },
    });

    return NextResponse.json({
      ok: true,
      name: result.user.name ?? result.user.username,
      username: result.user.username,
      businessName: result.company.name,
    }, { status: 201 });
  } catch (error) {
    console.error("[register] error:", error);
    return NextResponse.json(
      { error: "حدث خطأ في الخادم، حاول مرة أخرى" },
      { status: 500 }
    );
  }
}
