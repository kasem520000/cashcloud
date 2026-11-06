import { db } from "@/lib/db";

/**
 * سجل التدقيق — تسجيل الأحداث الحساسة لأغراض التتبع والتحقيق.
 * best-effort: لا يرمي استثناءات حتى لا يفشل الإجراء الأصلي بسبب السجل.
 */
export async function logAudit(opts: {
  companyId?: string | null;
  userId?: string | null;
  username?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  details?: unknown;
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        companyId: opts.companyId ?? null,
        userId: opts.userId ?? null,
        username: opts.username ?? null,
        action: opts.action,
        entity: opts.entity ?? null,
        entityId: opts.entityId ?? null,
        details: opts.details === undefined ? null : JSON.stringify(opts.details),
      },
    });
  } catch (error) {
    console.error("[audit]", error);
  }
}
