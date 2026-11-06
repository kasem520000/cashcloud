import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[logout] error:", error);
    return NextResponse.json({ error: "تعذر تسجيل الخروج" }, { status: 500 });
  }
}
