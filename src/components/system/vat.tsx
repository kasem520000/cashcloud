"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Landmark,
  Loader2,
  RefreshCw,
  CalendarDays,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  Send,
  BadgeCheck,
  FileText,
  Receipt,
  ShoppingCart,
  Scale,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatMoney, formatDate, formatDateTime } from "./types";
import { cn } from "@/lib/utils";

// ============ الأنواع (مطابقة لعقد /api/vat) ============

type VatFiledRecord = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  salesAmount: number;
  outputVat: number;
  purchasesAmount: number;
  inputVat: number;
  netVat: number;
  filedAt: string;
  notes: string | null;
};

type VatData = {
  declaration: {
    period: { from: string; to: string };
    salesCount: number;
    purchasesCount: number;
    salesAmount: number;
    outputVat: number;
    purchasesAmount: number;
    inputVat: number;
    netVat: number;
    dueDate: string;
  };
  filed: VatFiledRecord | null;
  history: VatFiledRecord[];
  currency: string;
  taxNumber: string | null;
};

// ============ مساعدات الفترة الشهرية ============

/** قيمة شهر بصيغة YYYY-MM مع إزاحة عدد أشهر عن الشهر الحالي */
function monthValueOffset(offset: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** أول وآخر يوم في الشهر (YYYY-MM) بصيغة YYYY-MM-DD */
function monthRange(m: string): { from: string; to: string } {
  const [y, mm] = m.split("-").map(Number);
  const lastDay = new Date(y, mm, 0).getDate();
  return { from: `${m}-01`, to: `${m}-${String(lastDay).padStart(2, "0")}` };
}

/** اسم الشهر بالعربية — «أكتوبر ٢٠٢٦» */
function monthTitle(m: string): string {
  const [y, mm] = m.split("-").map(Number);
  return new Date(y, mm - 1, 1).toLocaleDateString("ar-EG", {
    month: "long",
    year: "numeric",
  });
}

/** فرق الأيام بين اليوم وآخر موعد للتقديم (موجب = متبقٍ) */
function daysUntil(iso: string): number {
  const due = new Date(iso);
  const now = new Date();
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((dueDay.getTime() - nowDay.getTime()) / 86_400_000);
}

/** صياغة عربية صحيحة لعدد الأيام */
function daysLabel(days: number): string {
  if (days === 1) return "يوم واحد";
  if (days === 2) return "يومان";
  if (days >= 3 && days <= 10) return `${days.toLocaleString("ar-EG")} أيام`;
  return `${days.toLocaleString("ar-EG")} يوماً`;
}

// ============ المكون الرئيسي ============

export function VatView({
  currency,
  onDataChange,
}: {
  currency: string;
  onDataChange?: () => void;
}) {
  const { toast } = useToast();

  const [month, setMonth] = useState<string>(() => monthValueOffset(-1));
  const [data, setData] = useState<VatData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const range = useMemo(() => monthRange(month), [month]);
  const cur = data?.currency ?? currency;

  // جلب بيانات الإقرار عند تغيير الفترة أو التحديث
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    fetch(`/api/vat?from=${range.from}&to=${range.to}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: VatData & { error?: string }) => {
        if (cancelled) return;
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
        toast({
          variant: "destructive",
          title: "تعذر تحميل بيانات الإقرار الضريبي",
          description: "تحقق من الاتصال وحاول التحديث مرة أخرى",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, refreshKey, toast]);

  const reload = () => setRefreshKey((k) => k + 1);

  const decl = data?.declaration ?? null;
  const filed = data?.filed ?? null;
  const daysLeft = decl ? daysUntil(decl.dueDate) : 0;
  const net = decl?.netVat ?? 0;

  async function submitDeclaration() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/vat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: range.from, to: range.to, notes: notes.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "تعذر تقديم الإقرار");
      toast({
        title: filed ? "تم تحديث الإقرار الضريبي" : "تم تقديم الإقرار الضريبي بنجاح",
        description: `الفترة ${formatDate(range.from)} — ${formatDate(range.to)} بصافي ${formatMoney(
          d.declaration?.netVat ?? net,
          cur
        )}`,
      });
      setNotes("");
      setConfirmOpen(false);
      reload();
      onDataChange?.();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "فشل تقديم الإقرار",
        description: e instanceof Error ? e.message : "حدث خطأ غير متوقع",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // ============ حالة التحميل الأولى ============
  if (loading && !data) {
    return (
      <div className="p-4 sm:p-5 space-y-4 max-w-6xl mx-auto" aria-busy="true" aria-label="جارٍ تحميل الإقرار الضريبي">
        <div className="space-y-2">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-[420px] rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  // ============ حالة خطأ التحميل ============
  if (loadError && !data) {
    return (
      <div className="p-4 sm:p-5 max-w-6xl mx-auto">
        <div className="rounded-2xl border border-red-100 bg-red-50/60 p-8 flex flex-col items-center text-center gap-3">
          <AlertTriangle className="size-10 text-red-400" />
          <div>
            <h2 className="font-extrabold text-brand-navy">تعذر تحميل الإقرار الضريبي</h2>
            <p className="text-[13px] text-slate-500 mt-1">
              حدث خطأ أثناء جلب بيانات الفترة — حاول مرة أخرى
            </p>
          </div>
          <Button onClick={reload} className="rounded-xl gap-1.5">
            <RefreshCw className="size-4" />
            إعادة المحاولة
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-5 space-y-4 max-w-6xl mx-auto">
      {/* ===== الترويسة ===== */}
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-navy flex items-center gap-2">
            <Landmark className="size-6 text-brand-green" />
            الإقرار الضريبي — ضريبة القيمة المضافة
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            احسب وقدّم إقرار ض.ق.م وفق نموذج هيئة الزكاة والضريبة والجمارك (زتكا)
          </p>
        </div>
        <div className="flex-1" />
        {data?.taxNumber ? (
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-[12px] font-extrabold border border-emerald-200"
            dir="ltr"
            title="الرقم الضريبي المسجل في الإعدادات"
          >
            <BadgeCheck className="size-4" />
            VAT: {data.taxNumber}
          </span>
        ) : null}
        <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={reload} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          تحديث
        </Button>
      </header>

      {/* تنبيه: الرقم الضريبي غير مسجل */}
      {!data?.taxNumber && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3.5">
          <AlertTriangle className="size-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-[13px] leading-relaxed">
            <p className="font-extrabold text-amber-800">لم تسجل رقمك الضريبي بعد</p>
            <p className="text-amber-700 mt-0.5">
              سجّل الرقم الضريبي للمنشأة (15 رقماً) من صفحة الإعدادات ليرافق إقراراتك المقدمة للهيئة.
            </p>
          </div>
        </div>
      )}

      {/* ===== اختيار الفترة ===== */}
      <section
        aria-label="اختيار فترة الإقرار"
        className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-48">
            <Label htmlFor="vat-month" className="text-[12px] font-bold text-slate-500 mb-1.5">
              فترة الإقرار (شهر كامل)
            </Label>
            <div className="relative">
              <CalendarDays className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
              <Input
                id="vat-month"
                type="month"
                value={month}
                max={monthValueOffset(0)}
                onChange={(e) => {
                  if (e.target.value) setMonth(e.target.value);
                }}
                className="ps-9 rounded-xl h-10 text-[13px] font-bold"
                aria-label="اختر شهر الإقرار الضريبي"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: "الشهر الماضي", value: monthValueOffset(-1) },
              { label: "قبل شهرين", value: monthValueOffset(-2) },
            ].map((q) => (
              <Button
                key={q.value}
                type="button"
                size="sm"
                variant={month === q.value ? "default" : "outline"}
                className={cn(
                  "rounded-xl h-10 text-[12.5px]",
                  month === q.value && "bg-brand-navy hover:bg-slate-800"
                )}
                onClick={() => setMonth(q.value)}
                aria-pressed={month === q.value}
              >
                {q.label}
              </Button>
            ))}
          </div>
          <div className="flex-1" />
          <p className="text-[12.5px] text-slate-400 font-bold">
            فترة الإقرار: <span className="text-brand-navy">{monthTitle(month)}</span>
          </p>
        </div>
      </section>

      {/* ===== شريط حالة التقديم / الاستحقاق ===== */}
      {decl &&
        (filed ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3.5">
            <CheckCircle2 className="size-6 text-emerald-500 shrink-0" />
            <div className="text-[13px] leading-relaxed min-w-0">
              <p className="font-extrabold text-emerald-800">
                تم تقديم الإقرار لهذه الفترة بتاريخ {formatDateTime(filed.filedAt)}
              </p>
              <p className="text-emerald-700 mt-0.5">
                صافي الإقرار المقدَّم:{" "}
                <span className="font-extrabold" dir="ltr">
                  {formatMoney(filed.netVat, cur)}
                </span>
                {filed.notes ? ` — ${filed.notes}` : ""}
              </p>
            </div>
            <div className="flex-1" />
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-emerald-700 text-[11.5px] font-extrabold border border-emerald-200 shrink-0">
              <BadgeCheck className="size-4" />
              مقدَّم للهيئة
            </span>
          </div>
        ) : (
          <div
            className={cn(
              "flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3.5",
              daysLeft < 0
                ? "border-red-200 bg-red-50/70"
                : daysLeft <= 7
                  ? "border-orange-200 bg-orange-50/70"
                  : "border-amber-200 bg-amber-50/70"
            )}
            role="status"
          >
            {daysLeft < 0 ? (
              <AlertTriangle className="size-6 text-red-500 shrink-0" />
            ) : (
              <Clock className="size-6 text-amber-500 shrink-0" />
            )}
            <div className="text-[13px] leading-relaxed min-w-0">
              <p className="font-extrabold text-brand-navy">
                هذه الفترة لم تُقدَّم بعد — آخر موعد للتقديم:{" "}
                <span className="text-brand-navy">{formatDate(decl.dueDate)}</span>
              </p>
              <p
                className={cn(
                  "mt-0.5 font-bold",
                  daysLeft < 0 ? "text-red-600" : daysLeft <= 7 ? "text-orange-600" : "text-amber-700"
                )}
              >
                {daysLeft === 0
                  ? "آخر موعد للتقديم هو اليوم — قدّم إقرارك قبل نهاية اليوم"
                  : daysLeft > 0
                    ? `يتبقى ${daysLabel(daysLeft)} على انتهاء المهلة النظامية`
                    : `تجاوزت الموعد النظامي بـ ${daysLabel(Math.abs(daysLeft))} — قد تتعرض لغرامة تأخير`}
              </p>
            </div>
          </div>
        ))}

      {/* ===== نموذج الإقرار (استمارة زتكا) ===== */}
      <section
        aria-label="نموذج الإقرار الضريبي"
        className={cn(
          "bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] overflow-hidden transition-opacity",
          loading && data && "opacity-60 pointer-events-none"
        )}
      >
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <div>
            <h2 className="font-extrabold text-brand-navy text-[15px]">نموذج الإقرار الضريبي</h2>
            <p className="text-[12px] text-slate-400 mt-0.5">
              الفترة من <span className="font-bold text-slate-500">{formatDate(range.from)}</span> إلى{" "}
              <span className="font-bold text-slate-500">{formatDate(range.to)}</span> — {monthTitle(month)}
            </p>
          </div>
          <div className="flex-1" />
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-light border border-slate-200 text-[11px] font-bold text-slate-500">
            <FileText className="size-3.5" />
            نمط استمارة زتكا
          </span>
        </div>

        {decl ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-collapse min-w-[600px]" aria-label="بنود الإقرار الضريبي">
              <thead>
                <tr className="bg-brand-navy text-white text-[12px]">
                  <th scope="col" className="text-start font-bold px-4 py-3 w-[46%]">البند</th>
                  <th scope="col" className="text-start font-bold px-4 py-3">المبلغ (وعاء الضريبة)</th>
                  <th scope="col" className="text-start font-bold px-4 py-3">الضريبة</th>
                </tr>
              </thead>
              <tbody>
                {/* القسم الأول — المبيعات */}
                <tr>
                  <td colSpan={3} className="bg-brand-light border-b border-slate-200 px-4 py-2.5">
                    <span className="inline-flex items-center gap-2 text-[12.5px] font-extrabold text-brand-navy">
                      <Receipt className="size-4 text-brand-teal" />
                      القسم الأول — المبيعات
                    </span>
                  </td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-3.5">
                    <p className="font-bold text-brand-navy">المبيعات الخاضعة للنسبة الأساسية 15%</p>
                    <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-bold text-slate-400 bg-slate-50 border border-slate-100 rounded-full px-2 py-0.5">
                      {decl.salesCount.toLocaleString("ar-EG")} فاتورة مبيعات في الفترة
                    </span>
                  </td>
                  <td className="px-4 py-3.5 align-top">
                    <BoxValue box={1} value={formatMoney(decl.salesAmount, cur)} />
                  </td>
                  <td className="px-4 py-3.5 align-top">
                    <BoxValue box={2} value={formatMoney(decl.outputVat, cur)} tone="rose" />
                  </td>
                </tr>

                {/* القسم الثاني — المشتريات */}
                <tr>
                  <td colSpan={3} className="bg-brand-light border-y border-slate-200 px-4 py-2.5">
                    <span className="inline-flex items-center gap-2 text-[12.5px] font-extrabold text-brand-navy">
                      <ShoppingCart className="size-4 text-brand-teal" />
                      القسم الثاني — المشتريات
                    </span>
                  </td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-3.5">
                    <p className="font-bold text-brand-navy">المشتريات الخاضعة للضريبة (المدخلات)</p>
                    <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-bold text-slate-400 bg-slate-50 border border-slate-100 rounded-full px-2 py-0.5">
                      {decl.purchasesCount.toLocaleString("ar-EG")} فاتورة مشتريات في الفترة
                    </span>
                  </td>
                  <td className="px-4 py-3.5 align-top">
                    <BoxValue box={3} value={formatMoney(decl.purchasesAmount, cur)} />
                  </td>
                  <td className="px-4 py-3.5 align-top">
                    <BoxValue box={4} value={formatMoney(decl.inputVat, cur)} tone="emerald" />
                  </td>
                </tr>

                {/* القسم الثالث — النتيجة */}
                <tr>
                  <td colSpan={3} className="bg-brand-light border-t border-slate-200 px-4 py-2.5">
                    <span className="inline-flex items-center gap-2 text-[12.5px] font-extrabold text-brand-navy">
                      <Scale className="size-4 text-brand-teal" />
                      القسم الثالث — نتيجة الإقرار
                    </span>
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="p-4">
                    {/* صندوق الصافي المميز */}
                    <div
                      className={cn(
                        "rounded-2xl border p-4 sm:p-5 grid sm:grid-cols-[1fr_auto] items-center gap-3",
                        net > 0
                          ? "border-rose-200 bg-gradient-to-l from-rose-50 to-orange-50"
                          : net < 0
                            ? "border-emerald-200 bg-gradient-to-l from-emerald-50 to-teal-50"
                            : "border-slate-200 bg-slate-50"
                      )}
                      role="group"
                      aria-label="صافي الضريبة للفترة"
                    >
                      <div>
                        <p
                          className={cn(
                            "text-[14px] font-extrabold",
                            net > 0 ? "text-rose-700" : net < 0 ? "text-emerald-700" : "text-slate-600"
                          )}
                        >
                          {net > 0
                            ? "صافي الضريبة المستحقة للهيئة"
                            : net < 0
                              ? "رصيد ضريبة مسترد (يُرحَّل أو يُطلب استرداده)"
                              : "لا توجد ضريبة مستحقة لهذه الفترة"}
                        </p>
                        <p className="text-[11.5px] text-slate-400 mt-1">
                          ضريبة المخرجات (2) − ضريبة المدخلات (4) = الصافي
                          {net < 0 ? " — القيمة السالبة تعني رصيداً لصالح المنشأة" : ""}
                        </p>
                      </div>
                      <p
                        className={cn(
                          "text-2xl sm:text-3xl font-extrabold tabular-nums",
                          net > 0 ? "text-rose-600" : net < 0 ? "text-emerald-600" : "text-slate-500"
                        )}
                        dir="ltr"
                      >
                        {formatMoney(net, cur)}
                      </p>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-slate-400 text-[13px]">لا توجد بيانات للفترة المحددة</div>
        )}

        <div className="px-4 sm:px-5 py-3.5 border-t border-slate-100 bg-slate-50/60 flex items-start gap-2.5">
          <Info className="size-4 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[11.5px] text-slate-400 leading-relaxed">
            جميع القيم محسوبة تلقائياً من فواتير المبيعات والمشتريات المسجلة في الفترة — راجعها قبل التقديم،
            فالتقديم للهيئة إقرار رسمي بصحة الأرقام.
          </p>
        </div>
      </section>

      {/* ===== ملاحظات + زر التقديم ===== */}
      <section
        aria-label="تقديم الإقرار"
        className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] p-4 sm:p-5 space-y-3.5"
      >
        <div>
          <Label htmlFor="vat-notes" className="text-[12px] font-bold text-slate-500 mb-1.5">
            ملاحظات (اختياري)
          </Label>
          <Textarea
            id="vat-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="أي ملاحظات ترافق هذا الإقرار — مثل سبب التعديل أو مرجع سداد الضريبة..."
            className="rounded-xl min-h-20 text-[13px] resize-y"
            maxLength={500}
            rows={3}
          />
          <p className="text-[11px] text-slate-400 mt-1">{notes.length} / 500 حرفاً كحد أقصى</p>
        </div>
        <Button
          onClick={() => setConfirmOpen(true)}
          disabled={!decl || submitting || loading}
          className={cn(
            "w-full h-12 rounded-2xl text-[15px] font-extrabold gap-2",
            filed
              ? "bg-white border-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              : "bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95 shadow-md"
          )}
          aria-label={
            filed ? "تحديث الإقرار المقدَّم لهذه الفترة" : "تقديم الإقرار الضريبي لهيئة الزكاة والضريبة"
          }
        >
          {submitting ? (
            <Loader2 className="size-5 animate-spin" />
          ) : filed ? (
            <RefreshCw className="size-5" />
          ) : (
            <Send className="size-5" />
          )}
          {filed ? "تحديث الإقرار المقدَّم (يستبدل النسخة السابقة)" : "تقديم الإقرار للهيئة"}
        </Button>
        {filed && (
          <p className="text-[11.5px] text-slate-400 text-center">
            هذه الفترة مقدَّمة سابقاً — أي تحديث سيعيد حساب الأرقام من الفواتير ويستبدل الإقرار المحفوظ.
          </p>
        )}
      </section>

      {/* ===== سجل الإقرارات المقدمة ===== */}
      <section
        aria-label="سجل الإقرارات المقدمة"
        className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] overflow-hidden"
      >
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <History className="size-4.5 text-brand-teal" />
          <h2 className="font-extrabold text-brand-navy text-[15px]">سجل الإقرارات المقدمة</h2>
          {data && data.history.length > 0 && (
            <span className="text-[11.5px] font-bold text-slate-400">
              ({data.history.length.toLocaleString("ar-EG")} إقرار)
            </span>
          )}
        </div>

        {!data || data.history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-slate-300 gap-2.5 px-4 text-center">
            <Landmark className="size-12" />
            <p className="text-slate-400 text-[13px] font-bold">لم تُقدَّم أي إقرارات ضريبية بعد</p>
            <p className="text-slate-400/80 text-[12px] max-w-sm leading-relaxed">
              اختر فترة شهرية أعلاه وراجع أرقامها ثم قدّم إقرارك — سيظهر هنا سجل كامل بإقراراتك مع حالتها.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] min-w-[820px]" aria-label="جدول الإقرارات الضريبية المقدمة">
              <thead>
                <tr className="bg-brand-light text-slate-500 text-[11.5px]">
                  <th scope="col" className="text-start font-bold px-4 py-3">الفترة</th>
                  <th scope="col" className="text-start font-bold px-4 py-3">المبيعات</th>
                  <th scope="col" className="text-start font-bold px-4 py-3">ض. المخرجات</th>
                  <th scope="col" className="text-start font-bold px-4 py-3">المشتريات</th>
                  <th scope="col" className="text-start font-bold px-4 py-3">ض. المدخلات</th>
                  <th scope="col" className="text-start font-bold px-4 py-3">الصافي</th>
                  <th scope="col" className="text-start font-bold px-4 py-3">تاريخ التقديم</th>
                  <th scope="col" className="text-start font-bold px-4 py-3">الحالة</th>
                  <th scope="col" className="text-start font-bold px-4 py-3">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((h) => {
                  const isCurrent = h.periodStart.slice(0, 7) === month;
                  return (
                    <tr
                      key={h.id}
                      className={cn(
                        "border-t border-slate-100 transition-colors hover:bg-emerald-50/25",
                        isCurrent && "bg-brand-light/60"
                      )}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-extrabold text-brand-navy" dir="ltr">
                          {formatDate(h.periodStart)} — {formatDate(h.periodEnd)}
                        </span>
                        {isCurrent && (
                          <span className="block text-[10.5px] font-bold text-brand-teal mt-0.5">الفترة المعروضة</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 tabular-nums" dir="ltr">
                        {formatMoney(h.salesAmount, cur)}
                      </td>
                      <td className="px-4 py-3 text-rose-600 font-bold tabular-nums" dir="ltr">
                        {formatMoney(h.outputVat, cur)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 tabular-nums" dir="ltr">
                        {formatMoney(h.purchasesAmount, cur)}
                      </td>
                      <td className="px-4 py-3 text-emerald-600 font-bold tabular-nums" dir="ltr">
                        {formatMoney(h.inputVat, cur)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "font-extrabold tabular-nums",
                            h.netVat > 0 ? "text-rose-600" : h.netVat < 0 ? "text-emerald-600" : "text-slate-500"
                          )}
                          dir="ltr"
                        >
                          {formatMoney(h.netVat, cur)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDateTime(h.filedAt)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[11px] font-bold border border-emerald-100">
                          <CheckCircle2 className="size-3.5" />
                          مقدَّم
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 max-w-48 truncate" title={h.notes ?? undefined}>
                        {h.notes ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ===== نافذة تأكيد التقديم ===== */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl" className="rounded-2xl max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-brand-navy text-right flex items-center gap-2">
              <Send className="size-5 text-brand-green" />
              {filed ? "تأكيد تحديث الإقرار الضريبي" : "تأكيد تقديم الإقرار الضريبي"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right leading-relaxed">
              هل تؤكد {filed ? "تحديث" : "تقديم"} إقرار ضريبة القيمة المضافة للفترة{" "}
              <span className="font-bold text-brand-navy">
                {formatDate(range.from)} — {formatDate(range.to)}
              </span>{" "}
              بصافي{" "}
              <span className={cn("font-extrabold", net > 0 ? "text-rose-600" : "text-emerald-600")} dir="ltr">
                {formatMoney(net, cur)}
              </span>
              ؟
            </AlertDialogDescription>
          </AlertDialogHeader>

          {decl && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-xl border border-slate-100 bg-brand-light p-3">
              <ConfirmStat label="المبيعات" value={formatMoney(decl.salesAmount, cur)} />
              <ConfirmStat label="ض. المخرجات" value={formatMoney(decl.outputVat, cur)} tone="rose" />
              <ConfirmStat label="المشتريات" value={formatMoney(decl.purchasesAmount, cur)} />
              <ConfirmStat label="ض. المدخلات" value={formatMoney(decl.inputVat, cur)} tone="emerald" />
              <ConfirmStat
                label="الصافي"
                value={formatMoney(decl.netVat, cur)}
                tone={decl.netVat > 0 ? "rose" : "emerald"}
              />
              <ConfirmStat label="آخر موعد" value={formatDate(decl.dueDate)} />
            </div>
          )}

          <p className="text-[11.5px] text-slate-400 leading-relaxed">
            بالتأكيد تقر بصحة الأرقام المحسوبة من فواتيرك وتُسجَّل نسخة الإقرار في سجل المنشأة.
          </p>

          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl" disabled={submitting}>
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                submitDeclaration();
              }}
              disabled={submitting}
              className="rounded-xl bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95 font-extrabold gap-1.5"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {filed ? "تأكيد التحديث" : "تأكيد التقديم"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============ مكونات مساعدة ============

/** قيمة داخل صندوق مرقّم يحاكي استمارة زتكا */
function BoxValue({
  box,
  value,
  tone = "slate",
}: {
  box: number;
  value: string;
  tone?: "slate" | "rose" | "emerald";
}) {
  const tones = {
    slate: "text-brand-navy",
    rose: "text-rose-600",
    emerald: "text-emerald-600",
  };
  return (
    <span className="inline-flex items-center gap-2" dir="ltr">
      <span
        className="inline-flex items-center justify-center size-5 rounded-md border border-slate-300 bg-white text-[10px] font-bold text-slate-400 shrink-0"
        aria-hidden
      >
        {box}
      </span>
      <span className={cn("font-extrabold tabular-nums whitespace-nowrap", tones[tone])}>{value}</span>
    </span>
  );
}

/** خانة إحصائية داخل نافذة التأكيد */
function ConfirmStat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "rose" | "emerald";
}) {
  const tones = {
    slate: "text-brand-navy",
    rose: "text-rose-600",
    emerald: "text-emerald-600",
  };
  return (
    <div className="bg-white rounded-lg border border-slate-100 px-2.5 py-2">
      <p className="text-[10.5px] font-bold text-slate-400">{label}</p>
      <p className="text-[12.5px] font-extrabold tabular-nums mt-0.5" dir="ltr">
        <span className={tones[tone]}>{value}</span>
      </p>
    </div>
  );
}
