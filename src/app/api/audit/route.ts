import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET — سجل التدقيق (للمالك والمدير فقط) */
export async function GET(req: NextRequest) {
  try {
    const g = await guard();
    if (!g.ok) return g.response;

    if (!["OWNER", "ADMIN"].includes(g.ctx.role)) {
      return NextResponse.json(
        { error: "سجل التدقيق متاح للمالك والمدير فقط" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(searchParams.get("pageSize")) || 25));

    const where: Record<string, unknown> = { companyId: g.ctx.company.id };
    if (q) {
      where.OR = [{ action: { contains: q } }, { username: { contains: q } }];
    }

    const [total, logs] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          username: true,
          action: true,
          entity: true,
          entityId: true,
          details: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      logs,
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    console.error("[audit:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل سجل التدقيق" }, { status: 500 });
  }
}
