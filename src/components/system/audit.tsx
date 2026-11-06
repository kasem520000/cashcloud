"use client";

import { useEffect, useState } from "react";
import {
  History,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Activity,
  Database,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { AuditLogRecord, Session } from "./types";
import { formatDateTime } from "./types";

// ============ تسميات الأحداث ============

const ACTION_LABELS: Record<string, string> = {
  "sale.create": "إنشاء فاتورة بيع",
  "sale.credit-note": "إشعار دائن (مرتجع)",
  "purchase.create": "فاتورة شراء",
  "purchase.return": "مرتجع مشتريات",
  "payment.create": "تسجيل سند",
  "payment.delete": "حذف سند",
  "quotation.create": "إنشاء عرض سعر",
  "quotation.convert": "تحويل عرض لفاتورة",
  "quotation.status": "تحديث حالة عرض",
  "quotation.delete": "حذف عرض سعر",
  "expense.create": "تسجيل مصروف",
  "settings.update": "تحديث الإعدادات",
  "team.add": "إضافة عضو",
  "team.role": "تغيير دور عضو",
  "team.remove": "إزالة عضو",
  "plan.change": "تغيير الباقة",
  "auth.login": "تسجيل دخول",
  "auth.register": "تسجيل حساب جديد",
  "payroll.employee.create": "إضافة موظف",
  "payroll.employee.update": "تعديل موظف",
  "payroll.employee.delete": "حذف موظف",
  "payroll.run": "تشغيل مسير رواتب",
  "payroll.run.delete": "حذف مسير رواتب",
  "asset.create": "إضافة أصل ثابت",
  "asset.update": "تعديل أصل",
  "asset.delete": "حذف أصل",
  "asset.depreciation.run": "ترحيل إهلاك",
  "asset.dispose": "تخريد أصل",
  "recurring.create": "إنشاء قالب متكرر",
  "recurring.update": "تعديل قالب متكرر",
  "recurring.delete": "حذف قالب متكرر",
  "recurring.run": "توليد فاتورة متكررة",
};

/** مجموعة الحدث — تحدد لون الشارة */
function actionGroup(action: string): "auth" | "sales" | "payment" | "admin" {
  if (action.startsWith("auth.")) return "auth";
  if (
    action.startsWith("sale.") ||
    action.startsWith("quotation.") ||
    action.startsWith("purchase.")
  ) {
    return "sales";
  }
  if (action.startsWith("payment.")) return "payment";
  return "admin";
}

const GROUP_STYLES: Record<string, string> = {
  auth: "bg-slate-100 text-slate-500",
  sales: "bg-blue-50 text-brand-blue",
  payment: "bg-emerald-50 text-emerald-600",
  admin: "bg-amber-50 text-amber-600",
};

function ActionBadge({ action }: { action: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[11.5px] font-bold border-transparent whitespace-nowrap",
        GROUP_STYLES[actionGroup(action)] ?? "bg-slate-100 text-slate-500"
      )}
    >
      {ACTION_LABELS[action] ?? action}
    </Badge>
  );
}

// ============ المكوّن الرئيسي ============

export function AuditView({ session }: { session: Session }) {
  const isPrivileged = session.role === "OWNER" || session.role === "ADMIN";

  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  function load() {
    const params = new URLSearchParams({
      q,
      page: String(page),
      pageSize: "12",
    });
    fetch(`/api/audit?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setLogs(d.logs ?? []);
        setTotal(d.total ?? 0);
        setPageCount(d.pageCount ?? 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      load();
    }, 250);
    return () => clearTimeout(t);
  }, [q, page]);

  if (!isPrivileged) {
    return (
      <div className="p-4 sm:p-5 space-y-4">
        <h1 className="text-xl font-extrabold text-brand-navy flex items-center gap-2">
          <History className="size-6 text-brand-blue" />
          سجل التدقيق
        </h1>
        <Alert className="rounded-2xl border-amber-200 bg-amber-50 text-amber-800">
          <ShieldAlert className="size-4" />
          <AlertTitle className="font-extrabold">صلاحية غير كافية</AlertTitle>
          <AlertDescription className="text-amber-700">
            سجل التدقيق متاح للمالك والمدير فقط. تواصل مع مالك المنشأة إن احتجت
            مراجعة سجل الأحداث.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const lastActivity = logs.length > 0 ? logs[0] : null;

  return (
    <div className="p-4 sm:p-5 space-y-4">
      {/* الترويسة */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-navy flex items-center gap-2">
            <History className="size-6 text-brand-blue" />
            سجل التدقيق
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            كل الأحداث المهمة في منشأتك — بالتاريخ والمستخدم
          </p>
        </div>
        <div className="flex-1" />
        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="بحث بالحدث أو المستخدم..."
            className="w-full ps-10 h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-brand-blue"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setLoading(true);
            load();
          }}
          disabled={loading}
          className="h-10 rounded-xl font-bold gap-1.5"
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          تحديث
        </Button>
      </div>

      {/* بطاقتا الإحصاء */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.05)] flex items-center gap-3">
          <div className="size-11 rounded-xl bg-blue-50 text-brand-blue flex items-center justify-center shrink-0">
            <Database className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] text-slate-500 font-bold">إجمالي الأحداث</p>
            <p className="text-[15px] font-extrabold text-brand-navy">
              {total.toLocaleString("ar-EG")} حدث
            </p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.05)] flex items-center gap-3">
          <div className="size-11 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
            <Activity className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] text-slate-500 font-bold">آخر نشاط</p>
            {lastActivity ? (
              <p
                className="text-[13px] font-extrabold text-brand-navy truncate"
                title={`${ACTION_LABELS[lastActivity.action] ?? lastActivity.action} — ${lastActivity.username}`}
              >
                {ACTION_LABELS[lastActivity.action] ?? lastActivity.action} —{" "}
                {formatDateTime(lastActivity.createdAt)}
              </p>
            ) : (
              <p className="text-[13px] font-extrabold text-slate-300">—</p>
            )}
          </div>
        </div>
      </div>

      {/* جدول الأحداث */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="size-8 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
            <History className="size-14" />
            <p className="text-slate-400 text-sm">لا توجد أحداث مسجلة</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-brand-light text-slate-500 text-[12px]">
                    <th className="text-start font-bold px-4 py-3">الحدث</th>
                    <th className="text-start font-bold px-4 py-3">المستخدم</th>
                    <th className="text-start font-bold px-4 py-3">الكيان</th>
                    <th className="text-start font-bold px-4 py-3">التفاصيل</th>
                    <th className="text-start font-bold px-4 py-3">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-t border-slate-100 hover:bg-blue-50/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <ActionBadge action={log.action} />
                      </td>
                      <td
                        className="px-4 py-3 font-mono font-bold text-brand-navy whitespace-nowrap"
                        dir="ltr"
                      >
                        @{log.username}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {log.entity ? (
                          <>
                            {log.entity}
                            {log.entityId ? (
                              <span className="text-slate-400" dir="ltr">
                                {" "}
                                #{log.entityId.slice(0, 8)}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        className="px-4 py-3 text-slate-500 max-w-56 truncate"
                        title={log.details ?? undefined}
                      >
                        {log.details ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {formatDateTime(log.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <p className="text-[12px] text-slate-400">
                {total} حدث — صفحة {page} من {Math.max(pageCount, 1)}
              </p>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg"
                >
                  السابق
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg"
                >
                  التالي
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
