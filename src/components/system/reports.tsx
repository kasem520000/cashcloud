"use client";

import { useEffect, useState } from "react";
import {
  FileBarChart,
  Loader2,
  Boxes,
  ShoppingCart,
  TrendingUp,
  Receipt,
  Users,
  Printer,
  Scale,
  Landmark,
  CalendarClock,
  Truck,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney, formatDate } from "./types";
import { cn } from "@/lib/utils";

type ReportType =
  | "stock"
  | "sales"
  | "profit-loss"
  | "expenses"
  | "customers"
  | "suppliers"
  | "trial"
  | "income-statement"
  | "balance-sheet"
  | "aging"
  | "cash-flow";

const REPORTS: { key: ReportType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "trial", label: "ميزان المراجعة", icon: Scale },
  { key: "income-statement", label: "قائمة الدخل", icon: TrendingUp },
  { key: "balance-sheet", label: "الميزانية العمومية", icon: Landmark },
  { key: "aging", label: "أعمار الذمم", icon: CalendarClock },
  { key: "cash-flow", label: "تدفق النقد", icon: Waves },
  { key: "profit-loss", label: "الربح / الخسارة", icon: FileBarChart },
  { key: "sales", label: "تقرير المبيعات", icon: ShoppingCart },
  { key: "stock", label: "تقرير المخزون", icon: Boxes },
  { key: "expenses", label: "تقرير المصاريف", icon: Receipt },
  { key: "customers", label: "تقرير العملاء", icon: Users },
  { key: "suppliers", label: "تقرير الموردين", icon: Truck },
];

type ReportData = {
  title: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  summary?: { label: string; value: number; kind: string }[];
};

export function ReportsView({ currency }: { currency: string }) {
  const [type, setType] = useState<ReportType>("stock");
  const [cache, setCache] = useState<Record<string, ReportData | null>>({});
  const data = cache[type];
  const loading = data === undefined;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reports?type=${type}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setCache((c) => ({ ...c, [type]: d.error ? null : d }));
      })
      .catch(() => {
        if (!cancelled) setCache((c) => ({ ...c, [type]: null }));
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  const isNum = (v: unknown) => typeof v === "number";

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-navy flex items-center gap-2">
            <FileBarChart className="size-6 text-brand-blue" />
            مركز التقارير
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            التقارير المالية والتشغيلية والمحاسبية لمنشأتك
          </p>
        </div>
        <div className="flex-1" />
        <Button
          variant="outline"
          onClick={() => window.print()}
          className="rounded-xl gap-1.5 font-bold"
        >
          <Printer className="size-4" />
          طباعة
        </Button>
      </div>

      {/* Report tabs */}
      <div className="flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            onClick={() => setType(r.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold border-[1.5px] transition-colors",
              type === r.key
                ? "border-brand-blue bg-blue-50 text-brand-blue"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            )}
          >
            <r.icon className="size-4" />
            {r.label}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="size-8 animate-spin" />
          </div>
        ) : !data ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
            <FileBarChart className="size-14" />
            <p className="text-slate-400 text-sm">تعذر تحميل التقرير</p>
          </div>
        ) : (data.rows?.length ?? 0) === 0 && !data.summary ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
            <FileBarChart className="size-14" />
            <p className="text-slate-400 text-sm">لا توجد بيانات لهذا التقرير</p>
          </div>
        ) : (
          <>
            {(data.rows?.length ?? 0) === 0 && data.summary && (
              <div className="px-4 py-3 border-b border-slate-100 bg-brand-light/50">
                <h2 className="font-extrabold text-brand-navy text-[14px]">{data.title}</h2>
              </div>
            )}
            {(data.rows?.length ?? 0) > 0 && (
              <>
                <div className="px-4 py-3 border-b border-slate-100 bg-brand-light/50">
                  <h2 className="font-extrabold text-brand-navy text-[14px]">{data.title}</h2>
                  <p className="text-[12px] text-slate-400 mt-0.5">{data.rows?.length} سجل</p>
                </div>
                <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                  <table className="w-full text-[13px]">
                    <thead className="sticky top-0">
                      <tr className="bg-brand-light text-slate-500 text-[12px]">
                        {data.columns?.map((c) => (
                          <th key={c} className="text-start font-bold px-4 py-3 whitespace-nowrap">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows?.map((row, i) => (
                        <tr
                          key={i}
                          className="border-t border-slate-100 hover:bg-blue-50/40 transition-colors"
                        >
                      {Object.entries(row).map(([key, value]) => (
                        <td
                          key={key}
                          className={cn(
                            "px-4 py-3 whitespace-nowrap",
                            isNum(value)
                              ? value < 0
                                ? "text-red-500 font-bold"
                                : "font-bold text-brand-navy"
                              : "text-slate-600",
                            key === "low" && "hidden"
                          )}
                          dir={isNum(value) ? "ltr" : undefined}
                        >
                          {isNum(value)
                            ? key === "stock" || key === "items" || key === "invoices" || key === "days"
                              ? String(value)
                              : formatMoney(value, currency)
                            : key === "date"
                              ? formatDate(String(value))
                              : String(value)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
                </div>
              </>
            )}

            {data.summary && (
              <div className="p-4 sm:p-5 border-t border-slate-100 bg-brand-light/30">
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl">
                  {data.summary.map((row) => (
                    <div
                      key={row.label}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-xl px-4 py-3 border bg-white",
                        row.kind === "positive"
                          ? "border-emerald-200"
                          : row.kind === "negative"
                            ? "border-rose-200"
                            : "border-slate-200"
                      )}
                    >
                      <span className="font-bold text-[13px] text-slate-600 truncate">{row.label}</span>
                      <span
                        className={cn(
                          "font-extrabold text-[14px] shrink-0",
                          row.kind === "positive"
                            ? "text-emerald-600"
                            : row.kind === "negative"
                              ? "text-rose-500"
                              : "text-brand-navy"
                        )}
                        dir="ltr"
                      >
                        {formatMoney(row.value, currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
