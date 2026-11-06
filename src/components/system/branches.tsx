"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Loader2,
  MapPin,
  Pencil,
  Trash2,
  Store,
  Warehouse,
  Store as KioskIcon,
  Power,
  Receipt,
  Banknote,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { BranchRecord, ShiftHistoryRecord } from "./types";
import {
  BRANCH_KIND_LABELS,
  formatMoney,
  formatDate,
  formatDateTime,
} from "./types";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<string, typeof Store> = {
  store: Store,
  warehouse: Warehouse,
  kiosk: KioskIcon,
};

type FormState = {
  name: string;
  code: string;
  kind: string;
  phone: string;
  address: string;
  city: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  code: "",
  kind: "store",
  phone: "",
  address: "",
  city: "",
  isActive: true,
};

export function BranchesView({ currency }: { currency: string }) {
  const { toast } = useToast();
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [shifts, setShifts] = useState<ShiftHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, s] = await Promise.all([
        fetch("/api/branches").then((r) => r.json()),
        fetch("/api/pos/shifts").then((r) => r.json()),
      ]);
      setBranches(b.branches ?? []);
      setShifts(s.history ?? []);
    } catch {
      /* تجاهل */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(b: BranchRecord) {
    setEditingId(b.id);
    setForm({
      name: b.name,
      code: b.code,
      kind: b.kind,
      phone: b.phone ?? "",
      address: b.address ?? "",
      city: b.city ?? "",
      isActive: b.isActive,
    });
    setDialogOpen(true);
  }

  async function submit() {
    setBusy(true);
    try {
      const url = editingId ? `/api/branches/${editingId}` : "/api/branches";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: editingId ? "تعذر تحديث الفرع" : "تعذر إنشاء الفرع",
          description: data.error ?? "حدث خطأ غير متوقع",
        });
        return;
      }
      toast({
        title: editingId ? "تم تحديث الفرع" : "تم إنشاء الفرع",
        description: `${form.name} (${form.code})`,
      });
      setDialogOpen(false);
      await load();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(b: BranchRecord) {
    const res = await fetch(`/api/branches/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !b.isActive }),
    });
    if (res.ok) {
      toast({
        title: b.isActive ? "عُطّل الفرع" : "فُعّل الفرع",
        description: b.name,
      });
      await load();
    }
  }

  async function remove(b: BranchRecord) {
    if (!confirm(`حذف الفرع «${b.name}»؟ لا يمكن التراجع.`)) return;
    const res = await fetch(`/api/branches/${b.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast({
        variant: "destructive",
        title: "تعذر حذف الفرع",
        description: data.error ?? "حدث خطأ غير متوقع",
      });
      return;
    }
    toast({ title: "حُذف الفرع", description: b.name });
    await load();
  }

  const totalSales = branches.reduce((s, b) => s + b.salesTotal, 0);
  const activeCount = branches.filter((b) => b.isActive).length;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-navy flex items-center gap-2.5">
            <MapPin className="size-6 text-brand-blue" />
            الفروع والمنافذ
          </h1>
          <p className="text-[13px] text-slate-400 mt-1">
            إدارة متاجر ومستودعات ونقاط البيع المتعددة — مع تتبع مبيعات وورديات كل فرع
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="rounded-xl font-extrabold text-white bg-gradient-to-l from-brand-blue to-brand-green shadow-[0_8px_20px_rgba(37,99,235,0.25)]"
        >
          <Plus className="size-4 ml-1" />
          فرع جديد
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-[12px] text-slate-400 font-bold">إجمالي الفروع</p>
          <p className="text-2xl font-extrabold text-brand-navy mt-1">{branches.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-[12px] text-slate-400 font-bold">الفروع النشطة</p>
          <p className="text-2xl font-extrabold text-emerald-600 mt-1">{activeCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-[12px] text-slate-400 font-bold">مبيعات الفروع</p>
          <p className="text-lg font-extrabold text-brand-green mt-1" dir="ltr">
            {formatMoney(totalSales, currency)}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-[12px] text-slate-400 font-bold">ورديات مفتوحة الآن</p>
          <p className="text-2xl font-extrabold text-brand-blue mt-1">
            {branches.reduce((s, b) => s + b.openShifts, 0)}
          </p>
        </div>
      </div>

      {/* Branches list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-300">
          <Loader2 className="size-8 animate-spin" />
        </div>
      ) : branches.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
          <MapPin className="size-12 text-slate-200 mx-auto mb-3" />
          <p className="font-bold text-brand-navy">لا توجد فروع بعد</p>
          <p className="text-[13px] text-slate-400 mt-1">
            أنشئ فرعك الأول لتتبع مبيعات كل منفذ على حدة — الفواتير تُربط بالفرع عند البيع
          </p>
          <Button onClick={openCreate} className="mt-4 rounded-xl font-bold">
            <Plus className="size-4 ml-1" />
            إنشاء الفرع الأول
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {branches.map((b) => {
            const Icon = KIND_ICON[b.kind] ?? Store;
            return (
              <div
                key={b.id}
                className={cn(
                  "bg-white rounded-2xl border p-4 transition-shadow hover:shadow-[0_8px_24px_rgba(15,23,42,0.07)]",
                  b.isActive ? "border-slate-100" : "border-slate-200 opacity-70"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={cn(
                        "size-10 rounded-xl flex items-center justify-center shrink-0",
                        b.isActive
                          ? "bg-gradient-to-br from-blue-50 to-emerald-50 text-brand-blue"
                          : "bg-slate-100 text-slate-400"
                      )}
                    >
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-extrabold text-brand-navy truncate">{b.name}</p>
                      <p className="text-[12px] text-slate-400">
                        {BRANCH_KIND_LABELS[b.kind] ?? b.kind} · رمز{" "}
                        <span className="font-mono" dir="ltr">
                          {b.code}
                        </span>
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0",
                      b.isActive
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-slate-100 text-slate-400"
                    )}
                  >
                    {b.isActive ? "نشط" : "معطّل"}
                  </span>
                </div>

                {b.city && (
                  <p className="text-[12px] text-slate-400 mt-2 flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    {b.city}
                    {b.address ? ` — ${b.address}` : ""}
                  </p>
                )}

                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="rounded-xl bg-brand-light p-2.5 text-center">
                    <Receipt className="size-4 text-brand-blue mx-auto" />
                    <p className="text-[15px] font-extrabold text-brand-navy mt-0.5">
                      {b.salesCount}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold">فاتورة</p>
                  </div>
                  <div className="rounded-xl bg-brand-light p-2.5 text-center">
                    <Banknote className="size-4 text-emerald-500 mx-auto" />
                    <p className="text-[13px] font-extrabold text-brand-green mt-1" dir="ltr">
                      {b.salesTotal.toLocaleString("ar-EG", { maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold">مبيعات</p>
                  </div>
                  <div className="rounded-xl bg-brand-light p-2.5 text-center">
                    <Clock className="size-4 text-brand-blue mx-auto" />
                    <p className="text-[15px] font-extrabold text-brand-navy mt-0.5">
                      {b.openShifts > 0 ? b.openShifts : b.shiftsCount}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold">
                      {b.openShifts > 0 ? "وردية مفتوحة" : "وردية"}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(b)}
                    className="flex-1 rounded-lg font-bold h-9"
                  >
                    <Pencil className="size-3.5 ml-1" />
                    تعديل
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleActive(b)}
                    className="flex-1 rounded-lg font-bold h-9"
                  >
                    <Power className="size-3.5 ml-1" />
                    {b.isActive ? "تعطيل" : "تفعيل"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => remove(b)}
                    className="rounded-lg font-bold h-9 text-red-600 border-red-200 hover:bg-red-50"
                    aria-label={`حذف ${b.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Shifts history */}
      {shifts.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-100">
            <h2 className="font-extrabold text-brand-navy flex items-center gap-2">
              <Clock className="size-5 text-brand-blue" />
              سجل ورديات الكاشير
            </h2>
            <p className="text-[12px] text-slate-400 mt-0.5">
              آخر 30 وردية — مع فروقات الصندوق عند الإغلاق
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[12px]">
                  <th className="text-start font-bold px-4 py-2.5">الفرع</th>
                  <th className="text-start font-bold px-4 py-2.5">الكاشير</th>
                  <th className="text-start font-bold px-4 py-2.5">الفترة</th>
                  <th className="text-center font-bold px-4 py-2.5">فواتير</th>
                  <th className="text-center font-bold px-4 py-2.5">المبيعات</th>
                  <th className="text-center font-bold px-4 py-2.5">المتوقع</th>
                  <th className="text-center font-bold px-4 py-2.5">المحصور</th>
                  <th className="text-center font-bold px-4 py-2.5">الفرق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {shifts.map((sh) => (
                  <tr key={sh.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-bold text-brand-navy">{sh.branchName}</td>
                    <td className="px-4 py-2.5">{sh.cashier}</td>
                    <td className="px-4 py-2.5 text-[12px] text-slate-500" dir="auto">
                      {formatDateTime(sh.openedAt)}
                      {sh.closedAt ? ` → ${formatDate(sh.closedAt)}` : " (مفتوحة)"}
                    </td>
                    <td className="px-4 py-2.5 text-center font-bold">{sh.salesCount}</td>
                    <td className="px-4 py-2.5 text-center" dir="ltr">
                      {formatMoney(sh.salesTotal, currency)}
                    </td>
                    <td className="px-4 py-2.5 text-center" dir="ltr">
                      {sh.expectedCash != null ? sh.expectedCash.toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center" dir="ltr">
                      {sh.countedCash != null ? sh.countedCash.toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {sh.cashDifference == null ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <span
                          className={cn(
                            "font-extrabold font-mono",
                            Math.abs(sh.cashDifference) < 0.01
                              ? "text-emerald-600"
                              : sh.cashDifference > 0
                                ? "text-amber-600"
                                : "text-red-500"
                          )}
                          dir="ltr"
                        >
                          {sh.cashDifference > 0 ? "+" : ""}
                          {sh.cashDifference.toFixed(2)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-brand-navy">
              {editingId ? "تعديل الفرع" : "إنشاء فرع جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">اسم الفرع *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="فرع العليا"
                  disabled={!!editingId && false}
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">رمز الفرع *</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="RYD-01"
                  disabled={!!editingId}
                  className="h-11 rounded-xl border-slate-200 font-mono"
                  dir="ltr"
                />
                {editingId && (
                  <p className="text-[11px] text-slate-400">لا يمكن تغيير الرمز بعد الإنشاء</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">نوع الفرع</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="store">متجر</SelectItem>
                  <SelectItem value="warehouse">مستودع</SelectItem>
                  <SelectItem value="kiosk">كشك / منفذ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">الهاتف</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="0500000000"
                  className="h-11 rounded-xl border-slate-200"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">المدينة</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="الرياض"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">العنوان</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="شارع الملك فهد..."
                className="h-11 rounded-xl border-slate-200"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3.5 py-2.5">
              <div>
                <p className="font-bold text-slate-700 text-[13px]">الفرع نشط</p>
                <p className="text-[11px] text-slate-400">
                  الفروع المعطّلة لا تظهر في نقطة البيع
                </p>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm({ ...form, isActive: v })}
              />
            </div>

            <Button
              onClick={submit}
              disabled={busy || form.name.trim().length < 2 || form.code.trim().length < 2}
              className="w-full min-h-12 rounded-xl font-extrabold text-white bg-gradient-to-l from-brand-blue to-brand-green"
            >
              {busy ? (
                <Loader2 className="size-5 animate-spin" />
              ) : editingId ? (
                "حفظ التعديلات"
              ) : (
                "إنشاء الفرع"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
