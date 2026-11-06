import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";
import { moveStock, nextRefNumber } from "@/lib/stock";

export const dynamic = "force-dynamic";

type AdjustItem = { productId?: string; countedQty?: number };

/** POST — تسوية جرد مستودع (مطابقة الرصيد الدفتري مع العد الفعلي) */
export async function POST(req: NextRequest) {
  try {
    const g = await guard("products:write");
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const warehouseId = typeof body?.warehouseId === "string" ? body.warehouseId : "";
    const items: AdjustItem[] = Array.isArray(body?.items) ? body.items : [];
    const note = typeof body?.note === "string" ? body.note.trim() : "";

    if (!warehouseId) {
      return NextResponse.json({ error: "حدد المستودع المجرود" }, { status: 400 });
    }
    const warehouse = await db.warehouse.findFirst({
      where: { id: warehouseId, companyId: g.ctx.company.id },
    });
    if (!warehouse) {
      return NextResponse.json({ error: "المستودع غير موجود" }, { status: 404 });
    }

    const validItems = items
      .map((it) => ({
        productId: it.productId ?? "",
        countedQty: Number(it.countedQty),
      }))
      .filter(
        (it) => it.productId && !isNaN(it.countedQty) && it.countedQty >= 0
      );
    if (validItems.length === 0) {
      return NextResponse.json({ error: "أضف صنفاً واحداً على الأقل بكمية معتبرة" }, { status: 400 });
    }

    // التحقق من ملكية الأصناف
    const productIds = [...new Set(validItems.map((it) => it.productId))];
    const products = await db.product.findMany({
      where: { id: { in: productIds }, companyId: g.ctx.company.id },
      select: { id: true, name: true },
    });
    if (products.length !== productIds.length) {
      return NextResponse.json({ error: "أحد الأصناف غير تابع لمنشأتك" }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      const refNo = await nextRefNumber(tx, g.ctx.company.id, "ADJ");
      const changes: { name: string; before: number; counted: number; diff: number }[] = [];

      for (const it of validItems) {
        const level = await tx.stockLevel.findUnique({
          where: { productId_warehouseId: { productId: it.productId, warehouseId } },
          select: { quantity: true },
        });
        const before = level?.quantity ?? 0;
        const diff = it.countedQty - before;
        if (diff === 0) continue;

        await moveStock(tx, {
          companyId: g.ctx.company.id,
          productId: it.productId,
          warehouseId,
          delta: diff,
          type: "adjustment",
          refType: "adjustment",
          refNo,
          note: note || "تسوية جرد",
          userId: g.ctx.user.id,
        });

        changes.push({
          name: products.find((p) => p.id === it.productId)?.name ?? "",
          before,
          counted: it.countedQty,
          diff: Math.round(diff * 100) / 100,
        });
      }

      return { refNo, changes };
    });

    if (result.changes.length === 0) {
      return NextResponse.json(
        { error: "لا توجد فروقات — الأرصدة الدفترية مطابقة للعد الفعلي" },
        { status: 400 }
      );
    }

    await notify({
      companyId: g.ctx.company.id,
      title: "تسوية جرد مخزون",
      message: `تم تسوية ${result.changes.length} صنف بمستودع «${warehouse.name}» — مستند ${result.refNo}`,
      type: "stock",
      link: "warehouses",
    });

    await logAudit({
      companyId: g.ctx.company.id,
      userId: g.ctx.user.id,
      username: g.ctx.user.username,
      action: "stock.adjustment",
      entity: "warehouse",
      entityId: warehouseId,
      details: { refNo: result.refNo, warehouse: warehouse.name, changes: result.changes },
    });

    return NextResponse.json({ ok: true, refNo: result.refNo, changes: result.changes }, { status: 201 });
  } catch (error) {
    console.error("[warehouses:adjust]", error);
    return NextResponse.json({ error: "تعذر تنفيذ تسوية الجرد" }, { status: 500 });
  }
}
