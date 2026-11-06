import { db } from "@/lib/db";
import { tafqit } from "@/lib/tafqit";
import { formatNationalAddress } from "@/lib/address";
import type { Company, Contact, Sale, SaleItem } from "@prisma/client";

/**
 * خدمة البريد الإلكتروني
 * ======================
 * - عند ضبط RESEND_API_KEY و EMAIL_FROM → إرسال حقيقي عبر Resend
 * - بدون مفاتيح → وضع المحاكاة: تُسجَّل الرسالة في سجل البريد (EmailLog)
 *   مع معاينة كاملة للمحتوى — جاهزة للتفعيل فور إدخال المفاتيح في الإنتاج
 */

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export type SendEmailResult = {
  status: "sent" | "simulated" | "failed";
  error?: string;
};

export async function sendEmail(opts: {
  companyId: string;
  to: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  let result: SendEmailResult = { status: "simulated" };

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM ?? "ERP <onboarding@resend.dev>",
          to: [opts.to],
          subject: opts.subject,
          html: opts.html,
        }),
      });
      if (res.ok) {
        result = { status: "sent" };
      } else {
        const body = await res.text().catch(() => "");
        result = { status: "failed", error: `Resend ${res.status}: ${body.slice(0, 300)}` };
      }
    } catch (error) {
      result = { status: "failed", error: error instanceof Error ? error.message : "خطأ غير معروف" };
    }
  }

  try {
    await db.emailLog.create({
      data: {
        companyId: opts.companyId,
        toEmail: opts.to,
        subject: opts.subject,
        body: opts.html,
        status: result.status,
        error: result.error ?? null,
      },
    });
  } catch (error) {
    console.error("[mailer:log]", error);
  }

  return result;
}

const money = (n: number) =>
  (Math.round(n * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const dateAr = (d: Date | string) =>
  new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" });

/** بناء بريد HTML احترافي (RTL) للفاتورة — صالح للبريد الإلكتروني */
export function buildInvoiceEmailHtml(params: {
  company: Company;
  sale: Sale;
  items: SaleItem[];
  contact?: Contact | null;
  qrDataUrl?: string | null;
}): string {
  const { company, sale, items, contact, qrDataUrl } = params;
  const remaining = sale.total - sale.paid;
  const rows = items
    .map(
      (it, i) => `
      <tr style="background:${i % 2 ? "#f8fafc" : "#ffffff"};">
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;">${i + 1}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:bold;">${it.name}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:center;">${it.qty}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:left;" dir="ltr">${money(it.unitPrice)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:left;" dir="ltr">${money(it.total)}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;background:#f1f5f9;font-family:Tahoma,Arial,sans-serif;padding:24px;">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:linear-gradient(to left,#2563eb,#0ea5a8,#22c55e);padding:22px 26px;color:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="font-size:19px;font-weight:bold;">${company.name}</div>
          <div style="font-size:12px;opacity:.9;margin-top:4px;">
            الرقم الضريبي: ${company.taxNumber ?? "غير مسجل"} ${company.crNumber ? `· س.ت: ${company.crNumber}` : ""}
          </div>
          <div style="font-size:12px;opacity:.9;">${formatNationalAddress(company)}</div>
        </div>
        ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR" width="96" height="96" style="background:#fff;border-radius:10px;padding:4px;" />` : ""}
      </div>
    </div>

    <div style="padding:22px 26px;">
      <div style="font-size:17px;font-weight:bold;color:#0f172a;margin-bottom:4px;">فاتورة ضريبية ${sale.invoiceNo}</div>
      <div style="font-size:12.5px;color:#64748b;margin-bottom:18px;">
        التاريخ: ${dateAr(sale.date)}${sale.status === "draft" ? " · (مسودة)" : ""}
      </div>

      ${
        contact
          ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px;margin-bottom:18px;">
              <div style="font-size:13.5px;font-weight:bold;color:#0f172a;">${contact.name}</div>
              <div style="font-size:12px;color:#64748b;margin-top:2px;">
                ${contact.taxNumber ? `الرقم الضريبي: ${contact.taxNumber} · ` : ""}${formatNationalAddress(contact)}
              </div>
            </div>`
          : ""
      }

      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
        <thead>
          <tr style="background:#0f172a;color:#fff;">
            <th style="padding:10px 12px;font-size:12px;text-align:right;">#</th>
            <th style="padding:10px 12px;font-size:12px;text-align:right;">الصنف</th>
            <th style="padding:10px 12px;font-size:12px;text-align:center;">الكمية</th>
            <th style="padding:10px 12px;font-size:12px;text-align:left;">السعر</th>
            <th style="padding:10px 12px;font-size:12px;text-align:left;">الإجمالي</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <tr>
          <td style="padding:7px 0;font-size:13px;color:#334155;">الإجمالي قبل الضريبة</td>
          <td style="padding:7px 0;font-size:13px;font-weight:bold;text-align:left;" dir="ltr">${money(sale.subtotal)} ${company.currency}</td>
        </tr>
        ${sale.discount > 0 ? `<tr><td style="padding:7px 0;font-size:13px;color:#334155;">الخصم</td><td style="padding:7px 0;font-size:13px;color:#dc2626;font-weight:bold;text-align:left;" dir="ltr">- ${money(sale.discount)}</td></tr>` : ""}
        <tr>
          <td style="padding:7px 0;font-size:13px;color:#334155;">ضريبة القيمة المضافة (15%)</td>
          <td style="padding:7px 0;font-size:13px;font-weight:bold;text-align:left;" dir="ltr">${money(sale.tax)} ${company.currency}</td>
        </tr>
        <tr style="border-top:2px solid #0f172a;">
          <td style="padding:10px 0;font-size:15px;font-weight:bold;color:#0f172a;">الإجمالي المستحق</td>
          <td style="padding:10px 0;font-size:16px;font-weight:bold;color:#059669;text-align:left;" dir="ltr">${money(sale.total)} ${company.currency}</td>
        </tr>
        ${remaining > 0.01 ? `<tr><td style="padding:6px 0;font-size:13px;color:#64748b;">المدفوع (${money(sale.paid)}) — المتبقي</td><td style="padding:6px 0;font-size:13px;color:#d97706;font-weight:bold;text-align:left;" dir="ltr">${money(remaining)}</td></tr>` : ""}
      </table>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px 14px;margin-top:16px;font-size:12.5px;color:#166534;">
        <b>تفقيط المبلغ:</b> ${tafqit(sale.total, company.currency)}
      </div>

      ${sale.note ? `<div style="font-size:12.5px;color:#64748b;margin-top:14px;"><b>ملاحظات:</b> ${sale.note}</div>` : ""}
    </div>

    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 26px;font-size:11.5px;color:#94a3b8;text-align:center;">
      أُرسلت هذه الفاتورة إلكترونياً من نظام ${company.name} — فاتورة متوافقة مع متطلبات الفوترة الإلكترونية (زتكا)
    </div>
  </div>
</body>
</html>`;
}
