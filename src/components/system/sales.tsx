"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Search,
  Trash2,
  Eye,
  ShoppingCart,
  Loader2,
  Printer,
  X,
  QrCode,
  ShieldCheck,
  Mail,
  MessageCircle,
  Send,
  MapPin,
  Building2,
  Phone,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { Contact, Product, Sale, ViewKey, BranchRecord } from "./types";
import {
  CURRENCY_LABELS,
  INVOICE_CURRENCIES,
  formatMoney,
  formatDate,
  formatDateTime,
  PAYMENT_METHOD_LABELS,
} from "./types";
import { cn } from "@/lib/utils";
import { tafqit } from "@/lib/tafqit";
import { formatNationalAddress } from "@/lib/address";

/** إعدادات المنشأة من /api/settings — تُستخدم في ترويسة الفاتورة والطباعة */
type CompanyInfo = {
  businessName?: string | null;
  taxNumber?: string | null;
  crNumber?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  buildingNo?: string | null;
  streetName?: string | null;
  district?: string | null;
  city?: string | null;
  postalCode?: string | null;
  additionalNo?: string | null;
  emailConfigured?: boolean;
  whatsappConfigured?: boolean;
};

/** جهة اتصال كاملة كما يعيدها GET /api/sales/[id] */
type FullContact = {
  name: string;
  phone?: string | null;
  email?: string | null;
  taxNumber?: string | null;
  address?: string | null;
  buildingNo?: string | null;
  streetName?: string | null;
  district?: string | null;
  city?: string | null;
  postalCode?: string | null;
  additionalNo?: string | null;
};

/** فاتورة مع بيانات العميل الكاملة — للمعاينة والمشاركة */
type SaleFull = Omit<Sale, "contact"> & { contact?: FullContact | null };

/** رد موحّد لعمليات الإرسال (بريد / واتساب) */
type SendResult = {
  ok?: boolean;
  status?: string;
  to?: string;
  waLink?: string;
  message?: string;
  error?: string;
};

/** سطر التفقيط «فقط … لا غير» — يعيد توظيف ناتج tafqit دون تكرار كلمة «فقط» */
function tafqitLine(amount: number, currency: string): string {
  const t = tafqit(amount, currency).trim();
  const suffix = "فقط لا غير";
  return t.endsWith(suffix)
    ? `فقط ${t.slice(0, -suffix.length).trim()} لا غير`
    : `فقط ${t}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** سطر بند في محرر الفاتورة الجديدة */
type NewSaleLine = {
  productId: string;
  name: string;
  qty: string;
  unitPrice: string;
};

function emptySaleLine(): NewSaleLine {
  return { productId: "", name: "", qty: "1", unitPrice: "" };
}

/** شارة رمز عملة أجنبية بجانب رقم الفاتورة */
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

/** اشتقاق نسبة الضريبة الأصلية للفاتورة — تُستخدم في الإشعار الدائن */
function deriveTaxRate(s: {
  subtotal: number;
  discount: number;
  tax: number;
}): number {
  const net = s.subtotal - s.discount;
  return net > 0 ? round2((s.tax / net) * 100) : 15;
}

export function SalesView({
  currency,
  onNavigate,
  onDataChange,
}: {
  currency: string;
  onNavigate: (v: ViewKey) => void;
  onDataChange: () => void;
}) {
  const { toast } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<SaleFull | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Sale | null>(null);

  // فلتر الفرع
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [branchFilter, setBranchFilter] = useState("all");

  // مرتجع المبيعات (إشعار دائن)
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnQty, setReturnQty] = useState<string[]>([]);
  const [returnNote, setReturnNote] = useState("");
  const [returnSaving, setReturnSaving] = useState(false);

  // إعدادات المنشأة (ترويسة الفاتورة + الطباعة) — تُجلب مرة واحدة عند التحميل
  const [company, setCompany] = useState<CompanyInfo | null>(null);

  // مشاركة الفاتورة بالبريد الإلكتروني
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  // مشاركة الفاتورة عبر الواتساب
  const [waOpen, setWaOpen] = useState(false);
  const [waTo, setWaTo] = useState("");
  const [waMsg, setWaMsg] = useState("");
  const [sendingWa, setSendingWa] = useState(false);

  // حوار إنشاء فاتورة جديدة (تعدد العملات)
  const [newOpen, setNewOpen] = useState(false);
  const [newProducts, setNewProducts] = useState<Product[]>([]);
  const [newCustomers, setNewCustomers] = useState<Contact[]>([]);
  const [newLines, setNewLines] = useState<NewSaleLine[]>([emptySaleLine()]);
  const [newForm, setNewForm] = useState({
    contactId: "none",
    discount: "",
    taxRate: "15",
    paymentMethod: "cash",
    paid: "",
    note: "",
    currency: "SAR",
    exchangeRate: "1",
  });
  const [newSaving, setNewSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setCompany(d as CompanyInfo);
      })
      .catch(() => {});
    fetch("/api/branches")
      .then((r) => r.json())
      .then((d) => setBranches(d.branches ?? []))
      .catch(() => {});
  }, []);

  function load() {
    const params = new URLSearchParams({ q, page: String(page), pageSize: "12" });
    if (branchFilter !== "all") params.set("branchId", branchFilter);
    fetch(`/api/sales?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setSales(d.sales ?? []);
        setPageCount(d.pageCount ?? 1);
        setTotal(d.total ?? 0);
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
  }, [q, page, branchFilter]);

  async function remove(s: Sale) {
    setDeleteTarget(null);
    const res = await fetch(`/api/sales/${s.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast({ variant: "destructive", title: "فشل الحذف", description: d.error });
      return;
    }
    toast({ title: "تم حذف الفاتورة", description: s.invoiceNo });
    load();
    onDataChange();
  }

  /** فتح المعاينة فوراً ثم إثراؤها بالبيانات الكاملة (بريد/جوال/عنوان العميل) */
  function openDetail(s: Sale) {
    setDetail(s);
    fetch(`/api/sales/${s.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          const full = d as SaleFull;
          setDetail((prev) => (prev && prev.id === full.id ? full : prev));
        }
      })
      .catch(() => {});
  }

  // ============ إرسال الفاتورة بالبريد الإلكتروني ============
  function openEmailDialog() {
    if (!detail) return;
    const c = detail.contact;
    setEmailTo(c?.email && c.email.includes("@") ? c.email : "");
    setEmailMsg("");
    setEmailOpen(true);
  }

  async function sendInvoiceEmail() {
    if (!detail || !emailTo.trim()) return;
    setSendingEmail(true);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: detail.id,
          to: emailTo.trim(),
          message: emailMsg.trim() || undefined,
        }),
      });
      const d = (await res.json().catch(() => ({}))) as SendResult;
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل إرسال البريد",
          description: d.error ?? "تعذر الاتصال بالخادم",
        });
        return;
      }
      if (d.status === "sent") {
        toast({
          title: "تم إرسال الفاتورة بالبريد",
          description: d.message,
          className: "border-emerald-200 bg-emerald-50 text-emerald-900",
        });
        setEmailOpen(false);
      } else if (d.status === "simulated") {
        toast({
          title: "وضع محاكاة البريد",
          description: d.message,
          className: "border-sky-200 bg-sky-50 text-sky-900",
        });
        setEmailOpen(false);
      } else {
        toast({
          variant: "destructive",
          title: "فشل إرسال البريد",
          description: d.message ?? "خطأ غير معروف",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "فشل إرسال البريد",
        description: "تعذر الاتصال بالخادم",
      });
    } finally {
      setSendingEmail(false);
    }
  }

  // ============ إرسال الفاتورة عبر الواتساب ============
  function openWaDialog() {
    if (!detail) return;
    const c = detail.contact;
    const phone = c?.phone ?? "";
    setWaTo(phone.replace(/\D/g, "").length >= 8 ? phone : "");
    setWaMsg("");
    setWaOpen(true);
  }

  async function sendInvoiceWhatsApp() {
    if (!detail || !waTo.trim()) return;
    setSendingWa(true);
    try {
      const res = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId: detail.id,
          to: waTo.trim(),
          message: waMsg.trim() || undefined,
        }),
      });
      const d = (await res.json().catch(() => ({}))) as SendResult;
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل إرسال الواتساب",
          description: d.error ?? "تعذر الاتصال بالخادم",
        });
        return;
      }
      if (d.status === "sent") {
        toast({
          title: "تم إرسال الفاتورة عبر الواتساب",
          description: d.message,
          className: "border-emerald-200 bg-emerald-50 text-emerald-900",
        });
        setWaOpen(false);
      } else if (d.status === "simulated") {
        if (d.waLink) window.open(d.waLink, "_blank");
        toast({
          title: "وضع محاكاة الواتساب",
          description:
            (d.message ?? "") +
            (d.waLink ? " — فتحنا لك محادثة الواتساب في تبويب جديد جاهزة للإرسال." : ""),
          className: "border-sky-200 bg-sky-50 text-sky-900",
        });
        setWaOpen(false);
      } else {
        toast({
          variant: "destructive",
          title: "فشل إرسال الواتساب",
          description: d.message ?? "خطأ غير معروف",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "فشل إرسال الواتساب",
        description: "تعذر الاتصال بالخادم",
      });
    } finally {
      setSendingWa(false);
    }
  }

  /** فتح محرر المرتجع بكميات صفرية لكل بند */
  function openReturnDialog() {
    if (!detail) return;
    setReturnQty(new Array(detail.items.length).fill("0"));
    setReturnNote("");
    setReturnOpen(true);
  }

  /** إصدار إشعار دائن بالبنود المحددة */
  async function issueCreditNote() {
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
        unitPrice: x.it.unitPrice,
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
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "credit-note",
          originalInvoiceNo: detail.invoiceNo,
          contactId: detail.contactId,
          items,
          taxRate: deriveTaxRate(detail),
          paymentMethod: detail.paymentMethod,
          note: returnNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل إصدار الإشعار الدائن",
          description: data.error,
        });
        return;
      }
      toast({
        title: "تم إصدار الإشعار الدائن",
        description: data.invoiceNo,
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

  const totals = sales.reduce(
    (acc, s) => ({
      amount: acc.amount + s.total,
      due: acc.due + (s.total - s.paid),
    }),
    { amount: 0, due: 0 }
  );

  // فواتير بعملة أجنبية — تعرض عمود المعادل بالريال
  const hasForeign = sales.some((s) => s.currency && s.currency !== "SAR");

  // ============ إنشاء فاتورة جديدة ============

  function openNewInvoice() {
    setNewForm({
      contactId: "none",
      discount: "",
      taxRate: "15",
      paymentMethod: "cash",
      paid: "",
      note: "",
      currency: "SAR",
      exchangeRate: "1",
    });
    setNewLines([emptySaleLine()]);
    setNewOpen(true);
    fetch("/api/products?pageSize=100&isActive=true")
      .then((r) => r.json())
      .then((d) => setNewProducts(d.products ?? []))
      .catch(() => {});
    fetch("/api/contacts?type=customer&pageSize=100")
      .then((r) => r.json())
      .then((d) => setNewCustomers(d.contacts ?? []))
      .catch(() => {});
  }

  function updateNewLine(i: number, patch: Partial<NewSaleLine>) {
    setNewLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  /** اختيار منتج في سطر — يعبّئ الاسم والسعر من سعر البيع */
  function pickNewProduct(i: number, v: string) {
    if (v === "manual") {
      updateNewLine(i, { productId: "manual" });
      return;
    }
    const p = newProducts.find((x) => x.id === v);
    updateNewLine(i, {
      productId: v,
      name: p?.name ?? "",
      unitPrice: p ? String(p.salePrice) : "",
    });
  }

  // إجماليات الفاتورة الجديدة الحية
  const newSubtotal = round2(
    newLines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0)
  );
  const newDiscountVal = Math.min(Math.max(Number(newForm.discount) || 0, 0), newSubtotal);
  const newNet = round2(newSubtotal - newDiscountVal);
  const newTaxRateVal = Math.min(100, Math.max(0, Number(newForm.taxRate) || 0));
  const newTaxVal = round2((newNet * newTaxRateVal) / 100);
  const newGrandTotal = round2(newNet + newTaxVal);
  const newIsForeign = newForm.currency !== "SAR";
  const newRateVal = Number(newForm.exchangeRate) || 1;
  const newEquivalent = round2(newGrandTotal * (newIsForeign ? newRateVal : 1));

  async function submitNewInvoice() {
    const items = newLines
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
    if (newIsForeign && newRateVal <= 0) {
      toast({ variant: "destructive", title: "أدخل سعر صرف أكبر من صفر" });
      return;
    }
    setNewSaving(true);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          contactId: newForm.contactId === "none" ? null : newForm.contactId,
          discount: newDiscountVal,
          taxRate: newTaxRateVal,
          paymentMethod: newForm.paymentMethod,
          paid:
            newForm.paymentMethod === "credit"
              ? Number(newForm.paid) || 0
              : newGrandTotal,
          status: "final",
          currency: newForm.currency,
          exchangeRate: newIsForeign ? newRateVal : 1,
          note: newForm.note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل إنشاء الفاتورة",
          description: data.error,
        });
        return;
      }
      toast({
        title: "تم إنشاء الفاتورة",
        description: `${data.invoiceNo} — ${formatMoney(
          data.total ?? newGrandTotal,
          newForm.currency
        )}${newIsForeign ? ` (المعادل ${formatMoney(newEquivalent, "SAR")})` : ""}`,
      });
      setNewOpen(false);
      setPage(1);
      load();
      onDataChange();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setNewSaving(false);
    }
  }

  // عناوين الترويسة (المنشأة / العميل) — لا تُعرض إن لم تتوفر بيانات
  const companyAddress = company ? formatNationalAddress(company) : "";
  const showCompanyAddress = !!companyAddress && companyAddress !== "—";
  const contactAddress = detail?.contact ? formatNationalAddress(detail.contact) : "";
  const showContactAddress = !!contactAddress && contactAddress !== "—";
  const contactPhone =
    detail?.contact?.phone && /\d/.test(detail.contact.phone) ? detail.contact.phone : null;
  const contactEmail =
    detail?.contact?.email && detail.contact.email.includes("@") ? detail.contact.email : null;
  // عملة الفاتورة المفتوحة + معادلها بالريال
  const detailInvCurrency = detail?.currency ?? currency;
  const detailIsForeign = !!detail?.currency && detail.currency !== "SAR";
  const detailEquivalent =
    detailIsForeign && detail
      ? round2(detail.total * (detail.exchangeRate && detail.exchangeRate !== 0 ? detail.exchangeRate : 1))
      : null;

  // ============ إجماليات المرتجع الحية ============
  const returnTaxRate = detail ? deriveTaxRate(detail) : 15;
  const returnLines = (detail?.items ?? []).map((it, i) => {
    const qty = Math.max(0, Math.min(it.qty, Number(returnQty[i]) || 0));
    return { it, qty, value: round2(qty * it.unitPrice) };
  });
  const returnSubtotal = round2(returnLines.reduce((s, l) => s + l.value, 0));
  const returnTax = round2((returnSubtotal * returnTaxRate) / 100);
  const returnTotal = round2(returnSubtotal + returnTax);
  const hasReturn = returnLines.some((l) => l.qty >= 1);

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-navy flex items-center gap-2">
            <ShoppingCart className="size-6 text-brand-blue" />
            المبيعات
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            {total} فاتورة — إجمالي المعروض: {formatMoney(totals.amount, currency)}
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
            placeholder="بحث برقم الفاتورة..."
            className="w-full ps-10 h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-brand-blue"
          />
        </div>
        {branches.length > 0 && (
          <Select
            value={branchFilter}
            onValueChange={(v) => {
              setBranchFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44 h-10 rounded-xl border-slate-200 bg-white font-bold text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفروع</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          onClick={openNewInvoice}
          className="h-10 rounded-xl bg-brand-green hover:bg-emerald-600 font-extrabold gap-1.5"
        >
          <Plus className="size-4" />
          فاتورة جديدة
        </Button>
        <Button
          variant="outline"
          onClick={() => onNavigate("pos")}
          className="h-10 rounded-xl font-bold gap-1.5 border-slate-200"
        >
          <QrCode className="size-4" />
          الكاشير
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="size-8 animate-spin" />
          </div>
        ) : sales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
            <ShoppingCart className="size-14" />
            <p className="text-slate-400 text-sm">لا توجد فواتير مبيعات بعد</p>
            <Button
              onClick={() => onNavigate("pos")}
              variant="outline"
              className="rounded-xl mt-1"
            >
              أنشئ أول فاتورة من الكاشير
            </Button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-brand-light text-slate-500 text-[12px]">
                    <th className="text-start font-bold px-4 py-3">التاريخ</th>
                    <th className="text-start font-bold px-4 py-3">رقم الفاتورة</th>
                    <th className="text-start font-bold px-4 py-3">العميل</th>
                    {branches.length > 0 && (
                      <th className="text-start font-bold px-4 py-3">الفرع</th>
                    )}
                    <th className="text-start font-bold px-4 py-3">الإجمالي</th>
                    {hasForeign && (
                      <th className="text-start font-bold px-4 py-3">المعادل (ر.س)</th>
                    )}
                    <th className="text-start font-bold px-4 py-3">المدفوع</th>
                    <th className="text-start font-bold px-4 py-3">المتبقي</th>
                    <th className="text-start font-bold px-4 py-3">طريقة الدفع</th>
                    <th className="text-start font-bold px-4 py-3">الحالة</th>
                    <th className="text-start font-bold px-4 py-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => {
                    const due = s.total - s.paid;
                    const isCreditNote = s.kind === "credit-note";
                    const invCurrency = s.currency ?? currency;
                    const isForeign = !!s.currency && s.currency !== "SAR";
                    const equivalent =
                      isForeign && s.exchangeRate && s.exchangeRate !== 1
                        ? round2(s.total * s.exchangeRate)
                        : isForeign
                          ? round2(s.total)
                          : null;
                    return (
                      <tr
                        key={s.id}
                        className={cn(
                          "border-t border-slate-100 hover:bg-blue-50/40 transition-colors",
                          isCreditNote && "bg-amber-50/30"
                        )}
                      >
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {formatDate(s.date)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-0.5">
                            <div className="flex items-center gap-1.5">
                              {isCreditNote && (
                                <Undo2
                                  className="size-3.5 text-amber-500 shrink-0"
                                  aria-hidden
                                />
                              )}
                              <span
                                className="font-extrabold text-brand-blue"
                                dir="ltr"
                              >
                                {s.invoiceNo}
                              </span>
                              {isForeign && <CurrencyBadge code={invCurrency} />}
                            </div>
                            {isCreditNote && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge className="rounded-full px-2 py-0 text-[10.5px] font-bold bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-50">
                                  إشعار دائن
                                </Badge>
                                {s.originalInvoiceNo && (
                                  <span className="text-[11px] text-slate-400 whitespace-nowrap">
                                    مرتجع للفاتورة{" "}
                                    <span
                                      dir="ltr"
                                      className="font-bold text-slate-500"
                                    >
                                      {s.originalInvoiceNo}
                                    </span>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-bold text-brand-navy">
                          {s.contact?.name ?? "عميل نقدي"}
                        </td>
                        {branches.length > 0 && (
                          <td className="px-4 py-3">
                            {s.branch ? (
                              <span className="text-[11.5px] font-bold bg-blue-50 text-brand-blue px-2 py-0.5 rounded-full whitespace-nowrap">
                                {s.branch.name}
                              </span>
                            ) : (
                              <span className="text-[12px] text-slate-300">الرئيسي</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 font-extrabold text-brand-navy" dir="ltr">
                          {formatMoney(s.total, invCurrency)}
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
                          {formatMoney(s.paid, invCurrency)}
                        </td>
                        <td className="px-4 py-3" dir="ltr">
                          <span className={cn(due > 0 ? "text-amber-600 font-bold" : "text-slate-400")}>
                            {formatMoney(due, invCurrency)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {PAYMENT_METHOD_LABELS[s.paymentMethod] ?? s.paymentMethod}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "px-2.5 py-1 rounded-full text-[11.5px] font-bold",
                              s.kind === "credit-note"
                                ? "bg-amber-50 text-amber-600"
                                : s.status === "draft"
                                  ? "bg-slate-100 text-slate-500"
                                  : due > 0
                                    ? "bg-amber-50 text-amber-600"
                                    : "bg-emerald-50 text-emerald-600"
                            )}
                          >
                            {s.kind === "credit-note"
                              ? "مرتجع"
                              : s.status === "draft"
                                ? "مسودة"
                                : due > 0
                                  ? "معلقة"
                                  : "مدفوعة"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openDetail(s)}
                              className="size-8 rounded-lg hover:bg-blue-100 text-slate-400 hover:text-brand-blue flex items-center justify-center transition-colors"
                              aria-label={`عرض ${s.invoiceNo}`}
                            >
                              <Eye className="size-4" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(s)}
                              className="size-8 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors"
                              aria-label={`حذف ${s.invoiceNo}`}
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

      {/* Invoice detail modal */}
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
            aria-label={`تفاصيل الفاتورة ${detail.invoiceNo}`}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="font-extrabold text-brand-navy flex flex-wrap items-center gap-2">
                {detail.kind === "credit-note"
                  ? "إشعار دائن — مرتجع مبيعات"
                  : "فاتورة مبيعات"}{" "}
                — <span dir="ltr">{detail.invoiceNo}</span>
                {detail.currency && detail.currency !== "SAR" && (
                  <CurrencyBadge code={detail.currency} />
                )}
                {detail.kind === "credit-note" && detail.originalInvoiceNo && (
                  <Badge className="rounded-full px-2.5 py-0.5 text-[11px] font-bold bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-50">
                    مرتجع للفاتورة{" "}
                    <span dir="ltr" className="font-mono">
                      {detail.originalInvoiceNo}
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
              {/* ترويسة الفاتورة — بيانات المنشأة والعنوان الوطني */}
              <div className="rounded-xl border border-slate-100 bg-brand-light/60 p-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="font-extrabold text-brand-navy text-[14.5px] flex items-center gap-1.5">
                    <Building2 className="size-4 text-brand-blue shrink-0" />
                    {company?.businessName ?? "منشأتي"}
                  </p>
                  {showCompanyAddress && (
                    <p className="text-[12.5px] text-slate-500 flex items-start gap-1.5 ps-6 leading-relaxed">
                      <MapPin className="size-3.5 mt-0.5 shrink-0 text-slate-400" />
                      {companyAddress}
                    </p>
                  )}
                  {(company?.taxNumber || company?.crNumber) && (
                    <p className="text-[12px] text-slate-500 ps-6">
                      {company?.taxNumber && (
                        <>
                          الرقم الضريبي: <span dir="ltr">{company.taxNumber}</span>
                        </>
                      )}
                      {company?.taxNumber && company?.crNumber && " — "}
                      {company?.crNumber && (
                        <>
                          س.ت: <span dir="ltr">{company.crNumber}</span>
                        </>
                      )}
                    </p>
                  )}
                  {(company?.phone || company?.email) && (
                    <p className="text-[12px] text-slate-500 ps-6 flex flex-wrap items-center gap-x-3 gap-y-1" dir="ltr">
                      {company?.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="size-3.5 text-slate-400" />
                          {company.phone}
                        </span>
                      )}
                      {company?.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="size-3.5 text-slate-400" />
                          {company.email}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <div className="space-y-1 sm:border-s sm:ps-4">
                  <p className="text-[11px] font-bold text-slate-400">فاتورة إلى</p>
                  <p className="font-extrabold text-brand-navy text-[14.5px]">
                    {detail.contact?.name ?? "عميل نقدي"}
                  </p>
                  {showContactAddress && (
                    <p className="text-[12.5px] text-slate-500 flex items-start gap-1.5 leading-relaxed">
                      <MapPin className="size-3.5 mt-0.5 shrink-0 text-slate-400" />
                      {contactAddress}
                    </p>
                  )}
                  {detail.contact?.taxNumber && (
                    <p className="text-[12px] text-slate-500">
                      الرقم الضريبي: <span dir="ltr">{detail.contact.taxNumber}</span>
                    </p>
                  )}
                  {contactPhone && (
                    <p className="text-[12px] text-slate-500 flex items-center gap-1.5" dir="ltr">
                      <Phone className="size-3.5 shrink-0 text-slate-400" />
                      {contactPhone}
                    </p>
                  )}
                  {contactEmail && (
                    <p className="text-[12px] text-slate-500 flex items-center gap-1.5" dir="ltr">
                      <Mail className="size-3.5 shrink-0 text-slate-400" />
                      {contactEmail}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <Info label="التاريخ" value={formatDateTime(detail.date)} />
                <Info label="العميل" value={detail.contact?.name ?? "عميل نقدي"} />
                <Info
                  label="طريقة الدفع"
                  value={PAYMENT_METHOD_LABELS[detail.paymentMethod] ?? detail.paymentMethod}
                />
                <Info
                  label="الحالة"
                  value={detail.status === "draft" ? "مسودة" : detail.total - detail.paid > 0 ? "معلقة" : "مدفوعة"}
                />
                {detailIsForeign && (
                  <Info
                    label="عملة الفاتورة وسعر الصرف"
                    value={`${detail.currency} × ${detail.exchangeRate ?? 1}`}
                  />
                )}
              </div>

              <table className="w-full text-[13px] rounded-xl overflow-hidden border border-slate-100">
                <thead>
                  <tr className="bg-brand-light text-slate-500 text-[12px]">
                    <th className="text-start font-bold px-3 py-2.5">الصنف</th>
                    <th className="text-start font-bold px-3 py-2.5">الكمية</th>
                    <th className="text-start font-bold px-3 py-2.5">السعر</th>
                    <th className="text-start font-bold px-3 py-2.5">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((it, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2.5 font-bold text-brand-navy">{it.name}</td>
                      <td className="px-3 py-2.5 text-slate-500">{it.qty}</td>
                      <td className="px-3 py-2.5 text-slate-500" dir="ltr">
                        {formatMoney(it.unitPrice, detailInvCurrency)}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-brand-navy" dir="ltr">
                        {formatMoney(it.total, detailInvCurrency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="bg-brand-light rounded-xl p-4 space-y-1.5 border border-slate-100">
                <Row label="الإجمالي الفرعي" value={formatMoney(detail.subtotal, detailInvCurrency)} />
                {detail.discount > 0 && (
                  <Row label="الخصم" value={`- ${formatMoney(detail.discount, detailInvCurrency)}`} />
                )}
                {detail.tax > 0 && (
                  <Row label="الضريبة" value={formatMoney(detail.tax, detailInvCurrency)} />
                )}
                <div className="flex justify-between font-extrabold text-brand-navy pt-1.5 border-t border-dashed border-slate-200">
                  <span>الإجمالي</span>
                  <span className="text-brand-green" dir="ltr">
                    {formatMoney(detail.total, detailInvCurrency)}
                  </span>
                </div>
                {detailEquivalent != null && (
                  <Row
                    label={`المعادل (${detail.currency} × ${detail.exchangeRate ?? 1})`}
                    value={formatMoney(detailEquivalent, "SAR")}
                  />
                )}
                <Row label="المدفوع" value={formatMoney(detail.paid, detailInvCurrency)} />
                <Row
                  label="المتبقي"
                  value={formatMoney(detail.total - detail.paid, detailInvCurrency)}
                  strong
                />
                {/* التفقيط — المبلغ كتابةً */}
                <div className="mt-2.5 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                  <p className="text-[12.5px] font-bold text-emerald-900 leading-relaxed">
                    {tafqitLine(detail.total, detailInvCurrency)}
                  </p>
                </div>
              </div>

              <InvoiceQr saleId={detail.id} invoiceNo={detail.invoiceNo} isFinal={detail.status === "final"} />

              {/* زر المرتجع — للفواتير النهائية فقط */}
              {(detail.kind ?? "invoice") === "invoice" && detail.status === "final" && (
                <Button
                  onClick={openReturnDialog}
                  variant="outline"
                  className="rounded-xl font-bold gap-1.5 border-amber-300 text-amber-600 hover:bg-amber-50 hover:text-amber-600"
                >
                  <Undo2 className="size-4" />
                  مرتجع / إشعار دائن
                </Button>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button
                  onClick={() => window.print()}
                  variant="outline"
                  className="rounded-xl font-bold gap-1.5 px-2 sm:px-3"
                >
                  <Printer className="size-4" />
                  طباعة الفاتورة
                </Button>
                <Button
                  onClick={openEmailDialog}
                  variant="outline"
                  className="rounded-xl font-bold gap-1.5 px-2 sm:px-3 text-brand-blue hover:text-brand-blue hover:bg-blue-50/60"
                >
                  <Mail className="size-4" />
                  إرسال بالبريد
                </Button>
                <Button
                  onClick={openWaDialog}
                  variant="outline"
                  className="rounded-xl font-bold gap-1.5 px-2 sm:px-3 text-emerald-600 hover:text-emerald-600 hover:bg-emerald-50/60"
                >
                  <MessageCircle className="size-4" />
                  إرسال واتساب
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send invoice by email dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent dir="rtl" className="rounded-2xl max-w-md">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="flex items-center gap-2 text-brand-navy">
              <Mail className="size-4 text-brand-blue" />
              إرسال الفاتورة بالبريد الإلكتروني
            </DialogTitle>
            <DialogDescription>
              ستُرسل الفاتورة <span dir="ltr" className="font-bold">{detail?.invoiceNo}</span> مع
              بنودها ورمز QR الخاص بزتكا إلى البريد المحدد.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="invoice-email-to" className="text-[13px] font-bold text-brand-navy">
                بريد المستلم
              </Label>
              <Input
                id="invoice-email-to"
                dir="ltr"
                className="rounded-xl h-10 text-[13px]"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-email-msg" className="text-[13px] font-bold text-brand-navy">
                رسالة اختيارية
              </Label>
              <Textarea
                id="invoice-email-msg"
                className="rounded-xl min-h-20 text-[13px]"
                value={emailMsg}
                onChange={(e) => setEmailMsg(e.target.value)}
                placeholder="مثال: شكراً لتعاملكم معنا، مرفق فاتورتكم..."
              />
            </div>
            {company && !company.emailConfigured && (
              <p className="text-[11.5px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-relaxed">
                وضع المحاكاة مفعّل حالياً — ستُحفظ الرسالة في سجل البريد دون إرسال فعلي حتى تهيئة
                مفتاح RESEND_API_KEY.
              </p>
            )}
          </div>
          <DialogFooter className="flex-row gap-2 sm:justify-start">
            <Button
              onClick={sendInvoiceEmail}
              disabled={sendingEmail || !emailTo.trim()}
              className="rounded-xl flex-1 font-bold gap-1.5 bg-brand-blue hover:bg-brand-blue/90 text-white"
            >
              {sendingEmail ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {sendingEmail ? "جارٍ الإرسال..." : "إرسال"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setEmailOpen(false)}
              disabled={sendingEmail}
              className="rounded-xl flex-1 font-bold"
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send invoice by WhatsApp dialog */}
      <Dialog open={waOpen} onOpenChange={setWaOpen}>
        <DialogContent dir="rtl" className="rounded-2xl max-w-md">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="flex items-center gap-2 text-brand-navy">
              <MessageCircle className="size-4 text-emerald-600" />
              إرسال الفاتورة عبر الواتساب
            </DialogTitle>
            <DialogDescription>
              ستُرسل ملخص الفاتورة{" "}
              <span dir="ltr" className="font-bold">{detail?.invoiceNo}</span> برسالة نصية إلى رقم
              الجوال المحدد.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="invoice-wa-to" className="text-[13px] font-bold text-brand-navy">
                جوال المستلم (واتساب)
              </Label>
              <Input
                id="invoice-wa-to"
                dir="ltr"
                inputMode="tel"
                className="rounded-xl h-10 text-[13px]"
                value={waTo}
                onChange={(e) => setWaTo(e.target.value)}
                placeholder="05xxxxxxxx"
                autoComplete="tel"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-wa-msg" className="text-[13px] font-bold text-brand-navy">
                رسالة اختيارية
              </Label>
              <Textarea
                id="invoice-wa-msg"
                className="rounded-xl min-h-20 text-[13px]"
                value={waMsg}
                onChange={(e) => setWaMsg(e.target.value)}
                placeholder="مثال: نعتز بثقتكم، هذه فاتورتكم الأخيرة..."
              />
            </div>
            {company && !company.whatsappConfigured && (
              <p className="text-[11.5px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-relaxed">
                وضع المحاكاة مفعّل حالياً — سنفتح لك رابط واتساب جاهزاً بالرسالة، ويسجَّل الإرسال في
                السجل حتى تهيئة تكامل WhatsApp API.
              </p>
            )}
          </div>
          <DialogFooter className="flex-row gap-2 sm:justify-start">
            <Button
              onClick={sendInvoiceWhatsApp}
              disabled={sendingWa || !waTo.trim()}
              className="rounded-xl flex-1 font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {sendingWa ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {sendingWa ? "جارٍ الإرسال..." : "إرسال"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setWaOpen(false)}
              disabled={sendingWa}
              className="rounded-xl flex-1 font-bold"
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* مرتجع المبيعات — محرر الإشعار الدائن */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent
          className="sm:max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="text-brand-navy flex flex-wrap items-center gap-2">
              <Undo2 className="size-5 text-amber-500" />
              مرتجع / إشعار دائن —{" "}
              <span dir="ltr" className="font-mono text-brand-blue">
                {detail?.invoiceNo}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-[12.5px] text-slate-400 leading-relaxed">
              حدّد كمية الإرجاع لكل بند — سيُصدر النظام إشعاراً دائناً بقيمة
              المرتجع ويُعيد الكميات إلى المخزون.
            </p>
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-brand-light text-slate-500 text-[12px]">
                      <th className="text-start font-bold px-3 py-2.5">الصنف</th>
                      <th className="text-start font-bold px-3 py-2.5">الكمية</th>
                      <th className="text-start font-bold px-3 py-2.5">السعر</th>
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
                          {formatMoney(l.it.unitPrice, currency)}
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
                placeholder="سبب الإرجاع أو ملاحظة على الإشعار الدائن (اختياري)..."
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
                <span>إجمالي الإشعار الدائن</span>
                <span className="text-amber-600" dir="ltr">
                  {formatMoney(returnTotal, currency)}
                </span>
              </div>
            </div>

            <Button
              onClick={issueCreditNote}
              disabled={!hasReturn || returnSaving}
              className="w-full min-h-11 rounded-xl font-extrabold gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
            >
              {returnSaving ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  <Undo2 className="size-4" />
                  إصدار الإشعار الدائن
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* حوار إنشاء فاتورة جديدة (تعدد العملات) */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent
          className="sm:max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="text-brand-navy">فاتورة مبيعات جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">العميل</Label>
                <Select
                  value={newForm.contactId}
                  onValueChange={(v) => setNewForm((f) => ({ ...f, contactId: v }))}
                >
                  <SelectTrigger className="w-full data-[size=default]:h-11 rounded-xl border-slate-200 font-bold text-brand-navy bg-white">
                    <SelectValue placeholder="اختر العميل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">عميل نقدي</SelectItem>
                    {newCustomers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">طريقة الدفع</Label>
                <Select
                  value={newForm.paymentMethod}
                  onValueChange={(v) => setNewForm((f) => ({ ...f, paymentMethod: v }))}
                >
                  <SelectTrigger className="w-full data-[size=default]:h-11 rounded-xl border-slate-200 font-bold text-brand-navy bg-white">
                    <SelectValue placeholder="اختر الطريقة" />
                  </SelectTrigger>
                  <SelectContent>
                    {["cash", "card", "transfer", "credit"].map((m) => (
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
                <span>المنتج</span>
                <span>الاسم</span>
                <span>الكمية</span>
                <span>السعر</span>
                <span />
              </div>
              {newLines.map((line, i) => (
                <div
                  key={i}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_4.5rem_6.5rem_2.25rem] items-center"
                >
                  <div className="col-span-2 sm:col-span-1">
                    <Select
                      value={line.productId}
                      onValueChange={(v) => pickNewProduct(i, v)}
                    >
                      <SelectTrigger
                        aria-label={`منتج البند ${i + 1}`}
                        className="w-full data-[size=default]:h-10 rounded-xl border-slate-200 text-[13px] bg-white"
                      >
                        <SelectValue placeholder="اختر منتجاً" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">بند يدوي</SelectItem>
                        {newProducts.map((p) => (
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
                    onChange={(e) => updateNewLine(i, { name: e.target.value })}
                    className="h-10 rounded-xl border-slate-200 col-span-2 sm:col-span-1"
                  />
                  <Input
                    type="number"
                    min="1"
                    dir="ltr"
                    placeholder="1"
                    aria-label={`كمية البند ${i + 1}`}
                    value={line.qty}
                    onChange={(e) => updateNewLine(i, { qty: e.target.value })}
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
                    onChange={(e) => updateNewLine(i, { unitPrice: e.target.value })}
                    className="h-10 rounded-xl border-slate-200"
                  />
                  <button
                    onClick={() => setNewLines((ls) => ls.filter((_, idx) => idx !== i))}
                    disabled={newLines.length <= 1}
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
                onClick={() => setNewLines((ls) => [...ls, emptySaleLine()])}
                className="rounded-xl font-bold gap-1.5 border-dashed border-slate-300 text-brand-blue hover:bg-blue-50 hover:text-brand-blue"
              >
                <Plus className="size-4" />
                إضافة بند
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">الخصم</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newForm.discount}
                  onChange={(e) => setNewForm((f) => ({ ...f, discount: e.target.value }))}
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
                  value={newForm.taxRate}
                  onChange={(e) => setNewForm((f) => ({ ...f, taxRate: e.target.value }))}
                  placeholder="15"
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
              {newForm.paymentMethod === "credit" && (
                <div className="space-y-1.5">
                  <Label className="font-bold text-slate-700">المبلغ المدفوع</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newForm.paid}
                    onChange={(e) => setNewForm((f) => ({ ...f, paid: e.target.value }))}
                    placeholder="0.00"
                    dir="ltr"
                    className="h-11 rounded-xl border-slate-200"
                  />
                </div>
              )}
            </div>

            {/* تعدد العملات */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">عملة الفاتورة</Label>
                <Select
                  value={newForm.currency}
                  onValueChange={(v) =>
                    setNewForm((f) => ({ ...f, currency: v, exchangeRate: v === "SAR" ? "1" : f.exchangeRate }))
                  }
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
              {newIsForeign && (
                <div className="space-y-1.5">
                  <Label className="font-bold text-slate-700">
                    سعر الصرف إلى الريال
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={newForm.exchangeRate}
                    onChange={(e) =>
                      setNewForm((f) => ({ ...f, exchangeRate: e.target.value }))
                    }
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

            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">ملاحظة</Label>
              <Textarea
                value={newForm.note}
                onChange={(e) => setNewForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="ملاحظة على الفاتورة (اختياري)..."
                className="rounded-xl min-h-16 text-[13px]"
              />
            </div>

            {/* الإجماليات الحية */}
            <div className="rounded-xl bg-brand-light border border-slate-100 p-3 space-y-1.5 text-[13px]">
              <div className="flex justify-between">
                <span className="text-slate-500">المجموع قبل الخصم</span>
                <span className="font-bold text-brand-navy" dir="ltr">
                  {formatMoney(newSubtotal, newForm.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الخصم</span>
                <span className="font-bold text-rose-500" dir="ltr">
                  - {formatMoney(newDiscountVal, newForm.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">
                  ضريبة القيمة المضافة ({newTaxRateVal}%)
                </span>
                <span className="font-bold text-brand-navy" dir="ltr">
                  {formatMoney(newTaxVal, newForm.currency)}
                </span>
              </div>
              <div className="flex justify-between font-extrabold text-brand-navy pt-1.5 border-t border-dashed border-slate-200">
                <span>الإجمالي</span>
                <span className="text-brand-green" dir="ltr">
                  {formatMoney(newGrandTotal, newForm.currency)}
                </span>
              </div>
              {newIsForeign && (
                <div className="flex justify-between text-[12.5px]">
                  <span className="text-slate-500">المعادل (ر.س)</span>
                  <span className="font-bold text-brand-teal" dir="ltr">
                    {formatMoney(newEquivalent, "SAR")}
                  </span>
                </div>
              )}
            </div>

            <Button
              onClick={submitNewInvoice}
              disabled={newSaving}
              className="w-full min-h-11 rounded-xl font-extrabold bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
            >
              {newSaving ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  <Plus className="size-4" />
                  إصدار الفاتورة
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl" className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف الفاتورة</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الفاتورة «{deleteTarget?.invoiceNo}» وإرجاع الكميات إلى
              المخزون. هل أنت متأكد؟
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-brand-light rounded-xl px-3.5 py-2.5 border border-slate-100">
      <p className="text-[11px] text-slate-400 font-bold">{label}</p>
      <p className="font-bold text-brand-navy mt-0.5">{value}</p>
    </div>
  );
}

/** رمز QR لزتكا داخل عرض الفاتورة — يتولّد تلقائياً عند توفر الرقم الضريبي */
function InvoiceQr({ saleId, invoiceNo, isFinal }: { saleId: string; invoiceNo: string; isFinal: boolean }) {
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFinal) return;
    let cancelled = false;
    fetch("/api/zatca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "qr", saleId }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "تعذر توليد رمز QR");
        if (!cancelled) setQr(d.qr);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "تعذر توليد رمز QR");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [saleId, isFinal]);

  if (!isFinal) return null;

  return (
    <div className="rounded-xl border border-teal-100 bg-teal-50/40 p-3.5 flex items-center gap-3.5">
      {loading ? (
        <div className="size-[88px] rounded-xl bg-white border border-teal-100 flex items-center justify-center">
          <Loader2 className="size-6 animate-spin text-teal-400" />
        </div>
      ) : qr ? (
        <img
          src={qr}
          alt={`رمز QR لزتكا للفاتورة ${invoiceNo}`}
          className="size-[88px] rounded-xl bg-white border border-teal-100"
        />
      ) : (
        <div className="size-[88px] rounded-xl bg-white border border-amber-100 flex items-center justify-center">
          <QrCode className="size-7 text-amber-300" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-extrabold text-brand-navy flex items-center gap-1.5">
          <ShieldCheck className="size-4 text-brand-teal" />
          فاتورة إلكترونية — زتكا (المرحلة الأولى)
        </p>
        {qr ? (
          <p className="text-[11.5px] text-slate-500 mt-1 leading-relaxed">
            رمز QR متوافق: اسم البائع، الرقم الضريبي، الطابع الزمني، الإجمالي، والضريبة
          </p>
        ) : error ? (
          <p className="text-[11.5px] text-amber-600 mt-1 leading-relaxed">{error}</p>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between text-[13px]">
      <span className="text-slate-500">{label}</span>
      <span className={cn("font-bold", strong ? "text-amber-600" : "text-brand-navy")} dir="ltr">
        {value}
      </span>
    </div>
  );
}
