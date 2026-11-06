import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** أنواع الأقسام المدعومة في الصفحة التسويقية */
const SECTION_TYPES = [
  "features",
  "stats",
  "steps",
  "testimonials",
  "faq",
  "pricing",
  "richtext",
  "cta",
] as const;
const KINDS = ["home", "features", "pricing", "about", "faq", "contact", "page"] as const;

type SectionItem = {
  icon?: string;
  title?: string;
  text?: string;
  value?: string;
  sub?: string;
};
type Section = {
  id?: string;
  type: string;
  title?: string;
  subtitle?: string;
  text?: string;
  items?: SectionItem[];
};

/** تحقق من صحة بنية الأقسام قبل الحفظ */
function parseSections(raw: unknown): Section[] | null {
  if (typeof raw !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  for (const s of parsed) {
    if (!s || typeof s !== "object" || typeof (s as Section).type !== "string") return null;
    if (!SECTION_TYPES.includes((s as Section).type as (typeof SECTION_TYPES)[number])) return null;
    if ((s as Section).items !== undefined && !Array.isArray((s as Section).items)) return null;
  }
  return parsed as Section[];
}

function slugify(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || `page-${Date.now()}`
  );
}

/**
 * GET — قائمة الصفحات
 * عام (بدون جلسة): الصفحات المنشورة فقط + الحقول العامة
 * مدير المنصة (?admin=1): كل الصفحات بما فيها المسودات
 */
export async function GET(req: NextRequest) {
  try {
    const wantsAdmin = req.nextUrl.searchParams.get("admin") === "1";
    let isAdmin = false;
    if (wantsAdmin) {
      const auth = await getAuth();
      isAdmin = !!auth?.user.isPlatformAdmin;
    }

    const pages = await db.marketingPage.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      ...(isAdmin ? {} : { where: { status: "published" } }),
      select: isAdmin
        ? undefined
        : {
            id: true,
            slug: true,
            title: true,
            subtitle: true,
            kind: true,
            navLabel: true,
            order: true,
            heroBadge: true,
            heroTitle: true,
            heroSubtitle: true,
            ctaLabel: true,
            sections: true,
          },
    });

    return NextResponse.json({
      pages,
      admin: isAdmin,
    });
  } catch (e) {
    console.error("[marketing:list]", e);
    return NextResponse.json({ error: "تعذر تحميل الصفحات التسويقية" }, { status: 500 });
  }
}

/** POST — إنشاء صفحة جديدة (مدير المنصة فقط) */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth) {
      return NextResponse.json({ error: "غير مصرح — يرجى تسجيل الدخول" }, { status: 401 });
    }
    if (!auth.user.isPlatformAdmin) {
      return NextResponse.json({ error: "إدارة الصفحات لمديري المنصة فقط" }, { status: 403 });
    }

    const body = await req.json();
    const title = String(body?.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ error: "عنوان الصفحة مطلوب" }, { status: 400 });
    }

    let slug = String(body?.slug ?? "").trim() || slugify(title);
    const exists = await db.marketingPage.findUnique({ where: { slug } });
    if (exists) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

    const kind = KINDS.includes(body?.kind) ? body.kind : "page";
    const sections = parseSections(
      typeof body?.sections === "string" ? body.sections : JSON.stringify(body?.sections ?? "[]")
    );
    if (sections === null) {
      return NextResponse.json({ error: "بنية الأقسام غير صالحة" }, { status: 400 });
    }

    const page = await db.marketingPage.create({
      data: {
        slug,
        title,
        subtitle: body?.subtitle?.trim() || null,
        kind,
        status: body?.status === "draft" ? "draft" : "published",
        showInNav: body?.showInNav !== false,
        navLabel: body?.navLabel?.trim() || null,
        order: Number.isFinite(Number(body?.order)) ? Number(body.order) : 0,
        heroBadge: body?.heroBadge?.trim() || null,
        heroTitle: body?.heroTitle?.trim() || null,
        heroSubtitle: body?.heroSubtitle?.trim() || null,
        ctaLabel: body?.ctaLabel?.trim() || null,
        sections: JSON.stringify(sections),
      },
    });

    return NextResponse.json({ page, message: "تم إنشاء الصفحة التسويقية" }, { status: 201 });
  } catch (e) {
    console.error("[marketing:create]", e);
    return NextResponse.json({ error: "تعذر إنشاء الصفحة" }, { status: 500 });
  }
}

/** PATCH — تتبع زيارة صفحة (عام) أو تبديل الحالة السريع (مدير) */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body?.action;

    // تتبع الزيارات — متاح للجميع
    if (action === "track-view") {
      const id = String(body?.pageId ?? "");
      if (!id) return NextResponse.json({ error: "معرّف الصفحة مطلوب" }, { status: 400 });
      await db.marketingPage.update({
        where: { id },
        data: { views: { increment: 1 } },
      });
      return NextResponse.json({ ok: true });
    }

    // تبديل النشر — مدير المنصة فقط
    if (action === "toggle-status") {
      const auth = await getAuth();
      if (!auth?.user.isPlatformAdmin) {
        return NextResponse.json({ error: "إدارة الصفحات لمديري المنصة فقط" }, { status: 403 });
      }
      const page = await db.marketingPage.findUnique({ where: { id: String(body?.pageId ?? "") } });
      if (!page) return NextResponse.json({ error: "الصفحة غير موجودة" }, { status: 404 });
      const updated = await db.marketingPage.update({
        where: { id: page.id },
        data: { status: page.status === "published" ? "draft" : "published" },
      });
      return NextResponse.json({
        page: updated,
        message: updated.status === "published" ? "تم نشر الصفحة" : "تم تحويل الصفحة لمسودة",
      });
    }

    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  } catch (e) {
    console.error("[marketing:patch]", e);
    return NextResponse.json({ error: "تعذر تنفيذ الإجراء" }, { status: 500 });
  }
}
