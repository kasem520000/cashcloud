import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { moveStock, ensureDefaultWarehouse } from "@/lib/stock";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const g = await guard("products:read");
    if (!g.ok) return g.response;

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const category = searchParams.get("category")?.trim() ?? "";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(searchParams.get("pageSize")) || 25));

    const where: Record<string, unknown> = { companyId: g.ctx.company.id };
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { sku: { contains: q } },
        { brand: { contains: q } },
      ];
    }
    if (category) where.category = category;

    const [total, products, categories] = await Promise.all([
      db.product.count({ where }),
      db.product.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          stockLevels: {
            where: { quantity: { not: 0 } },
            select: { quantity: true, warehouse: { select: { name: true } } },
          },
        },
      }),
      db.product.findMany({
        where: { companyId: g.ctx.company.id },
        select: { category: true },
        distinct: ["category"],
      }),
    ]);

    return NextResponse.json({
      products,
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      categories: categories.map((c) => c.category).filter(Boolean),
    });
  } catch (error) {
    console.error("[products:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل الأصناف" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await guard("products:write");
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "اسم الصنف مطلوب" }, { status: 400 });
    }

    let sku =
      typeof body?.sku === "string" && body.sku.trim()
        ? body.sku.trim()
        : `SKU-${Date.now().toString(36).toUpperCase()}`;

    const exists = await db.product.findUnique({
      where: { companyId_sku: { companyId: g.ctx.company.id, sku } },
    });
    if (exists) sku = `${sku}-${Date.now().toString(36).slice(-4).toUpperCase()}`;

    const product = await db.product.create({
      data: {
        companyId: g.ctx.company.id,
        name,
        sku,
        category: body?.category?.trim() || "عام",
        brand: body?.brand?.trim() || null,
        unit: body?.unit?.trim() || "قطعة",
        salePrice: Number(body?.salePrice) || 0,
        purchasePrice: Number(body?.purchasePrice) || 0,
        stock: 0, // يُدار عبر أرصدة المستودعات أدناه
        alertQuantity: Number(body?.alertQuantity) || 5,
      },
    });

    // الرصيد الافتتاحي يُسجل في المستودع الافتراضي (تعدد المستودعات)
    const openingStock = Number(body?.stock) || 0;
    if (openingStock > 0) {
      const defaultWh = await ensureDefaultWarehouse(g.ctx.company.id);
      await moveStock(db, {
        companyId: g.ctx.company.id,
        productId: product.id,
        warehouseId: defaultWh.id,
        delta: openingStock,
        type: "opening",
        refType: "product-create",
        note: "رصيد افتتاحي عند إنشاء الصنف",
        userId: g.ctx.user.id,
      });
    }

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("[products:POST]", error);
    return NextResponse.json({ error: "تعذر إضافة الصنف" }, { status: 500 });
  }
}
