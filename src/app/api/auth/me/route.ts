import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    return NextResponse.json({
      authenticated: true,
      user: auth.user,
      company: auth.company,
      role: auth.role,
      memberships: auth.memberships,
    });
  } catch (error) {
    console.error("[me] error:", error);
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
