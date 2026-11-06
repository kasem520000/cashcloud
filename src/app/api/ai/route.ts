import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** بناء ملخص مالي مضغوط للمنشأة يُغذّى للمساعد كسياق */
async function buildFinancialContext(companyId: string) {
  const [sales, purchases, expenses, products, contacts, recentInvoices] =
    await Promise.all([
      db.sale.findMany({
        where: { companyId, status: "final" },
        select: { subtotal: true, discount: true, tax: true, total: true, paid: true, date: true },
      }),
      db.purchase.findMany({
        where: { companyId },
        select: { subtotal: true, discount: true, tax: true, total: true, paid: true },
      }),
      db.expense.findMany({
        where: { companyId },
        select: { amount: true, category: true },
      }),
      db.product.findMany({
        where: { companyId, isActive: true },
        select: { name: true, stock: true, alertQuantity: true, purchasePrice: true },
      }),
      db.contact.findMany({ where: { companyId }, select: { type: true } }),
      db.sale.findMany({
        where: { companyId, status: "final" },
        orderBy: { date: "desc" },
        take: 5,
        select: {
          invoiceNo: true,
          total: true,
          paid: true,
          date: true,
          contact: { select: { name: true } },
        },
      }),
    ]);

  const totalSales = sales.reduce((s, x) => s + x.total, 0);
  const salesDue = sales.reduce((s, x) => s + (x.total - x.paid), 0);
  const outputVat = sales.reduce((s, x) => s + x.tax, 0);
  const totalPurchases = purchases.reduce((s, x) => s + x.total, 0);
  const purchasesDue = purchases.reduce((s, x) => s + (x.total - x.paid), 0);
  const inputVat = purchases.reduce((s, x) => s + x.tax, 0);
  const totalExpenses = expenses.reduce((s, x) => s + x.amount, 0);
  const netIncome = totalSales - totalPurchases - totalExpenses;
  const lowStock = products.filter((p) => p.stock <= p.alertQuantity);
  const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});

  return {
    المبيعات: {
      الإجمالي: r2(totalSales),
      الذمم_المستحقة: r2(salesDue),
      ضريبة_المخرجات: r2(outputVat),
      عدد_الفواتير: sales.length,
    },
    المشتريات: {
      الإجمالي: r2(totalPurchases),
      المستحق_للموردين: r2(purchasesDue),
      ضريبة_المدخلات: r2(inputVat),
    },
    المصاريف: {
      الإجمالي: r2(totalExpenses),
      حسب_الفئة: Object.fromEntries(
        Object.entries(byCategory).map(([k, v]) => [k, r2(v)])
      ),
    },
    الأداء: {
      صافي_الربح_التقريبي: r2(netIncome),
      صافي_الضريبة_المستحقة: r2(outputVat - inputVat),
    },
    المخزون: {
      عدد_الأصناف: products.length,
      قيمة_المخزون: r2(products.reduce((s, p) => s + p.stock * p.purchasePrice, 0)),
      أصناف_منخفضة: lowStock.map((p) => `${p.name} (${p.stock})`).slice(0, 8),
    },
    العلاقات: {
      عملاء: contacts.filter((c) => c.type === "customer").length,
      موردون: contacts.filter((c) => c.type === "supplier").length,
    },
    أحدث_الفواتير: recentInvoices.map((s) => ({
      رقم: s.invoiceNo,
      العميل: s.contact?.name ?? "نقدي",
      الإجمالي: r2(s.total),
      المدفوع: r2(s.paid),
    })),
  };
}

/** GET — محادثاتي، أو رسائل محادثة محددة ?conversationId= */
export async function GET(req: NextRequest) {
  try {
    const g = await guard();
    if (!g.ok) return g.response;

    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");

    if (conversationId) {
      const conversation = await db.aiConversation.findFirst({
        where: { id: conversationId, companyId: g.ctx.company.id, userId: g.ctx.user.id },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      if (!conversation) {
        return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
      }
      return NextResponse.json({ conversation });
    }

    const conversations = await db.aiConversation.findMany({
      where: { companyId: g.ctx.company.id, userId: g.ctx.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { _count: { select: { messages: true } } },
    });
    return NextResponse.json({
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        messagesCount: c._count.messages,
      })),
    });
  } catch (error) {
    console.error("[ai:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل المحادثات" }, { status: 500 });
  }
}

/** DELETE — حذف محادثة ?conversationId= */
export async function DELETE(req: NextRequest) {
  try {
    const g = await guard();
    if (!g.ok) return g.response;

    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");
    if (!conversationId) {
      return NextResponse.json({ error: "معرّف المحادثة مطلوب" }, { status: 400 });
    }
    await db.aiConversation.deleteMany({
      where: {
        id: conversationId,
        companyId: g.ctx.company.id,
        userId: g.ctx.user.id,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ai:DELETE]", error);
    return NextResponse.json({ error: "تعذر حذف المحادثة" }, { status: 500 });
  }
}

/** POST — إرسال رسالة للمساعد الذكي { message, conversationId? } */
export async function POST(req: NextRequest) {
  try {
    const g = await guard();
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 4000) {
      return NextResponse.json({ error: "الرسالة مطلوبة (حتى 4000 حرف)" }, { status: 400 });
    }

    // المحادثة: موجودة (والملكية محققة) أو جديدة
    let conversationId: string | null =
      typeof body?.conversationId === "string" ? body.conversationId : null;
    let title = message.slice(0, 50);
    if (conversationId) {
      const existing = await db.aiConversation.findFirst({
        where: {
          id: conversationId,
          companyId: g.ctx.company.id,
          userId: g.ctx.user.id,
        },
      });
      if (!existing) conversationId = null;
      else title = existing.title;
    }
    if (!conversationId) {
      const created = await db.aiConversation.create({
        data: {
          companyId: g.ctx.company.id,
          userId: g.ctx.user.id,
          title,
        },
      });
      conversationId = created.id;
    }

    // آخر 12 رسالة كسياق للمحادثة
    const history = await db.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: 12,
    });
    history.reverse();

    // السياق المالي المباشر من قاعدة بيانات المنشأة
    const context = await buildFinancialContext(g.ctx.company.id);

    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content:
            `أنت «المساعد الذكي المحاسبي» داخل نظام ERP سحابي سعودي متعدد المنشآت باسم ${g.ctx.company.name}. ` +
            "أنت خبير في: المحاسبة (القيد المزدوج، دليل الحسابات، القوائم المالية)، الضريبة السعودية (إقرار ضريبة القيمة المضافة 15%)، " +
            "الفاتورة الإلكترونية زتكا (المرحلتان الأولى والثانية، رمز QR، XML/UBL)، إدارة المخزون والذمم، وتحليل الأعمال.\n" +
            "قواعد الإجابة:\n" +
            "1) أجب بالعربية الفصحى المبسطة، منظمة بنقاط قصيرة عند الحاجة.\n" +
            "2) استخدم بيانات المنشأة الحقيقية المرفقة في السياق عند الإجابة عن أسئلة الأرقام.\n" +
            "3) عند سؤال عن إقرار الضريبة اشرح الخطوات داخل النظام (قسم الإقرار الضريبي يحسب المخرجات والمدخلات تلقائياً).\n" +
            "4) لا تخترع أرقاماً غير موجودة في السياق — إن غاب الرقم اطلب التوضيح أو أشر إلى مكانه في النظام.\n" +
            "5) كن عملياً: اقترح خطوات قابلة للتنفيذ داخل النظام.\n\n" +
            `سياق المنشأة الحالي (JSON):\n${JSON.stringify(context)}`,
        },
        ...history.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user", content: message },
      ],
      thinking: { type: "disabled" },
    });

    const reply =
      completion.choices[0]?.message?.content?.trim() ||
      "عذراً، تعذر توليد رد الآن — حاول مرة أخرى.";

    await db.aiMessage.createMany({
      data: [
        { conversationId, role: "user", content: message },
        { conversationId, role: "assistant", content: reply },
      ],
    });

    return NextResponse.json({ reply, conversationId, title });
  } catch (error) {
    console.error("[ai:POST]", error);
    return NextResponse.json(
      { error: "تعذر الاتصال بالمساعد الذكي، حاول مرة أخرى" },
      { status: 500 }
    );
  }
}
