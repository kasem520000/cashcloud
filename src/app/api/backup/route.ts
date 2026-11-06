import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** GET — تنزيل نسخة احتياطية JSON كاملة لبيانات المنشأة النشطة (للمالك والمدير فقط) */
export async function GET(_req: NextRequest) {
  try {
    const g = await guard();
    if (!g.ok) return g.response;

    if (!["OWNER", "ADMIN"].includes(g.ctx.role)) {
      return NextResponse.json(
        { error: "النسخ الاحتياطي متاح للمالك والمدير فقط" },
        { status: 403 }
      );
    }

    const companyId = g.ctx.company.id;

    const [
      company,
      contacts,
      products,
      sales,
      purchases,
      payments,
      quotations,
      expenses,
      accounts,
      journalEntries,
      vatDeclarations,
      notificationsCount,
    ] = await Promise.all([
      db.company.findUnique({
        where: { id: companyId },
        select: {
          id: true,
          name: true,
          slug: true,
          currency: true,
          taxNumber: true,
          crNumber: true,
          status: true,
          zatcaEnv: true,
          address: true,
          phone: true,
          email: true,
          plan: true,
          planStartedAt: true,
          buildingNo: true,
          streetName: true,
          district: true,
          city: true,
          postalCode: true,
          additionalNo: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      db.contact.findMany({ where: { companyId } }),
      db.product.findMany({ where: { companyId } }),
      db.sale.findMany({ where: { companyId }, include: { items: true } }),
      db.purchase.findMany({ where: { companyId }, include: { items: true } }),
      db.payment.findMany({ where: { companyId } }),
      db.quotation.findMany({ where: { companyId }, include: { items: true } }),
      db.expense.findMany({ where: { companyId } }),
      db.account.findMany({ where: { companyId } }),
      db.journalEntry.findMany({ where: { companyId }, include: { lines: true } }),
      db.vatDeclaration.findMany({ where: { companyId } }),
      db.notification.count({ where: { companyId } }),
    ]);

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

    const payload = {
      meta: {
        exportedAt: now.toISOString(),
        version: 1,
        companyName: company?.name ?? g.ctx.company.name,
      },
      company,
      contacts,
      products,
      sales,
      purchases,
      payments,
      quotations,
      expenses,
      accounts,
      journalEntries,
      vatDeclarations,
      counters: { notifications: notificationsCount },
    };

    await logAudit({
      companyId,
      userId: g.ctx.user.id,
      username: g.ctx.user.username,
      action: "backup.export",
      entity: "company",
      entityId: companyId,
      details: { sales: sales.length, purchases: purchases.length, payments: payments.length },
    });

    return NextResponse.json(payload, {
      headers: {
        "Content-Disposition": `attachment; filename="backup-${g.ctx.company.slug}-${stamp}.json"`,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("[backup:GET]", error);
    return NextResponse.json({ error: "تعذر إنشاء النسخة الاحتياطية" }, { status: 500 });
  }
}
