import { db } from "@/lib/db";

/**
 * مركز الإشعارات — إنشاء إشعار داخل النظام لمنشأة (أو مستخدم محدد)
 * لا يرمي استثناءات حتى لا يفشل الإجراء الأصلي بسبب الإشعار.
 */
export async function notify(opts: {
  companyId: string;
  title: string;
  message: string;
  type?: string;
  link?: string | null;
  userId?: string | null;
}): Promise<void> {
  try {
    await db.notification.create({
      data: {
        companyId: opts.companyId,
        userId: opts.userId ?? null,
        title: opts.title,
        message: opts.message,
        type: opts.type ?? "system",
        link: opts.link ?? null,
      },
    });
  } catch (error) {
    console.error("[notify]", error);
  }
}

/** إشعارات متعددة دفعة واحدة */
export async function notifyMany(
  companyId: string,
  items: {
    title: string;
    message: string;
    type?: string;
    link?: string | null;
  }[]
): Promise<void> {
  if (items.length === 0) return;
  try {
    await db.notification.createMany({
      data: items.map((i) => ({
        companyId,
        userId: null,
        title: i.title,
        message: i.message,
        type: i.type ?? "system",
        link: i.link ?? null,
      })),
    });
  } catch (error) {
    console.error("[notifyMany]", error);
  }
}

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  system: "النظام",
  invoice: "الفواتير",
  payment: "المدفوعات",
  purchase: "المشتريات",
  expense: "المصاريف",
  stock: "المخزون",
  vat: "الضرائب",
  support: "الدعم الفني",
  subscription: "الاشتراك",
};

/** أيقونة لونية لكل نوع (فئات Tailwind الجاهزة) */
export const NOTIFICATION_TYPE_STYLES: Record<string, string> = {
  system: "bg-slate-100 text-slate-600",
  invoice: "bg-emerald-50 text-emerald-600",
  payment: "bg-teal-50 text-teal-600",
  purchase: "bg-amber-50 text-amber-600",
  expense: "bg-orange-50 text-orange-600",
  stock: "bg-cyan-50 text-cyan-600",
  vat: "bg-rose-50 text-rose-600",
  support: "bg-violet-50 text-violet-600",
  subscription: "bg-blue-50 text-blue-600",
};
