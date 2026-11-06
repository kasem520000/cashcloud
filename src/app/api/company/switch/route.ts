import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuth, setActiveCompany } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth) {
      return NextResponse.json({ error: "يرجى تسجيل الدخول" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const companyId = typeof body?.companyId === "string" ? body.companyId : "";
    if (!companyId) {
      return NextResponse.json({ error: "معرف المنشأة مطلوب" }, { status: 400 });
    }

    const membership = await db.membership.findUnique({
      where: { userId_companyId: { userId: auth.user.id, companyId } },
    });
    if (!membership) {
      return NextResponse.json(
        { error: "أنت لست عضواً في هذه المنشأة" },
        { status: 403 }
      );
    }

    await setActiveCompany(companyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[company:switch] error:", error);
    return NextResponse.json({ error: "تعذر تبديل المنشأة" }, { status: 500 });
  }
}
