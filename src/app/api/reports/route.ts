import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { accountsWithBalances, ACCOUNT_TYPES } from "@/lib/accounting";

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function GET(req: NextRequest) {
  try {
    const g = await guard("accounting:read");
    if (!g.ok) return g.response;
    const companyId = g.ctx.company.id;

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") ?? "stock";

    // ===== تقارير المخزون والمبيعات والمصاريف والعملاء =====

    if (type === "stock") {
      const products = await db.product.findMany({
        where: { companyId },
        orderBy: { stock: "asc" },
      });
      return NextResponse.json({
        title: "تقرير المخزون",
        rows: products.map((p) => ({
          name: p.name,
          sku: p.sku,
          category: p.category,
          stock: p.stock,
          unit: p.unit,
          value: r2(p.stock * p.purchasePrice),
          low: p.stock <= p.alertQuantity,
        })),
        columns: ["الصنف", "الرمز", "المجموعة", "المخزون", "الوحدة", "قيمة المخزون"],
      });
    }

    if (type === "sales") {
      const sales = await db.sale.findMany({
        where: { companyId, status: "final" },
        orderBy: { date: "desc" },
        include: { contact: { select: { name: true } }, items: true },
      });
      return NextResponse.json({
        title: "تقرير المبيعات",
        rows: sales.map((s) => ({
          invoiceNo: s.invoiceNo,
          date: s.date,
          customer: s.contact?.name ?? "عميل نقدي",
          items: s.items.length,
          total: s.total,
          paid: s.paid,
          due: r2(s.total - s.paid),
        })),
        columns: ["الفاتورة", "التاريخ", "العميل", "عدد الأصناف", "الإجمالي", "المدفوع", "المتبقي"],
      });
    }

    if (type === "profit-loss") {
      const [sales, purchases, expenses] = await Promise.all([
        db.sale.findMany({
          where: { companyId, status: "final" },
          select: { subtotal: true, total: true },
        }),
        db.purchase.findMany({ where: { companyId }, select: { total: true } }),
        db.expense.findMany({ where: { companyId }, select: { amount: true, category: true } }),
      ]);
      const totalSales = sales.reduce((s, x) => s + x.subtotal, 0);
      const totalPurchases = purchases.reduce((s, x) => s + x.total, 0);
      const totalExpenses = expenses.reduce((s, x) => s + x.amount, 0);
      const grossProfit = totalSales - totalPurchases;
      const netProfit = grossProfit - totalExpenses;
      return NextResponse.json({
        title: "الربح / الخسارة",
        summary: [
          { label: "إجمالي المبيعات", value: r2(totalSales), kind: "positive" },
          { label: "(-) إجمالي المشتريات", value: r2(totalPurchases), kind: "negative" },
          { label: "(=) إجمالي الربح", value: r2(grossProfit), kind: "neutral" },
          { label: "(-) إجمالي المصاريف", value: r2(totalExpenses), kind: "negative" },
          { label: "(=) صافي الربح", value: r2(netProfit), kind: netProfit >= 0 ? "positive" : "negative" },
        ],
      });
    }

    if (type === "expenses") {
      const expenses = await db.expense.findMany({
        where: { companyId },
        orderBy: { date: "desc" },
      });
      return NextResponse.json({
        title: "تقرير المصاريف",
        rows: expenses.map((e) => ({
          refNo: e.refNo,
          date: e.date,
          category: e.category,
          note: e.note ?? "—",
          amount: e.amount,
        })),
        columns: ["المرجع", "التاريخ", "الفئة", "ملاحظات", "المبلغ"],
      });
    }

    if (type === "customers" || type === "suppliers") {
      const contactType = type === "customers" ? "customer" : "supplier";
      const contacts = await db.contact.findMany({
        where: { companyId, type: contactType },
        include: {
          sales: { where: { status: "final" }, select: { total: true, paid: true } },
          purchases: { select: { total: true, paid: true } },
        },
      });
      return NextResponse.json({
        title: type === "customers" ? "تقرير العملاء" : "تقرير الموردين",
        rows: contacts.map((c) => ({
          name: c.name,
          phone: c.phone ?? "—",
          invoices: c.sales.length + c.purchases.length,
          total: c.sales.reduce((s, x) => s + x.total, 0) + c.purchases.reduce((s, x) => s + x.total, 0),
          due:
            c.sales.reduce((s, x) => s + (x.total - x.paid), 0) +
            c.purchases.reduce((s, x) => s + (x.total - x.paid), 0),
        })),
        columns: [type === "customers" ? "العميل" : "المورد", "الجوال", "عدد الفواتير", "إجمالي التعاملات", "المستحق"],
      });
    }

    // ===== التقارير المحاسبية =====

    if (type === "trial") {
      const accounts = await accountsWithBalances(companyId);
      const withMovement = accounts.filter((a) => a.debit > 0 || a.credit > 0);
      const totalDebit = withMovement.reduce((s, a) => s + a.debit, 0);
      const totalCredit = withMovement.reduce((s, a) => s + a.credit, 0);
      return NextResponse.json({
        title: "ميزان المراجعة",
        rows: withMovement.map((a) => ({
          code: a.code,
          name: a.name,
          type: ACCOUNT_TYPES[a.type],
          debit: a.debit,
          credit: a.credit,
        })),
        columns: ["الرمز", "الحساب", "النوع", "مدين", "دائن"],
        summary: [
          { label: "إجمالي المدين", value: r2(totalDebit), kind: "neutral" },
          { label: "إجمالي الدائن", value: r2(totalCredit), kind: "neutral" },
          {
            label: totalDebit === totalCredit ? "الميزان متوازن ✓" : "الميزان غير متوازن ✗",
            value: r2(totalDebit - totalCredit),
            kind: Math.abs(totalDebit - totalCredit) < 0.01 ? "positive" : "negative",
          },
        ],
      });
    }

    if (type === "income-statement") {
      const accounts = await accountsWithBalances(companyId);
      const revenues = accounts.filter((a) => a.type === "REVENUE" && a.credit > 0);
      const expenses = accounts.filter((a) => a.type === "EXPENSE" && a.debit > 0);
      const totalRevenue = revenues.reduce((s, a) => s + a.credit, 0);
      const totalExpense = expenses.reduce((s, a) => s + a.debit, 0);
      const cogs = accounts.find((a) => a.code === "5010");
      const cogsAmount = cogs?.debit ?? 0;
      const grossProfit = totalRevenue - cogsAmount;
      const operatingExpenses = totalExpense - cogsAmount;
      const netIncome = totalRevenue - totalExpense;
      return NextResponse.json({
        title: "قائمة الدخل",
        summary: [
          { label: "إيرادات النشاط", value: r2(totalRevenue), kind: "positive" },
          { label: "(-) تكلفة البضاعة المباعة", value: r2(cogsAmount), kind: "negative" },
          { label: "(=) مجمل الربح", value: r2(grossProfit), kind: "neutral" },
          { label: "(-) المصاريف التشغيلية", value: r2(operatingExpenses), kind: "negative" },
          { label: "(=) صافي الربح", value: r2(netIncome), kind: netIncome >= 0 ? "positive" : "negative" },
        ],
      });
    }

    if (type === "balance-sheet") {
      const accounts = await accountsWithBalances(companyId);
      const assets = accounts.filter((a) => a.type === "ASSET");
      const liabilities = accounts.filter((a) => a.type === "LIABILITY");
      const equity = accounts.filter((a) => a.type === "EQUITY");
      const revenues = accounts.filter((a) => a.type === "REVENUE");
      const expenses = accounts.filter((a) => a.type === "EXPENSE");

      const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
      const totalLiabilities = liabilities.reduce((s, a) => s + -a.balance, 0);
      const retained = revenues.reduce((s, a) => s + a.credit, 0) - expenses.reduce((s, a) => s + a.debit, 0);
      const totalEquity = equity.reduce((s, a) => s + -a.balance, 0) + retained;
      const withMovement = (list: typeof assets) =>
        list.filter((a) => a.debit > 0 || a.credit > 0);

      return NextResponse.json({
        title: "الميزانية العمومية",
        rows: [
          ...withMovement(assets).map((a) => ({
            code: a.code,
            name: a.name,
            section: "أصول",
            amount: a.balance,
          })),
          ...withMovement(liabilities).map((a) => ({
            code: a.code,
            name: a.name,
            section: "خصوم",
            amount: -a.balance,
          })),
          ...withMovement(equity).map((a) => ({
            code: a.code,
            name: a.name,
            section: "حقوق ملكية",
            amount: -a.balance,
          })),
          { code: "—", name: "الأرباح المحتجزة (الفترة الحالية)", section: "حقوق ملكية", amount: r2(retained) },
        ],
        columns: ["الرمز", "الحساب", "القسم", "الرصيد"],
        summary: [
          { label: "إجمالي الأصول", value: r2(totalAssets), kind: "neutral" },
          { label: "إجمالي الخصوم", value: r2(totalLiabilities), kind: "neutral" },
          { label: "إجمالي حقوق الملكية", value: r2(totalEquity), kind: "neutral" },
          {
            label: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.5 ? "الميزانية متوازنة ✓" : "فرق التوازن",
            value: r2(totalAssets - (totalLiabilities + totalEquity)),
            kind: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.5 ? "positive" : "negative",
          },
        ],
      });
    }

    if (type === "aging") {
      const sales = await db.sale.findMany({
        where: { companyId, status: "final" },
        include: { contact: { select: { name: true } } },
        orderBy: { date: "asc" },
      });
      const now = new Date();
      const buckets = { b1: 0, b2: 0, b3: 0, b4: 0 };
      const rows = sales
        .filter((s) => s.total - s.paid > 0.01)
        .map((s) => {
          const due = s.total - s.paid;
          const days = Math.floor((now.getTime() - new Date(s.date).getTime()) / 86400000);
          const bucket = days <= 30 ? "b1" : days <= 60 ? "b2" : days <= 90 ? "b3" : "b4";
          buckets[bucket as keyof typeof buckets] += due;
          return {
            invoiceNo: s.invoiceNo,
            customer: s.contact?.name ?? "عميل نقدي",
            days,
            due: r2(due),
            b1: bucket === "b1" ? r2(due) : 0,
            b2: bucket === "b2" ? r2(due) : 0,
            b3: bucket === "b3" ? r2(due) : 0,
            b4: bucket === "b4" ? r2(due) : 0,
          };
        });
      return NextResponse.json({
        title: "أعمار الذمم المدينة",
        rows,
        columns: ["الفاتورة", "العميل", "أيام التقادم", "المتبقي", "0-30 يوم", "31-60 يوم", "61-90 يوم", "+90 يوم"],
        summary: [
          { label: "ذمم 0-30 يوم", value: r2(buckets.b1), kind: "neutral" },
          { label: "ذمم 31-60 يوم", value: r2(buckets.b2), kind: "neutral" },
          { label: "ذمم 61-90 يوم", value: r2(buckets.b3), kind: "neutral" },
          { label: "ذمم +90 يوم (حرجة)", value: r2(buckets.b4), kind: buckets.b4 > 0 ? "negative" : "positive" },
        ],
      });
    }

    // ===== تقرير تدفق النقد =====

    if (type === "cash-flow") {
      const fromStr = searchParams.get("from");
      const toStr = searchParams.get("to");
      const now = new Date();
      const from = fromStr ? new Date(fromStr) : new Date(now.getFullYear(), 0, 1);
      const to = toStr ? new Date(toStr + "T23:59:59.999") : now;
      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        return NextResponse.json({ error: "فترة غير صالحة" }, { status: 400 });
      }

      // حسابات النقد: الصندوق (1010) والبنك (1020)
      const accounts = await db.account.findMany({
        where: { companyId },
        select: { id: true, code: true },
      });
      const cashIds = new Set(
        accounts.filter((a) => a.code === "1010" || a.code === "1020").map((a) => a.id)
      );

      // الرصيد الافتتاحي: صافي حركات النقد قبل بداية الفترة
      const openingLines = await db.journalLine.findMany({
        where: {
          accountId: { in: [...cashIds] },
          entry: { companyId, status: "posted", date: { lt: from } },
        },
        select: { debit: true, credit: true },
      });
      const opening = openingLines.reduce((s, l) => s + l.debit - l.credit, 0);

      // قيود الفترة المرحّلة التي تمس حسابات النقد
      const entries = await db.journalEntry.findMany({
        where: { companyId, status: "posted", date: { gte: from, lte: to } },
        include: { lines: { include: { account: { select: { code: true } } } } },
        orderBy: { date: "asc" },
      });

      const FINANCING_CODES = new Set(["2200", "3010", "3020"]);
      const rows: { date: Date; description: string; section: string; amount: number }[] = [];
      let operating = 0;
      let investing = 0;
      let financing = 0;

      for (const entry of entries) {
        let cashNet = 0;
        let hasCashLine = false;
        const otherCodes: string[] = [];
        for (const line of entry.lines) {
          if (cashIds.has(line.accountId)) {
            hasCashLine = true;
            cashNet += line.debit - line.credit;
          } else {
            otherCodes.push(line.account.code);
          }
        }
        if (!hasCashLine || Math.abs(cashNet) < 0.005) continue;

        // التصنيف حسب الأسطر غير النقدية المقابلة
        let section = "الأنشطة التشغيلية";
        if (otherCodes.some((c) => c.startsWith("15"))) {
          section = "الأنشطة الاستثمارية";
        } else if (otherCodes.some((c) => FINANCING_CODES.has(c))) {
          section = "الأنشطة التمويلية";
        }

        if (section === "الأنشطة التشغيلية") operating += cashNet;
        else if (section === "الأنشطة الاستثمارية") investing += cashNet;
        else financing += cashNet;

        rows.push({ date: entry.date, description: entry.description, section, amount: r2(cashNet) });
      }

      const netChange = operating + investing + financing;
      const closing = opening + netChange;

      return NextResponse.json({
        title: "تقرير تدفق النقد",
        rows,
        columns: ["التاريخ", "البيان", "القسم", "الحركة النقدية"],
        summary: [
          { label: "الرصيد الافتتاحي", value: r2(opening), kind: "neutral" },
          { label: "صافي الأنشطة التشغيلية", value: r2(operating), kind: operating >= 0 ? "positive" : "negative" },
          { label: "صافي الأنشطة الاستثمارية", value: r2(investing), kind: investing >= 0 ? "positive" : "negative" },
          { label: "صافي الأنشطة التمويلية", value: r2(financing), kind: financing >= 0 ? "positive" : "negative" },
          { label: "صافي التغير في النقد", value: r2(netChange), kind: netChange >= 0 ? "positive" : "negative" },
          { label: "الرصيد الختامي", value: r2(closing), kind: "neutral" },
        ],
      });
    }

    return NextResponse.json({ error: "نوع تقرير غير معروف" }, { status: 400 });
  } catch (error) {
    console.error("[reports:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل التقرير" }, { status: 500 });
  }
}
