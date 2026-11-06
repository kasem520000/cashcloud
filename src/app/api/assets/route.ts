import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { postAutoJournal, deleteAutoJournals, ensureDefaultAccounts } from "@/lib/accounting";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** القسط الشهري بالقسط الثابت: (التكلفة - القيمة التخريدية) / (العمر بالأشهر) */
function monthlyDepreciation(asset: {
  cost: number;
  salvageValue: number;
  usefulLifeYears: number;
  status: string;
}): number {
  if (asset.status === "disposed") return 0;
  const months = asset.usefulLifeYears * 12;
  if (months <= 0) return 0;
  const value = (asset.cost - asset.salvageValue) / months;
  return value > 0 ? r2(value) : 0;
}

/** القيمة القابلة للإهلاك */
function depreciableValue(asset: { cost: number; salvageValue: number }): number {
  return r2(Math.max(0, asset.cost - asset.salvageValue));
}

/** هل اكتمل إهلاك الأصل؟ */
function isFullyDepreciated(asset: { cost: number; salvageValue: number; accumulated: number }): boolean {
  return asset.accumulated >= depreciableValue(asset) - 0.01;
}

/** GET — الأصول الثابتة + الإحصاءات + آخر سجلات الإهلاك */
export async function GET() {
  try {
    const g = await guard("accounting:read");
    if (!g.ok) return g.response;
    const companyId = g.ctx.company.id;

    const [assets, recentDepreciation] = await Promise.all([
      db.fixedAsset.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
      }),
      db.depreciationEntry.findMany({
        where: { companyId },
        orderBy: { date: "desc" },
        take: 50,
        include: { asset: { select: { name: true } } },
      }),
    ]);

    const enriched = assets.map((a) => {
      const dep = monthlyDepreciation(a);
      const dv = depreciableValue(a);
      return {
        id: a.id,
        name: a.name,
        category: a.category,
        purchaseDate: a.purchaseDate,
        cost: a.cost,
        salvageValue: a.salvageValue,
        usefulLifeYears: a.usefulLifeYears,
        method: a.method,
        accumulated: a.accumulated,
        status: a.status,
        disposedAt: a.disposedAt,
        disposalAmount: a.disposalAmount,
        note: a.note,
        monthlyDepreciation: dep,
        nbv: r2(a.cost - a.accumulated),
        depreciableValue: dv,
        fullyDepreciated: a.accumulated >= dv - 0.01,
      };
    });

    const activeAssets = enriched.filter((a) => a.status === "active");
    const stats = {
      totalAssets: enriched.length,
      activeAssets: activeAssets.length,
      totalCost: r2(enriched.reduce((s, a) => s + a.cost, 0)),
      totalAccumulated: r2(enriched.reduce((s, a) => s + a.accumulated, 0)),
      totalNbv: r2(enriched.reduce((s, a) => s + a.nbv, 0)),
      monthlyDepreciation: r2(
        activeAssets
          .filter((a) => !a.fullyDepreciated)
          .reduce((s, a) => s + a.monthlyDepreciation, 0)
      ),
    };

    return NextResponse.json({
      assets: enriched,
      stats,
      recentDepreciation: recentDepreciation.map((d) => ({
        id: d.id,
        assetId: d.assetId,
        assetName: d.asset.name,
        period: d.period,
        amount: d.amount,
        date: d.date,
      })),
    });
  } catch (error) {
    console.error("[assets:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل الأصول الثابتة" }, { status: 500 });
  }
}

/** POST — إدارة الأصول وتشغيل الإهلاك والتخريد (action-based) */
export async function POST(req: NextRequest) {
  try {
    const g = await guard("accounting:write");
    if (!g.ok) return g.response;
    const companyId = g.ctx.company.id;

    const body = await req.json().catch(() => null);
    const action: string = body?.action ?? "";

    // ===== 1) إنشاء أصل ثابت =====
    if (action === "asset.create") {
      const a = body?.asset ?? {};
      const name = typeof a.name === "string" ? a.name.trim() : "";
      if (!name) {
        return NextResponse.json({ error: "اسم الأصل مطلوب" }, { status: 400 });
      }
      const cost = Number(a.cost);
      if (isNaN(cost) || cost <= 0) {
        return NextResponse.json({ error: "تكلفة الأصل يجب أن تكون أكبر من صفر" }, { status: 400 });
      }
      const salvageValue = Number(a.salvageValue);
      if (isNaN(salvageValue) || salvageValue < 0 || salvageValue > cost) {
        return NextResponse.json({ error: "القيمة التخريدية يجب أن تكون رقماً موجباً لا يتجاوز التكلفة" }, { status: 400 });
      }
      const usefulLifeYears = Number(a.usefulLifeYears);
      if (!Number.isInteger(usefulLifeYears) || usefulLifeYears < 1 || usefulLifeYears > 50) {
        return NextResponse.json({ error: "العمر الإنتاجي يجب أن يكون بين سنة و50 سنة" }, { status: 400 });
      }
      const purchaseDate = a.purchaseDate ? new Date(a.purchaseDate) : new Date();
      const validDate = isNaN(purchaseDate.getTime()) ? new Date() : purchaseDate;

      const asset = await db.fixedAsset.create({
        data: {
          companyId,
          name,
          category: typeof a.category === "string" && a.category.trim() ? a.category.trim() : "معدات",
          purchaseDate: validDate,
          cost,
          salvageValue,
          usefulLifeYears,
          method: typeof a.method === "string" && a.method.trim() ? a.method.trim() : "straight-line",
          note: typeof a.note === "string" && a.note.trim() ? a.note.trim() : null,
        },
      });

      // قيد شراء الأصل: أصول ثابتة ← نقدية
      await postAutoJournal({
        companyId,
        date: validDate,
        description: `شراء أصل ثابت: ${name}`,
        reference: `ASSET-ACQ-${asset.id}`,
        source: "auto-depreciation",
        lines: [
          { code: "1500", debit: cost, description: `شراء أصل: ${name}` },
          { code: "1010", credit: cost, description: `سداد قيمة الأصل: ${name}` },
        ],
      });

      await logAudit({
        companyId,
        userId: g.ctx.user.id,
        username: g.ctx.user.username,
        action: "asset.create",
        entity: "fixedAsset",
        entityId: asset.id,
        details: { name, cost, usefulLifeYears },
      });

      return NextResponse.json({ asset }, { status: 201 });
    }

    // ===== 2) تعديل أصل =====
    if (action === "asset.update") {
      const id: string = body?.id ?? "";
      const a = body?.asset ?? {};
      const asset = await db.fixedAsset.findFirst({ where: { id, companyId } });
      if (!asset) {
        return NextResponse.json({ error: "الأصل غير موجود" }, { status: 404 });
      }
      const entryCount = await db.depreciationEntry.count({ where: { assetId: id } });
      if (entryCount > 0) {
        return NextResponse.json(
          { error: "لا يمكن تعديل أصل بدأ الإهلاك — قرّده أولاً" },
          { status: 400 }
        );
      }
      const name = typeof a.name === "string" ? a.name.trim() : "";
      if (!name) {
        return NextResponse.json({ error: "اسم الأصل مطلوب" }, { status: 400 });
      }
      const cost = Number(a.cost ?? asset.cost);
      if (isNaN(cost) || cost <= 0) {
        return NextResponse.json({ error: "تكلفة الأصل يجب أن تكون أكبر من صفر" }, { status: 400 });
      }
      const salvageValue = Number(a.salvageValue ?? asset.salvageValue);
      if (isNaN(salvageValue) || salvageValue < 0 || salvageValue > cost) {
        return NextResponse.json({ error: "القيمة التخريدية يجب أن تكون رقماً موجباً لا يتجاوز التكلفة" }, { status: 400 });
      }
      const usefulLifeYears = Number(a.usefulLifeYears ?? asset.usefulLifeYears);
      if (!Number.isInteger(usefulLifeYears) || usefulLifeYears < 1 || usefulLifeYears > 50) {
        return NextResponse.json({ error: "العمر الإنتاجي يجب أن يكون بين سنة و50 سنة" }, { status: 400 });
      }

      const updated = await db.fixedAsset.update({
        where: { id },
        data: {
          name,
          category: typeof a.category === "string" && a.category.trim() ? a.category.trim() : undefined,
          purchaseDate: a.purchaseDate ? (isNaN(new Date(a.purchaseDate).getTime()) ? undefined : new Date(a.purchaseDate)) : undefined,
          cost,
          salvageValue,
          usefulLifeYears,
          method: typeof a.method === "string" && a.method.trim() ? a.method.trim() : undefined,
          note: typeof a.note === "string" ? (a.note.trim() || null) : undefined,
        },
      });

      await logAudit({
        companyId,
        userId: g.ctx.user.id,
        username: g.ctx.user.username,
        action: "asset.update",
        entity: "fixedAsset",
        entityId: id,
        details: { name },
      });

      return NextResponse.json({ asset: updated });
    }

    // ===== 3) حذف أصل =====
    if (action === "asset.delete") {
      const id: string = body?.id ?? "";
      const asset = await db.fixedAsset.findFirst({ where: { id, companyId } });
      if (!asset) {
        return NextResponse.json({ error: "الأصل غير موجود" }, { status: 404 });
      }
      const entryCount = await db.depreciationEntry.count({ where: { assetId: id } });
      if (entryCount > 0) {
        return NextResponse.json(
          { error: "لا يمكن تعديل أصل بدأ الإهلاك — قرّده أولاً" },
          { status: 400 }
        );
      }
      await db.fixedAsset.delete({ where: { id } });
      await deleteAutoJournals(companyId, `ASSET-ACQ-${id}`);
      await logAudit({
        companyId,
        userId: g.ctx.user.id,
        username: g.ctx.user.username,
        action: "asset.delete",
        entity: "fixedAsset",
        entityId: id,
        details: { name: asset.name, cost: asset.cost },
      });
      return NextResponse.json({ ok: true });
    }

    // ===== 4) ترحيل إهلاك فترة =====
    if (action === "depreciation.run") {
      const period: string = typeof body?.period === "string" ? body.period.trim() : "";
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
        return NextResponse.json({ error: "صيغة الفترة غير صالحة — استخدم YYYY-MM" }, { status: 400 });
      }

      // ضمان اكتمال دليل الحسابات (ترقية سلسة للمنشآت القائمة)
      await ensureDefaultAccounts(companyId);

      const assets = await db.fixedAsset.findMany({
        where: { companyId, status: "active" },
      });
      const already = await db.depreciationEntry.findMany({
        where: { companyId, period },
        select: { assetId: true },
      });
      const doneAssets = new Set(already.map((d) => d.assetId));

      // المبالغ المستحقة: أقل من القسط الشهري والمتبقي
      const pending = assets
        .filter((a) => !doneAssets.has(a.id) && !isFullyDepreciated(a))
        .map((a) => {
          const remaining = r2(depreciableValue(a) - a.accumulated);
          const amount = r2(Math.min(monthlyDepreciation(a), remaining));
          return { asset: a, amount };
        })
        .filter((p) => p.amount > 0);

      if (pending.length === 0) {
        return NextResponse.json({ error: "لا توجد أصول تستحق إهلاكاً لهذه الفترة" }, { status: 400 });
      }

      const totalAmount = r2(pending.reduce((s, p) => s + p.amount, 0));
      const now = new Date();

      await db.$transaction(async (tx) => {
        await tx.depreciationEntry.createMany({
          data: pending.map((p) => ({
            companyId,
            assetId: p.asset.id,
            period,
            amount: p.amount,
            date: now,
          })),
        });
        for (const p of pending) {
          await tx.fixedAsset.update({
            where: { id: p.asset.id },
            data: { accumulated: { increment: p.amount } },
          });
        }
      });

      // قيد الإهلاك: مصروف الإهلاك ← مجمع إهلاك الأصول
      const journal = await postAutoJournal({
        companyId,
        date: now,
        description: `إهلاك الأصول الثابتة لفترة ${period}`,
        reference: `DEPR-${period}`,
        source: "auto-depreciation",
        lines: [
          { code: "5500", debit: totalAmount, description: `مصروف إهلاك — فترة ${period}` },
          { code: "1510", credit: totalAmount, description: `مجمع إهلاك الأصول — فترة ${period}` },
        ],
      });

      await notify({
        companyId,
        title: `اكتمل ترحيل إهلاك الفترة ${period}`,
        message: `تم ترحيل إهلاك ${pending.length} أصلاً بإجمالي ${totalAmount.toFixed(2)} ${g.ctx.company.currency} لفترة ${period}`,
        type: "system",
        link: "assets",
      });

      await logAudit({
        companyId,
        userId: g.ctx.user.id,
        username: g.ctx.user.username,
        action: "asset.depreciation.run",
        entity: "depreciationEntry",
        details: { period, entriesCount: pending.length, totalAmount },
      });

      return NextResponse.json(
        { entriesCount: pending.length, totalAmount, journalNumber: journal?.number ?? null },
        { status: 201 }
      );
    }

    // ===== 5) تخريد أصل =====
    if (action === "asset.dispose") {
      const id: string = body?.id ?? "";
      const asset = await db.fixedAsset.findFirst({ where: { id, companyId } });
      if (!asset) {
        return NextResponse.json({ error: "الأصل غير موجود" }, { status: 404 });
      }
      if (asset.status === "disposed") {
        return NextResponse.json({ error: "هذا الأصل مجرَّد مسبقاً" }, { status: 400 });
      }
      const disposalAmount = Number(body?.disposalAmount);
      if (isNaN(disposalAmount) || disposalAmount < 0) {
        return NextResponse.json({ error: "مبلغ التخريد يجب أن يكون رقماً موجباً" }, { status: 400 });
      }
      const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;
      const now = new Date();

      const updated = await db.fixedAsset.update({
        where: { id },
        data: { status: "disposed", disposedAt: now, disposalAmount, note: note ?? asset.note },
      });

      // قيد التخريد: نقدية + مجمع الإهلاك (+ خسارة) ← الأصل الثابت (+ ربح)
      const diff = r2(asset.cost - asset.accumulated - disposalAmount);
      const lines: { code: string; debit?: number; credit?: number; description?: string }[] = [
        { code: "1010", debit: disposalAmount, description: "متداولات التخريد" },
        { code: "1510", debit: asset.accumulated, description: "مجمع إهلاك الأصل المجرَّد" },
        { code: "1500", credit: asset.cost, description: "استبعاد الأصل المجرَّد" },
      ];
      if (diff > 0.01) {
        lines.push({ code: "5900", debit: diff, description: "خسارة تخريد" });
      } else if (diff < -0.01) {
        lines.push({ code: "4900", credit: Math.abs(diff), description: "ربح تخريد" });
      }

      await postAutoJournal({
        companyId,
        date: now,
        description: `تخريد الأصل: ${asset.name}`,
        reference: `ASSET-DISPOSE-${id}`,
        source: "auto-depreciation",
        lines,
      });

      await logAudit({
        companyId,
        userId: g.ctx.user.id,
        username: g.ctx.user.username,
        action: "asset.dispose",
        entity: "fixedAsset",
        entityId: id,
        details: { name: asset.name, disposalAmount, accumulated: asset.accumulated },
      });

      return NextResponse.json({ asset: updated });
    }

    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  } catch (error) {
    console.error("[assets:POST]", error);
    return NextResponse.json({ error: "تعذر تنفيذ إجراء الأصول" }, { status: 500 });
  }
}
