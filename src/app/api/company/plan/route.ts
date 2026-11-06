import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const VALID_PLANS = ["trial", "basic", "pro", "enterprise"];

export const PLANS_INFO = [
  {
    key: "trial",
    name: "التجريبية",
    price: 0,
    period: "مجاناً",
    features: [
      "منشأة واحدة",
      "حتى 50 فاتورة شهرياً",
      "مستخدمان",
      "التقارير الأساسية",
    ],
  },
  {
    key: "basic",
    name: "الأساسية",
    price: 99,
    period: "شهرياً",
    features: [
      "حتى 300 فاتورة شهرياً",
      "5 مستخدمين بأدوار",
      "المحاسبة والقيود اليومية",
      "تقارير الأرباح والخسائر",
    ],
  },
  {
    key: "pro",
    name: "الاحترافية",
    price: 249,
    period: "شهرياً",
    features: [
      "فواتير غير محدودة",
      "15 مستخدماً بأدوار",
      "نقاط البيع POS",
      "كل التقارير المتقدمة",
      "أعمار الذمم والميزانية",
    ],
  },
  {
    key: "enterprise",
    name: "المؤسسات",
    price: 599,
    period: "شهرياً",
    features: [
      "كل ميزات الاحترافية",
      "مستخدمون غير محدودين",
      "منشآت متعددة بالتبديل",
      "دعم أولوية 24/7",
    ],
  },
];

export async function GET() {
  const g = await guard();
  if (!g.ok) return g.response;
  return NextResponse.json({
    plans: PLANS_INFO,
    current: g.ctx.company.plan,
    role: g.ctx.role,
  });
}

export async function POST(req: NextRequest) {
  try {
    const g = await guard("billing:manage");
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const plan = typeof body?.plan === "string" ? body.plan : "";
    if (!VALID_PLANS.includes(plan)) {
      return NextResponse.json({ error: "باقة غير معروفة" }, { status: 400 });
    }

    await db.company.update({
      where: { id: g.ctx.company.id },
      data: { plan, planStartedAt: new Date() },
    });

    // إشعار تغيير الباقة
    await notify({
      companyId: g.ctx.company.id,
      title: "تم تحديث باقة الاشتراك",
      message: `تم تحويل باقة المنشأة إلى «${PLANS_INFO.find((p) => p.key === plan)?.name ?? plan}» بنجاح.`,
      type: "subscription",
      link: "plans",
    });

    await logAudit({
      companyId: g.ctx.company.id,
      userId: g.ctx.user.id,
      username: g.ctx.user.username,
      action: "plan.change",
      entity: "company",
      entityId: g.ctx.company.id,
      details: { plan },
    });

    return NextResponse.json({ ok: true, plan });
  } catch (error) {
    console.error("[company:plan] error:", error);
    return NextResponse.json({ error: "تعذر تحديث الباقة" }, { status: 500 });
  }
}
