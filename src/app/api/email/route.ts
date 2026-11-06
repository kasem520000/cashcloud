import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { sendEmail, buildInvoiceEmailHtml, isEmailConfigured } from "@/lib/mailer";
import { generateQrDataUrl } from "@/lib/zatca";

export const dynamic = "force-dynamic";

/** GET — حالة تهيئة البريد + آخر الرسائل المرسلة */
export async function GET() {
  try {
    const g = await guard();
    if (!g.ok) return g.response;

    const logs = await db.emailLog.findMany({
      where: { companyId: g.ctx.company.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        toEmail: true,
        subject: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      configured: isEmailConfigured(),
      logs,
    });
  } catch (error) {
    console.error("[email:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل سجل البريد" }, { status: 500 });
  }
}

/** POST — إرسال فاتورة بالبريد الإلكتروني { saleId, to?, message? } */
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
      include: { items: true, contact: true },
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
      sale.contact?.email ||
      company.email ||
      "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json(
        { error: "لا يوجد بريد إلكتروني مستهدف — أضف بريد العميل أو أدخله يدوياً" },
        { status: 400 }
      );
    }

    // صورة QR من حِمل زتكا المخزن (إن وُجد)
    let qrDataUrl: string | null = null;
    if (sale.qrData) {
      try {
        qrDataUrl = await generateQrDataUrl(sale.qrData);
      } catch {
        qrDataUrl = null;
      }
    }

    const html = buildInvoiceEmailHtml({
      company,
      sale,
      items: sale.items,
      contact: sale.contact,
      qrDataUrl,
    });

    const result = await sendEmail({
      companyId: g.ctx.company.id,
      to,
      subject: `فاتورة ضريبية ${sale.invoiceNo} — ${company.name}`,
      html,
    });

    return NextResponse.json({
      ok: result.status !== "failed",
      status: result.status,
      to,
      message:
        result.status === "sent"
          ? `تم إرسال الفاتورة ${sale.invoiceNo} إلى ${to} بنجاح`
          : result.status === "simulated"
            ? `وضع المحاكاة: حُفظ بريد الفاتورة ${sale.invoiceNo} إلى ${to} في سجل البريد — فعّل RESEND_API_KEY للإرسال الفعلي`
            : `فشل الإرسال: ${result.error ?? "خطأ غير معروف"}`,
    });
  } catch (error) {
    console.error("[email:POST]", error);
    return NextResponse.json({ error: "تعذر إرسال البريد" }, { status: 500 });
  }
}
