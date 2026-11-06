"use client";

import { useEffect, useState } from "react";
import {
  ArrowRightCircle,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  Plus,
  Search,
  Send,
  Trash2,
  XCircle,
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
  DialogFooter,
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
  QuotationDetail,
  QuotationListRecord,
  Session,
} from "./types";
import {
  formatDate,
  formatMoney,
  hasPerm,
  QUOTATION_STATUS_LABELS,
} from "./types";

// ============ ثوابت مساعدة ============

const STATUS_FILTERS = [
  { value: "", label: "الكل" },
  { value: "draft", label: "مسودات" },
  { value: "sent", label: "مُرسلة" },
  { value: "accepted", label: "مقبولة" },
  { value: "rejected", label: "مرفوضة" },
  { value: "converted", label: "محوّلة" },
];

/** الحالات التي يجوز تحويل العرض منها إلى فاتورة */
const CONVERTIBLE = ["draft", "sent", "accepted"];

type NewQuoteLine = {
  productId: string;
  name: string;
  qty: string;
  unitPrice: string;
};

function emptyLine(): NewQuoteLine {
  return { productId: "", name: "", qty: "1", unitPrice: "" };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function StatusBadge({ status }: { status: string }) {
  const label = QUOTATION_STATUS_LABELS[status] ?? status;
  return (
    <Badge
      variant="secondary"
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[11.5px] font-bold border-transparent gap-1",
        status === "draft" && "bg-slate-100 text-slate-500",
        status === "sent" && "bg-blue-50 text-brand-blue",
        status === "accepted" && "bg-emerald-50 text-emerald-600",
        status === "rejected" && "bg-rose-50 text-rose-500",
        status === "converted" && "bg-amber-50 text-amber-600"
      )}
    >
      {status === "converted" && <CheckCircle2 className="size-3" />}
      {label}
    </Badge>
  );
}

// ============ المكوّن الرئيسي ============

export function QuotationsView({
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

  const [quotations, setQuotations] = useState<QuotationListRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  // حوار التفاصيل
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<QuotationDetail | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  // تحويل / حذف
  const [convertTarget, setConvertTarget] = useState<QuotationListRecord | null>(null);
  const [converting, setConverting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuotationListRecord | null>(null);

  // حوار عرض جديد
  const [newOpen, setNewOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [contactId, setContactId] = useState("none");
  const [validUntil, setValidUntil] = useState("");
  const [lines, setLines] = useState<NewQuoteLine[]>([emptyLine()]);
  const [discount, setDiscount] = useState("");
  const [taxRate, setTaxRate] = useState("15");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    const params = new URLSearchParams({
      q,
      status,
      page: String(page),
      pageSize: "12",
    });
    fetch(`/api/quotations?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setQuotations(d.quotations ?? []);
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
  }, [q, status, page]);

  function openNew() {
    setContactId("none");
    setValidUntil("");
    setLines([emptyLine()]);
    setDiscount("");
    setTaxRate("15");
    setNote("");
    setNewOpen(true);
    fetch("/api/products?pageSize=100&isActive=true")
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []))
      .catch(() => {});
    fetch("/api/contacts?type=customer&pageSize=100")
      .then((r) => r.json())
      .then((d) => setCustomers(d.contacts ?? []))
      .catch(() => {});
  }

  function updateLine(i: number, patch: Partial<NewQuoteLine>) {
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
  const discountVal = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const net = round2(subtotal - discountVal);
  const taxRateVal = Math.min(100, Math.max(0, Number(taxRate) || 0));
  const taxVal = round2((net * taxRateVal) / 100);
  const grandTotal = round2(net + taxVal);

  async function save(statusToSave: "draft" | "sent") {
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
        description: "اختر منتجاً أو أدخل اسماً يدوياً مع كمية أكبر من صفر",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contactId === "none" ? undefined : contactId,
          items,
          discount: discountVal,
          taxRate: taxRateVal,
          validUntil: validUntil || undefined,
          note: note.trim() || undefined,
          status: statusToSave,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل حفظ عرض السعر",
          description: data.error,
        });
        return;
      }
      toast({
        title:
          statusToSave === "sent" ? "تم حفظ العرض وإرساله" : "تم حفظ العرض كمسودة",
        description: data.quoteNo,
      });
      setNewOpen(false);
      load();
      onDataChange();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(id: string) {
    setDetail(null);
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const res = await fetch(`/api/quotations/${id}`);
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل تحميل العرض",
          description: data.error,
        });
        setDetailOpen(false);
        return;
      }
      setDetail(data as QuotationDetail);
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  /** تحديث حالة العرض (إرسال / قبول / رفض) */
  async function changeStatus(
    quote: QuotationDetail | QuotationListRecord,
    next: "sent" | "accepted" | "rejected"
  ) {
    setBusyAction(true);
    try {
      const res = await fetch(`/api/quotations/${quote.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", status: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل تحديث الحالة",
          description: data.error,
        });
        return;
      }
      toast({
        title: "تم تحديث حالة العرض",
        description: `${quote.quoteNo} — ${QUOTATION_STATUS_LABELS[next] ?? next}`,
      });
      load();
      onDataChange();
      if (detail && detail.id === quote.id) {
        await openDetail(quote.id);
      }
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setBusyAction(false);
    }
  }

  async function convert(quote: QuotationListRecord) {
    setConvertTarget(null);
    setConverting(true);
    try {
      const res = await fetch(`/api/quotations/${quote.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "convert" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل تحويل العرض",
          description: data.error,
        });
        return;
      }
      toast({
        title: "تم إنشاء الفاتورة",
        description: data.sale?.invoiceNo ?? "",
      });
      setDetailOpen(false);
      setDetail(null);
      load();
      onDataChange();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setConverting(false);
    }
  }

  async function remove(quote: QuotationListRecord) {
    setDeleteTarget(null);
    try {
      const res = await fetch(`/api/quotations/${quote.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل حذف العرض",
          description: data.error,
        });
        return;
      }
      toast({ title: "تم حذف عرض السعر", description: quote.quoteNo });
      load();
      onDataChange();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    }
  }

  return (
    <div className="p-4 sm:p-5 space-y-4">
      {/* الترويسة والفلاتر */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-navy flex items-center gap-2">
            <FileText className="size-6 text-brand-blue" />
            عروض الأسعار
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            {total} عرض — أنشئ عرضاً للعميل وحوّله لفاتورة عند القبول
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
            placeholder="بحث برقم العرض أو العميل..."
            className="w-full ps-10 h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-brand-blue"
          />
        </div>
        <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => {
                setStatus(f.value);
                setPage(1);
              }}
              className={cn(
                "h-8 px-3 rounded-lg text-[12.5px] font-bold transition-colors",
                status === f.value
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
            عرض سعر جديد
          </Button>
        )}
      </div>

      {/* جدول العروض */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="size-8 animate-spin" />
          </div>
        ) : quotations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
            <FileText className="size-14" />
            <p className="text-slate-400 text-sm">لا توجد عروض أسعار بعد</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-brand-light text-slate-500 text-[12px]">
                    <th className="text-start font-bold px-4 py-3">رقم العرض</th>
                    <th className="text-start font-bold px-4 py-3">العميل</th>
                    <th className="text-start font-bold px-4 py-3">التاريخ</th>
                    <th className="text-start font-bold px-4 py-3">ساري حتى</th>
                    <th className="text-start font-bold px-4 py-3">الإجمالي</th>
                    <th className="text-start font-bold px-4 py-3">الحالة</th>
                    <th className="text-start font-bold px-4 py-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {quotations.map((qu) => (
                    <tr
                      key={qu.id}
                      className="border-t border-slate-100 hover:bg-blue-50/40 transition-colors"
                    >
                      <td
                        className="px-4 py-3 font-mono font-bold text-brand-blue whitespace-nowrap"
                        dir="ltr"
                      >
                        {qu.quoteNo}
                      </td>
                      <td className="px-4 py-3 font-bold text-brand-navy whitespace-nowrap">
                        {qu.contactName ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {formatDate(qu.date)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {qu.validUntil ? formatDate(qu.validUntil) : "—"}
                      </td>
                      <td
                        className="px-4 py-3 font-extrabold text-brand-navy whitespace-nowrap"
                        dir="ltr"
                      >
                        {formatMoney(qu.total, currency)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={qu.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openDetail(qu.id)}
                            className="size-8 rounded-lg hover:bg-blue-100 text-slate-400 hover:text-brand-blue flex items-center justify-center transition-colors"
                            aria-label={`عرض ${qu.quoteNo}`}
                          >
                            <Eye className="size-4" />
                          </button>
                          {CONVERTIBLE.includes(qu.status) && (
                            <button
                              onClick={() => setConvertTarget(qu)}
                              disabled={converting}
                              className="size-8 rounded-lg hover:bg-emerald-100 text-slate-400 hover:text-emerald-600 flex items-center justify-center transition-colors"
                              aria-label={`تحويل ${qu.quoteNo} لفاتورة`}
                            >
                              <ArrowRightCircle className="size-4" />
                            </button>
                          )}
                          {qu.status === "draft" && (
                            <button
                              onClick={() => setDeleteTarget(qu)}
                              className="size-8 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors"
                              aria-label={`حذف ${qu.quoteNo}`}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <p className="text-[12px] text-slate-400">
                {total} عرض — صفحة {page} من {Math.max(pageCount, 1)}
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

      {/* حوار تفاصيل العرض */}
      <Dialog
        open={detailOpen}
        onOpenChange={(o) => {
          setDetailOpen(o);
          if (!o) setDetail(null);
        }}
      >
        <DialogContent
          className="sm:max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="text-brand-navy flex flex-wrap items-center gap-2">
              {detail ? (
                <>
                  <span>تفاصيل عرض السعر</span>
                  <span className="font-mono text-brand-blue" dir="ltr">
                    {detail.quoteNo}
                  </span>
                  <StatusBadge status={detail.status} />
                </>
              ) : (
                "تفاصيل عرض السعر"
              )}
            </DialogTitle>
          </DialogHeader>
          {detailLoading || !detail ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="size-8 animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-xl bg-brand-light px-3 py-2">
                  <p className="text-[11px] font-bold text-slate-400">العميل</p>
                  <p className="text-[13px] font-bold text-brand-navy truncate">
                    {detail.contactName ?? "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-brand-light px-3 py-2">
                  <p className="text-[11px] font-bold text-slate-400">التاريخ</p>
                  <p className="text-[13px] font-bold text-brand-navy">
                    {formatDate(detail.date)}
                  </p>
                </div>
                <div className="rounded-xl bg-brand-light px-3 py-2">
                  <p className="text-[11px] font-bold text-slate-400">ساري حتى</p>
                  <p className="text-[13px] font-bold text-brand-navy">
                    {detail.validUntil ? formatDate(detail.validUntil) : "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-brand-light px-3 py-2">
                  <p className="text-[11px] font-bold text-slate-400">عدد البنود</p>
                  <p className="text-[13px] font-bold text-brand-navy">
                    {detail.items.length}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-brand-light text-slate-500 text-[12px]">
                        <th className="text-start font-bold px-3 py-2.5">الصنف</th>
                        <th className="text-start font-bold px-3 py-2.5">الكمية</th>
                        <th className="text-start font-bold px-3 py-2.5">السعر</th>
                        <th className="text-start font-bold px-3 py-2.5">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map((it) => (
                        <tr
                          key={it.id}
                          className="border-t border-slate-100 hover:bg-blue-50/40 transition-colors"
                        >
                          <td className="px-3 py-2.5 font-bold text-brand-navy">
                            {it.name}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500" dir="ltr">
                            {it.qty}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500" dir="ltr">
                            {formatMoney(it.unitPrice, currency)}
                          </td>
                          <td
                            className="px-3 py-2.5 font-bold text-brand-navy"
                            dir="ltr"
                          >
                            {formatMoney(it.total, currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-brand-light rounded-xl p-4 space-y-1.5 border border-slate-100 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">المجموع قبل الخصم</span>
                  <span className="font-bold text-brand-navy" dir="ltr">
                    {formatMoney(detail.subtotal, currency)}
                  </span>
                </div>
                {detail.discount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">الخصم</span>
                    <span className="font-bold text-rose-500" dir="ltr">
                      - {formatMoney(detail.discount, currency)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">الوعاء الضريبي</span>
                  <span className="font-bold text-brand-navy" dir="ltr">
                    {formatMoney(detail.subtotal - detail.discount, currency)}
                  </span>
                </div>
                {detail.tax > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">ضريبة القيمة المضافة</span>
                    <span className="font-bold text-brand-navy" dir="ltr">
                      {formatMoney(detail.tax, currency)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between font-extrabold text-brand-navy pt-1.5 border-t border-dashed border-slate-200">
                  <span>الإجمالي</span>
                  <span className="text-brand-green" dir="ltr">
                    {formatMoney(detail.total, currency)}
                  </span>
                </div>
                {detail.note && (
                  <p className="text-[12px] text-slate-400 pt-1 leading-relaxed">
                    ملاحظة: {detail.note}
                  </p>
                )}
              </div>

              <DialogFooter className="flex-row flex-wrap gap-2 sm:justify-start">
                {CONVERTIBLE.includes(detail.status) && (
                  <Button
                    onClick={() => setConvertTarget(detail)}
                    disabled={busyAction || converting}
                    className="rounded-xl font-extrabold gap-1.5 bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
                  >
                    {converting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ArrowRightCircle className="size-4" />
                    )}
                    تحويل لفاتورة
                  </Button>
                )}
                {detail.status === "draft" && (
                  <Button
                    variant="outline"
                    onClick={() => changeStatus(detail, "sent")}
                    disabled={busyAction}
                    className="rounded-xl font-bold gap-1.5 border-slate-200"
                  >
                    {busyAction ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    إرسال للعميل
                  </Button>
                )}
                {detail.status === "sent" && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => changeStatus(detail, "accepted")}
                      disabled={busyAction}
                      className="rounded-xl font-bold gap-1.5 border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-600"
                    >
                      <CheckCircle2 className="size-4" />
                      قبول
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => changeStatus(detail, "rejected")}
                      disabled={busyAction}
                      className="rounded-xl font-bold gap-1.5 border-rose-200 text-rose-500 hover:bg-rose-50 hover:text-rose-500"
                    >
                      <XCircle className="size-4" />
                      رفض
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* حوار عرض سعر جديد */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent
          className="sm:max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="text-brand-navy">عرض سعر جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">العميل</Label>
                <Select value={contactId} onValueChange={setContactId}>
                  <SelectTrigger className="w-full data-[size=default]:h-11 rounded-xl border-slate-200 font-bold text-brand-navy bg-white">
                    <SelectValue placeholder="اختر العميل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون عميل</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">ساري حتى</Label>
                <Input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
            </div>

            {/* محرر البنود */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-bold text-slate-700 text-[13px]">البنود</Label>
                <span className="text-[11px] text-slate-400">
                  اختر منتجاً أو أدخل بنداً يدوياً
                </span>
              </div>
              <div className="hidden sm:grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_4.5rem_6.5rem_2.25rem] gap-2 text-[11px] font-bold text-slate-400">
                <span>المنتج</span>
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
                        aria-label={`منتج البند ${i + 1}`}
                        className="w-full data-[size=default]:h-10 rounded-xl border-slate-200 text-[13px] bg-white"
                      >
                        <SelectValue placeholder="اختر منتجاً" />
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
                    onClick={() =>
                      setLines((ls) => ls.filter((_, idx) => idx !== i))
                    }
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
                <Label className="font-bold text-slate-700">الخصم</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="0.00"
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">نسبة الضريبة %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  placeholder="15"
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">ملاحظة</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="شروط العرض أو ملاحظات للعميل (اختياري)..."
                className="rounded-xl min-h-20 text-[13px]"
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
                <span className="text-slate-500">الوعاء الضريبي</span>
                <span className="font-bold text-brand-navy" dir="ltr">
                  {formatMoney(net, currency)}
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
                <span>الإجمالي</span>
                <span className="text-brand-green" dir="ltr">
                  {formatMoney(grandTotal, currency)}
                </span>
              </div>
            </div>
          </div>

          {/* أزرار الحفظ */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => save("draft")}
              disabled={saving}
              className="h-11 rounded-xl font-extrabold border-slate-200"
            >
              {saving ? <Loader2 className="size-5 animate-spin" /> : "حفظ كمسودة"}
            </Button>
            <Button
              onClick={() => save("sent")}
              disabled={saving}
              className="h-11 rounded-xl font-extrabold bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
            >
              {saving ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  <Send className="size-4" />
                  حفظ وإرسال
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* تأكيد التحويل لفاتورة */}
      <AlertDialog
        open={!!convertTarget}
        onOpenChange={(o) => !o && setConvertTarget(null)}
      >
        <AlertDialogContent dir="rtl" className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>تحويل العرض إلى فاتورة؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم تحويل العرض «{convertTarget?.quoteNo}» إلى فاتورة مبيعات
              نهائية وتحديث حالته إلى «محوّل لفاتورة». هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:justify-start">
            <AlertDialogAction
              onClick={() => convertTarget && convert(convertTarget)}
              className="bg-brand-blue hover:bg-brand-blue/90 rounded-xl flex-1"
            >
              تحويل
            </AlertDialogAction>
            <AlertDialogCancel className="rounded-xl flex-1">إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* تأكيد حذف المسودة */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent dir="rtl" className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف عرض السعر</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف مسودة العرض «{deleteTarget?.quoteNo}» نهائياً. لا يمكن
              التراجع عن هذا الإجراء.
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
