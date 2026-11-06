import { db } from "@/lib/db";
import { tafqit } from "@/lib/tafqit";
import type { Company, Contact, Sale } from "@prisma/client";

/**
 * خدمة الواتساب
 * =============
 * - عند ضبط WHATSAPP_TOKEN و WHATSAPP_PHONE_ID → إرسال حقيقي عبر
 *   WhatsApp Cloud API (Meta)
 * - بدون مفاتيح → وضع المحاكاة: تُنشأ رابط wa.me جاهز للإرسال اليدوي
 *   وتُسجَّل الرسالة في سجل الواتساب (WhatsAppLog)
 */

export function isWhatsAppConfigured(): boolean {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}

/** تطبيع رقم سعودي/دولي إلى صيغة wa.me */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("966")) return digits;
  if (digits.startsWith("00966")) return digits.slice(2);
  if (digits.startsWith("0")) return `966${digits.slice(1)}`;
  return digits;
}

/** رابط واتساب جاهز للفتح (wa.me) */
export function buildWaLink(phone: string, message: string): string {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}

export type SendWhatsAppResult = {
  status: "sent" | "simulated" | "failed";
  waLink?: string;
  error?: string;
};

export async function sendWhatsApp(opts: {
  companyId: string;
  to: string;
  message: string;
}): Promise<SendWhatsAppResult> {
  const waLink = buildWaLink(opts.to, opts.message);
  let result: SendWhatsAppResult = { status: "simulated", waLink };

  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (token && phoneId) {
    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: normalizePhone(opts.to),
          type: "text",
          text: { preview_url: false, body: opts.message },
        }),
      });
      if (res.ok) {
        result = { status: "sent", waLink };
      } else {
        const body = await res.text().catch(() => "");
        result = { status: "failed", waLink, error: `WhatsApp API ${res.status}: ${body.slice(0, 300)}` };
      }
    } catch (error) {
      result = {
        status: "failed",
        waLink,
        error: error instanceof Error ? error.message : "خطأ غير معروف",
      };
    }
  }

  try {
    await db.whatsAppLog.create({
      data: {
        companyId: opts.companyId,
        toPhone: opts.to,
        message: opts.message,
        status: result.status,
        error: result.error ?? null,
      },
    });
  } catch (error) {
    console.error("[whatsapp:log]", error);
  }

  return result;
}

/** نص رسالة واتساب للفاتورة (مختصر ومناسب للمحادثة) */
export function buildInvoiceWhatsAppMessage(params: {
  company: Company;
  sale: Sale;
  contact?: Contact | null;
  publicUrl?: string | null;
}): string {
  const { company, sale, contact, publicUrl } = params;
  const lines = [
    `*فاتورة ضريبية ${sale.invoiceNo}*`,
    `من: ${company.name}`,
    contact ? `إلى: ${contact.name}` : "",
    `التاريخ: ${new Date(sale.date).toLocaleDateString("ar-EG")}`,
    "",
    `الإجمالي قبل الضريبة: ${sale.subtotal.toFixed(2)} ${company.currency}`,
    `ضريبة القيمة المضافة: ${sale.tax.toFixed(2)} ${company.currency}`,
    `*الإجمالي: ${sale.total.toFixed(2)} ${company.currency}*`,
    sale.paid < sale.total ? `المتبقي: ${(sale.total - sale.paid).toFixed(2)} ${company.currency}` : "مدفوعة بالكامل ✓",
    "",
    tafqit(sale.total, company.currency),
  ];
  if (publicUrl) {
    lines.push("", `عرض الفاتورة: ${publicUrl}`);
  } else if (company.phone) {
    lines.push("", `للاستفسار: ${company.phone}`);
  }
  return lines.filter(Boolean).join("\n");
}
