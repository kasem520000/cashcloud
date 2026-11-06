"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Search,
  Trash2,
  Receipt,
  Loader2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { Expense } from "./types";
import { formatMoney, formatDate } from "./types";

const CATEGORIES = [
  "إيجار",
  "رواتب",
  "كهرباء وماء",
  "نقل وتوصيل",
  "صيانة",
  "تسويق وإعلان",
  "قرطاسية",
  "اتصالات وإنترنت",
  "ضيافة",
  "أخرى",
];

const emptyForm = { category: "إيجار", amount: "", note: "" };

export function ExpensesView({
  currency,
  onDataChange,
}: {
  currency: string;
  onDataChange: () => void;
}) {
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [total, setTotal] = useState(0);
  const [todayTotal, setTodayTotal] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  function load() {
    fetch(`/api/expenses?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d) => {
        setExpenses(d.expenses ?? []);
        setTotal(d.total ?? 0);
        setTodayTotal(d.todayTotal ?? 0);
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
  }, [q]);

  async function save() {
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      toast({ variant: "destructive", title: "أدخل مبلغاً صحيحاً" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "فشل الحفظ", description: data.error });
        return;
      }
      toast({ title: "تم تسجيل المصروف", description: formatMoney(amount, currency) });
      setDialogOpen(false);
      setForm({ ...emptyForm });
      load();
      onDataChange();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(e: Expense) {
    const res = await fetch(`/api/expenses/${e.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast({ variant: "destructive", title: "فشل الحذف" });
      return;
    }
    toast({ title: "تم حذف المصروف" });
    load();
    onDataChange();
  }

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-navy flex items-center gap-2">
            <Receipt className="size-6 text-brand-blue" />
            المصاريف
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">تسجيل ومتابعة مصاريف المتجر</p>
        </div>
        <div className="flex-1" />
        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث في المصاريف..."
            className="w-full ps-10 h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-brand-blue"
          />
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="h-10 rounded-xl bg-brand-green hover:bg-emerald-600 font-extrabold gap-1.5"
        >
          <Plus className="size-4" />
          مصروف جديد
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.05)] flex items-center gap-3">
          <div className="size-11 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
            <Wallet className="size-5" />
          </div>
          <div>
            <p className="text-lg font-extrabold text-brand-navy" dir="ltr">
              {formatMoney(total, currency)}
            </p>
            <p className="text-[12px] text-slate-500">إجمالي المصاريف</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.05)] flex items-center gap-3">
          <div className="size-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Receipt className="size-5" />
          </div>
          <div>
            <p className="text-lg font-extrabold text-brand-navy" dir="ltr">
              {formatMoney(todayTotal, currency)}
            </p>
            <p className="text-[12px] text-slate-500">مصاريف اليوم</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="size-8 animate-spin" />
          </div>
        ) : expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
            <Receipt className="size-14" />
            <p className="text-slate-400 text-sm">لا توجد مصاريف مسجلة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-brand-light text-slate-500 text-[12px]">
                  <th className="text-start font-bold px-4 py-3">المرجع</th>
                  <th className="text-start font-bold px-4 py-3">التاريخ</th>
                  <th className="text-start font-bold px-4 py-3">الفئة</th>
                  <th className="text-start font-bold px-4 py-3">المبلغ</th>
                  <th className="text-start font-bold px-4 py-3">ملاحظات</th>
                  <th className="text-start font-bold px-4 py-3">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr
                    key={e.id}
                    className="border-t border-slate-100 hover:bg-blue-50/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-bold text-brand-blue" dir="ltr">
                      {e.refNo}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {formatDate(e.date)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[12px] font-bold">
                        {e.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-extrabold text-rose-500" dir="ltr">
                      {formatMoney(e.amount, currency)}
                    </td>
                    <td className="px-4 py-3 text-slate-400 max-w-48 truncate">
                      {e.note ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => remove(e)}
                        className="size-8 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors"
                        aria-label={`حذف ${e.refNo}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-brand-navy">تسجيل مصروف جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">الفئة</Label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-bold text-brand-navy outline-none focus:border-brand-blue"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">المبلغ *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                dir="ltr"
                className="h-11 rounded-xl border-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">ملاحظات</Label>
              <Input
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="وصف اختياري للمصروف..."
                className="h-11 rounded-xl border-slate-200"
              />
            </div>
            <Button
              onClick={save}
              disabled={saving}
              className="w-full min-h-11 rounded-xl font-extrabold bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
            >
              {saving ? <Loader2 className="size-5 animate-spin" /> : "تسجيل المصروف"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
