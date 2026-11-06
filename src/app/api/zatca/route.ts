import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import {
  generateQrPayload,
  generateQrDataUrl,
  buildInvoiceXml,
  runComplianceChecks,
  simulateSubmission,
  submitToZatca,
  computeCryptographicStamp,
  isValidEcPrivateKey,
  isValidSaudiVat,
} from "@/lib/zatca";

export const dynamic = "force-dynamic";

/** GET — حالة الامتثال + فواتير مع حالتها لدى زتكا */
export async function GET() {
  try {
    const g = await guard("sales:read");
    if (!g.ok) return g.response;

    const company = g.ctx.company;
    // بيانات اعتماد زتكا (CSID) من سجل المنشأة — تُعاد حالتها فقط دون كشف الأسرار
    const creds = await db.company.findUnique({
      where: { id: company.id },
      select: { egsSerial: true, zatcaCsid: true, zatcaSecret: true, zatcaPrivateKey: true },
    });
    const invoices = await db.sale.findMany({
      where: { companyId: company.id, status: "final" },
      orderBy: { date: "desc" },
      take: 200,
      include: { contact: { select: { name: true } } },
    });

    const withQr = invoices.filter((s) => s.qrData).length;
    const submitted = invoices.filter((s) => s.zatcaStatus === "REPORTED").length;
    const rejected = invoices.filter((s) => s.zatcaStatus === "REJECTED").length;

    return NextResponse.json({
      company: {
        name: company.name,
        taxNumber: company.taxNumber,
        crNumber: company.crNumber,
        address: company.address,
        phone: company.phone,
        currency: company.currency,
        zatcaEnv: company.zatcaEnv,
        egsSerial: creds?.egsSerial ?? null,
        csidConfigured: !!(creds?.zatcaCsid && creds?.zatcaSecret && creds?.zatcaPrivateKey),
      },
      compliance: runComplianceChecks(company, { total: invoices.length, withQr }),
      stats: {
        total: invoices.length,
        withQr,
        submitted,
        rejected,
        pending: invoices.length - submitted - rejected,
      },
      invoices: invoices.map((s) => ({
        id: s.id,
        invoiceNo: s.invoiceNo,
        date: s.date,
        contactName: s.contact?.name ?? "عميل نقدي",
        subtotal: s.subtotal,
        tax: s.tax,
        total: s.total,
        paid: s.paid,
        hasQr: !!s.qrData,
        zatcaStatus: s.zatcaStatus,
        zatcaUuid: s.zatcaUuid,
        zatcaHash: s.zatcaHash,
        zatcaSubmittedAt: s.zatcaSubmittedAt,
      })),
    });
  } catch (error) {
    console.error("[zatca:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل بيانات الامتثال" }, { status: 500 });
  }
}

/** POST — تنفيذ إجراءات زتكا على فاتورة: توليد QR / تصدير XML / إرسال
 *
 * ملاحظة مهمة: الإرسال الفعلي لبوابة زتكا يتطلب CSID صادراً من بوابة فاتورة (فطورا)
 * مع سر الاعتماد والمفتاح الخاص (EC P-384) — تُضبط من إعدادات المنشأة.
 * بدون اعتماد مكتمل يعمل النظام تلقائياً بوضع المحاكاة (simulateSubmission).
 */
export async function POST(req: NextRequest) {
  try {
    const g = await guard("sales:read");
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const action = body?.action;
    const saleId: string = body?.saleId ?? "";

    if (!["qr", "xml", "submit"].includes(action) || !saleId) {
      return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
    }
    if (action === "submit") {
      const gw = await guard("sales:write");
      if (!gw.ok) return gw.response;
    }

    const sale = await db.sale.findFirst({
      where: { id: saleId, companyId: g.ctx.company.id },
      include: { items: true, contact: true },
    });
    if (!sale) {
      return NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 });
    }
    if (sale.status !== "final") {
      return NextResponse.json({ error: "لا يمكن تطبيق إجراءات زتكا على مسودة" }, { status: 400 });
    }

    const company = g.ctx.company;
    const vatOk = isValidSaudiVat(company.taxNumber);

    // ---------- توليد رمز QR (المرحلة الأولى) ----------
    if (action === "qr") {
      if (!vatOk) {
        return NextResponse.json(
          { error: "سجّل رقمك الضريبي أولاً (15 رقماً يبدأ وينتهي بـ 3) من قسم بيانات الامتثال" },
          { status: 400 }
        );
      }
      const payload = generateQrPayload({
        sellerName: company.name,
        vatNumber: company.taxNumber!,
        timestamp: sale.date,
        total: sale.total,
        vatTotal: sale.tax,
      });
      const qr = await generateQrDataUrl(payload);
      await db.sale.update({ where: { id: sale.id }, data: { qrData: payload } });
      return NextResponse.json({ qr, payload, invoiceNo: sale.invoiceNo });
    }

    // ---------- تصدير XML (UBL 2.1) ----------
    if (action === "xml") {
      if (!vatOk) {
        return NextResponse.json(
          { error: "سجّل رقمك الضريبي أولاً لاستكمال بيانات XML" },
          { status: 400 }
        );
      }
      if (!sale.qrData) {
        const payload = generateQrPayload({
          sellerName: company.name,
          vatNumber: company.taxNumber!,
          timestamp: sale.date,
          total: sale.total,
          vatTotal: sale.tax,
        });
        await db.sale.update({ where: { id: sale.id }, data: { qrData: payload } });
        sale.qrData = payload;
      }
      const taxRate = sale.subtotal > 0 ? (sale.tax / sale.subtotal) * 100 : 0;
      const xml = buildInvoiceXml({
        invoiceNo: sale.invoiceNo,
        uuid: sale.zatcaUuid ?? crypto.randomUUID(),
        issueDate: sale.date,
        currency: company.currency,
        icv: parseInt(sale.invoiceNo.replace(/\D/g, ""), 10) || 1,
        company: {
          name: company.name,
          taxNumber: company.taxNumber!,
          crNumber: company.crNumber,
          address: company.address,
          phone: company.phone,
        },
        customer: sale.contact
          ? {
              name: sale.contact.name,
              taxNumber: sale.contact.taxNumber,
              address: sale.contact.address,
            }
          : null,
        lines: sale.items.map((it) => ({
          name: it.name,
          qty: it.qty,
          unitPrice: it.unitPrice,
          total: it.total,
        })),
        subtotal: sale.subtotal,
        taxRate: Math.round(taxRate * 100) / 100,
        tax: sale.tax,
        total: sale.total,
        paid: sale.paid,
        qrPayload: sale.qrData!,
      });
      return NextResponse.json({ xml, invoiceNo: sale.invoiceNo });
    }

    // ---------- إرسال لبوابة زتكا ----------
    // الإرسال الفعلي يتطلب CSID صادراً من بوابة فاتورة (فطورا) — بدون اعتماد يعمل النظام بوضع المحاكاة
    const creds = await db.company.findUnique({
      where: { id: company.id },
      select: { zatcaEnv: true, zatcaCsid: true, zatcaSecret: true, zatcaPrivateKey: true },
    });

    // ===== وضع الإرسال الفعلي (اعتماد CSID مكتمل) =====
    if (creds?.zatcaCsid && creds.zatcaSecret && creds.zatcaPrivateKey) {
      if (!vatOk) {
        return NextResponse.json(
          { error: "سجّل رقمك الضريبي أولاً (15 رقماً يبدأ وينتهي بـ 3) قبل الإرسال الفعلي" },
          { status: 400 }
        );
      }

      // تجهيز رمز QR إن غاب (متطلب أساسي للإرسال)
      if (!sale.qrData) {
        const payload = generateQrPayload({
          sellerName: company.name,
          vatNumber: company.taxNumber!,
          timestamp: sale.date,
          total: sale.total,
          vatTotal: sale.tax,
        });
        await db.sale.update({ where: { id: sale.id }, data: { qrData: payload } });
        sale.qrData = payload;
      }

      // بناء XML بنفس منطق التصدير مع نوع المستند (388 فاتورة | 381 إشعار دائن)
      const taxRate = sale.subtotal > 0 ? (sale.tax / sale.subtotal) * 100 : 0;
      const xml = buildInvoiceXml({
        invoiceNo: sale.invoiceNo,
        uuid: sale.zatcaUuid ?? crypto.randomUUID(),
        issueDate: sale.date,
        currency: company.currency,
        icv: parseInt(sale.invoiceNo.replace(/\D/g, ""), 10) || 1,
        company: {
          name: company.name,
          taxNumber: company.taxNumber!,
          crNumber: company.crNumber,
          address: company.address,
          phone: company.phone,
        },
        customer: sale.contact
          ? {
              name: sale.contact.name,
              taxNumber: sale.contact.taxNumber,
              address: sale.contact.address,
            }
          : null,
        lines: sale.items.map((it) => ({
          name: it.name,
          qty: it.qty,
          unitPrice: it.unitPrice,
          total: it.total,
        })),
        subtotal: sale.subtotal,
        taxRate: Math.round(taxRate * 100) / 100,
        tax: sale.tax,
        total: sale.total,
        paid: sale.paid,
        qrPayload: sale.qrData!,
        invoiceTypeCode: sale.kind === "credit-note" ? 381 : 388,
      });

      // التحقق من صلاحية المفتاح الخاص قبل التوقيع (EC P-384 صادر عند تسجيل وحدة الفاتورة EGS)
      if (!isValidEcPrivateKey(creds.zatcaPrivateKey)) {
        return NextResponse.json(
          {
            error:
              "المفتاح الخاص المُدخل غير صالح للتوقيع — يجب أن يكون مفتاح EC (منحنى P-384) بصيغة PEM سليمة، يُصدَر عند تسجيل وحدة الفاتورة EGS في بوابة فاتورة (فطورا)",
          },
          { status: 400 }
        );
      }

      // الختم التشفيري (ملخص SHA256 + توقيع ECDSA-SHA384) يُلحق كتعليق نهاية الـ XML
      let stamp: string;
      try {
        stamp = computeCryptographicStamp(xml, creds.zatcaPrivateKey);
      } catch {
        return NextResponse.json(
          { error: "فشل توليد الختم التشفيري — تأكد أن المفتاح الخاص EC P-384 بصيغة PEM سليمة" },
          { status: 400 }
        );
      }
      const signedXml = `${xml}\n<!-- STAMP: ${stamp} -->`;

      const live = await submitToZatca({
        environment: creds.zatcaEnv === "production" ? "production" : "simulation",
        csid: creds.zatcaCsid,
        secret: creds.zatcaSecret,
        invoiceXml: signedXml,
      });

      // تحديث السجل بالنتيجة + أرشفة الـ XML الموقّع للتدقيق
      await db.sale.update({
        where: { id: sale.id },
        data: {
          zatcaStatus: live.status,
          zatcaUuid: live.uuid,
          zatcaHash: live.hash,
          zatcaSubmittedAt: new Date(),
          zatcaXml: signedXml,
        },
      });

      return NextResponse.json({
        ok: live.status === "REPORTED",
        status: live.status,
        uuid: live.uuid,
        hash: live.hash,
        message:
          live.status === "REPORTED"
            ? live.message
            : live.validationResults.length > 0
              ? `${live.message} — راجع قائمة نتائج التحقق (validationResults) لمعرفة أسباب الرفض`
              : live.message,
        mode: "live",
        validationResults: live.validationResults,
        invoiceNo: sale.invoiceNo,
      });
    }

    // ===== وضع المحاكاة (لا اعتماد CSID مكتمل) =====
    const result = simulateSubmission({
      invoiceNo: sale.invoiceNo,
      total: sale.total,
      vatOk,
      hasQr: !!sale.qrData,
      hasItems: sale.items.length > 0,
    });

    await db.sale.update({
      where: { id: sale.id },
      data: {
        zatcaStatus: result.status,
        zatcaUuid: result.uuid,
        zatcaHash: result.hash,
        zatcaSubmittedAt: result.submittedAt,
      },
    });

    return NextResponse.json({
      ok: result.status === "REPORTED",
      status: result.status,
      uuid: result.uuid,
      hash: result.hash,
      message: result.message,
      simulated: true,
      mode: "simulation",
      invoiceNo: sale.invoiceNo,
    });
  } catch (error) {
    console.error("[zatca:POST]", error);
    return NextResponse.json({ error: "تعذر تنفيذ إجراء زتكا" }, { status: 500 });
  }
}
