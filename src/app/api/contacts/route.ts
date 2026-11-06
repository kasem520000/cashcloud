import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const g = await guard("contacts:read");
    if (!g.ok) return g.response;

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") === "supplier" ? "supplier" : "customer";
    const q = searchParams.get("q")?.trim() ?? "";

    const where: Record<string, unknown> = { companyId: g.ctx.company.id, type };
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { phone: { contains: q } },
        { email: { contains: q } },
      ];
    }

    const contacts = await db.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        sales: { select: { total: true, paid: true } },
        purchases: { select: { total: true, paid: true } },
      },
    });

    const enriched = contacts.map((c) => {
      const totalSales = c.sales.reduce((s, x) => s + x.total, 0);
      const salesDue = c.sales.reduce((s, x) => s + (x.total - x.paid), 0);
      const totalPurchases = c.purchases.reduce((s, x) => s + x.total, 0);
      const purchasesDue = c.purchases.reduce((s, x) => s + (x.total - x.paid), 0);
      const { sales: _s, purchases: _p, ...rest } = c;
      void _s;
      void _p;
      return {
        ...rest,
        totalSales,
        salesDue,
        totalPurchases,
        purchasesDue,
        balance: type === "customer" ? salesDue : purchasesDue,
      };
    });

    return NextResponse.json({ contacts: enriched, type });
  } catch (error) {
    console.error("[contacts:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل جهات الاتصال" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await guard("contacts:write");
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const type = body?.type === "supplier" ? "supplier" : "customer";
    if (!name) {
      return NextResponse.json({ error: "الاسم مطلوب" }, { status: 400 });
    }

    const contact = await db.contact.create({
      data: {
        companyId: g.ctx.company.id,
        name,
        type,
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

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error("[contacts:POST]", error);
    return NextResponse.json({ error: "تعذر إضافة جهة الاتصال" }, { status: 500 });
  }
}
