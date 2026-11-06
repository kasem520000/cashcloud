import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { postAutoJournal } from "@/lib/accounting";
import { generateQrPayload, isValidSaudiVat } from "@/lib/zatca";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round(n * 100) / 100;

const FREQUENCIES = ["weekly", "monthly", "quarterly", "yearly"] as const;
const PAYMENT_METHODS = ["cash", "card", "transfer", "credit"] as const;

type RecurringItemInput = {
  productId?: string | null;
  name?: string;
  qty?: number;
  unitPrice?: number;
};

/** الجدولة التالية للتكرار انطلاقاً من الآن (وليس من الموعد القديم) */
function advanceNextRun(from: Date, frequency: string): Date {
  const d = new Date(from);
  switch (frequency) {
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d;
}

/** التحقق من عناصر القالب وإرجاعها بصيغة نظيفة */
function parseItems(raw: unknown): { ok: true; items: { productId: string | null; name: string; qty: number; unitPrice: number }[] } | { ok: false; error: string } {
  const arr = Array.isArray(raw) ? (raw as RecurringItemInput[]) : [];
  if (arr.length === 0) return { ok: false, error: "أضف صنفاً واحداً على الأقل للقالب" };
  const items: { productId: string | null; name: string; qty: number; unitPrice: number }[] = [];
  for (const it of arr) {
    const name = typeof it?.name === "string" ? it.name.trim() : "";
    const qty = Number(it?.qty);
    const unitPrice = Number(it?.unitPrice);
    if (!name) return { ok: false, error: "اسم الصنف مطلوب لكل عنصر" };
    if (isNaN(qty) || qty <= 0) return { ok: false, error: "كمية كل صنف يجب أن تكون أكبر من صفر" };
    if (isNaN(unitPrice) || unitPrice < 0) return { ok: false, error: "سعر كل صنف يجب أن يكون رقماً موجباً" };
    items.push({
      productId: typeof it.productId === "string" && it.productId ? it.productId : null,
      name,
      qty,
      unitPrice,
    });
  }
  return { ok: true, items };
}

/** GET — قوالب الفواتير المتكررة + الإحصاءات */
export async function GET() {
  try {
    const g = await guard("sales:read");
    if (!g.ok) return g.response;
    const companyId = g.ctx.company.id;

    const templates = await db.recurringInvoice.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      include: { items: true },
    });

    // ربط أسماء جهات الاتصال يدوياً (contactId بدون علاقة FK)
    const contactIds = [...new Set(templates.map((t) => t.contactId).filter(Boolean))] as string[];
    const contacts = contactIds.length
      ? await db.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, name: true } })
      : [];
    const contactNameMap = new Map(contacts.map((c) => [c.id, c.name]));

    const now = new Date();
    return NextResponse.json({
      templates: templates.map((t) => ({
        id: t.id,
        contactId: t.contactId,
        contactName: t.contactId ? (contactNameMap.get(t.contactId) ?? null) : null,
        frequency: t.frequency,
        nextRunAt: t.nextRunAt,
        lastRunAt: t.lastRunAt,
        generatedCount: t.generatedCount,
        taxRate: t.taxRate,
        discount: t.discount,
        paymentMethod: t.paymentMethod,
        note: t.note,
        isActive: t.isActive,
        items: t.items.map((it) => ({
          id: it.id,
          productId: it.productId,
          name: it.name,
          qty: it.qty,
          unitPrice: it.unitPrice,
        })),
        subtotal: r2(t.items.reduce((s, it) => s + it.qty * it.unitPrice, 0)),
      })),
      stats: {
        active: templates.filter((t) => t.isActive).length,
        totalGenerated: templates.reduce((s, t) => s + t.generatedCount, 0),
        dueNow: templates.filter((t) => t.isActive && t.nextRunAt <= now).length,
      },
    });
  } catch (error) {
    console.error("[recurring:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل الفواتير المتكررة" }, { status: 500 });
  }
}

/** POST — إدارة القوالب والتوليد الفوري (action-based) */
export async function POST(req: NextRequest) {
  try {
    const g = await guard("sales:write");
    if (!g.ok) return g.response;
    const companyId = g.ctx.company.id;

    const body = await req.json().catch(() => null);
    const action: string = body?.action ?? "";

    // ===== 1) إنشاء قالب =====
    if (action === "create") {
      const t = body?.template ?? {};
      const frequency = FREQUENCIES.includes(t?.frequency) ? t.frequency : "";
      if (!frequency) {
        return NextResponse.json({ error: "دورية غير صالحة (weekly | monthly | quarterly | yearly)" }, { status: 400 });
      }
      const nextRunAt = t?.nextRunAt ? new Date(t.nextRunAt) : null;
      if (!nextRunAt || isNaN(nextRunAt.getTime())) {
        return NextResponse.json({ error: "تاريخ التشغيل القادم مطلوب وصالح" }, { status: 400 });
      }
      const parsed = parseItems(t?.items);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      const contactId = typeof t?.contactId === "string" && t.contactId ? t.contactId : null;
      if (contactId) {
        const contact = await db.contact.findFirst({ where: { id: contactId, companyId }, select: { id: true } });
        if (!contact) {
          return NextResponse.json({ error: "جهة التعامل غير موجودة" }, { status: 400 });
        }
      }

      const template = await db.recurringInvoice.create({
        data: {
          companyId,
          contactId,
          frequency,
          nextRunAt,
          taxRate: Math.max(0, Math.min(100, Number(t?.taxRate ?? 15) || 0)),
          discount: Math.max(0, Number(t?.discount) || 0),
          paymentMethod: PAYMENT_METHODS.includes(t?.paymentMethod) ? t.paymentMethod : "credit",
          note: typeof t?.note === "string" && t.note.trim() ? t.note.trim() : null,
          isActive: t?.isActive === undefined ? true : !!t.isActive,
          items: { create: parsed.items },
        },
        include: { items: true },
      });

      await logAudit({
        companyId,
        userId: g.ctx.user.id,
        username: g.ctx.user.username,
        action: "recurring.create",
        entity: "recurringInvoice",
        entityId: template.id,
        details: { frequency, itemsCount: parsed.items.length },
      });

      return NextResponse.json({ template }, { status: 201 });
    }

    // ===== 2) تعديل قالب =====
    if (action === "update") {
      const id: string = body?.id ?? "";
      const t = body?.template ?? {};
      const template = await db.recurringInvoice.findFirst({ where: { id, companyId } });
      if (!template) {
        return NextResponse.json({ error: "القالب غير موجود" }, { status: 404 });
      }
      const frequency = FREQUENCIES.includes(t?.frequency) ? (t.frequency as string) : template.frequency;
      const nextRunAt = t?.nextRunAt ? new Date(t.nextRunAt) : null;
      if (t?.nextRunAt !== undefined && (!nextRunAt || isNaN(nextRunAt.getTime()))) {
        return NextResponse.json({ error: "تاريخ التشغيل القادم غير صالح" }, { status: 400 });
      }
      const contactId =
        t?.contactId === undefined ? undefined : typeof t.contactId === "string" && t.contactId ? t.contactId : null;

      // استبدال العناصر بالكامل إن وُجدت
      let itemsData: undefined | { create: { productId: string | null; name: string; qty: number; unitPrice: number }[] };
      if (t?.items !== undefined) {
        const parsed = parseItems(t.items);
        if (!parsed.ok) {
          return NextResponse.json({ error: parsed.error }, { status: 400 });
        }
        itemsData = { create: parsed.items };
      }

      const updated = await db.$transaction(async (tx) => {
        if (itemsData) {
          await tx.recurringItem.deleteMany({ where: { recurringId: id } });
        }
        return tx.recurringInvoice.update({
          where: { id },
          data: {
            contactId,
            frequency,
            nextRunAt: nextRunAt ?? undefined,
            taxRate: t?.taxRate === undefined ? undefined : Math.max(0, Math.min(100, Number(t.taxRate) || 0)),
            discount: t?.discount === undefined ? undefined : Math.max(0, Number(t.discount) || 0),
            paymentMethod: PAYMENT_METHODS.includes(t?.paymentMethod) ? t.paymentMethod : undefined,
            note: typeof t?.note === "string" ? (t.note.trim() || null) : undefined,
            isActive: t?.isActive === undefined ? undefined : !!t.isActive,
            items: itemsData,
          },
          include: { items: true },
        });
      });

      await logAudit({
        companyId,
        userId: g.ctx.user.id,
        username: g.ctx.user.username,
        action: "recurring.update",
        entity: "recurringInvoice",
        entityId: id,
        details: { frequency },
      });

      return NextResponse.json({ template: updated });
    }

    // ===== 3) حذف قالب =====
    if (action === "delete") {
      const id: string = body?.id ?? "";
      const template = await db.recurringInvoice.findFirst({ where: { id, companyId } });
      if (!template) {
        return NextResponse.json({ error: "القالب غير موجود" }, { status: 404 });
      }
      await db.recurringInvoice.delete({ where: { id } }); // يحذف العناصر cascade
      await logAudit({
        companyId,
        userId: g.ctx.user.id,
        username: g.ctx.user.username,
        action: "recurring.delete",
        entity: "recurringInvoice",
        entityId: id,
        details: { generatedCount: template.generatedCount },
      });
      return NextResponse.json({ ok: true });
    }

    // ===== 4) تفعيل/إيقاف قالب =====
    if (action === "toggle") {
      const id: string = body?.id ?? "";
      const template = await db.recurringInvoice.findFirst({ where: { id, companyId } });
      if (!template) {
        return NextResponse.json({ error: "القالب غير موجود" }, { status: 404 });
      }
      const updated = await db.recurringInvoice.update({
        where: { id },
        data: { isActive: !template.isActive },
        include: { items: true },
      });
      return NextResponse.json({ template: updated });
    }

    // ===== 5) توليد فاتورة فورية من القالب =====
    if (action === "run") {
      const id: string = body?.id ?? "";
      const template = await db.recurringInvoice.findFirst({
        where: { id, companyId },
        include: { items: true },
      });
      if (!template) {
        return NextResponse.json({ error: "القالب غير موجود" }, { status: 404 });
      }
      if (template.items.length === 0) {
        return NextResponse.json({ error: "القالب لا يحتوي عناصر" }, { status: 400 });
      }

      // جهة التعامل المرتبطة (بدون FK — جلب يدوي)
      const contact = template.contactId
        ? await db.contact.findFirst({
            where: { id: template.contactId, companyId },
          })
        : null;

      const now = new Date();
      const subtotal = r2(template.items.reduce((s, it) => s + it.qty * it.unitPrice, 0));
      const taxable = Math.max(0, r2(subtotal - template.discount));
      const tax = r2((taxable * template.taxRate) / 100);
      const total = r2(taxable + tax);
      const paid = template.paymentMethod === "credit" ? 0 : total;

      // تكلفة البضاعة (من أسعار الشراء بعملة المنشأة)
      const productIds = [...new Set(template.items.map((it) => it.productId).filter(Boolean))] as string[];
      const products = productIds.length
        ? await db.product.findMany({
            where: { id: { in: productIds }, companyId },
            select: { id: true, purchasePrice: true },
          })
        : [];
      const priceMap = new Map(products.map((p) => [p.id, p.purchasePrice]));
      const cogs = r2(
        template.items.reduce(
          (s, it) => s + it.qty * (priceMap.get(it.productId ?? "") ?? 0),
          0
        )
      );

      const sale = await db.$transaction(async (tx) => {
        const count = await tx.sale.count({ where: { companyId } });
        const invoiceNo = `INV-${String(count + 1).padStart(5, "0")}`;

        const created = await tx.sale.create({
          data: {
            companyId,
            invoiceNo,
            kind: "invoice",
            status: "final",
            contactId: contact?.id ?? null,
            userId: g.ctx.user.id,
            date: now,
            subtotal,
            discount: template.discount,
            tax,
            total,
            paid,
            paymentMethod: template.paymentMethod,
            currency: "SAR",
            exchangeRate: 1,
            note: template.note ?? null,
            items: {
              create: template.items.map((it) => ({
                productId: it.productId,
                name: it.name,
                qty: it.qty,
                unitPrice: it.unitPrice,
                total: it.qty * it.unitPrice,
              })),
            },
          },
          include: { items: true, contact: { select: { name: true } } },
        });

        // خصم المخزون للعناصر المرتبطة بمنتجات تخص المنشأة
        for (const it of template.items) {
          if (it.productId && priceMap.has(it.productId)) {
            await tx.product.update({
              where: { id: it.productId },
              data: { stock: { decrement: it.qty } },
            });
          }
        }

        return created;
      });

      // قيد الإيراد: قبض/ذمم مدينة ← إيراد المبيعات + الضريبة
      const cashCode = template.paymentMethod === "transfer" ? "1020" : "1010";
      await postAutoJournal({
        companyId,
        date: now,
        description: `فاتورة متكررة ${sale.invoiceNo}`,
        reference: `SALE-${sale.invoiceNo}`,
        source: "auto-sale",
        lines: [
          { code: cashCode, debit: paid, description: "المقبوضات" },
          { code: "1200", debit: r2(total - paid), description: "مبيعات آجلة" },
          { code: "4010", credit: taxable, description: "إيرادات مبيعات" },
          { code: "2100", credit: tax, description: "ضريبة القيمة المضافة" },
        ],
      });

      // قيد تكلفة البضاعة المباعة
      if (cogs > 0) {
        await postAutoJournal({
          companyId,
          date: now,
          description: `تكلفة بضاعة فاتورة متكررة ${sale.invoiceNo}`,
          reference: `SALE-${sale.invoiceNo}`,
          source: "auto-sale",
          lines: [
            { code: "5010", debit: cogs, description: "تكلفة البضاعة المباعة" },
            { code: "1300", credit: cogs, description: "صرف من المخزون" },
          ],
        });
      }

      // رمز QR لزتكا عند توفر رقم ضريبي صالح
      if (isValidSaudiVat(g.ctx.company.taxNumber)) {
        const qrData = generateQrPayload({
          sellerName: g.ctx.company.name,
          vatNumber: g.ctx.company.taxNumber!,
          timestamp: now,
          total,
          vatTotal: tax,
        });
        await db.sale.update({ where: { id: sale.id }, data: { qrData } });
      }

      await notify({
        companyId,
        title: "فاتورة متكررة تولّدت تلقائياً",
        message: `تولّدت الفاتورة ${sale.invoiceNo} من القالب المتكرر بإجمالي ${total.toFixed(2)} ${g.ctx.company.currency}${contact?.name ? ` للعميل ${contact.name}` : ""}`,
        type: "invoice",
        link: "sales",
      });

      // تحديث القالب: آخر تشغيل + عداد + الموعد القادم من الآن
      await db.recurringInvoice.update({
        where: { id },
        data: {
          lastRunAt: now,
          generatedCount: { increment: 1 },
          nextRunAt: advanceNextRun(now, template.frequency),
        },
      });

      await logAudit({
        companyId,
        userId: g.ctx.user.id,
        username: g.ctx.user.username,
        action: "recurring.run",
        entity: "sale",
        entityId: sale.id,
        details: { invoiceNo: sale.invoiceNo, templateId: id, total },
      });

      return NextResponse.json({ sale, invoiceNo: sale.invoiceNo }, { status: 201 });
    }

    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  } catch (error) {
    console.error("[recurring:POST]", error);
    return NextResponse.json({ error: "تعذر تنفيذ إجراء الفواتير المتكررة" }, { status: 500 });
  }
}
