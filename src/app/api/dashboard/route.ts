import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const g = await guard();
    if (!g.ok) return g.response;
    const companyId = g.ctx.company.id;

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOf30 = new Date(now);
    startOf30.setDate(startOf30.getDate() - 29);
    startOf30.setHours(0, 0, 0, 0);

    const [
      sales,
      purchases,
      expenses,
      products,
      contacts,
      saleReturns,
      purchaseReturns,
    ] = await Promise.all([
      db.sale.findMany({
        where: { companyId, status: "final", kind: "invoice" },
        select: { total: true, paid: true, date: true },
      }),
      db.purchase.findMany({
        where: { companyId, kind: "invoice" },
        select: { total: true, paid: true, date: true },
      }),
      db.expense.findMany({
        where: { companyId },
        select: { amount: true, date: true, category: true },
      }),
      db.product.findMany({
        where: { companyId },
        select: { stock: true, alertQuantity: true, purchasePrice: true, isActive: true },
      }),
      db.contact.findMany({ where: { companyId }, select: { type: true } }),
      db.sale.findMany({
        where: { companyId, status: "final", kind: "credit-note" },
        select: { total: true, date: true },
      }),
      db.purchase.findMany({
        where: { companyId, kind: "return" },
        select: { total: true, date: true },
      }),
    ]);

    const totalSales = sales.reduce((s, x) => s + x.total, 0);
    const salesDue = sales.reduce((s, x) => s + (x.total - x.paid), 0);
    const totalPurchases = purchases.reduce((s, x) => s + x.total, 0);
    const purchasesDue = purchases.reduce((s, x) => s + (x.total - x.paid), 0);
    const totalExpenses = expenses.reduce((s, x) => s + x.amount, 0);
    const netIncome = totalSales - totalPurchases - totalExpenses;
    const saleReturnsTotal = saleReturns.reduce((s, x) => s + x.total, 0);
    const purchaseReturnsTotal = purchaseReturns.reduce((s, x) => s + x.total, 0);

    // 30-day series (sales per day)
    const days: { date: string; label: string; sales: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(startOf30);
      d.setDate(startOf30.getDate() + (29 - i));
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const daySales = sales
        .filter((s) => new Date(s.date) >= d && new Date(s.date) < next)
        .reduce((s2, x) => s2 + x.total, 0);
      days.push({
        date: d.toISOString().slice(0, 10),
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        sales: Math.round(daySales * 100) / 100,
      });
    }

    // top products by sales qty
    const topItems = await db.saleItem.groupBy({
      by: ["name"],
      where: { sale: { companyId, status: "final", kind: "invoice" } },
      _sum: { qty: true, total: true },
      orderBy: { _sum: { total: "desc" } },
      take: 7,
    });

    // expense by category (this month)
    const expensesByCategory = expenses
      .filter((e) => new Date(e.date) >= startOfMonth)
      .reduce<Record<string, number>>((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + e.amount;
        return acc;
      }, {});

    const todaySales = sales
      .filter((s) => new Date(s.date) >= startOfToday)
      .reduce((s, x) => s + x.total, 0);

    // ===== إحصائيات الفروع (تعدد المنافذ) =====
    const branchesRaw = await db.branch.findMany({
      where: { companyId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, code: true, isActive: true },
    });
    const salesWithBranch = await db.sale.findMany({
      where: { companyId, status: "final", kind: "invoice" },
      select: { branchId: true, total: true },
    });
    const branchStats = branchesRaw.map((b) => ({
      id: b.id,
      name: b.name,
      code: b.code,
      isActive: b.isActive,
      salesTotal: salesWithBranch
        .filter((s) => s.branchId === b.id)
        .reduce((s, x) => s + x.total, 0),
      salesCount: salesWithBranch.filter((s) => s.branchId === b.id).length,
    }));

    return NextResponse.json({
      kpis: {
        totalSales,
        salesDue,
        saleReturnsTotal,
        totalPurchases,
        purchasesDue,
        purchaseReturnsTotal,
        totalExpenses,
        netIncome,
        todaySales,
        todayProfit: Math.round((todaySales - totalExpenses / 30) * 100) / 100,
      },
      counts: {
        products: products.filter((p) => p.isActive).length,
        lowStock: products.filter((p) => p.stock <= p.alertQuantity).length,
        stockValue: products.reduce((s, p) => s + p.stock * p.purchasePrice, 0),
        customers: contacts.filter((c) => c.type === "customer").length,
        suppliers: contacts.filter((c) => c.type === "supplier").length,
        branches: branchesRaw.length,
        openShifts: await db.posShift.count({ where: { companyId, status: "open" } }),
      },
      branchStats,
      salesSeries: days,
      topProducts: topItems.map((t) => ({
        name: t.name,
        qty: t._sum.qty || 0,
        total: t._sum.total || 0,
      })),
      expensesByCategory: Object.entries(expensesByCategory).map(([name, value]) => ({
        name,
        value: Math.round(value * 100) / 100,
      })),
    });
  } catch (error) {
    console.error("[dashboard:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل الإحصائيات" }, { status: 500 });
  }
}
