import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round(n * 100) / 100;

type QuotationWithCount = Prisma.QuotationGetPayload<{
  include: { contact: { select: { name: true } }; _count: { select: { items: true } } };
}>;

type QuotationListRecord = {
  id: string;
  quoteNo: string;
  date: Date;
  validUntil: Date | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  status: string;
  note: string | null;
  contactId: string | null;
  contactName: string | null;
  itemsCount: number;
};

function toListRecord(x: QuotationWithCount): QuotationListRecord {
  return {
    id: x.id,
    quoteNo: x.quoteNo,
    date: x.date,
    validUntil: x.validUntil,
    subtotal: x.subtotal,
    discount: x.discount,
    tax: x.tax,
    total: x.total,
    status: x.status,
    note: x.note,
    contactId: x.contactId,
    contactName: x.contact?.name ?? null,
    itemsCount: x._count.items,
  };
}

type ItemInput = {
  productId?: string | null;
  name?: string;
  qty?: number;
  unitPrice?: number;
};

/** GET — قائمة عروض الأسعار (بحث بالرقم أو اسم العميل + فلترة الحالة) */
export async function GET(req: NextRequest) {
  try {
    const g = await guard("sales:read");
    if (!g.ok) return g.response;

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const status = searchParams.get("status")?.trim() ?? "";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(searchParams.get("pageSize")) || 25));

    const where: Record<string, unknown> = { companyId: g.ctx.company.id };
    if (q) {
      where.OR = [{ quoteNo: { contains: q } }, { contact: { name: { contains: q } } }];
    }
    if (["draft", "sent", "accepted", "rejected", "converted"].includes(status)) {
      where.status = status;
    }

    const [total, quotations] = await Promise.all([
      db.quotation.count({ where }),
      db.quotation.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          contact: { select: { name: true } },
          _count: { select: { items: true } },
        },
      }),
    ]);

    return NextResponse.json({
      quotations: quotations.map(toListRecord),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    console.error("[quotations:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل عروض الأسعار" }, { status: 500 });
  }
}

/** POST — إنشاء عرض سعر جديد (مسودة أو مُرسل) */
export async function POST(req: NextRequest) {
  try {
    const g = await guard("sales:write");
    if (!g.ok) return g.response;
    const companyId = g.ctx.company.id;

    const body = await req.json().catch(() => null);
    const items: ItemInput[] = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "أضف بنداً واحداً على الأقل" }, { status: 400 });
    }

    const contactId =
      typeof body?.contactId === "string" && body.contactId ? body.contactId : null;
    if (contactId) {
      const contact = await db.contact.findFirst({
        where: { id: contactId, companyId },
        select: { id: true },
      });
      if (!contact) {
        return NextResponse.json({ error: "جهة التعامل غير موجودة" }, { status: 400 });
      }
    }

    const subtotal = items.reduce(
      (s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0),
      0
    );
    const discount = Math.max(0, Number(body?.discount) || 0);
    const taxRate =
      body?.taxRate === undefined || body?.taxRate === null
        ? 15
        : Math.max(0, Math.min(100, Number(body.taxRate) || 0));
    const taxable = Math.max(0, subtotal - discount);
    const tax = Math.round(taxable * taxRate) / 100;
    const total = Math.round((taxable + tax) * 100) / 100;
    const status = body?.status === "sent" ? "sent" : "draft";
    const validUntil = body?.validUntil ? new Date(body.validUntil) : null;
    const date = body?.date ? new Date(body.date) : new Date();

    const quotation = await db.$transaction(async (tx) => {
      const count = await tx.quotation.count({ where: { companyId } });
      const quoteNo = `QT-${String(count + 1).padStart(5, "0")}`;

      return tx.quotation.create({
        data: {
          companyId,
          quoteNo,
          contactId,
          userId: g.ctx.user.id,
          date: isNaN(date.getTime()) ? new Date() : date,
          validUntil: validUntil && !isNaN(validUntil.getTime()) ? validUntil : null,
          subtotal: r2(subtotal),
          discount,
          tax,
          total,
          status,
          note: typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null,
          items: {
            create: items.map((it) => ({
              productId: it.productId || null,
              name: it.name || "بند",
              qty: Number(it.qty) || 1,
              unitPrice: Number(it.unitPrice) || 0,
              total: r2((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)),
            })),
          },
        },
        include: { items: true, contact: { select: { name: true } } },
      });
    });

    await logAudit({
      companyId,
      userId: g.ctx.user.id,
      username: g.ctx.user.username,
      action: "quotation.create",
      entity: "quotation",
      entityId: quotation.id,
      details: { quoteNo: quotation.quoteNo, total: quotation.total, status: quotation.status },
    });

    return NextResponse.json(
      {
        id: quotation.id,
        quoteNo: quotation.quoteNo,
        date: quotation.date,
        validUntil: quotation.validUntil,
        subtotal: quotation.subtotal,
        discount: quotation.discount,
        tax: quotation.tax,
        total: quotation.total,
        status: quotation.status,
        note: quotation.note,
        contactId: quotation.contactId,
        contactName: quotation.contact?.name ?? null,
        itemsCount: quotation.items.length,
        items: quotation.items.map((it) => ({
          id: it.id,
          productId: it.productId,
          name: it.name,
          qty: it.qty,
          unitPrice: it.unitPrice,
          total: it.total,
        })),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[quotations:POST]", error);
    return NextResponse.json({ error: "تعذر إنشاء عرض السعر" }, { status: 500 });
  }
}
