import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { accountsWithBalances, ACCOUNT_TYPES } from "@/lib/accounting";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const g = await guard("accounting:read");
    if (!g.ok) return g.response;

    const accounts = await accountsWithBalances(g.ctx.company.id);
    return NextResponse.json({ accounts, types: ACCOUNT_TYPES });
  } catch (error) {
    console.error("[accounts:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل دليل الحسابات" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await guard("accounting:write");
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const type = typeof body?.type === "string" ? body.type : "";

    if (!code || !name || !ACCOUNT_TYPES[type]) {
      return NextResponse.json(
        { error: "الرمز والاسم والنوع جميعها مطلوبة" },
        { status: 400 }
      );
    }
    if (!/^\d{3,6}$/.test(code)) {
      return NextResponse.json(
        { error: "رمز الحساب يجب أن يكون 3-6 أرقام" },
        { status: 400 }
      );
    }

    const exists = await db.account.findUnique({
      where: { companyId_code: { companyId: g.ctx.company.id, code } },
    });
    if (exists) {
      return NextResponse.json({ error: "رمز الحساب مستخدم مسبقاً" }, { status: 409 });
    }

    const account = await db.account.create({
      data: { companyId: g.ctx.company.id, code, name, type },
    });
    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    console.error("[accounts:POST]", error);
    return NextResponse.json({ error: "تعذر إضافة الحساب" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const g = await guard("accounting:write");
    if (!g.ok) return g.response;

    const body = await req.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!id || !name) {
      return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
    }

    const account = await db.account.findFirst({
      where: { id, companyId: g.ctx.company.id },
    });
    if (!account) {
      return NextResponse.json({ error: "الحساب غير موجود" }, { status: 404 });
    }

    const updated = await db.account.update({
      where: { id },
      data: { name, isActive: body?.isActive ?? account.isActive },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[accounts:PUT]", error);
    return NextResponse.json({ error: "تعذر تعديل الحساب" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const g = await guard("accounting:write");
    if (!g.ok) return g.response;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") ?? "";
    const account = await db.account.findFirst({
      where: { id, companyId: g.ctx.company.id },
      include: { _count: { select: { lines: true } } },
    });
    if (!account) {
      return NextResponse.json({ error: "الحساب غير موجود" }, { status: 404 });
    }
    if (account._count.lines > 0) {
      // حساب عليه حركات — نعطّله بدل حذفه للحفاظ على سلامة القيود
      await db.account.update({ where: { id }, data: { isActive: false } });
      return NextResponse.json({ ok: true, deactivated: true });
    }
    await db.account.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[accounts:DELETE]", error);
    return NextResponse.json({ error: "تعذر حذف الحساب" }, { status: 500 });
  }
}
