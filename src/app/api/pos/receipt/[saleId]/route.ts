import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { generateQrPayload, generateQrDataUrl } from "@/lib/zatca";

export const dynamic = "force-dynamic";

/**
 * GET — بيانات إيصال طباعة فاتورة POS (فاتورة مبسطة وفق زتكا):
 * ترويسة المنشأة + البنود + الإجماليات + رمز QR (TLV-Base64)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ saleId: string }> }
) {
  try {
    const g = await guard("sales:read");
    if (!g.ok) return g.response;

    const { saleId } = await params;
    const sale = await db.sale.findFirst({
      where: { id: saleId, companyId: g.ctx.company.id },
      include: {
        items: true,
        contact: { select: { name: true, taxNumber: true } },
        branch: { select: { name: true, code: true } },
      },
    });
    if (!sale) {
      return NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 });
    }

    const company = g.ctx.company;

    // توليد QR إن لم يوجد (متطلب زتكا الأساسي للفاتورة المبسطة)
    let qrData = sale.qrData;
    if (!qrData && company.taxNumber) {
      qrData = generateQrPayload({
        sellerName: company.name,
        vatNumber: company.taxNumber,
        timestamp: sale.date,
        total: sale.total,
        vatTotal: sale.tax,
      });
      await db.sale.update({ where: { id: sale.id }, data: { qrData } });
    }
    const qrImage = qrData ? await generateQrDataUrl(qrData) : null;

    const r2 = (n: number) => Math.round(n * 100) / 100;

    return NextResponse.json({
      receipt: {
        invoiceNo: sale.invoiceNo,
        kind: sale.kind,
        date: sale.date,
        branchName: sale.branch?.name ?? null,
        branchCode: sale.branch?.code ?? null,
        contactName: sale.contact?.name ?? "عميل نقدي",
        contactTaxNumber: sale.contact?.taxNumber ?? null,
        items: sale.items.map((it) => ({
          name: it.name,
          qty: it.qty,
          unitPrice: r2(it.unitPrice),
          total: r2(it.total),
        })),
        subtotal: r2(sale.subtotal),
        discount: r2(sale.discount),
        tax: r2(sale.tax),
        total: r2(sale.total),
        paid: r2(sale.paid),
        change: r2(Math.max(0, sale.paid - sale.total)),
        remaining: r2(Math.max(0, sale.total - sale.paid)),
        paymentMethod: sale.paymentMethod,
        currency: sale.currency,
        qrImage,
        qrData,
        zatcaStatus: sale.zatcaStatus,
        zatcaUuid: sale.zatcaUuid,
      },
      company: {
        name: company.name,
        taxNumber: company.taxNumber,
        crNumber: company.crNumber,
        phone: company.phone,
        address: company.address,
        currency: company.currency,
        zatcaEnv: company.zatcaEnv,
      },
    });
  } catch (error) {
    console.error("[pos-receipt:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل الإيصال" }, { status: 500 });
  }
}
