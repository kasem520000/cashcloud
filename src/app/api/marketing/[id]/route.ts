import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

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

/** حارس صلاحيات مدير المنصة */
async function guardPlatform() {
  const auth = await getAuth();
  if (!auth) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "غير مصرح — يرجى تسجيل الدخول" }, { status: 401 }),
    };
  }
  if (!auth.user.isPlatformAdmin) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "إدارة الصفحات التسويقية لمديري المنصة فقط" },
        { status: 403 }
      ),
    };
  }
  return { ok: true as const };
}

/** PUT — تعديل صفحة موجودة */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await guardPlatform();
    if (!g.ok) return g.response;

    const { id } = await params;
    const page = await db.marketingPage.findUnique({ where: { id } });
    if (!page) {
      return NextResponse.json({ error: "الصفحة غير موجودة" }, { status: 404 });
    }

    const body = await req.json();
    const title = String(body?.title ?? page.title).trim();
    if (!title) {
      return NextResponse.json({ error: "عنوان الصفحة مطلوب" }, { status: 400 });
    }

    // التحقق من تفرد الـ slug الجديد
    let slug = String(body?.slug ?? page.slug).trim() || page.slug;
    if (slug !== page.slug) {
      const exists = await db.marketingPage.findUnique({ where: { slug } });
      if (exists) {
        return NextResponse.json(
          { error: "المعرف (slug) مستخدم بالفعل في صفحة أخرى" },
          { status: 409 }
        );
      }
    }

    let sections = page.sections;
    if (body?.sections !== undefined) {
      const parsed = parseSections(
        typeof body.sections === "string" ? body.sections : JSON.stringify(body.sections)
      );
      if (parsed === null) {
        return NextResponse.json({ error: "بنية الأقسام غير صالحة" }, { status: 400 });
      }
      sections = JSON.stringify(parsed);
    }

    const updated = await db.marketingPage.update({
      where: { id },
      data: {
        slug,
        title,
        subtitle: body?.subtitle !== undefined ? body.subtitle?.trim() || null : page.subtitle,
        kind: body?.kind !== undefined && KINDS.includes(body.kind) ? body.kind : page.kind,
        status:
          body?.status !== undefined
            ? body.status === "draft"
              ? "draft"
              : "published"
            : page.status,
        showInNav: body?.showInNav !== undefined ? body.showInNav !== false : page.showInNav,
        navLabel: body?.navLabel !== undefined ? body.navLabel?.trim() || null : page.navLabel,
        order:
          body?.order !== undefined && Number.isFinite(Number(body.order))
            ? Number(body.order)
            : page.order,
        heroBadge:
          body?.heroBadge !== undefined ? body.heroBadge?.trim() || null : page.heroBadge,
        heroTitle:
          body?.heroTitle !== undefined ? body.heroTitle?.trim() || null : page.heroTitle,
        heroSubtitle:
          body?.heroSubtitle !== undefined
            ? body.heroSubtitle?.trim() || null
            : page.heroSubtitle,
        ctaLabel: body?.ctaLabel !== undefined ? body.ctaLabel?.trim() || null : page.ctaLabel,
        sections,
      },
    });

    return NextResponse.json({ page: updated, message: "تم حفظ تعديلات الصفحة" });
  } catch (e) {
    console.error("[marketing:update]", e);
    return NextResponse.json({ error: "تعذر تعديل الصفحة" }, { status: 500 });
  }
}

/** DELETE — حذف صفحة */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await guardPlatform();
    if (!g.ok) return g.response;

    const { id } = await params;
    const page = await db.marketingPage.findUnique({ where: { id } });
    if (!page) {
      return NextResponse.json({ error: "الصفحة غير موجودة" }, { status: 404 });
    }

    await db.marketingPage.delete({ where: { id } });
    return NextResponse.json({ message: `تم حذف صفحة «${page.title}» نهائياً` });
  } catch (e) {
    console.error("[marketing:delete]", e);
    return NextResponse.json({ error: "تعذر حذف الصفحة" }, { status: 500 });
  }
}
