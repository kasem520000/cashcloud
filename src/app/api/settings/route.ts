import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** الحقول القابلة للمسح لاعتماد زتكا (السلسلة الفارغة تعني مسح القيمة) */
const ZATCA_CLEARABLE_FIELDS = [
  "egsSerial",
  "zatcaCsid",
  "zatcaSecret",
  "zatcaPrivateKey",
  "zatcaCert",
] as const;

export async function GET() {
  try {
    const g = await guard();
    if (!g.ok) return g.response;

    // جلب حقول اعتماد زتكا من سجل المنشأة (لا تُعاد القيم السرية نفسها — فقط حالة التهيئة)
    const company = await db.company.findUnique({
      where: { id: g.ctx.company.id },
      select: {
        zatcaEnv: true,
        egsSerial: true,
        zatcaCsid: true,
        zatcaSecret: true,
        zatcaPrivateKey: true,
        zatcaCert: true,
      },
    });

    return NextResponse.json({
      businessName: g.ctx.company.name,
      currency: g.ctx.company.currency,
      name: g.ctx.user.name,
      username: g.ctx.user.username,
      email: g.ctx.user.email,
      taxNumber: g.ctx.company.taxNumber,
      crNumber: g.ctx.company.crNumber,
      address: g.ctx.company.address,
      phone: g.ctx.company.phone,
      // العنوان الوطني
      buildingNo: g.ctx.company.buildingNo,
      streetName: g.ctx.company.streetName,
      district: g.ctx.company.district,
      city: g.ctx.company.city,
      postalCode: g.ctx.company.postalCode,
      additionalNo: g.ctx.company.additionalNo,
      // حالة تكاملات الإرسال
      emailConfigured: !!process.env.RESEND_API_KEY,
      whatsappConfigured: !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID),
      // اعتماد زتكا (CSID) للإرسال الفعلي — حالات فقط دون كشف الأسرار
      zatcaEnv: company?.zatcaEnv ?? g.ctx.company.zatcaEnv,
      egsSerial: company?.egsSerial ?? null,
      csidConfigured: !!company?.zatcaCsid,
      zatcaSecretConfigured: !!company?.zatcaSecret,
      zatcaCertConfigured: !!company?.zatcaCert,
      zatcaKeyConfigured: !!company?.zatcaPrivateKey,
    });
  } catch (error) {
    console.error("[settings:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل الإعدادات" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const g = await guard("company:manage");
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);

    const str = (v: unknown): string | null =>
      typeof v === "string" && v.trim() ? v.trim() : null;

    /**
     * الحقول النصية الاختيارية: تُحدَّث فقط إن وُجد المفتاح في الطلب —
     * السلسلة الفارغة تمسح القيمة، والغياب يُبقيها دون تغيير
     * (يحمي الحفظ الجزئي — مثل بطاقة زتكا — من مسح بقية البيانات)
     */
    const optStr = (v: unknown): string | null | undefined =>
      typeof v === "string" ? (v.trim() || null) : undefined;

    // ===== حقول اعتماد زتكا (CSID): تُحدَّث فقط إن وُجد المفتاح في الطلب =====
    const zatcaData: Record<string, string | null> = {};
    const updatedZatcaFields: string[] = [];
    for (const field of ZATCA_CLEARABLE_FIELDS) {
      if (field in (body ?? {})) {
        zatcaData[field] = str(body?.[field]); // السلسلة الفارغة تعني مسح القيمة
        updatedZatcaFields.push(field);
      }
    }
    if ("zatcaEnv" in (body ?? {})) {
      const env = body?.zatcaEnv;
      if (env !== "simulation" && env !== "production") {
        return NextResponse.json(
          { error: "بيئة زتكا غير صالحة — القيم المسموحة: simulation أو production" },
          { status: 400 }
        );
      }
      zatcaData.zatcaEnv = env;
      updatedZatcaFields.push("zatcaEnv");
    }

    await db.$transaction([
      db.company.update({
        where: { id: g.ctx.company.id },
        data: {
          name: body?.businessName?.trim() || undefined,
          currency: body?.currency?.trim() || undefined,
          taxNumber: optStr(body?.taxNumber),
          crNumber: optStr(body?.crNumber),
          address: optStr(body?.address),
          phone: optStr(body?.phone),
          email: optStr(body?.email),
          // العنوان الوطني
          buildingNo: optStr(body?.buildingNo),
          streetName: optStr(body?.streetName),
          district: optStr(body?.district),
          city: optStr(body?.city),
          postalCode: optStr(body?.postalCode),
          additionalNo: optStr(body?.additionalNo),
          // اعتماد زتكا (CSID)
          ...zatcaData,
        },
      }),
      db.user.update({
        where: { id: g.ctx.user.id },
        data: { name: body?.name?.trim() || undefined },
      }),
    ]);

    await logAudit({
      companyId: g.ctx.company.id,
      userId: g.ctx.user.id,
      username: g.ctx.user.username,
      action: "settings.update",
      entity: "company",
      entityId: g.ctx.company.id,
      details: {
        // أسماء الحقول فقط — لا تُسجَّل قيم الأسرار أبداً
        fields: Object.keys((body ?? {}) as Record<string, unknown>),
        zatcaFieldsUpdated: updatedZatcaFields,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[settings:PUT]", error);
    return NextResponse.json({ error: "تعذر حفظ الإعدادات" }, { status: 500 });
  }
}
