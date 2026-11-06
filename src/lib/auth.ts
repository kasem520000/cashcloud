import { cookies } from "next/headers";
import crypto from "node:crypto";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "erp_session";
export const COMPANY_COOKIE = "erp_company";
const SESSION_DAYS = 30;

// ============ كلمات السر (scrypt) ============

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
  } catch {
    return false;
  }
}

// ============ الجلسات ============

export type SessionUser = {
  id: string;
  username: string;
  name: string | null;
  email: string | null;
  isPlatformAdmin: boolean;
};

export type CompanyInfo = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  plan: string;
  status: string;
  taxNumber: string | null;
  crNumber: string | null;
  zatcaEnv: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  // العنوان الوطني
  buildingNo: string | null;
  streetName: string | null;
  district: string | null;
  city: string | null;
  postalCode: string | null;
  additionalNo: string | null;
};

export type AuthContext = {
  user: SessionUser;
  company: CompanyInfo;
  role: string;
  memberships: { company: CompanyInfo; role: string }[];
};

export async function getAuth(): Promise<AuthContext | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;

  const memberships = await db.membership.findMany({
    where: { userId: session.userId },
    include: { company: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) return null;

  const activeId = store.get(COMPANY_COOKIE)?.value;
  const active = memberships.find((m) => m.companyId === activeId) ?? memberships[0];

  return {
    user: {
      id: session.user.id,
      username: session.user.username,
      name: session.user.name,
      email: session.user.email,
      isPlatformAdmin: session.user.isPlatformAdmin,
    },
    company: active.company,
    role: active.role,
    memberships: memberships.map((m) => ({ company: m.company, role: m.role })),
  };
}

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await db.session.create({ data: { token, userId, expiresAt } });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { token } });
  }
  store.delete(SESSION_COOKIE);
  store.delete(COMPANY_COOKIE);
}

export async function setActiveCompany(companyId: string) {
  const store = await cookies();
  store.set(COMPANY_COOKIE, companyId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + 365 * 86400000),
  });
}

// ============ الأدوار والصلاحيات ============

export const ROLES: Record<string, string> = {
  OWNER: "المالك",
  ADMIN: "مدير",
  ACCOUNTANT: "محاسب",
  SALES: "مبيعات",
  VIEWER: "مُشاهد",
};

const PERMS: Record<string, string[]> = {
  OWNER: ["*"],
  ADMIN: ["*"],
  ACCOUNTANT: [
    "*:read",
    "products:write",
    "sales:write",
    "purchases:write",
    "contacts:write",
    "expenses:write",
    "accounting:write",
    "pos:write",
  ],
  SALES: ["*:read", "sales:write", "contacts:write", "pos:write"],
  VIEWER: ["*:read"],
};

export function can(role: string, perm: string): boolean {
  const list = PERMS[role] ?? [];
  if (list.includes("*")) return true;
  if (list.includes(perm)) return true;
  const [mod, act] = perm.split(":");
  if (act === "read" && list.includes("*:read")) return true;
  return false;
}

// ============ حارس الـ API ============

export type Guarded = AuthContext;

export async function guard(perm?: string): Promise<
  { ok: true; ctx: Guarded } | { ok: false; response: Response }
> {
  const auth = await getAuth();
  if (!auth) {
    return {
      ok: false,
      response: Response.json(
        { error: "غير مصرح — يرجى تسجيل الدخول" },
        { status: 401 }
      ),
    };
  }
  if (perm && !can(auth.role, perm)) {
    return {
      ok: false,
      response: Response.json(
        { error: "ليست لديك صلاحية لتنفيذ هذا الإجراء" },
        { status: 403 }
      ),
    };
  }
  // فرض تعليق المنشأة: لا تُنفَّذ عمليات المنشآت المعلقة من إدارة المنصة
  if (auth.company.status === "suspended") {
    return {
      ok: false,
      response: Response.json(
        { error: "المنشأة معلّقة حالياً — تواصل مع إدارة المنصة" },
        { status: 403 }
      ),
    };
  }
  return { ok: true, ctx: auth };
}

export function slugify(name: string): string {
  const base = name
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return base || `co-${Date.now().toString(36)}`;
}

export async function uniqueSlug(name: string): Promise<string> {
  let slug = slugify(name);
  let suffix = 1;
  while (await db.company.findUnique({ where: { slug } })) {
    slug = `${slugify(name)}-${suffix++}`;
  }
  return slug;
}
