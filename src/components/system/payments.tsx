"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  Plus,
  Receipt,
  Scale,
  Search,
  Trash2,
  TrendingUp,
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
import type { Contact, PaymentRecord, Session } from "./types";
import {
  formatDate,
  formatMoney,
  hasPerm,
  PAYMENT_DIRECTION_LABELS,
  PAYMENT_METHOD_LABELS,
} from "./types";

// ============ ثوابت مساعدة ============

/** طرق الدفع المتاحة للسندات — الآجل لا يصلح لسند نقدي فعلي */
const VOUCHER_METHODS = ["cash", "card", "transfer"] as const;

const DIRECTION_FILTERS = [
  { value: "", label: "الكل" },
  { value: "receipt", label: "سندات القبض" },
  { value: "payment", label: "سندات الصرف" },
];

/** مستند قابل للربط بالسند: فاتورة بيع أو شراء غير مسددة */
type LinkableDoc = {
  id: string;
  no: string;
  contactId: string | null;
  contactName: string;
  due: number;
};

const emptyForm = {
  direction: "receipt" as "receipt" | "payment",
  contactId: "none",
  saleId: "none",
  purchaseId: "none",
  amount: "",
  method: "cash",
  date: "",
  note: "",
};

function todayStr(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** نص المرجع المرتبط بالسند داخل الجدول */
function referenceLabel(p: PaymentRecord): { text: string; no: string | null } {
  if (p.saleInvoiceNo) return { text: "فاتورة", no: p.saleInvoiceNo };
  if (p.purchaseRefNo) return { text: "شراء", no: p.purchaseRefNo };
  return { text: p.direction === "receipt" ? "قبض حرّ" : "صرف حرّ", no: null };
}

function DirectionBadge({ direction }: { direction: string }) {
  const isReceipt = direction === "receipt";
  const Icon = isReceipt ? ArrowDownToLine : ArrowUpFromLine;
  return (
    <Badge
      variant="secondary"
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[11.5px] font-bold border-transparent gap-1",
        isReceipt ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"
      )}
    >
      <Icon className="size-3" />
      {PAYMENT_DIRECTION_LABELS[direction] ?? direction}
    </Badge>
  );
}

// ============ المكوّن الرئيسي ============

export function PaymentsView({
  session,
  currency,
  onDataChange,
}: {
  session: Session;
  currency: string;
  onDataChange: () => void;
}) {
  const { toast } = useToast();
  const canCreate = hasPerm(session.role, "sales:write");

  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [direction, setDirection] = useState("");

  // بطاقات الإحصاء — من fetch واحد
  const [stats, setStats] = useState({ receipt: 0, payment: 0 });

  // حوار السند الجديد
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm, date: todayStr() });
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [suppliers, setSuppliers] = useState<Contact[]>([]);
  const [linkableSales, setLinkableSales] = useState<LinkableDoc[]>([]);
  const [linkablePurchases, setLinkablePurchases] = useState<LinkableDoc[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<PaymentRecord | null>(null);

  function load() {
    const params = new URLSearchParams({
      q,
      direction,
      page: String(page),
      pageSize: "12",
    });
    fetch(`/api/payments?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setPayments(d.payments ?? []);
        setTotal(d.total ?? 0);
        setPageCount(d.pageCount ?? 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  /** إحصاءات القبض والصرف من طلب واحد */
  function loadStats() {
    fetch("/api/payments?pageSize=100")
      .then((r) => r.json())
      .then((d) => {
        const list: PaymentRecord[] = d.payments ?? [];
        setStats({
          receipt: round2(
            list
              .filter((p) => p.direction === "receipt")
              .reduce((s, p) => s + (p.amount || 0), 0)
          ),
          payment: round2(
            list
              .filter((p) => p.direction === "payment")
              .reduce((s, p) => s + (p.amount || 0), 0)
          ),
        });
      })
      .catch(() => {});
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      load();
    }, 250);
    return () => clearTimeout(t);
  }, [q, direction, page]);

  useEffect(() => {
    loadStats();
  }, []);

  /** فتح حوار السند الجديد وتحميل قوائم الجهات والمستندات غير المسددة */
  function openNew() {
    setForm({ ...emptyForm, date: todayStr() });
    setDialogOpen(true);

    fetch("/api/contacts?type=customer&pageSize=100")
      .then((r) => r.json())
      .then((d) => setCustomers(d.contacts ?? []))
      .catch(() => {});
    fetch("/api/contacts?type=supplier&pageSize=100")
      .then((r) => r.json())
      .then((d) => setSuppliers(d.contacts ?? []))
      .catch(() => {});

    // الفواتير غير المسددة (kind=invoice و paid<total)
    fetch("/api/sales?status=final&pageSize=100")
      .then((r) => r.json())
      .then((d) => {
        const sales: {
          id: string;
          invoiceNo: string;
          contactId: string | null;
          contact?: { name: string } | null;
          kind?: string;
          total: number;
          paid: number;
        }[] = d.sales ?? [];
        setLinkableSales(
          sales
            .filter((s) => (s.kind ?? "invoice") === "invoice" && s.paid < s.total)
            .map((s) => ({
              id: s.id,
              no: s.invoiceNo,
              contactId: s.contactId,
              contactName: s.contact?.name ?? "عميل نقدي",
              due: round2(s.total - s.paid),
            }))
        );
      })
      .catch(() => {});

    // فواتير الشراء غير المسددة
    fetch("/api/purchases?pageSize=100")
      .then((r) => r.json())
      .then((d) => {
        const purchases: {
          id: string;
          refNo: string;
          contactId: string | null;
          contact?: { name: string } | null;
          kind?: string;
          total: number;
          paid: number;
        }[] = d.purchases ?? [];
        setLinkablePurchases(
          purchases
            .filter((p) => (p.kind ?? "invoice") === "invoice" && p.paid < p.total)
            .map((p) => ({
              id: p.id,
              no: p.refNo,
              contactId: p.contactId,
              contactName: p.contact?.name ?? "بدون مورد",
              due: round2(p.total - p.paid),
            }))
        );
      })
      .catch(() => {});
  }

  /** تبديل نوع السند — يعيد ضبط الطرف والمستند لأن القوائم تختلف */
  function switchDirection(dir: "receipt" | "payment") {
    setForm((f) => ({
      ...f,
      direction: dir,
      contactId: "none",
      saleId: "none",
      purchaseId: "none",
    }));
  }

  /** اختيار مستند مرتبط: يملأ المبلغ بالمتبقي ويجعل الطرف يتبع المستند */
  function selectDoc(v: string) {
    const isReceipt = form.direction === "receipt";
    const doc = (isReceipt ? linkableSales : linkablePurchases).find(
      (d) => d.id === v
    );
    setForm((f) => ({
      ...f,
      saleId: isReceipt ? v : "none",
      purchaseId: isReceipt ? "none" : v,
      contactId: doc?.contactId ?? f.contactId,
      amount: doc ? String(doc.due) : f.amount,
    }));
  }

  async function save() {
    const amount = round2(Number(form.amount) || 0);
    if (amount <= 0) {
      toast({ variant: "destructive", title: "أدخل مبلغاً صحيحاً" });
      return;
    }
    if (!form.date) {
      toast({ variant: "destructive", title: "التاريخ مطلوب" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: form.direction,
          contactId: form.contactId === "none" ? undefined : form.contactId,
          saleId:
            form.direction === "receipt" && form.saleId !== "none"
              ? form.saleId
              : undefined,
          purchaseId:
            form.direction === "payment" && form.purchaseId !== "none"
              ? form.purchaseId
              : undefined,
          amount,
          method: form.method,
          date: form.date,
          note: form.note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل تسجيل السند",
          description: data.error,
        });
        return;
      }
      toast({
        title: `تم تسجيل السند ${data.voucherNo ?? ""}`.trim(),
        description: `${formatMoney(amount, currency)} — ${
          PAYMENT_DIRECTION_LABELS[form.direction] ?? form.direction
        }`,
      });
      setDialogOpen(false);
      load();
      loadStats();
      onDataChange();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: PaymentRecord) {
    setDeleteTarget(null);
    try {
      const res = await fetch(`/api/payments/${p.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل حذف السند",
          description: data.error,
        });
        return;
      }
      toast({ title: "تم حذف السند", description: p.voucherNo });
      load();
      loadStats();
      onDataChange();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    }
  }

  const isReceipt = form.direction === "receipt";
  const contactOptions = isReceipt ? customers : suppliers;
  const docOptions = isReceipt ? linkableSales : linkablePurchases;
  const net = round2(stats.receipt - stats.payment);

  return (
    <div className="p-4 sm:p-5 space-y-4">
      {/* الترويسة والفلاتر */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-navy flex items-center gap-2">
            <Receipt className="size-6 text-brand-blue" />
            المدفوعات والسندات
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            سندات القبض والصرف مع ترحيل محاسبي تلقائي
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
            placeholder="بحث برقم السند أو الطرف..."
            className="w-full ps-10 h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-brand-blue"
          />
        </div>
        <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1">
          {DIRECTION_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => {
                setDirection(f.value);
                setPage(1);
              }}
              className={cn(
                "h-8 px-3 rounded-lg text-[12.5px] font-bold transition-colors",
                direction === f.value
                  ? "bg-brand-light text-brand-navy"
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {canCreate && (
          <Button
            onClick={openNew}
            className="h-10 rounded-xl font-extrabold gap-1.5 bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
          >
            <Plus className="size-4" />
            سند جديد
          </Button>
        )}
      </div>

      {/* بطاقات الإحصاء */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.05)] flex items-center gap-3">
          <div className="size-11 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
            <TrendingUp className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] text-slate-500 font-bold">إجمالي المقبوضات</p>
            <p className="text-[15px] font-extrabold text-brand-navy truncate" dir="ltr">
              {formatMoney(stats.receipt, currency)}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.05)] flex items-center gap-3">
          <div className="size-11 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
            <ArrowDownRight className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] text-slate-500 font-bold">إجمالي المدفوعات</p>
            <p className="text-[15px] font-extrabold text-brand-navy truncate" dir="ltr">
              {formatMoney(stats.payment, currency)}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.05)] flex items-center gap-3">
          <div className="size-11 rounded-xl bg-blue-50 text-brand-blue flex items-center justify-center shrink-0">
            <Scale className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] text-slate-500 font-bold">صافي الحركة النقدية</p>
            <p
              className={cn(
                "text-[15px] font-extrabold truncate",
                net >= 0 ? "text-brand-navy" : "text-rose-500"
              )}
              dir="ltr"
            >
              {formatMoney(net, currency)}
            </p>
          </div>
        </div>
      </div>

      {/* جدول السندات */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="size-8 animate-spin" />
          </div>
        ) : payments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
            <Receipt className="size-14" />
            <p className="text-slate-400 text-sm">لا توجد سندات مسجلة</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-brand-light text-slate-500 text-[12px]">
                    <th className="text-start font-bold px-4 py-3">رقم السند</th>
                    <th className="text-start font-bold px-4 py-3">النوع</th>
                    <th className="text-start font-bold px-4 py-3">الطرف</th>
                    <th className="text-start font-bold px-4 py-3">المرجع</th>
                    <th className="text-start font-bold px-4 py-3">المبلغ</th>
                    <th className="text-start font-bold px-4 py-3">الطريقة</th>
                    <th className="text-start font-bold px-4 py-3">التاريخ</th>
                    <th className="text-start font-bold px-4 py-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const ref = referenceLabel(p);
                    return (
                      <tr
                        key={p.id}
                        className="border-t border-slate-100 hover:bg-blue-50/40 transition-colors"
                      >
                        <td
                          className="px-4 py-3 font-mono font-bold text-brand-blue whitespace-nowrap"
                          dir="ltr"
                        >
                          {p.voucherNo}
                        </td>
                        <td className="px-4 py-3">
                          <DirectionBadge direction={p.direction} />
                        </td>
                        <td className="px-4 py-3 font-bold text-brand-navy whitespace-nowrap">
                          {p.contactName ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {ref.no ? (
                            <>
                              {ref.text}{" "}
                              <span className="font-bold text-brand-navy" dir="ltr">
                                {ref.no}
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-400">{ref.text}</span>
                          )}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3 font-extrabold whitespace-nowrap",
                            p.direction === "receipt"
                              ? "text-emerald-600"
                              : "text-rose-500"
                          )}
                          dir="ltr"
                        >
                          {formatMoney(p.amount, currency)}
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {formatDate(p.date)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setDeleteTarget(p)}
                            className="size-8 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors"
                            aria-label={`حذف السند ${p.voucherNo}`}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <p className="text-[12px] text-slate-400">
                {total} سند — صفحة {page} من {Math.max(pageCount, 1)}
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

      {/* حوار سند جديد */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="sm:max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="text-brand-navy">تسجيل سند جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* اختيار النوع */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => switchDirection("receipt")}
                aria-pressed={isReceipt}
                className={cn(
                  "rounded-xl border-2 p-3.5 flex flex-col items-center gap-2 transition-all min-h-[76px] justify-center",
                  isReceipt
                    ? "border-emerald-400 bg-emerald-50/70 text-emerald-700 shadow-sm"
                    : "border-slate-200 bg-white text-slate-400 hover:border-emerald-200"
                )}
              >
                <ArrowDownToLine className="size-6" />
                <span className="text-[13px] font-extrabold">سند قبض من عميل</span>
              </button>
              <button
                type="button"
                onClick={() => switchDirection("payment")}
                aria-pressed={!isReceipt}
                className={cn(
                  "rounded-xl border-2 p-3.5 flex flex-col items-center gap-2 transition-all min-h-[76px] justify-center",
                  !isReceipt
                    ? "border-rose-400 bg-rose-50/70 text-rose-600 shadow-sm"
                    : "border-slate-200 bg-white text-slate-400 hover:border-rose-200"
                )}
              >
                <ArrowUpFromLine className="size-6" />
                <span className="text-[13px] font-extrabold">سند صرف لمورد</span>
              </button>
            </div>

            {/* الطرف */}
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">
                {isReceipt ? "العميل" : "المورد"}
              </Label>
              <Select
                value={form.contactId}
                onValueChange={(v) => setForm((f) => ({ ...f, contactId: v }))}
              >
                <SelectTrigger className="w-full data-[size=default]:h-11 rounded-xl border-slate-200 font-bold text-brand-navy bg-white">
                  <SelectValue placeholder="اختر الجهة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {isReceipt ? "بدون عميل (قبض حرّ)" : "بدون مورد (صرف حرّ)"}
                  </SelectItem>
                  {contactOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* المستند المرتبط */}
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">
                المستند المرتبط{" "}
                <span className="text-slate-400 font-normal">(اختياري)</span>
              </Label>
              <Select
                value={isReceipt ? form.saleId : form.purchaseId}
                onValueChange={selectDoc}
              >
                <SelectTrigger className="w-full data-[size=default]:h-11 rounded-xl border-slate-200 font-bold text-brand-navy bg-white">
                  <SelectValue placeholder="بدون مستند" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون مستند</SelectItem>
                  {docOptions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {isReceipt ? "فاتورة" : "شراء"} {d.no} — {d.contactName}{" "}
                      (متبقي: {d.due.toLocaleString("ar-EG", { minimumFractionDigits: 2 })})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-400">
                عند اختيار مستند يُملأ المبلغ بالمتبقي وتتبع الجهة المستند تلقائياً
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">المبلغ *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  placeholder="0.00"
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">الطريقة *</Label>
                <Select
                  value={form.method}
                  onValueChange={(v) => setForm((f) => ({ ...f, method: v }))}
                >
                  <SelectTrigger className="w-full data-[size=default]:h-11 rounded-xl border-slate-200 font-bold text-brand-navy bg-white">
                    <SelectValue placeholder="اختر الطريقة" />
                  </SelectTrigger>
                  <SelectContent>
                    {VOUCHER_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">التاريخ *</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, date: e.target.value }))
                  }
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
                placeholder="بيان السند (اختياري)..."
                className="rounded-xl min-h-20 text-[13px]"
              />
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
                  تسجيل السند
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* تأكيد حذف السند */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent dir="rtl" className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف السند؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف السند «{deleteTarget?.voucherNo}» وعكس أثره المحاسبي.
              هل أنت متأكد؟
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
