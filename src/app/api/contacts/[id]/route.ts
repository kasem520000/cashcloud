import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const g = await guard("contacts:write");
    if (!g.ok) return g.response;

    const { id } = await params;
    const body = await req.json().catch(() => null);
    const existing = await db.contact.findFirst({
      where: { id, companyId: g.ctx.company.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "جهة الاتصال غير موجودة" }, { status: 404 });
    }

    const contact = await db.contact.update({
      where: { id },
      data: {
        name: body?.name?.trim() || existing.name,
        phone: body?.phone?.trim() || null,
        email: body?.email?.trim() || null,
        taxNumber: body?.taxNumber?.trim() || null,
        address: body?.address?.trim() || null,
        // العنوان الوطني
        buildingNo: body?.buildingNo?.trim() || null,
        streetName: body?.streetName?.trim() || null,
        district: body?.district?.trim() || null,
        city: body?.city?.trim() || null,
        postalCode: body?.postalCode?.trim() || null,
        additionalNo: body?.additionalNo?.trim() || null,
      },
    });

    return NextResponse.json(contact);
  } catch (error) {
    console.error("[contacts:PUT]", error);
    return NextResponse.json({ error: "تعذر تحديث جهة الاتصال" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const g = await guard("contacts:write");
    if (!g.ok) return g.response;

    const { id } = await params;
    const existing = await db.contact.findFirst({
      where: { id, companyId: g.ctx.company.id },
      include: { sales: { take: 1 }, purchases: { take: 1 } },
    });
    if (!existing) {
      return NextResponse.json({ error: "جهة الاتصال غير موجودة" }, { status: 404 });
    }
    if (existing.sales.length > 0 || existing.purchases.length > 0) {
      return NextResponse.json(
        { error: "لا يمكن الحذف: توجد عمليات مسجلة على هذه الجهة" },
        { status: 409 }
      );
    }
    await db.contact.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[contacts:DELETE]", error);
    return NextResponse.json({ error: "تعذر حذف جهة الاتصال" }, { status: 500 });
  }
}
