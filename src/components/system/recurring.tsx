"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlarmClock,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Power,
  ReceiptText,
  Repeat,
  Search,
  Trash2,
  Zap,
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
  Contact,
  Product,
  RecurringTemplateRecord,
  Session,
} from "./types";
import {
  formatDate,
  formatMoney,
  FREQUENCY_LABELS,
  hasPerm,
  PAYMENT_METHOD_LABELS,
} from "./types";

// ============ ثوابت مساعدة ============

const FREQUENCY_KEYS = ["weekly", "monthly", "quarterly", "yearly"] as const;
const PAYMENT_METHOD_KEYS = ["cash", "card", "transfer", "credit"] as const;

type NewRecurringLine = {
  productId: string;
  name: string;
  qty: string;
  unitPrice: string;
};

function emptyLine(): NewRecurringLine {
  return { productId: "", name: "", qty: "1", unitPrice: "" };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const emptyTemplateForm = {
  contactId: "none",
  frequency: "monthly",
  nextRunAt: "",
  taxRate: "15",
  discount: "",
  paymentMethod: "cash",
  note: "",
};

type RecurringStats = { active: number; totalGenerated: number; dueNow: number };

const emptyStats: RecurringStats = { active: 0, totalGenerated: 0, dueNow: 0 };

// ============ المكوّن الرئيسي ============

export function RecurringView({
  currency,
  session,
}: {
  currency: string;
  session: Session;
}) {
  const { toast } = useToast();
  const canWrite = hasPerm(session.role, "sales:write");

  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<RecurringTemplateRecord[]>([]);
  const [stats, setStats] = useState<RecurringStats>(emptyStats);
  const [q, setQ] = useState("");

  // حوار إنشاء / تعديل قالب
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringTemplateRecord | null>(null);
  const [form, setForm] = useState({ ...emptyTemplateForm });
  const [lines, setLines] = useState<NewRecurringLine[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);

  // توليد فوري / حذف
  const [runningId, setRunningId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecurringTemplateRecord | null>(null);

  const load = useCallback(() => {
    fetch("/api/recurring")
      .then((r) => r.json())
      .then((d) => {
        setTemplates(d.templates ?? []);
        if (d.stats) setStats(d.stats as RecurringStats);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setEditing(null);
    setForm({ ...emptyTemplateForm });
    setLines([emptyLine()]);
    setDialogOpen(true);
    fetch("/api/products?pageSize=100&isActive=true")
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []))
      .catch(() => {});
    fetch("/api/contacts?type=customer&pageSize=100")
      .then((r) => r.json())
      .then((d) => setCustomers(d.contacts ?? []))
      .catch(() => {});
  }

  function openEdit(t: RecurringTemplateRecord) {
    setEditing(t);
    setForm({
      contactId: t.contactId ?? "none",
      frequency: t.frequency,
      nextRunAt: t.nextRunAt?.slice(0, 10) ?? "",
      taxRate: String(t.taxRate ?? 15),
      discount: String(t.discount ?? ""),
      paymentMethod: t.paymentMethod ?? "cash",
      note: t.note ?? "",
    });
    setLines(
      (t.items ?? []).map((it) => ({
        productId: it.productId ?? "manual",
        name: it.name,
        qty: String(it.qty),
        unitPrice: String(it.unitPrice),
      }))
    );
    setDialogOpen(true);
    fetch("/api/products?pageSize=100&isActive=true")
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []))
      .catch(() => {});
    fetch("/api/contacts?type=customer&pageSize=100")
      .then((r) => r.json())
      .then((d) => setCustomers(d.contacts ?? []))
      .catch(() => {});
  }

  function updateLine(i: number, patch: Partial<NewRecurringLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  /** اختيار منتج في سطر — يعبّئ الاسم والسعر من سعر البيع */
  function pickProduct(i: number, v: string) {
    if (v === "manual") {
      updateLine(i, { productId: "manual" });
      return;
    }
    const p = products.find((x) => x.id === v);
    updateLine(i, {
      productId: v,
      name: p?.name ?? "",
      unitPrice: p ? String(p.salePrice) : "",
    });
  }

  // إجماليات حية
  const subtotal = round2(
    lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0)
  );
  const discountVal = Math.min(Math.max(Number(form.discount) || 0, 0), subtotal);
  const net = round2(subtotal - discountVal);
  const taxRateVal = Math.min(100, Math.max(0, Number(form.taxRate) || 0));
  const taxVal = round2((net * taxRateVal) / 100);
  const grandTotal = round2(net + taxVal);

  async function save() {
    const items = lines
      .filter((l) => l.name.trim() && Number(l.qty) > 0)
      .map((l) => ({
        productId: l.productId && l.productId !== "manual" ? l.productId : undefined,
        name: l.name.trim(),
        qty: Number(l.qty) || 1,
        unitPrice: Number(l.unitPrice) || 0,
      }));
    if (items.length === 0) {
      toast({
        variant: "destructive",
        title: "أضف بنداً واحداً على الأقل",
        description: "اختر صنفاً أو أدخل اسماً يدوياً مع كمية أكبر من صفر",
      });
      return;
    }
    if (!form.nextRunAt) {
      toast({ variant: "destructive", title: "تاريخ التشغيل القادم مطلوب" });
      return;
    }
    setSaving(true);
    try {
      const template = {
        contactId: form.contactId === "none" ? undefined : form.contactId,
        frequency: form.frequency,
        nextRunAt: form.nextRunAt,
        taxRate: taxRateVal,
        discount: discountVal,
        paymentMethod: form.paymentMethod,
        note: form.note.trim() || undefined,
        items,
      };
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing ? { action: "update", id: editing.id, template } : { action: "create", template }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل حفظ القالب",
          description: data.error,
        });
        return;
      }
      toast({
        title: editing ? "تم تحديث القالب المتكرر" : "تم إنشاء القالب المتكرر",
        description: `${FREQUENCY_LABELS[form.frequency] ?? form.frequency} — ${
          form.contactId === "none"
            ? "عميل نقدي"
            : customers.find((c) => c.id === form.contactId)?.name ?? "عميل"
        }`,
      });
      setDialogOpen(false);
      load();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setSaving(false);
    }
  }

  /** توليد فاتورة الآن من القالب */
  async function runNow(t: RecurringTemplateRecord) {
    setRunningId(t.id);
    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", id: t.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل توليد الفاتورة",
          description: data.error,
        });
        return;
      }
      toast({
        title: `تم توليد الفاتورة ${data.invoiceNo ?? ""} بنجاح`,
        description: data.sale?.total != null
          ? `الإجمالي ${formatMoney(data.sale.total, currency)} — خُصمت الكميات ورُحِّلت القيود ووُلِّد QR زتكا`
          : "خُصمت الكميات ورُحِّلت القيود ووُلِّد QR زتكا",
      });
      load();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setRunningId(null);
    }
  }

  /** إيقاف / تفعيل القالب */
  async function toggle(t: RecurringTemplateRecord) {
    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", id: t.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل تحديث حالة القالب",
          description: data.error,
        });
        return;
      }
      toast({
        title: t.isActive ? "تم إيقاف القالب" : "تم تفعيل القالب",
        description: t.contactName ?? "عميل نقدي",
      });
      load();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    }
  }

  async function remove(t: RecurringTemplateRecord) {
    setDeleteTarget(null);
    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: t.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل حذف القالب",
          description: data.error,
        });
        return;
      }
      toast({ title: "تم حذف القالب المتكرر", description: t.contactName ?? "عميل نقدي" });
      load();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    }
  }

  const filteredTemplates = templates.filter((t) => {
    if (!q.trim()) return true;
    const needle = q.trim();
    return (t.contactName ?? "عميل نقدي").includes(needle);
  });

  const nowTs = Date.now();
  const isDue = (t: RecurringTemplateRecord) =>
    t.isActive && new Date(t.nextRunAt).getTime() <= nowTs;

  return (
    <div className="p-4 sm:p-5 space-y-4">
      {/* الترويسة */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-navy flex items-center gap-2">
            <Repeat className="size-6 text-brand-blue" />
            الفواتير المتكررة
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            قوالب فوترة دورية تُولّد الفواتير آلياً — بخصم المخزون وترحيل القيود وQR زتكا
          </p>
        </div>
        <div className="flex-1" />
        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث باسم العميل..."
            className="w-full ps-10 h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-brand-blue"
          />
        </div>
        {canWrite && (
          <Button
            onClick={openNew}
            className="h-10 rounded-xl font-extrabold gap-1.5 bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
          >
            <Plus className="size-4" />
            قالب متكرر جديد
          </Button>
        )}
      </div>

      {/* بطاقات الإحصاء */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.05)] flex items-center gap-3">
          <div className="size-11 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
            <CheckCircle2 className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] text-slate-500 font-bold">قوالب نشطة</p>
            <p className="text-[15px] font-extrabold text-brand-navy">
              {stats.active.toLocaleString("ar-EG")}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.05)] flex items-center gap-3">
          <div className="size-11 rounded-xl bg-blue-50 text-brand-blue flex items-center justify-center shrink-0">
            <ReceiptText className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] text-slate-500 font-bold">إجمالي الفواتير المولّدة</p>
            <p className="text-[15px] font-extrabold text-brand-navy">
              {stats.totalGenerated.toLocaleString("ar-EG")}
            </p>
          </div>
        </div>
        <div
          className={cn(
            "rounded-2xl border p-4 shadow-[0_4px_16px_rgba(15,23,42,0.05)] flex items-center gap-3",
            stats.dueNow > 0
              ? "bg-amber-50/70 border-amber-200"
              : "bg-white border-slate-100"
          )}
        >
          <div
            className={cn(
              "size-11 rounded-xl flex items-center justify-center shrink-0",
              stats.dueNow > 0 ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-400"
            )}
          >
            <AlarmClock className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-slate-500">مستحقة الآن</p>
            <p
              className={cn(
                "text-[15px] font-extrabold",
                stats.dueNow > 0 ? "text-amber-600" : "text-brand-navy"
              )}
            >
              {stats.dueNow.toLocaleString("ar-EG")}
            </p>
          </div>
        </div>
      </div>

      {/* قائمة القوالب (بطاقات) */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-100 flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="size-8 animate-spin" />
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
          <Repeat className="size-14" />
          <p className="text-slate-400 text-sm">
            {q.trim() ? "لا توجد نتائج مطابقة" : "لا توجد قوالب متكررة بعد"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filteredTemplates.map((t) => (
            <div
              key={t.id}
              className={cn(
                "bg-white rounded-2xl border p-4 space-y-3 shadow-[0_4px_16px_rgba(15,23,42,0.05)]",
                isDue(t) ? "border-amber-200" : "border-slate-100",
                !t.isActive && "bg-slate-50/60"
              )}
            >
              {/* رأس البطاقة */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="size-10 rounded-xl bg-gradient-to-br from-brand-blue to-brand-teal text-white flex items-center justify-center shrink-0">
                  <Repeat className="size-5" />
                </div>
                <p className="font-extrabold text-brand-navy text-[14.5px] truncate">
                  {t.contactName ?? "عميل نقدي"}
                </p>
                <div className="flex-1" />
                <Badge
                  variant="secondary"
                  className="rounded-full px-2.5 py-0.5 text-[11.5px] font-bold border-transparent bg-blue-50 text-brand-blue"
                >
                  {FREQUENCY_LABELS[t.frequency] ?? t.frequency}
                </Badge>
                {t.isActive ? (
                  <Badge
                    variant="secondary"
                    className="rounded-full px-2.5 py-0.5 text-[11.5px] font-bold border-transparent bg-emerald-50 text-emerald-600"
                  >
                    نشطة
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="rounded-full px-2.5 py-0.5 text-[11.5px] font-bold border-transparent bg-slate-100 text-slate-400"
                  >
                    متوقفة
                  </Badge>
                )}
                {isDue(t) && (
                  <Badge
                    variant="secondary"
                    className="rounded-full px-2.5 py-0.5 text-[11.5px] font-bold border-transparent bg-amber-50 text-amber-600 gap-1"
                  >
                    <AlarmClock className="size-3" />
                    مستحقة الآن
                  </Badge>
                )}
              </div>

              {/* البنود */}
              <div className="rounded-xl border border-slate-100 bg-brand-light/60 px-3.5 py-2.5 space-y-1">
                {t.items.map((it, i) => (
                  <p key={i} className="text-[12.5px] text-slate-600 flex items-baseline gap-1.5">
                    <span className="font-bold text-brand-navy">{it.name}</span>
                    <span className="text-slate-400">× {it.qty}</span>
                    <span className="flex-1 border-b border-dotted border-slate-200" />
                    <span dir="ltr" className="text-slate-500 font-bold">
                      {formatMoney(it.unitPrice, currency)}
                    </span>
                  </p>
                ))}
                <div className="flex justify-between text-[12.5px] pt-1.5 border-t border-dashed border-slate-200">
                  <span className="text-slate-500">
                    الإجمالي قبل الضريبة (خصم {formatMoney(t.discount, currency)})
                  </span>
                  <span className="font-extrabold text-brand-navy" dir="ltr">
                    {formatMoney(t.subtotal, currency)}
                  </span>
                </div>
                <div className="flex justify-between text-[12.5px]">
                  <span className="text-slate-500">
                    الإجمالي التقديري مع الضريبة ({t.taxRate}%)
                  </span>
                  <span className="font-extrabold text-brand-green" dir="ltr">
                    {formatMoney(round2((t.subtotal - t.discount) * (1 + t.taxRate / 100)), currency)}
                  </span>
                </div>
              </div>

              {/* التواريخ */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-slate-400">
                <span className="flex items-center gap-1">
                  <CalendarClock className="size-3.5" />
                  التشغيل القادم: {formatDate(t.nextRunAt)}
                </span>
                <span>
                  آخر تشغيل: {t.lastRunAt ? formatDate(t.lastRunAt) : "—"}
                </span>
                <span>
                  وُلِّدت {t.generatedCount.toLocaleString("ar-EG")} فاتورة
                </span>
                <span>
                  الدفع: {PAYMENT_METHOD_LABELS[t.paymentMethod] ?? t.paymentMethod}
                </span>
              </div>

              {t.note && (
                <p className="text-[12px] text-slate-400 leading-relaxed">ملاحظة: {t.note}</p>
              )}

              {/* الإجراءات */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {canWrite && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => runNow(t)}
                      disabled={runningId === t.id}
                      className="rounded-lg font-extrabold gap-1.5 bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
                    >
                      {runningId === t.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Zap className="size-4" />
                      )}
                      توليد فاتورة الآن
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggle(t)}
                      className="rounded-lg font-bold gap-1.5 border-slate-200"
                    >
                      <Power className="size-4" />
                      {t.isActive ? "إيقاف" : "تفعيل"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(t)}
                      className="rounded-lg font-bold gap-1.5 border-slate-200 text-brand-blue hover:text-brand-blue hover:bg-blue-50/60"
                    >
                      <Pencil className="size-4" />
                      تعديل
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteTarget(t)}
                      className="rounded-lg font-bold gap-1.5 border-rose-200 text-rose-500 hover:text-rose-500 hover:bg-rose-50"
                    >
                      <Trash2 className="size-4" />
                      حذف
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* حوار إنشاء / تعديل قالب */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="sm:max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="text-brand-navy">
              {editing ? "تعديل القالب المتكرر" : "قالب فاتورة متكررة جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">العميل</Label>
                <Select
                  value={form.contactId}
                  onValueChange={(v) => setForm((f) => ({ ...f, contactId: v }))}
                >
                  <SelectTrigger className="w-full data-[size=default]:h-11 rounded-xl border-slate-200 font-bold text-brand-navy bg-white">
                    <SelectValue placeholder="اختر العميل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">عميل نقدي</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">التكرار *</Label>
                <Select
                  value={form.frequency}
                  onValueChange={(v) => setForm((f) => ({ ...f, frequency: v }))}
                >
                  <SelectTrigger className="w-full data-[size=default]:h-11 rounded-xl border-slate-200 font-bold text-brand-navy bg-white">
                    <SelectValue placeholder="اختر التكرار" />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_KEYS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {FREQUENCY_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">تاريخ التشغيل القادم *</Label>
                <Input
                  type="date"
                  value={form.nextRunAt}
                  onChange={(e) => setForm((f) => ({ ...f, nextRunAt: e.target.value }))}
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">طريقة الدفع</Label>
                <Select
                  value={form.paymentMethod}
                  onValueChange={(v) => setForm((f) => ({ ...f, paymentMethod: v }))}
                >
                  <SelectTrigger className="w-full data-[size=default]:h-11 rounded-xl border-slate-200 font-bold text-brand-navy bg-white">
                    <SelectValue placeholder="اختر الطريقة" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_KEYS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* محرر البنود */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-bold text-slate-700 text-[13px]">البنود</Label>
                <span className="text-[11px] text-slate-400">
                  اختر صنفاً أو أدخل بنداً يدوياً
                </span>
              </div>
              <div className="hidden sm:grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_4.5rem_6.5rem_2.25rem] gap-2 text-[11px] font-bold text-slate-400">
                <span>الصنف</span>
                <span>الاسم</span>
                <span>الكمية</span>
                <span>السعر</span>
                <span />
              </div>
              {lines.map((line, i) => (
                <div
                  key={i}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_4.5rem_6.5rem_2.25rem] items-center"
                >
                  <div className="col-span-2 sm:col-span-1">
                    <Select
                      value={line.productId}
                      onValueChange={(v) => pickProduct(i, v)}
                    >
                      <SelectTrigger
                        aria-label={`صنف البند ${i + 1}`}
                        className="w-full data-[size=default]:h-10 rounded-xl border-slate-200 text-[13px] bg-white"
                      >
                        <SelectValue placeholder="اختر صنفاً" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">بند يدوي</SelectItem>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    placeholder="اسم الصنف"
                    aria-label={`اسم البند ${i + 1}`}
                    value={line.name}
                    onChange={(e) => updateLine(i, { name: e.target.value })}
                    className="h-10 rounded-xl border-slate-200 col-span-2 sm:col-span-1"
                  />
                  <Input
                    type="number"
                    min="1"
                    dir="ltr"
                    placeholder="1"
                    aria-label={`كمية البند ${i + 1}`}
                    value={line.qty}
                    onChange={(e) => updateLine(i, { qty: e.target.value })}
                    className="h-10 rounded-xl border-slate-200"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    dir="ltr"
                    placeholder="0.00"
                    aria-label={`سعر البند ${i + 1}`}
                    value={line.unitPrice}
                    onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                    className="h-10 rounded-xl border-slate-200"
                  />
                  <button
                    onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                    disabled={lines.length <= 1}
                    className="size-9 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors disabled:opacity-30 disabled:pointer-events-none justify-self-end"
                    aria-label={`حذف البند ${i + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLines((ls) => [...ls, emptyLine()])}
                className="rounded-xl font-bold gap-1.5 border-dashed border-slate-300 text-brand-blue hover:bg-blue-50 hover:text-brand-blue"
              >
                <Plus className="size-4" />
                إضافة بند
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">نسبة الضريبة %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={form.taxRate}
                  onChange={(e) => setForm((f) => ({ ...f, taxRate: e.target.value }))}
                  placeholder="15"
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">الخصم</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.discount}
                  onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))}
                  placeholder="0.00"
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">ملاحظة</Label>
              <Textarea
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="ملاحظة تظهر على الفواتير المولّدة (اختياري)..."
                className="rounded-xl min-h-16 text-[13px]"
              />
            </div>

            {/* الإجماليات الحية */}
            <div className="rounded-xl bg-brand-light border border-slate-100 p-3 space-y-1.5 text-[13px]">
              <div className="flex justify-between">
                <span className="text-slate-500">المجموع قبل الخصم</span>
                <span className="font-bold text-brand-navy" dir="ltr">
                  {formatMoney(subtotal, currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الخصم</span>
                <span className="font-bold text-rose-500" dir="ltr">
                  - {formatMoney(discountVal, currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">
                  ضريبة القيمة المضافة ({taxRateVal}%)
                </span>
                <span className="font-bold text-brand-navy" dir="ltr">
                  {formatMoney(taxVal, currency)}
                </span>
              </div>
              <div className="flex justify-between font-extrabold text-brand-navy pt-1.5 border-t border-dashed border-slate-200">
                <span>الإجمالي التقديري للفاتورة</span>
                <span className="text-brand-green" dir="ltr">
                  {formatMoney(grandTotal, currency)}
                </span>
              </div>
            </div>

            <Button
              onClick={save}
              disabled={saving}
              className="w-full min-h-11 rounded-xl font-extrabold bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
            >
              {saving ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  <Plus className="size-4" />
                  {editing ? "حفظ التعديلات" : "إنشاء القالب"}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* تأكيد حذف قالب */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent dir="rtl" className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف القالب المتكرر؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف القالب الخاص بـ «{deleteTarget?.contactName ?? "عميل نقدي"}»
              نهائياً. الفواتير المولّدة مسبقاً لا تتأثر. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:justify-start">
            <AlertDialogAction
              onClick={() => deleteTarget && remove(deleteTarget)}
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
