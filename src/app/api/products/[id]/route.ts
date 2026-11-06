import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { moveStock, ensureDefaultWarehouse } from "@/lib/stock";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const g = await guard("products:write");
    if (!g.ok) return g.response;

    const { id } = await params;
    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "اسم الصنف مطلوب" }, { status: 400 });
    }

    const existing = await db.product.findFirst({
      where: { id, companyId: g.ctx.company.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "الصنف غير موجود" }, { status: 404 });
    }

    // تعديل الرصيد يسوّى على المستودع الافتراضي كحركة تسوية (اتساق تعدد المستودعات)
    if (body?.stock !== undefined) {
      const newStock = Number(body.stock) || 0;
      const delta = newStock - existing.stock;
      if (delta !== 0) {
        const defaultWh = await ensureDefaultWarehouse(g.ctx.company.id);
        await moveStock(db, {
          companyId: g.ctx.company.id,
          productId: id,
          warehouseId: defaultWh.id,
          delta,
          type: "adjustment",
          refType: "adjustment",
          refNo: "تعديل يدوي من بطاقة الصنف",
          note: "تسوية رصيد من نموذج تعديل الصنف",
          userId: g.ctx.user.id,
        });
      }
    }

    const product = await db.product.update({
      where: { id },
      data: {
        name,
        category: body?.category?.trim() || existing.category,
        brand: body?.brand?.trim() || null,
        unit: body?.unit?.trim() || existing.unit,
        salePrice: body?.salePrice !== undefined ? Number(body.salePrice) || 0 : existing.salePrice,
        purchasePrice:
          body?.purchasePrice !== undefined ? Number(body.purchasePrice) || 0 : existing.purchasePrice,
        alertQuantity:
          body?.alertQuantity !== undefined ? Number(body.alertQuantity) || 0 : existing.alertQuantity,
        isActive: typeof body?.isActive === "boolean" ? body.isActive : existing.isActive,
      },
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error("[products:PUT]", error);
    return NextResponse.json({ error: "تعذر تحديث الصنف" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const g = await guard("products:write");
    if (!g.ok) return g.response;

    const { id } = await params;
    const existing = await db.product.findFirst({
      where: { id, companyId: g.ctx.company.id },
      include: { saleItems: { take: 1 }, purchaseItems: { take: 1 } },
    });
    if (!existing) {
      return NextResponse.json({ error: "الصنف غير موجود" }, { status: 404 });
    }
    if (existing.saleItems.length > 0 || existing.purchaseItems.length > 0) {
      await db.product.update({ where: { id }, data: { isActive: false } });
      return NextResponse.json({ ok: true, deactivated: true });
    }
    await db.product.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[products:DELETE]", error);
    return NextResponse.json({ error: "تعذر حذف الصنف" }, { status: 500 });
  }
}
