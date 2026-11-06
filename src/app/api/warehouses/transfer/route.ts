import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";
import { moveStock, getStockLevel, nextRefNumber } from "@/lib/stock";

export const dynamic = "force-dynamic";

type TransferItem = { productId?: string; qty?: number };

/** POST — تحويل مخزون من مستودع إلى آخر (مع تسجيل حركتي خروج/دخول) */
export async function POST(req: NextRequest) {
  try {
    const g = await guard("products:write");
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const fromWarehouseId = typeof body?.fromWarehouseId === "string" ? body.fromWarehouseId : "";
    const toWarehouseId = typeof body?.toWarehouseId === "string" ? body.toWarehouseId : "";
    const items: TransferItem[] = Array.isArray(body?.items) ? body.items : [];
    const note = typeof body?.note === "string" ? body.note.trim() : "";

    if (!fromWarehouseId || !toWarehouseId) {
      return NextResponse.json({ error: "حدد المستودع المصدر والمستودع الهدف" }, { status: 400 });
    }
    if (fromWarehouseId === toWarehouseId) {
      return NextResponse.json({ error: "لا يمكن التحويل لنفس المستودع" }, { status: 400 });
    }
    const validItems = items
      .map((it) => ({ productId: it.productId ?? "", qty: Number(it.qty) || 0 }))
      .filter((it) => it.productId && it.qty > 0);
    if (validItems.length === 0) {
      return NextResponse.json({ error: "أضف صنفاً واحداً على الأقل بكمية أكبر من صفر" }, { status: 400 });
    }

    // التحقق من المستودعين
    const warehouses = await db.warehouse.findMany({
      where: { id: { in: [fromWarehouseId, toWarehouseId] }, companyId: g.ctx.company.id },
    });
    const from = warehouses.find((w) => w.id === fromWarehouseId);
    const to = warehouses.find((w) => w.id === toWarehouseId);
    if (!from || !to) {
      return NextResponse.json({ error: "أحد المستودعين غير موجود" }, { status: 404 });
    }
    if (!from.isActive || !to.isActive) {
      return NextResponse.json({ error: "لا يمكن التحويل من/إلى مستودع معطّل" }, { status: 400 });
    }

    // التحقق من ملكية الأصناف وكفاية الأرصدة في المصدر
    const productIds = [...new Set(validItems.map((it) => it.productId))];
    const products = await db.product.findMany({
      where: { id: { in: productIds }, companyId: g.ctx.company.id },
      select: { id: true, name: true },
    });
    if (products.length !== productIds.length) {
      return NextResponse.json({ error: "أحد الأصناف غير تابع لمنشأتك" }, { status: 400 });
    }

    const shortages: string[] = [];
    for (const it of validItems) {
      const level = await db.stockLevel.findUnique({
        where: { productId_warehouseId: { productId: it.productId, warehouseId: fromWarehouseId } },
        select: { quantity: true },
      });
      const available = level?.quantity ?? 0;
      if (available < it.qty) {
        const p = products.find((pr) => pr.id === it.productId);
        shortages.push(`${p?.name ?? it.productId} (المتاح ${available})`);
      }
    }
    if (shortages.length > 0) {
      return NextResponse.json(
        { error: `رصيد غير كافٍ بالمستودع المصدر: ${shortages.join("، ")}` },
        { status: 400 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      const refNo = await nextRefNumber(tx, g.ctx.company.id, "TRF");
      const names = validItems.map((it) => products.find((p) => p.id === it.productId)?.name ?? "");

      for (const it of validItems) {
        // خروج من المصدر
        await moveStock(tx, {
          companyId: g.ctx.company.id,
          productId: it.productId,
          warehouseId: fromWarehouseId,
          delta: -it.qty,
          type: "transfer-out",
          refType: "transfer",
          refNo,
          note: note || `تحويل إلى ${to.name}`,
          userId: g.ctx.user.id,
        });
        // دخول للهدف
        await moveStock(tx, {
          companyId: g.ctx.company.id,
          productId: it.productId,
          warehouseId: toWarehouseId,
          delta: it.qty,
          type: "transfer-in",
          refType: "transfer",
          refNo,
          note: note || `تحويل من ${from.name}`,
          userId: g.ctx.user.id,
        });
      }

      return { refNo, items: validItems.map((it, i) => ({ ...it, name: names[i] })) };
    });

    await notify({
      companyId: g.ctx.company.id,
      title: "تحويل مخزون",
      message: `تم تحويل ${result.items.length} صنف من «${from.name}» إلى «${to.name}» — مستند ${result.refNo}`,
      type: "stock",
      link: "warehouses",
    });

    await logAudit({
      companyId: g.ctx.company.id,
      userId: g.ctx.user.id,
      username: g.ctx.user.username,
      action: "stock.transfer",
      entity: "warehouse",
      entityId: toWarehouseId,
      details: {
        refNo: result.refNo,
        from: from.name,
        to: to.name,
        items: result.items.map((it) => ({ name: it.name, qty: it.qty })),
      },
    });

    return NextResponse.json({ ok: true, refNo: result.refNo, items: result.items }, { status: 201 });
  } catch (error) {
    console.error("[warehouses:transfer]", error);
    return NextResponse.json({ error: "تعذر تنفيذ التحويل" }, { status: 500 });
  }
}

/** GET — رصيد أصناف المستودع المصدر (لاختيار الأصناف القابلة للتحويل) */
export async function GET(req: NextRequest) {
  try {
    const g = await guard("products:read");
    if (!g.ok) return g.response;

    const { searchParams } = new URL(req.url);
    const fromWarehouseId = searchParams.get("from")?.trim() ?? "";
    if (!fromWarehouseId) {
      return NextResponse.json({ error: "حدد المستودع المصدر" }, { status: 400 });
    }
    const warehouse = await db.warehouse.findFirst({
      where: { id: fromWarehouseId, companyId: g.ctx.company.id },
    });
    if (!warehouse) {
      return NextResponse.json({ error: "المستودع غير موجود" }, { status: 404 });
    }

    const levels = await db.stockLevel.findMany({
      where: { warehouseId: fromWarehouseId, quantity: { gt: 0 } },
      include: {
        product: { select: { id: true, name: true, sku: true, unit: true } },
      },
      orderBy: { quantity: "desc" },
    });

    return NextResponse.json({
      levels: levels.map((l) => ({
        productId: l.productId,
        name: l.product.name,
        sku: l.product.sku,
        unit: l.product.unit,
        available: l.quantity,
      })),
    });
  } catch (error) {
    console.error("[warehouses:transfer:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل أرصدة المصدر" }, { status: 500 });
  }
}
