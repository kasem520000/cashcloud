import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import {
  sendWhatsApp,
  buildInvoiceWhatsAppMessage,
  isWhatsAppConfigured,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/** GET — حالة تهيئة الواتساب + آخر الرسائل */
export async function GET() {
  try {
    const g = await guard();
    if (!g.ok) return g.response;

    const logs = await db.whatsAppLog.findMany({
      where: { companyId: g.ctx.company.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        toPhone: true,
        message: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      configured: isWhatsAppConfigured(),
      logs,
    });
  } catch (error) {
    console.error("[whatsapp:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل سجل الواتساب" }, { status: 500 });
  }
}

/** POST — إرسال فاتورة عبر الواتساب { saleId, to?, message? } */
export async function POST(req: NextRequest) {
  try {
    const g = await guard("sales:read");
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const saleId = typeof body?.saleId === "string" ? body.saleId : "";
    if (!saleId) {
      return NextResponse.json({ error: "معرّف الفاتورة مطلوب" }, { status: 400 });
    }

    const sale = await db.sale.findFirst({
      where: { id: saleId, companyId: g.ctx.company.id },
      include: { contact: true },
    });
    if (!sale) {
      return NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 });
    }

    const company = await db.company.findUnique({ where: { id: g.ctx.company.id } });
    if (!company) {
      return NextResponse.json({ error: "المنشأة غير موجودة" }, { status: 404 });
    }

    const to =
      (typeof body?.to === "string" && body.to.trim()) ||
      sale.contact?.phone ||
      company.phone ||
      "";
    if (to.replace(/\D/g, "").length < 8) {
      return NextResponse.json(
        { error: "لا يوجد رقم واتساب مستهدف — أضف جوال العميل أو أدخله يدوياً" },
        { status: 400 }
      );
    }

    const baseMessage = buildInvoiceWhatsAppMessage({
      company,
      sale,
      contact: sale.contact,
    });
    const message =
      typeof body?.message === "string" && body.message.trim()
        ? `${body.message.trim()}\n\n${baseMessage}`
        : baseMessage;

    const result = await sendWhatsApp({
      companyId: g.ctx.company.id,
      to,
      message,
    });

    return NextResponse.json({
      ok: result.status !== "failed",
      status: result.status,
      to,
      waLink: result.waLink,
      message:
        result.status === "sent"
          ? `تم إرسال الفاتورة ${sale.invoiceNo} عبر الواتساب إلى ${to}`
          : result.status === "simulated"
            ? `وضع المحاكاة: فتحنا لك رابط الواتساب جاهزاً بالإرسال إلى ${to}`
            : `فشل الإرسال: ${result.error ?? "خطأ غير معروف"}`,
    });
  } catch (error) {
    console.error("[whatsapp:POST]", error);
    return NextResponse.json({ error: "تعذر إرسال رسالة الواتساب" }, { status: 500 });
  }
}
