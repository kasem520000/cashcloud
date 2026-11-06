"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  Boxes,
  Calculator,
  History,
  Info,
  Loader2,
  Pencil,
  Plus,
  Search,
  TrendingDown,
  Trash2,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type {
  DepreciationRecord,
  FixedAssetRecord,
  Session,
} from "./types";
import {
  ASSET_STATUS_LABELS,
  formatDate,
  formatMoney,
  hasPerm,
} from "./types";

// ============ ثوابت مساعدة ============

const ASSET_CATEGORIES = [
  "معدات",
  "سيارات",
  "أجهزة حاسب",
  "أثاث",
  "عقارات",
  "أخرى",
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** فترة الشهر الحالي بصيغة YYYY-MM */
function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const emptyAssetForm = {
  name: "",
  category: "معدات",
  purchaseDate: "",
  cost: "",
  salvageValue: "",
  usefulLifeYears: "",
  note: "",
};

type AssetsStats = {
  totalAssets: number;
  activeAssets: number;
  totalCost: number;
  totalAccumulated: number;
  totalNbv: number;
  monthlyDepreciation: number;
};

const emptyStats: AssetsStats = {
  totalAssets: 0,
  activeAssets: 0,
  totalCost: 0,
  totalAccumulated: 0,
  totalNbv: 0,
  monthlyDepreciation: 0,
};

// ============ المكوّن الرئيسي ============

export function AssetsView({
  currency,
  session,
}: {
  currency: string;
  session: Session;
}) {
  const { toast } = useToast();
  const canWrite = hasPerm(session.role, "accounting:write");

  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<FixedAssetRecord[]>([]);
  const [recentDepreciation, setRecentDepreciation] = useState<DepreciationRecord[]>([]);
  const [stats, setStats] = useState<AssetsStats>(emptyStats);
  const [q, setQ] = useState("");

  // حوار إضافة / تعديل أصل
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<FixedAssetRecord | null>(null);
  const [assetForm, setAssetForm] = useState({ ...emptyAssetForm });
  const [assetSaving, setAssetSaving] = useState(false);
  const [deleteAssetTarget, setDeleteAssetTarget] = useState<FixedAssetRecord | null>(null);

  // حوار ترحيل إهلاك فترة
  const [depDialogOpen, setDepDialogOpen] = useState(false);
  const [depPeriod, setDepPeriod] = useState(currentPeriod());
  const [depSaving, setDepSaving] = useState(false);

  // حوار التخريد
  const [disposeTarget, setDisposeTarget] = useState<FixedAssetRecord | null>(null);
  const [disposeForm, setDisposeForm] = useState({ amount: "", note: "" });
  const [disposeSaving, setDisposeSaving] = useState(false);

  const load = useCallback(() => {
    fetch("/api/assets")
      .then((r) => r.json())
      .then((d) => {
        setAssets(d.assets ?? []);
        setRecentDepreciation(d.recentDepreciation ?? []);
        if (d.stats) setStats(d.stats as AssetsStats);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ============ إدارة الأصول ============

  function openNewAsset() {
    setEditingAsset(null);
    setAssetForm({ ...emptyAssetForm, category: ASSET_CATEGORIES[0] });
    setAssetDialogOpen(true);
  }

  function openEditAsset(a: FixedAssetRecord) {
    setEditingAsset(a);
    setAssetForm({
      name: a.name,
      category: ASSET_CATEGORIES.includes(a.category) ? a.category : "أخرى",
      purchaseDate: a.purchaseDate?.slice(0, 10) ?? "",
      cost: String(a.cost ?? ""),
      salvageValue: String(a.salvageValue ?? ""),
      usefulLifeYears: String(a.usefulLifeYears ?? ""),
      note: a.note ?? "",
    });
    setAssetDialogOpen(true);
  }

  /** معاينة حية للقسط الشهري */
  const costVal = Number(assetForm.cost) || 0;
  const salvageVal = Number(assetForm.salvageValue) || 0;
  const lifeVal = Number(assetForm.usefulLifeYears) || 0;
  const monthlyInstallment =
    lifeVal > 0 ? round2(Math.max(0, costVal - salvageVal) / (lifeVal * 12)) : 0;

  async function saveAsset() {
    if (!assetForm.name.trim()) {
      toast({ variant: "destructive", title: "اسم الأصل مطلوب" });
      return;
    }
    if (!assetForm.purchaseDate) {
      toast({ variant: "destructive", title: "تاريخ الشراء مطلوب" });
      return;
    }
    if (costVal <= 0) {
      toast({ variant: "destructive", title: "أدخل تكلفة أكبر من صفر" });
      return;
    }
    if (lifeVal < 1 || lifeVal > 50) {
      toast({ variant: "destructive", title: "العمر الإنتاجي يجب أن يكون بين 1 و 50 سنة" });
      return;
    }
    if (salvageVal > costVal) {
      toast({ variant: "destructive", title: "القيمة التخريدية لا يمكن أن تتجاوز التكلفة" });
      return;
    }
    setAssetSaving(true);
    try {
      const body = editingAsset
        ? {
            action: "asset.update",
            id: editingAsset.id,
            asset: {
              name: assetForm.name.trim(),
              category: assetForm.category,
              purchaseDate: assetForm.purchaseDate,
              cost: costVal,
              salvageValue: salvageVal,
              usefulLifeYears: lifeVal,
              note: assetForm.note.trim() || undefined,
            },
          }
        : {
            action: "asset.create",
            asset: {
              name: assetForm.name.trim(),
              category: assetForm.category,
              purchaseDate: assetForm.purchaseDate,
              cost: costVal,
              salvageValue: salvageVal,
              usefulLifeYears: lifeVal,
              note: assetForm.note.trim() || undefined,
            },
          };
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل حفظ الأصل",
          description: data.error,
        });
        return;
      }
      toast({
        title: editingAsset ? "تم تحديث الأصل" : "تمت إضافة الأصل",
        description: assetForm.name.trim(),
      });
      setAssetDialogOpen(false);
      load();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setAssetSaving(false);
    }
  }

  async function removeAsset(a: FixedAssetRecord) {
    setDeleteAssetTarget(null);
    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "asset.delete", id: a.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل حذف الأصل",
          description: data.error,
        });
        return;
      }
      toast({ title: "تم حذف الأصل", description: a.name });
      load();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    }
  }

  // ============ ترحيل الإهلاك ============

  async function runDepreciation() {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(depPeriod.trim())) {
      toast({
        variant: "destructive",
        title: "صيغة الفترة غير صحيحة",
        description: "أدخل الفترة بصيغة YYYY-MM مثل 2025-01",
      });
      return;
    }
    setDepSaving(true);
    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "depreciation.run", period: depPeriod.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل ترحيل الإهلاك",
          description: data.error,
        });
        return;
      }
      toast({
        title: "تم ترحيل إهلاك الفترة",
        description: `${data.entriesCount ?? 0} قيد — إجمالي ${formatMoney(
          data.totalAmount ?? 0,
          currency
        )}${data.journalNumber ? ` — القيد ${data.journalNumber}` : ""}`,
      });
      setDepDialogOpen(false);
      load();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setDepSaving(false);
    }
  }

  // ============ التخريد ============

  async function disposeAsset() {
    if (!disposeTarget) return;
    const amount = Number(disposeForm.amount) || 0;
    if (amount < 0) {
      toast({ variant: "destructive", title: "أدخل مبلغ تخريد صحيحاً" });
      return;
    }
    setDisposeSaving(true);
    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "asset.dispose",
          id: disposeTarget.id,
          disposalAmount: amount,
          note: disposeForm.note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل تخريد الأصل",
          description: data.error,
        });
        return;
      }
      toast({
        title: "تم تخريد الأصل",
        description: `${disposeTarget.name} — بمبلغ ${formatMoney(amount, currency)}`,
      });
      setDisposeTarget(null);
      load();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setDisposeSaving(false);
    }
  }

  const filteredAssets = assets.filter((a) => {
    if (!q.trim()) return true;
    const needle = q.trim();
    return a.name.includes(needle) || a.category.includes(needle);
  });

  return (
    <div className="p-4 sm:p-5 space-y-4">
      {/* الترويسة */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-navy flex items-center gap-2">
            <Boxes className="size-6 text-brand-blue" />
            الأصول الثابتة والإهلاك
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            سجل الأصول بطريقة القسط الثابت مع ترحيل إهلاك شهري آلي
          </p>
        </div>
        <div className="flex-1" />
        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث باسم الأصل أو الفئة..."
            className="w-full ps-10 h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-brand-blue"
          />
        </div>
        {canWrite && (
          <>
            <Button
              variant="outline"
              onClick={() => {
                setDepPeriod(currentPeriod());
                setDepDialogOpen(true);
              }}
              className="h-10 rounded-xl font-bold gap-1.5 border-slate-200"
            >
              <Calculator className="size-4" />
              ترحيل إهلاك فترة
            </Button>
            <Button
              onClick={openNewAsset}
              className="h-10 rounded-xl font-extrabold gap-1.5 bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
            >
              <Plus className="size-4" />
              إضافة أصل ثابت
            </Button>
          </>
        )}
      </div>

      {/* بطاقات الإحصاء */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.05)] flex items-center gap-3">
            <div className="size-11 rounded-xl bg-blue-50 text-brand-blue flex items-center justify-center shrink-0">
              <Wallet className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] text-slate-500 font-bold">إجمالي تكلفة الأصول</p>
              <p className="text-[15px] font-extrabold text-brand-navy truncate" dir="ltr">
                {formatMoney(stats.totalCost, currency)}
              </p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.05)] flex items-center gap-3">
            <div className="size-11 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
              <TrendingDown className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] text-slate-500 font-bold">مجمع الإهلاك</p>
              <p className="text-[15px] font-extrabold text-brand-navy truncate" dir="ltr">
                {formatMoney(stats.totalAccumulated, currency)}
              </p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.05)] flex items-center gap-3">
            <div className="size-11 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
              <Boxes className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] text-slate-500 font-bold">صافي القيمة الدفترية</p>
              <p className="text-[15px] font-extrabold text-brand-navy truncate" dir="ltr">
                {formatMoney(stats.totalNbv, currency)}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-brand-light/70 px-4 py-2.5">
          <Calculator className="size-4 text-brand-teal shrink-0" />
          <p className="text-[12.5px] text-slate-500">
            إهلاك شهري متوقع للأصول النشطة:{" "}
            <span className="font-extrabold text-brand-navy" dir="ltr">
              {formatMoney(stats.monthlyDepreciation, currency)}
            </span>
          </p>
          <div className="flex-1" />
          <p className="text-[11.5px] text-slate-400">
            {stats.activeAssets.toLocaleString("ar-EG")} أصل نشط من{" "}
            {stats.totalAssets.toLocaleString("ar-EG")}
          </p>
        </div>
      </div>

      {/* جدول الأصول */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="size-8 animate-spin" />
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
            <Boxes className="size-14" />
            <p className="text-slate-400 text-sm">
              {q.trim() ? "لا توجد نتائج مطابقة" : "لا توجد أصول ثابتة بعد"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-brand-light text-slate-500 text-[12px]">
                  <th className="text-start font-bold px-4 py-3">الأصل والفئة</th>
                  <th className="text-start font-bold px-4 py-3">تاريخ الشراء</th>
                  <th className="text-start font-bold px-4 py-3">التكلفة</th>
                  <th className="text-start font-bold px-4 py-3">القيمة التخريدية</th>
                  <th className="text-start font-bold px-4 py-3">العمر (سنوات)</th>
                  <th className="text-start font-bold px-4 py-3">القسط الشهري</th>
                  <th className="text-start font-bold px-4 py-3">مجمع الإهلاك</th>
                  <th className="text-start font-bold px-4 py-3">صافي القيمة</th>
                  <th className="text-start font-bold px-4 py-3">الحالة</th>
                  <th className="text-start font-bold px-4 py-3">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.map((a) => {
                  const depreciationStarted = a.accumulated > 0;
                  const isDisposed = a.status === "disposed";
                  return (
                    <tr
                      key={a.id}
                      className={cn(
                        "border-t border-slate-100 hover:bg-blue-50/40 transition-colors",
                        isDisposed && "bg-slate-50/60"
                      )}
                    >
                      <td className="px-4 py-3">
                        <p className="font-bold text-brand-navy whitespace-nowrap">{a.name}</p>
                        <p className="text-[11.5px] text-slate-400">{a.category}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {formatDate(a.purchaseDate)}
                      </td>
                      <td className="px-4 py-3 font-extrabold text-brand-navy whitespace-nowrap" dir="ltr">
                        {formatMoney(a.cost, currency)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap" dir="ltr">
                        {formatMoney(a.salvageValue, currency)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap" dir="ltr">
                        {a.usefulLifeYears}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap" dir="ltr">
                        {formatMoney(a.monthlyDepreciation, currency)}
                      </td>
                      <td className="px-4 py-3 text-rose-500 font-bold whitespace-nowrap" dir="ltr">
                        {formatMoney(a.accumulated, currency)}
                      </td>
                      <td className="px-4 py-3 font-extrabold text-emerald-600 whitespace-nowrap" dir="ltr">
                        {formatMoney(a.nbv, currency)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          {isDisposed ? (
                            <Badge
                              variant="secondary"
                              className="rounded-full px-2.5 py-0.5 text-[11.5px] font-bold border-transparent bg-slate-100 text-slate-400"
                            >
                              {ASSET_STATUS_LABELS.disposed}
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="rounded-full px-2.5 py-0.5 text-[11.5px] font-bold border-transparent bg-emerald-50 text-emerald-600"
                            >
                              {ASSET_STATUS_LABELS.active}
                            </Badge>
                          )}
                          {a.fullyDepreciated && (
                            <Badge
                              variant="secondary"
                              className="rounded-full px-2 py-0 text-[10.5px] font-bold border-transparent bg-amber-50 text-amber-600"
                            >
                              مُهلك بالكامل
                            </Badge>
                          )}
                          {isDisposed && a.disposedAt && (
                            <span className="text-[10.5px] text-slate-400 whitespace-nowrap">
                              {formatDate(a.disposedAt)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {canWrite ? (
                          <div className="flex items-center gap-1">
                            {depreciationStarted ? (
                              <span
                                className="size-8 rounded-lg bg-slate-50 text-slate-300 flex items-center justify-center cursor-help"
                                title="لا يمكن تعديل أو حذف أصل بدأ الإهلاك — قرّده أولاً"
                              >
                                <Info className="size-4" />
                              </span>
                            ) : (
                              <>
                                <button
                                  onClick={() => openEditAsset(a)}
                                  className="size-8 rounded-lg hover:bg-blue-100 text-slate-400 hover:text-brand-blue flex items-center justify-center transition-colors"
                                  aria-label={`تعديل ${a.name}`}
                                >
                                  <Pencil className="size-4" />
                                </button>
                                <button
                                  onClick={() => setDeleteAssetTarget(a)}
                                  className="size-8 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors"
                                  aria-label={`حذف ${a.name}`}
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              </>
                            )}
                            {!isDisposed && (
                              <button
                                onClick={() => {
                                  setDisposeTarget(a);
                                  setDisposeForm({ amount: "", note: "" });
                                }}
                                className="size-8 rounded-lg hover:bg-amber-100 text-slate-400 hover:text-amber-500 flex items-center justify-center transition-colors"
                                aria-label={`تخريد ${a.name}`}
                                title="تخريد الأصل"
                              >
                                <Archive className="size-4" />
                              </button>
                            )}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* سجل عمليات الإهلاك */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <History className="size-5 text-brand-blue" />
          <div>
            <h2 className="font-extrabold text-brand-navy text-[15px]">سجل عمليات الإهلاك</h2>
            <p className="text-[12px] text-slate-400 mt-0.5">
              آخر قيود الإهلاك المرحّلة آلياً
            </p>
          </div>
        </div>
        {recentDepreciation.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-slate-300 gap-2">
            <Calculator className="size-12" />
            <p className="text-slate-400 text-sm">لم تُرحَّل أي عمليات إهلاك بعد</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-brand-light text-slate-500 text-[12px]">
                  <th className="text-start font-bold px-4 py-2.5">الأصل</th>
                  <th className="text-start font-bold px-4 py-2.5">الفترة</th>
                  <th className="text-start font-bold px-4 py-2.5">المبلغ</th>
                  <th className="text-start font-bold px-4 py-2.5">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {recentDepreciation.map((d) => (
                  <tr
                    key={d.id}
                    className="border-t border-slate-100 hover:bg-blue-50/40 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-bold text-brand-navy whitespace-nowrap">
                      {d.assetName}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap" dir="ltr">
                      {d.period}
                    </td>
                    <td className="px-4 py-2.5 font-bold text-rose-500 whitespace-nowrap" dir="ltr">
                      {formatMoney(d.amount, currency)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                      {formatDate(d.date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* حوار إضافة / تعديل أصل */}
      <Dialog open={assetDialogOpen} onOpenChange={setAssetDialogOpen}>
        <DialogContent
          className="sm:max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="text-brand-navy">
              {editingAsset ? `تعديل الأصل — ${editingAsset.name}` : "إضافة أصل ثابت"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">اسم الأصل *</Label>
              <Input
                value={assetForm.name}
                onChange={(e) => setAssetForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="مثال: سيارة تويوتا هايلوكس"
                className="h-11 rounded-xl border-slate-200"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">الفئة</Label>
                <Select
                  value={assetForm.category}
                  onValueChange={(v) => setAssetForm((f) => ({ ...f, category: v }))}
                >
                  <SelectTrigger className="w-full data-[size=default]:h-11 rounded-xl border-slate-200 font-bold text-brand-navy bg-white">
                    <SelectValue placeholder="اختر الفئة" />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">تاريخ الشراء *</Label>
                <Input
                  type="date"
                  value={assetForm.purchaseDate}
                  onChange={(e) =>
                    setAssetForm((f) => ({ ...f, purchaseDate: e.target.value }))
                  }
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">التكلفة *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={assetForm.cost}
                  onChange={(e) => setAssetForm((f) => ({ ...f, cost: e.target.value }))}
                  placeholder="0.00"
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">القيمة التخريدية</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={assetForm.salvageValue}
                  onChange={(e) =>
                    setAssetForm((f) => ({ ...f, salvageValue: e.target.value }))
                  }
                  placeholder="0.00"
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">العمر (سنوات) *</Label>
                <Input
                  type="number"
                  min="1"
                  max="50"
                  step="1"
                  value={assetForm.usefulLifeYears}
                  onChange={(e) =>
                    setAssetForm((f) => ({ ...f, usefulLifeYears: e.target.value }))
                  }
                  placeholder="5"
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">ملاحظة</Label>
              <Textarea
                value={assetForm.note}
                onChange={(e) => setAssetForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="ملاحظة على الأصل (اختياري)..."
                className="rounded-xl min-h-16 text-[13px]"
              />
            </div>

            {/* معاينة القسط الشهري */}
            <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-4 space-y-1.5 text-[13px]">
              <p className="font-extrabold text-brand-teal text-[12.5px]">
                طريقة القسط الثابت
              </p>
              <p className="text-[11.5px] text-slate-500">
                القسط الشهري = (التكلفة − القيمة التخريدية) ÷ (العمر × 12)
              </p>
              <div className="flex justify-between font-extrabold text-brand-navy pt-1">
                <span>القسط الشهري المتوقع</span>
                <span className="text-brand-teal" dir="ltr">
                  {formatMoney(monthlyInstallment, currency)}
                </span>
              </div>
            </div>

            <Button
              onClick={saveAsset}
              disabled={assetSaving}
              className="w-full min-h-11 rounded-xl font-extrabold bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
            >
              {assetSaving ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  <Plus className="size-4" />
                  {editingAsset ? "حفظ التعديلات" : "إضافة الأصل"}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* حوار ترحيل إهلاك فترة */}
      <Dialog open={depDialogOpen} onOpenChange={setDepDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-brand-navy">ترحيل إهلاك فترة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">الفترة (YYYY-MM) *</Label>
              <Input
                value={depPeriod}
                onChange={(e) => setDepPeriod(e.target.value)}
                placeholder="2025-01"
                dir="ltr"
                className="h-11 rounded-xl border-slate-200 font-mono"
              />
              <p className="text-[11px] text-slate-400">
                سيُرحَّل قيد واحد مجمع لكل الأصول النشطة المستحقة للفترة
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-[12.5px] text-amber-800 leading-relaxed">
              <p className="font-extrabold">القيد المحاسبي الآلي</p>
              <p className="mt-0.5">
                مدين: 5500 مصروف الإهلاك — دائن: 1510 مجمع إهلاك الأصول الثابتة.
                الأصول المُهلكة بالكامل أو المخردة تُستثنى تلقائياً، ولا يمكن ترحيل
                نفس الفترة مرتين لنفس الأصل.
              </p>
            </div>

            <Button
              onClick={runDepreciation}
              disabled={depSaving}
              className="w-full min-h-11 rounded-xl font-extrabold bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
            >
              {depSaving ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  <Calculator className="size-4" />
                  ترحيل إهلاك الفترة
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* حوار تخريد أصل */}
      <Dialog
        open={!!disposeTarget}
        onOpenChange={(o) => !o && setDisposeTarget(null)}
      >
        <DialogContent className="sm:max-w-md rounded-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-brand-navy flex items-center gap-2">
              <Archive className="size-5 text-amber-500" />
              تخريد الأصل — {disposeTarget?.name}
            </DialogTitle>
          </DialogHeader>
          {disposeTarget && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-[12.5px]">
                <div className="rounded-xl bg-brand-light px-3 py-2">
                  <p className="text-[11px] font-bold text-slate-400">صافي القيمة الدفترية</p>
                  <p className="font-extrabold text-brand-navy" dir="ltr">
                    {formatMoney(disposeTarget.nbv, currency)}
                  </p>
                </div>
                <div className="rounded-xl bg-brand-light px-3 py-2">
                  <p className="text-[11px] font-bold text-slate-400">مجمع الإهلاك</p>
                  <p className="font-extrabold text-brand-navy" dir="ltr">
                    {formatMoney(disposeTarget.accumulated, currency)}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">مبلغ التخريد (المبيع النهائي)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={disposeForm.amount}
                  onChange={(e) => setDisposeForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00"
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">ملاحظة</Label>
                <Textarea
                  value={disposeForm.note}
                  onChange={(e) => setDisposeForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="سبب التخريد أو طرف البيع (اختياري)..."
                  className="rounded-xl min-h-16 text-[13px]"
                />
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-[12.5px] text-amber-800 leading-relaxed">
                <p className="font-extrabold">قيد التخريد الآلي</p>
                <p className="mt-0.5">
                  يُقفل الأصل بإثبات مجمع الإهلاك وتكلفته، ويُعترف بفرق صافي القيمة
                  الدفترية ومبلغ التخريد كمكسب أو خسارة تخريد. لا يمكن التراجع عن
                  التخريد.
                </p>
              </div>

              <Button
                onClick={disposeAsset}
                disabled={disposeSaving}
                className="w-full min-h-11 rounded-xl font-extrabold gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
              >
                {disposeSaving ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <>
                    <Archive className="size-4" />
                    تنفيذ التخريد
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* تأكيد حذف أصل */}
      <AlertDialog
        open={!!deleteAssetTarget}
        onOpenChange={(o) => !o && setDeleteAssetTarget(null)}
      >
        <AlertDialogContent dir="rtl" className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الأصل الثابت؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الأصل «{deleteAssetTarget?.name}» نهائياً. الأصول التي بدأ
              إهلاكها لا يمكن حذفها — قرّدها أولاً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:justify-start">
            <AlertDialogAction
              onClick={() => deleteAssetTarget && removeAsset(deleteAssetTarget)}
              className="bg-red-500 hover:bg-red-600 rounded-xl flex-1"
            >
              حذف
            </AlertDialogAction>
            <AlertDialogCancel className="rounded-xl flex-1">إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
