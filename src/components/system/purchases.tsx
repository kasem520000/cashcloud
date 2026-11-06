"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Search,
  Trash2,
  Truck,
  Loader2,
  Undo2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import type { Purchase, Product, Contact, PurchaseItem, WarehouseRecord } from "./types";
import {
  CURRENCY_LABELS,
  INVOICE_CURRENCIES,
  formatMoney,
  formatDate,
} from "./types";
import { cn } from "@/lib/utils";

/** الصف يشمل ضريبة القيمة المضافة (tax) التي ترجعها الـ API */
type PurchaseRow = Purchase & { tax?: number };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** شارة رمز عملة أجنبية بجانب رقم المرجع */
function CurrencyBadge({ code }: { code: string }) {
  return (
    <Badge
      className="rounded-full px-1.5 py-0 text-[10.5px] font-bold bg-teal-50 text-brand-teal border border-teal-200 hover:bg-teal-50"
      dir="ltr"
    >
      {CURRENCY_LABELS[code] ?? code}
    </Badge>
  );
}

/** اشتقاق نسبة الضريبة الأصلية لفاتورة الشراء — تُستخدم في المرتجع */
function deriveTaxRate(p: {
  subtotal: number;
  discount: number;
  tax?: number;
}): number {
  const net = p.subtotal - p.discount;
  return net > 0 ? round2(((p.tax ?? 0) / net) * 100) : 15;
}

export function PurchasesView({
  currency,
  onDataChange,
}: {
  currency: string;
  onDataChange: () => void;
}) {
  const { toast } = useToast();
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Contact[]>([]);
  const [lines, setLines] = useState<{ productId: string; qty: string; unitCost: string }[]>([]);
  const [supplierId, setSupplierId] = useState("none");
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [paid, setPaid] = useState("");
  const [note, setNote] = useState("");
  const [taxRate, setTaxRate] = useState("15");
  // تعدد العملات في فاتورة الشراء
  const [invCurrency, setInvCurrency] = useState("SAR");
  const [invRate, setInvRate] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<PurchaseRow | null>(null);

  // مرتجع المشتريات
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnQty, setReturnQty] = useState<string[]>([]);
  const [returnNote, setReturnNote] = useState("");
  const [returnSaving, setReturnSaving] = useState(false);

  function load() {
    const params = new URLSearchParams({ q, page: String(page), pageSize: "12" });
    fetch(`/api/purchases?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setPurchases(d.purchases ?? []);
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

  function openAdd() {
    Promise.all([
      fetch("/api/products?pageSize=100").then((r) => r.json()),
      fetch("/api/contacts?type=supplier").then((r) => r.json()),
      fetch("/api/warehouses").then((r) => r.json()),
    ]).then(([p, s, w]) => {
      setProducts(p.products ?? []);
      setSuppliers(s.contacts ?? []);
      setWarehouses(w.warehouses ?? []);
      setWarehouseId(w.defaultWarehouseId ?? "");
    });
    setLines([{ productId: "", qty: "1", unitCost: "" }]);
    setSupplierId("none");
    setPaid("");
    setNote("");
    setTaxRate("15");
    setInvCurrency("SAR");
    setInvRate("1");
    setDialogOpen(true);
  }

  const subtotal = lines.reduce(
    (s, l) => s + (Number(l.qty) || 0) * (Number(l.unitCost) || 0),
    0
  );
  // نسبة الضريبة 0-100 (مطابقة لتسلسل الخادم) — لا يوجد خصم في النموذج
  const taxRateVal = Math.min(100, Math.max(0, Number(taxRate) || 0));
  const taxVal = Math.round(subtotal * taxRateVal) / 100;
  const grandTotal = Math.round((subtotal + taxVal) * 100) / 100;
  const invIsForeign = invCurrency !== "SAR";
  const invRateVal = Number(invRate) || 1;
  const invEquivalent = round2(grandTotal * (invIsForeign ? invRateVal : 1));

  async function submit() {
    const items: PurchaseItem[] = lines
      .filter((l) => l.productId && Number(l.qty) > 0)
      .map((l) => {
        const p = products.find((x) => x.id === l.productId);
        return {
          productId: l.productId,
          name: p?.name ?? "صنف",
          qty: Number(l.qty) || 1,
          unitCost: Number(l.unitCost) || 0,
          total: (Number(l.qty) || 0) * (Number(l.unitCost) || 0),
        };
      });
    if (items.length === 0) {
      toast({ variant: "destructive", title: "أضف صنفاً واحداً على الأقل" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          contactId: supplierId === "none" ? null : supplierId,
          warehouseId: warehouseId || null,
          paid: Number(paid) || 0,
          taxRate: taxRateVal,
          note,
          status: "received",
          currency: invCurrency,
          exchangeRate: invIsForeign ? invRateVal : 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "فشل التسجيل", description: data.error });
        return;
      }
      toast({
        title: "تم تسجيل عملية الشراء",
        description: `${data.refNo} — تم تحديث المخزون${
          invIsForeign ? ` (المعادل ${formatMoney(invEquivalent, "SAR")})` : ""
        }`,
      });
      setDialogOpen(false);
      load();
      onDataChange();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(p: Purchase) {
    const res = await fetch(`/api/purchases/${p.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast({ variant: "destructive", title: "فشل الحذف", description: d.error });
      return;
    }
    toast({ title: "تم حذف عملية الشراء", description: p.refNo });
    load();
    onDataChange();
  }

  /** فتح محرر مرتجع المشتريات بكميات صفرية */
  function openReturnDialog() {
    if (!detail) return;
    setReturnQty(new Array(detail.items.length).fill("0"));
    setReturnNote("");
    setReturnOpen(true);
  }

  /** إصدار مرتجع مشتريات بالبنود المحددة */
  async function issuePurchaseReturn() {
    if (!detail) return;
    const items = detail.items
      .map((it, i) => ({
        it,
        qty: Math.max(0, Math.min(it.qty, Number(returnQty[i]) || 0)),
      }))
      .filter((x) => x.qty > 0)
      .map((x) => ({
        productId: x.it.productId,
        name: x.it.name,
        qty: x.qty,
        unitCost: x.it.unitCost,
      }));
    if (items.length === 0) {
      toast({
        variant: "destructive",
        title: "حدّد كمية إرجاع",
        description: "أدخل كمية إرجاع أكبر من صفر لبند واحد على الأقل",
      });
      return;
    }
    setReturnSaving(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "return",
          originalRefNo: detail.refNo,
          contactId: detail.contactId,
          items,
          taxRate: deriveTaxRate(detail),
          note: returnNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل إصدار مرتجع المشتريات",
          description: data.error,
        });
        return;
      }
      toast({
        title: "تم إصدار مرتجع المشتريات",
        description: data.refNo,
      });
      setReturnOpen(false);
      setDetail(null);
      load();
      onDataChange();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setReturnSaving(false);
    }
  }

  // ============ إجماليات المرتجع الحية ============
  const returnTaxRate = detail ? deriveTaxRate(detail) : 15;
  const returnLines = (detail?.items ?? []).map((it, i) => {
    const qty = Math.max(0, Math.min(it.qty, Number(returnQty[i]) || 0));
    return { it, qty, value: round2(qty * it.unitCost) };
  });
  const returnSubtotal = round2(returnLines.reduce((s, l) => s + l.value, 0));
  const returnTax = round2((returnSubtotal * returnTaxRate) / 100);
  const returnTotal = round2(returnSubtotal + returnTax);
  const hasReturn = returnLines.some((l) => l.qty >= 1);

  // فواتير شراء بعملة أجنبية — تعرض عمود المعادل بالريال
  const hasForeign = purchases.some((p) => p.currency && p.currency !== "SAR");
  // معادل الفاتورة المفتوحة بالريال
  const detailInvCurrency = detail?.currency ?? currency;
  const detailEquivalent =
    detail && detail.currency && detail.currency !== "SAR"
      ? round2(detail.total * (detail.exchangeRate && detail.exchangeRate !== 0 ? detail.exchangeRate : 1))
      : null;

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-navy flex items-center gap-2">
            <Truck className="size-6 text-brand-blue" />
            المشتريات
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">إدارة عمليات الشراء من الموردين</p>
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
            placeholder="بحث برقم المرجع..."
            className="w-full ps-10 h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-brand-blue"
          />
        </div>
        <Button
          onClick={openAdd}
          className="h-10 rounded-xl bg-brand-green hover:bg-emerald-600 font-extrabold gap-1.5"
        >
          <Plus className="size-4" />
          شراء جديد
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="size-8 animate-spin" />
          </div>
        ) : purchases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
            <Truck className="size-14" />
            <p className="text-slate-400 text-sm">لا توجد عمليات شراء بعد</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-brand-light text-slate-500 text-[12px]">
                    <th className="text-start font-bold px-4 py-3">التاريخ</th>
                    <th className="text-start font-bold px-4 py-3">المرجع</th>
                    <th className="text-start font-bold px-4 py-3">المورد</th>
                    <th className="text-start font-bold px-4 py-3">عدد الأصناف</th>
                    <th className="text-start font-bold px-4 py-3">الإجمالي</th>
                    {hasForeign && (
                      <th className="text-start font-bold px-4 py-3">المعادل (ر.س)</th>
                    )}
                    <th className="text-start font-bold px-4 py-3">المدفوع</th>
                    <th className="text-start font-bold px-4 py-3">الحالة</th>
                    <th className="text-start font-bold px-4 py-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => {
                    const isReturn = p.kind === "return";
                    const rowCurrency = p.currency ?? currency;
                    const isForeign = !!p.currency && p.currency !== "SAR";
                    const equivalent =
                      isForeign && p.exchangeRate && p.exchangeRate !== 1
                        ? round2(p.total * p.exchangeRate)
                        : isForeign
                          ? round2(p.total)
                          : null;
                    return (
                      <tr
                        key={p.id}
                        className={cn(
                          "border-t border-slate-100 hover:bg-blue-50/40 transition-colors",
                          isReturn && "bg-amber-50/30"
                        )}
                      >
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {formatDate(p.date)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-0.5">
                            <div className="flex items-center gap-1.5">
                              {isReturn && (
                                <Undo2
                                  className="size-3.5 text-amber-500 shrink-0"
                                  aria-hidden
                                />
                              )}
                              <span className="font-extrabold text-brand-blue" dir="ltr">
                                {p.refNo}
                              </span>
                              {isForeign && <CurrencyBadge code={rowCurrency} />}
                            </div>
                            {isReturn && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge className="rounded-full px-2 py-0 text-[10.5px] font-bold bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-50">
                                  مرتجع مشتريات
                                </Badge>
                                {p.originalRefNo && (
                                  <span className="text-[11px] text-slate-400 whitespace-nowrap">
                                    مرتجع للفاتورة{" "}
                                    <span
                                      dir="ltr"
                                      className="font-bold text-slate-500"
                                    >
                                      {p.originalRefNo}
                                    </span>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      <td className="px-4 py-3 font-bold text-brand-navy">
                        {p.contact?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{p.items.length}</td>
                      <td className="px-4 py-3 font-extrabold text-brand-navy" dir="ltr">
                        {formatMoney(p.total, rowCurrency)}
                        {(p.tax ?? 0) > 0 && (
                          <span className="block text-[11px] font-bold text-slate-400">
                            + ضريبة {formatMoney(p.tax ?? 0, rowCurrency)}
                          </span>
                        )}
                      </td>
                      {hasForeign && (
                        <td
                          className={cn(
                            "px-4 py-3 whitespace-nowrap",
                            equivalent != null
                              ? "font-bold text-brand-teal"
                              : "text-slate-300"
                          )}
                          dir="ltr"
                        >
                          {equivalent != null ? formatMoney(equivalent, "SAR") : "—"}
                        </td>
                      )}
                      <td className="px-4 py-3 text-slate-500" dir="ltr">
                        {formatMoney(p.paid, rowCurrency)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-full text-[11.5px] font-bold",
                            p.kind === "return"
                              ? "bg-amber-50 text-amber-600"
                              : p.status === "received"
                                ? "bg-emerald-50 text-emerald-600"
                                : "bg-amber-50 text-amber-600"
                          )}
                        >
                          {p.kind === "return"
                            ? "مرتجع"
                            : p.status === "received"
                              ? "مستلمة"
                              : "معلقة"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setDetail(p)}
                            className="text-[12px] font-bold text-brand-blue hover:underline"
                          >
                            تفاصيل
                          </button>
                          <button
                            onClick={() => remove(p)}
                            className="size-8 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors"
                            aria-label={`حذف ${p.refNo}`}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pageCount > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <p className="text-[12px] text-slate-400">
                  صفحة {page} من {pageCount}
                </p>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="rounded-lg"
                  >
                    السابق
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= pageCount}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg"
                  >
                    التالي
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add purchase dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-brand-navy">تسجيل عملية شراء</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">المورد</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون مورد</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">المستودع المستلم</Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200">
                    <SelectValue placeholder="المستودع الافتراضي" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses
                      .filter((w) => w.isActive)
                      .map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name} {w.code}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-400">
                  تُضاف الكميات المستلمة لرصيد هذا المستودع
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-slate-700">الأصناف</Label>
              {lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={l.productId}
                    onChange={(e) =>
                      setLines((ls) =>
                        ls.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x))
                      )
                    }
                    className="flex-1 h-11 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-bold text-brand-navy outline-none focus:border-brand-blue"
                    aria-label="اختيار الصنف"
                  >
                    <option value="">— اختر صنفاً —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    placeholder="الكمية"
                    value={l.qty}
                    onChange={(e) =>
                      setLines((ls) =>
                        ls.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x))
                      )
                    }
                    className="w-20 h-11 rounded-xl border border-slate-200 px-3 text-[13px] outline-none focus:border-brand-blue"
                    dir="ltr"
                    aria-label="الكمية"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="سعر الشراء"
                    value={l.unitCost}
                    onChange={(e) =>
                      setLines((ls) =>
                        ls.map((x, j) => (j === i ? { ...x, unitCost: e.target.value } : x))
                      )
                    }
                    className="w-28 h-11 rounded-xl border border-slate-200 px-3 text-[13px] outline-none focus:border-brand-blue"
                    dir="ltr"
                    aria-label="سعر الشراء"
                  />
                  <button
                    onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                    className="size-9 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center shrink-0 transition-colors"
                    aria-label="حذف السطر"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLines((ls) => [...ls, { productId: "", qty: "1", unitCost: "" }])}
                className="rounded-lg gap-1"
              >
                <Plus className="size-3.5" />
                إضافة سطر
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">المبلغ المدفوع</Label>
                <Input
                  type="number"
                  min="0"
                  value={paid}
                  onChange={(e) => setPaid(e.target.value)}
                  className="h-11 rounded-xl border-slate-200"
                  dir="ltr"
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
                  className="h-11 rounded-xl border-slate-200"
                  dir="ltr"
                />
              </div>
            </div>

            {/* تعدد العملات */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">عملة الفاتورة</Label>
                <Select
                  value={invCurrency}
                  onValueChange={(v) => {
                    setInvCurrency(v);
                    if (v === "SAR") setInvRate("1");
                  }}
                >
                  <SelectTrigger className="w-full data-[size=default]:h-11 rounded-xl border-slate-200 font-bold text-brand-navy bg-white">
                    <SelectValue placeholder="اختر العملة" />
                  </SelectTrigger>
                  <SelectContent>
                    {INVOICE_CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c} {CURRENCY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {invIsForeign && (
                <div className="space-y-1.5">
                  <Label className="font-bold text-slate-700">سعر الصرف إلى الريال</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={invRate}
                    onChange={(e) => setInvRate(e.target.value)}
                    placeholder="1"
                    dir="ltr"
                    className="h-11 rounded-xl border-slate-200"
                  />
                  <p className="text-[11px] text-slate-400">
                    القيود المحاسبية تُرحَّل تلقائياً بمعادل الريال السعودي
                  </p>
                </div>
              )}
            </div>

            {/* ملخص الإجماليات */}
            <div className="bg-brand-light rounded-xl p-4 space-y-1.5 border border-slate-100 text-[13px]">
              <div className="flex justify-between text-slate-500">
                <span>الإجمالي الفرعي</span>
                <span dir="ltr">{formatMoney(subtotal, invCurrency)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>ضريبة القيمة المضافة ({taxRateVal}%)</span>
                <span dir="ltr">{formatMoney(taxVal, invCurrency)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-dashed border-slate-200">
                <span className="font-extrabold text-brand-navy">الإجمالي النهائي</span>
                <span className="text-lg font-extrabold text-brand-green" dir="ltr">
                  {formatMoney(grandTotal, invCurrency)}
                </span>
              </div>
              {invIsForeign && (
                <div className="flex justify-between text-[12.5px]">
                  <span className="text-slate-500">المعادل (ر.س)</span>
                  <span className="font-bold text-brand-teal" dir="ltr">
                    {formatMoney(invEquivalent, "SAR")}
                  </span>
                </div>
              )}
            </div>

            <Button
              onClick={submit}
              disabled={submitting}
              className="w-full min-h-11 rounded-xl font-extrabold bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
            >
              {submitting ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                "تسجيل الشراء وتحديث المخزون"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail modal */}
      {detail && (
        <div
          className="fixed inset-0 z-50 bg-brand-navy/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
            role="dialog"
            aria-label={`تفاصيل الشراء ${detail.refNo}`}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-extrabold text-brand-navy flex flex-wrap items-center gap-2">
                {detail.kind === "return" ? "مرتجع مشتريات" : "عملية شراء"}{" "}
                — <span dir="ltr">{detail.refNo}</span>
                {detail.currency && detail.currency !== "SAR" && (
                  <CurrencyBadge code={detail.currency} />
                )}
                {detail.kind === "return" && detail.originalRefNo && (
                  <Badge className="rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-50">
                    مرتجع للفاتورة{" "}
                    <span dir="ltr" className="font-mono">
                      {detail.originalRefNo}
                    </span>
                  </Badge>
                )}
              </h2>
              <button
                onClick={() => setDetail(null)}
                className="size-8 rounded-lg hover:bg-slate-100 text-slate-400 flex items-center justify-center"
                aria-label="إغلاق"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-brand-light rounded-xl p-3.5 border border-slate-100 space-y-1.5 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">المورد</span>
                  <span className="font-bold text-brand-navy">{detail.contact?.name ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">التاريخ</span>
                  <span className="font-bold text-brand-navy">{formatDate(detail.date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الإجمالي</span>
                  <span className="font-extrabold text-brand-green" dir="ltr">
                    {formatMoney(detail.total, detailInvCurrency)}
                  </span>
                </div>
                {detailEquivalent != null && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">
                      المعادل ({detail.currency} × {detail.exchangeRate ?? 1})
                    </span>
                    <span className="font-bold text-brand-teal" dir="ltr">
                      {formatMoney(detailEquivalent, "SAR")}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">المدفوع</span>
                  <span className="font-bold text-brand-navy" dir="ltr">
                    {formatMoney(detail.paid, currency)}
                  </span>
                </div>
                {(detail.tax ?? 0) > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">الوعاء بعد الخصم</span>
                      <span className="font-bold text-brand-navy" dir="ltr">
                        {formatMoney(detail.subtotal - detail.discount, currency)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">ضريبة القيمة المضافة</span>
                      <span className="font-bold text-brand-navy" dir="ltr">
                        {formatMoney(detail.tax ?? 0, currency)}
                      </span>
                    </div>
                  </>
                )}
              </div>
              <table className="w-full text-[13px] rounded-xl overflow-hidden border border-slate-100">
                <thead>
                  <tr className="bg-brand-light text-slate-500 text-[12px]">
                    <th className="text-start font-bold px-3 py-2.5">الصنف</th>
                    <th className="text-start font-bold px-3 py-2.5">الكمية</th>
                    <th className="text-start font-bold px-3 py-2.5">التكلفة</th>
                    <th className="text-start font-bold px-3 py-2.5">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((it, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2.5 font-bold text-brand-navy">{it.name}</td>
                      <td className="px-3 py-2.5 text-slate-500">{it.qty}</td>
                      <td className="px-3 py-2.5 text-slate-500" dir="ltr">
                        {formatMoney(it.unitCost, currency)}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-brand-navy" dir="ltr">
                        {formatMoney(it.total, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* زر المرتجع — لفواتير الشراء العادية فقط */}
              {(detail.kind ?? "invoice") === "invoice" && (
                <Button
                  onClick={openReturnDialog}
                  variant="outline"
                  className="rounded-xl font-bold gap-1.5 border-amber-300 text-amber-600 hover:bg-amber-50 hover:text-amber-600"
                >
                  <Undo2 className="size-4" />
                  مرتجع مشتريات
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* مرتجع المشتريات — محرر الكميات */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent
          className="sm:max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="text-brand-navy flex flex-wrap items-center gap-2">
              <Undo2 className="size-5 text-amber-500" />
              مرتجع مشتريات —{" "}
              <span dir="ltr" className="font-mono text-brand-blue">
                {detail?.refNo}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-[12.5px] text-slate-400 leading-relaxed">
              حدّد كمية الإرجاع لكل بند — سيُصدر النظام مرتجع مشتريات ويُخفض
              المخزون والرصيد المستحق للمورد.
            </p>
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-brand-light text-slate-500 text-[12px]">
                      <th className="text-start font-bold px-3 py-2.5">الصنف</th>
                      <th className="text-start font-bold px-3 py-2.5">الكمية</th>
                      <th className="text-start font-bold px-3 py-2.5">التكلفة</th>
                      <th className="text-start font-bold px-3 py-2.5">كمية الإرجاع</th>
                      <th className="text-start font-bold px-3 py-2.5">قيمة المرتجع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnLines.map((l, i) => (
                      <tr
                        key={i}
                        className="border-t border-slate-100 hover:bg-blue-50/40 transition-colors"
                      >
                        <td className="px-3 py-2.5 font-bold text-brand-navy">
                          {l.it.name}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500" dir="ltr">
                          {l.it.qty}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500" dir="ltr">
                          {formatMoney(l.it.unitCost, currency)}
                        </td>
                        <td className="px-3 py-2.5">
                          <Input
                            type="number"
                            min="0"
                            max={l.it.qty}
                            step="1"
                            dir="ltr"
                            value={returnQty[i] ?? "0"}
                            onChange={(e) =>
                              setReturnQty((qs) =>
                                qs.map((x, j) => (j === i ? e.target.value : x))
                              )
                            }
                            className="h-9 w-24 rounded-lg border-slate-200"
                            aria-label={`كمية إرجاع ${l.it.name}`}
                          />
                        </td>
                        <td
                          className="px-3 py-2.5 font-bold text-brand-navy"
                          dir="ltr"
                        >
                          {formatMoney(l.value, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">ملاحظة</Label>
              <Textarea
                value={returnNote}
                onChange={(e) => setReturnNote(e.target.value)}
                placeholder="سبب الإرجاع أو ملاحظة على المرتجع (اختياري)..."
                className="rounded-xl min-h-20 text-[13px]"
              />
            </div>

            {/* إجماليات المرتجع الحية */}
            <div className="rounded-xl bg-brand-light border border-slate-100 p-3 space-y-1.5 text-[13px]">
              <div className="flex justify-between">
                <span className="text-slate-500">مجموع المرتجع</span>
                <span className="font-bold text-brand-navy" dir="ltr">
                  {formatMoney(returnSubtotal, currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">
                  ضريبة القيمة المضافة ({returnTaxRate}%)
                </span>
                <span className="font-bold text-brand-navy" dir="ltr">
                  {formatMoney(returnTax, currency)}
                </span>
              </div>
              <div className="flex justify-between font-extrabold text-brand-navy pt-1.5 border-t border-dashed border-slate-200">
                <span>إجمالي المرتجع</span>
                <span className="text-amber-600" dir="ltr">
                  {formatMoney(returnTotal, currency)}
                </span>
              </div>
            </div>

            <Button
              onClick={issuePurchaseReturn}
              disabled={!hasReturn || returnSaving}
              className="w-full min-h-11 rounded-xl font-extrabold gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
            >
              {returnSaving ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  <Undo2 className="size-4" />
                  إصدار مرتجع المشتريات
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
