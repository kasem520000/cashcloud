import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { notify } from "@/lib/notify";

export const dynamic = "force-dynamic";

const CATEGORIES: Record<string, string> = {
  general: "استفسار عام",
  billing: "الفواتير والاشتراك",
  technical: "مشكلة تقنية",
  zatca: "الامتثال وزتكا",
  accounting: "المحاسبة والقيود",
};

const PRIORITIES: Record<string, string> = {
  low: "منخفضة",
  normal: "عادية",
  high: "عالية",
};

/**
 * رد آلي فوري من المساعد الذكي على تذكرة الدعم —
 * يخفف انتظار العميل ويجيب على الأسئلة الشائعة حتى يرد الفريق البشري.
 */
async function autoReply(ticketId: string, question: string, category: string) {
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content:
            "أنت مساعد الدعم الفني لنظام ERP محاسبي سحابي سعودي (فواتير، مخزون، محاسبة، فاتورة إلكترونية زتكا، ضريبة قيمة مضافة 15%). " +
            "أجب بالعربية بأسلوب دعم فني مهني ومطمئن ومختصر (3-6 أسطر كحد أقصى). " +
            "إن كان السؤال يتطلب تدخل فريق الدعم البشري (مشاكل حساب، فوترة، بيانات خاصة) فأكد أن الفريق سيتواصل معه قريباً خلال ساعات العمل. " +
            "لا تخترع سياسات أو أسعاراً غير معروفة. صنّف السؤال ضمن: " +
            Object.values(CATEGORIES).join("، ") +
            ". فئة التذكرة الحالية: " +
            (CATEGORIES[category] ?? CATEGORIES.general),
        },
        { role: "user", content: question },
      ],
      thinking: { type: "disabled" },
    });
    const reply = completion.choices[0]?.message?.content?.trim();
    if (reply) {
      await db.supportMessage.create({
        data: { ticketId, isStaff: true, message: `🤖 ${reply}` },
      });
      await db.supportTicket.update({
        where: { id: ticketId },
        data: { status: "answered" },
      });
    }
  } catch (error) {
    console.error("[support:autoReply]", error);
  }
}

/** GET — قائمة التذاكر، أو تفاصيل تذكرة واحدة مع الرسائل */
export async function GET(req: NextRequest) {
  try {
    const g = await guard();
    if (!g.ok) return g.response;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      const ticket = await db.supportTicket.findFirst({
        where: { id, companyId: g.ctx.company.id },
        include: {
          messages: { orderBy: { createdAt: "asc" } },
          user: { select: { name: true, username: true } },
        },
      });
      if (!ticket) {
        return NextResponse.json({ error: "التذكرة غير موجودة" }, { status: 404 });
      }
      return NextResponse.json({ ticket });
    }

    const tickets = await db.supportTicket.findMany({
      where: { companyId: g.ctx.company.id },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        user: { select: { name: true, username: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { messages: true } },
      },
    });

    return NextResponse.json({
      tickets: tickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        category: t.category,
        categoryLabel: CATEGORIES[t.category] ?? t.category,
        priority: t.priority,
        priorityLabel: PRIORITIES[t.priority] ?? t.priority,
        status: t.status,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        userName: t.user.name ?? t.user.username,
        messagesCount: t._count.messages,
        lastMessage: t.messages[0]?.message ?? "",
        lastMessageAt: t.messages[0]?.createdAt ?? t.createdAt,
      })),
      categories: Object.entries(CATEGORIES).map(([value, label]) => ({ value, label })),
      priorities: Object.entries(PRIORITIES).map(([value, label]) => ({ value, label })),
    });
  } catch (error) {
    console.error("[support:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل التذاكر" }, { status: 500 });
  }
}

/** POST — إنشاء تذكرة جديدة { subject, category, priority, message } */
export async function POST(req: NextRequest) {
  try {
    const g = await guard();
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const category = CATEGORIES[body?.category] ? body.category : "general";
    const priority = PRIORITIES[body?.priority] ? body.priority : "normal";

    if (!subject || !message) {
      return NextResponse.json(
        { error: "العنوان ووصف المشكلة مطلوبان" },
        { status: 400 }
      );
    }

    const ticket = await db.supportTicket.create({
      data: {
        companyId: g.ctx.company.id,
        userId: g.ctx.user.id,
        subject: subject.slice(0, 120),
        category,
        priority,
        messages: {
          create: { senderId: g.ctx.user.id, message },
        },
      },
      include: { messages: true },
    });

    await notify({
      companyId: g.ctx.company.id,
      title: "تم استلام تذكرة الدعم",
      message: `تذكرتك «${ticket.subject}» قيد المعالجة — ستصلك الإجابة في هذه الصفحة.`,
      type: "support",
      link: "support",
    });

    // رد آلي فوري من المساعد الذكي (لا يمنع الاستجابة)
    await autoReply(ticket.id, `${subject}\n\n${message}`, category);

    return NextResponse.json(
      await db.supportTicket.findUnique({
        where: { id: ticket.id },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      }),
      { status: 201 }
    );
  } catch (error) {
    console.error("[support:POST]", error);
    return NextResponse.json({ error: "تعذر إنشاء التذكرة" }, { status: 500 });
  }
}

/** PUT — إضافة رد / تغيير حالة { id, action, message? } */
export async function PUT(req: NextRequest) {
  try {
    const g = await guard();
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id : "";
    const action = typeof body?.action === "string" ? body.action : "";

    const ticket = await db.supportTicket.findFirst({
      where: { id, companyId: g.ctx.company.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!ticket) {
      return NextResponse.json({ error: "التذكرة غير موجودة" }, { status: 404 });
    }

    if (action === "reply") {
      const message = typeof body?.message === "string" ? body.message.trim() : "";
      if (!message) {
        return NextResponse.json({ error: "نص الرد مطلوب" }, { status: 400 });
      }
      await db.supportMessage.create({
        data: { ticketId: ticket.id, senderId: g.ctx.user.id, message },
      });
      await db.supportTicket.update({
        where: { id: ticket.id },
        data: { status: "open", updatedAt: new Date() },
      });

      const lastStaffQuestion = [...ticket.messages]
        .reverse()
        .find((m) => m.isStaff && !m.message.startsWith("🤖"));
      await autoReply(
        ticket.id,
        `${ticket.subject}\n\n${message}${lastStaffQuestion ? `\n\n(سياق سابق: ${lastStaffQuestion.message.slice(0, 300)})` : ""}`,
        ticket.category
      );

      return NextResponse.json({ ok: true });
    }

    if (["resolve", "close", "reopen"].includes(action)) {
      const status =
        action === "resolve" ? "resolved" : action === "close" ? "closed" : "open";
      await db.supportTicket.update({ where: { id: ticket.id }, data: { status } });
      return NextResponse.json({ ok: true, status });
    }

    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  } catch (error) {
    console.error("[support:PUT]", error);
    return NextResponse.json({ error: "تعذر تحديث التذكرة" }, { status: 500 });
  }
}
