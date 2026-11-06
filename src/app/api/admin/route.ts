import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { notify } from "@/lib/notify";

export const dynamic = "force-dynamic";

/** أسعار الباقات الشهرية (ر.س) — لاحتساب MRR التقديري */
export const PLAN_PRICES: Record<string, number> = {
  trial: 0,
  basic: 99,
  pro: 249,
  enterprise: 599,
};

/** حارس صلاحيات مدير المنصة — يتطلب isPlatformAdmin */
async function guardPlatform() {
  const auth = await getAuth();
  if (!auth) {
    return {
      ok: false as const,
      response: Response.json({ error: "غير مصرح — يرجى تسجيل الدخول" }, { status: 401 }),
    };
  }
  if (!auth.user.isPlatformAdmin) {
    return {
      ok: false as const,
      response: Response.json({ error: "هذه الصفحة لمديري المنصة فقط" }, { status: 403 }),
    };
  }
  return { ok: true as const, auth };
}

/** GET — إحصاءات المنصة + المنشآت + المستخدمون */
export async function GET() {
  try {
    const g = await guardPlatform();
    if (!g.ok) return g.response;

    const [companies, users, invoiceAgg, saleAgg, tickets] = await Promise.all([
      db.company.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { memberships: true, sales: true, products: true } },
          memberships: {
            where: { role: "OWNER" },
            include: { user: { select: { name: true, username: true, email: true } } },
            take: 1,
          },
        },
      }),
      db.user.findMany({
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { memberships: true, sessions: true } } },
      }),
      db.sale.aggregate({ _sum: { total: true }, _count: true }),
      db.purchase.aggregate({ _sum: { total: true }, _count: true }),
      db.supportTicket.findMany({
        orderBy: { updatedAt: "desc" },
        take: 50,
        include: {
          company: { select: { name: true } },
          user: { select: { name: true, username: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
          _count: { select: { messages: true } },
        },
      }),
    ]);

    const active = companies.filter((c) => c.status === "active");
    const suspended = companies.filter((c) => c.status === "suspended");
    const planDistribution: Record<string, number> = { trial: 0, basic: 0, pro: 0, enterprise: 0 };
    for (const c of companies) {
      if (c.plan in planDistribution) planDistribution[c.plan]++;
    }
    const mrr = active.reduce((s, c) => s + (PLAN_PRICES[c.plan] ?? 0), 0);

    return NextResponse.json({
      stats: {
        tenants: companies.length,
        active: active.length,
        suspended: suspended.length,
        users: users.length,
        platformAdmins: users.filter((u) => u.isPlatformAdmin).length,
        invoices: invoiceAgg._count,
        salesVolume: invoiceAgg._sum.total ?? 0,
        purchasesVolume: saleAgg._sum.total ?? 0,
        mrr,
        arr: mrr * 12,
        planDistribution,
      },
      tenants: companies.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        plan: c.plan,
        status: c.status,
        currency: c.currency,
        taxNumber: c.taxNumber,
        createdAt: c.createdAt,
        members: c._count.memberships,
        invoices: c._count.sales,
        products: c._count.products,
        owner: c.memberships[0]?.user
          ? c.memberships[0].user.name ?? c.memberships[0].user.username
          : "—",
        ownerEmail: c.memberships[0]?.user.email ?? null,
      })),
      users: users.map((u) => ({
        id: u.id,
        name: u.name ?? u.username,
        username: u.username,
        email: u.email,
        isPlatformAdmin: u.isPlatformAdmin,
        memberships: u._count.memberships,
        createdAt: u.createdAt,
      })),
      tickets: tickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        category: t.category,
        priority: t.priority,
        status: t.status,
        companyName: t.company.name,
        userName: t.user.name ?? t.user.username,
        messagesCount: t._count.messages,
        lastMessage: t.messages[0]?.message ?? "",
        lastMessageAt: t.messages[0]?.createdAt ?? t.updatedAt,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      openTickets: tickets.filter((t) => t.status === "open").length,
    });
  } catch (error) {
    console.error("[admin:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل بيانات المنصة" }, { status: 500 });
  }
}

const VALID_PLANS = ["trial", "basic", "pro", "enterprise"];

/** PATCH — إدارة المنشآت والمستخدمين (تعليق/تفعيل/باقة/صلاحيات) */
export async function PATCH(req: NextRequest) {
  try {
    const g = await guardPlatform();
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const action = body?.action;

    // ---------- إجراءات المنشآت ----------
    if (["suspend", "activate", "set-plan"].includes(action)) {
      const companyId: string = body?.companyId ?? "";
      if (!companyId) return NextResponse.json({ error: "معرّف المنشأة مطلوب" }, { status: 400 });

      const company = await db.company.findUnique({ where: { id: companyId } });
      if (!company) return NextResponse.json({ error: "المنشأة غير موجودة" }, { status: 404 });

      if (action === "suspend") {
        await db.company.update({ where: { id: companyId }, data: { status: "suspended" } });
        // إنهاء جلسات أعضاء المنشأة المعلقة فوراً
        const members = await db.membership.findMany({
          where: { companyId },
          select: { userId: true },
        });
        await db.session.deleteMany({
          where: { userId: { in: members.map((m) => m.userId) } },
        });
        return NextResponse.json({ ok: true, message: `تم تعليق «${company.name}» وإنهاء جلسات مستخدميها` });
      }

      if (action === "activate") {
        await db.company.update({ where: { id: companyId }, data: { status: "active" } });
        return NextResponse.json({ ok: true, message: `تم تفعيل «${company.name}»` });
      }

      // set-plan
      const plan = body?.plan;
      if (!VALID_PLANS.includes(plan)) {
        return NextResponse.json({ error: "باقة غير صالحة" }, { status: 400 });
      }
      await db.company.update({
        where: { id: companyId },
        data: { plan, planStartedAt: new Date() },
      });
      return NextResponse.json({ ok: true, message: `تم ترقية «${company.name}» إلى الباقة المطلوبة` });
    }

    // ---------- إجراءات المستخدمين ----------
    if (action === "grant-admin" || action === "revoke-admin") {
      const userId: string = body?.userId ?? "";
      if (!userId) return NextResponse.json({ error: "معرّف المستخدم مطلوب" }, { status: 400 });

      const user = await db.user.findUnique({ where: { id: userId } });
      if (!user) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
      if (user.id === g.auth.user.id) {
        return NextResponse.json({ error: "لا يمكنك تغيير صلاحياتك بنفسك" }, { status: 400 });
      }

      await db.user.update({
        where: { id: userId },
        data: { isPlatformAdmin: action === "grant-admin" },
      });
      return NextResponse.json({
        ok: true,
        message: action === "grant-admin"
          ? `تم منح «${user.name ?? user.username}» صلاحيات مدير المنصة`
          : `تم سحب صلاحيات مدير المنصة من «${user.name ?? user.username}»`,
      });
    }

    // ---------- إجراءات الدعم (رد فريق المنصة على التذاكر) ----------
    if (action === "ticket-reply" || action === "ticket-status") {
      const ticketId: string = body?.ticketId ?? "";
      if (!ticketId) return NextResponse.json({ error: "معرّف التذكرة مطلوب" }, { status: 400 });

      const ticket = await db.supportTicket.findUnique({ where: { id: ticketId } });
      if (!ticket) return NextResponse.json({ error: "التذكرة غير موجودة" }, { status: 404 });

      if (action === "ticket-reply") {
        const message = typeof body?.message === "string" ? body.message.trim() : "";
        if (!message) return NextResponse.json({ error: "نص الرد مطلوب" }, { status: 400 });
        await db.supportMessage.create({
          data: { ticketId, senderId: g.auth.user.id, isStaff: true, message },
        });
        await db.supportTicket.update({
          where: { id: ticketId },
          data: { status: "answered", updatedAt: new Date() },
        });
        await notify({
          companyId: ticket.companyId,
          title: "رد جديد على تذكرتك",
          message: `رد فريق الدعم على «${ticket.subject}»: ${message.slice(0, 140)}${message.length > 140 ? "..." : ""}`,
          type: "support",
          link: "support",
        });
        return NextResponse.json({ ok: true, message: "تم إرسال الرد للعميل" });
      }

      const status = ["open", "answered", "resolved", "closed"].includes(body?.status)
        ? body.status
        : "";
      if (!status) return NextResponse.json({ error: "حالة غير صالحة" }, { status: 400 });
      await db.supportTicket.update({
        where: { id: ticketId },
        data: { status, updatedAt: new Date() },
      });
      return NextResponse.json({ ok: true, message: `تم تحديث حالة التذكرة إلى «${status}»` });
    }

    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  } catch (error) {
    console.error("[admin:PATCH]", error);
    return NextResponse.json({ error: "تعذر تنفيذ الإجراء" }, { status: 500 });
  }
}
