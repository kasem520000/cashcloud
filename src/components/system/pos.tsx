"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Loader2,
  Banknote,
  CreditCard,
  Landmark,
  Clock,
  PackageSearch,
  Receipt,
  Printer,
  MapPin,
  Warehouse as WarehouseIcon,
  Lock,
  LockOpen,
  Wallet,
  ScanBarcode,
  X,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type {
  Product,
  Contact,
  SaleItem,
  BranchRecord,
  WarehouseRecord,
  ActiveShift,
  ReceiptData,
  ReceiptCompany,
} from "./types";
import { formatMoney, formatDateTime, PAYMENT_METHOD_LABELS, CURRENCY_LABELS } from "./types";
import { cn } from "@/lib/utils";

type CartLine = {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  stock: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function PosView({
  currency,
  onDataChange,
}: {
  currency: string;
  onDataChange: () => void;
}) {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [whLevels, setWhLevels] = useState<Record<string, number>>({});
  const [shift, setShift] = useState<ActiveShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("walkin");
  const [branchId, setBranchId] = useState("none");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [discount, setDiscount] = useState("0");
  const [taxRate, setTaxRate] = useState("15");
  const [paidAmount, setPaidAmount] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // ===== الوردية =====
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [openingCash, setOpeningCash] = useState("0");
  const [shiftBusy, setShiftBusy] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [countedCash, setCountedCash] = useState("");

  // ===== الإيصال =====
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [receiptCompany, setReceiptCompany] = useState<ReceiptCompany | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const loadShift = useCallback(async () => {
    try {
      const res = await fetch("/api/pos/shifts");
      if (!res.ok) return;
      const data = await res.json();
      setShift(data.active ?? null);
    } catch {
      /* تجاهل */
    }
  }, []);

  const loadProducts = useCallback(() => {
    fetch("/api/products?pageSize=100")
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/products?pageSize=100").then((r) => r.json()),
      fetch("/api/contacts?type=customer").then((r) => r.json()),
      fetch("/api/branches").then((r) => r.json()),
      fetch("/api/pos/shifts").then((r) => r.json()),
      fetch("/api/warehouses").then((r) => r.json()),
    ])
      .then(([p, c, b, s, w]) => {
        if (cancelled) return;
        setProducts(p.products ?? []);
        setCustomers(c.contacts ?? []);
        setBranches(b.branches ?? []);
        setShift(s.active ?? null);
        setWarehouses(w.warehouses ?? []);
        if (w.defaultWarehouseId) setWarehouseId(w.defaultWarehouseId);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // جلب أرصدة المستودع المحدد (تعدد المستودعات)
  const loadWarehouseLevels = useCallback(async (whId: string) => {
    if (!whId) return;
    try {
      const res = await fetch(`/api/warehouses?levels=1&warehouseId=${whId}`);
      if (!res.ok) return;
      const data = await res.json();
      const map: Record<string, number> = {};
      for (const l of data.levels ?? []) {
        map[l.productId] = l.quantity;
      }
      setWhLevels(map);
    } catch {
      /* تجاهل */
    }
  }, []);

  const prevWarehouseRef = useRef(warehouseId);
  useEffect(() => {
    if (!warehouseId) return;
    // تغيير المستودع يفرغ السلة (الأرصدة تختلف بين المستودعات)
    if (prevWarehouseRef.current && prevWarehouseRef.current !== warehouseId) {
      setCart([]);
    }
    prevWarehouseRef.current = warehouseId;
    loadWarehouseLevels(warehouseId);
  }, [warehouseId, loadWarehouseLevels]);

  /** الرصيد المتاح للصنف في المستودع المحدد */
  const stockOf = useCallback(
    (p: Product) => (warehouseId ? whLevels[p.id] ?? 0 : p.stock),
    [warehouseId, whLevels]
  );

  const categories = useMemo(
    () => ["all", ...new Set(products.map((p) => p.category).filter(Boolean))],
    [products]
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return products.filter(
      (p) =>
        p.isActive &&
        (category === "all" || p.category === category) &&
        (!query ||
          p.name.toLowerCase().includes(query) ||
          p.sku.toLowerCase().includes(query))
    );
  }, [products, q, category]);

  const subtotal = cart.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const discountVal = Math.min(Math.max(0, Number(discount) || 0), subtotal);
  const taxVal = r2(((subtotal - discountVal) * (Number(taxRate) || 0)) / 100);
  const total = r2(subtotal - discountVal + taxVal);

  function addToCart(p: Product) {
    const available = stockOf(p);
    setCart((c) => {
      const existing = c.find((l) => l.productId === p.id);
      if (existing) {
        if (existing.qty + 1 > available) {
          toast({
            variant: "destructive",
            title: "المخزون غير كافٍ",
            description: `متوفر من ${p.name}: ${available} فقط`,
          });
          return c;
        }
        return c.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l));
      }
      if (available < 1) {
        toast({
          variant: "destructive",
          title: "نفد المخزون",
          description: `${p.name} غير متوفر حالياً`,
        });
        return c;
      }
      return [
        ...c,
        { productId: p.id, name: p.name, qty: 1, unitPrice: p.salePrice, stock: available },
      ];
    });
  }

  function changeQty(productId: string, delta: number) {
    setCart((c) =>
      c
        .map((l) => {
          if (l.productId !== productId) return l;
          const next = l.qty + delta;
          if (next > l.stock) {
            toast({
              variant: "destructive",
              title: "المخزون غير كافٍ",
              description: `متوفر: ${l.stock} فقط`,
            });
            return l;
          }
          return { ...l, qty: next };
        })
        .filter((l) => l.qty > 0)
    );
  }

  /** ماسح الباركود: Enter مع تطابق SKU واحد يضيف مباشرة */
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const query = q.trim().toLowerCase();
    if (!query) return;
    const exact = products.filter(
      (p) =>
        p.isActive &&
        (p.sku.toLowerCase() === query || p.name.toLowerCase() === query)
    );
    if (exact.length === 1) {
      addToCart(exact[0]);
      setQ("");
      e.preventDefault();
    }
  }

  // ===== إدارة الوردية =====

  async function openShift() {
    setShiftBusy(true);
    try {
      const res = await fetch("/api/pos/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openingCash: Number(openingCash) || 0,
          branchId: branchId !== "none" ? branchId : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "تعذر فتح الوردية",
          description: data.error ?? "حدث خطأ غير متوقع",
        });
        return;
      }
      toast({ title: "فُتحت الوردية", description: "يمكنك الآن بدء البيع" });
      setShiftDialogOpen(false);
      await loadShift();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setShiftBusy(false);
    }
  }

  async function closeShift() {
    if (!shift) return;
    setShiftBusy(true);
    try {
      const res = await fetch("/api/pos/shifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shiftId: shift.id,
          countedCash: Number(countedCash) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "تعذر إغلاق الوردية",
          description: data.error ?? "حدث خطأ غير متوقع",
        });
        return;
      }
      const rep = data.report;
      const diffTxt =
        rep.cashDifference === 0
          ? "لا فرق في الصندوق ✓"
          : `${rep.cashDifference > 0 ? "زيادة" : "عجز"} ${Math.abs(rep.cashDifference).toFixed(2)}`;
      toast({
        title: "أُغلقت الوردية",
        description: `مبيعات: ${rep.salesTotal.toFixed(2)} — ${diffTxt}`,
      });
      setCloseDialogOpen(false);
      setCountedCash("");
      await loadShift();
      onDataChange();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setShiftBusy(false);
    }
  }

  // ===== إتمام البيع =====

  async function showReceipt(saleId: string) {
    try {
      const res = await fetch(`/api/pos/receipt/${saleId}`);
      if (!res.ok) return;
      const data = await res.json();
      setReceipt(data.receipt);
      setReceiptCompany(data.company);
      setReceiptOpen(true);
    } catch {
      /* تجاهل */
    }
  }

  async function submitSale() {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      const items: SaleItem[] = cart.map((l) => ({
        productId: l.productId,
        name: l.name,
        qty: l.qty,
        unitPrice: l.unitPrice,
        total: l.qty * l.unitPrice,
      }));
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          contactId: customerId === "walkin" ? null : customerId,
          discount: discountVal,
          taxRate: Number(taxRate) || 0,
          paymentMethod,
          paid: paymentMethod === "credit" ? Number(paidAmount) || 0 : total,
          status: "final",
          branchId: branchId !== "none" ? branchId : null,
          warehouseId: warehouseId || null,
          posShiftId: shift?.id ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل إتمام البيع",
          description: data.error ?? "حدث خطأ غير متوقع",
        });
        return;
      }
      toast({
        title: "تمت عملية البيع بنجاح",
        description: `فاتورة ${data.invoiceNo} — ${formatMoney(data.total, currency)}`,
      });
      const saleId = data.id;
      setCart([]);
      setCheckoutOpen(false);
      setDiscount("0");
      setPaidAmount("0");
      setCustomerId("walkin");
      loadProducts();
      if (warehouseId) loadWarehouseLevels(warehouseId);
      loadShift(); // تحديث ملخص الوردية
      onDataChange();
      if (saleId) await showReceipt(saleId);
    } catch {
      toast({
        variant: "destructive",
        title: "خطأ في الاتصال",
        description: "تعذر الاتصال بالخادم",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const activeBranches = branches.filter((b) => b.isActive);
  const activeWarehouses = warehouses.filter((w) => w.isActive);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ===== شريط الفرع والوردية ===== */}
      <div className="flex flex-wrap items-center gap-2.5 px-4 sm:px-5 py-3 border-b border-slate-100 bg-white/70 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <MapPin className="size-4 text-brand-blue" />
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-52 h-10 rounded-xl border-slate-200 font-bold text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">الفرع الرئيسي (بدون فرع)</SelectItem>
              {activeBranches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name} — {b.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <WarehouseIcon className="size-4 text-emerald-600" />
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="w-52 h-10 rounded-xl border-slate-200 font-bold text-[13px]">
              <SelectValue placeholder="المستودع..." />
            </SelectTrigger>
            <SelectContent>
              {activeWarehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name} — {w.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1" />

        {shift ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 h-10 px-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <LockOpen className="size-4 text-emerald-600" />
              <div className="text-[12px] leading-tight">
                <span className="font-extrabold text-emerald-700">وردية مفتوحة</span>
                <span className="text-emerald-600/80"> منذ {formatDateTime(shift.openedAt)}</span>
              </div>
              {shift.summary && (
                <span className="text-[12px] font-extrabold text-emerald-800 bg-white px-2 py-0.5 rounded-lg" dir="ltr">
                  {shift.summary.salesCount} فاتورة · {r2(shift.summary.salesTotal).toLocaleString("ar-EG", { maximumFractionDigits: 0 })}
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCountedCash(
                  shift.summary ? String(shift.summary.expectedCash) : String(shift.openingCash)
                );
                setCloseDialogOpen(true);
              }}
              className="h-10 rounded-xl border-red-200 text-red-600 hover:bg-red-50 font-bold"
            >
              <Lock className="size-4 ml-1" />
              إغلاق الوردية
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShiftDialogOpen(true)}
            className="h-10 rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-bold"
          >
            <LockOpen className="size-4 ml-1" />
            فتح وردية جديدة
          </Button>
        )}
      </div>

      <div className="flex h-full min-h-0 flex-1">
        {/* Products area */}
        <div className="flex-1 min-w-0 flex flex-col p-4 sm:p-5 gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-56">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="ابحث بالاسم أو امسح الباركود ثم Enter..."
                className="ps-10 h-11 rounded-xl bg-white border-slate-200"
              />
              <span className="absolute end-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 text-[11px] text-slate-400 font-bold">
                <ScanBarcode className="size-3.5" />
                باركود
              </span>
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-44 h-11 rounded-xl bg-white border-slate-200 font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c === "all" ? "كل المجموعات" : c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              <Loader2 className="size-8 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-2">
              <PackageSearch className="size-14" />
              <p className="text-slate-400 text-sm">لا توجد أصناف مطابقة</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 pb-2">
                {filtered.map((p) => {
                  const available = stockOf(p);
                  return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    disabled={available < 1}
                    className="bg-white rounded-2xl border border-slate-100 p-3.5 text-start shadow-[0_3px_12px_rgba(15,23,42,0.05)] hover:shadow-[0_8px_20px_rgba(37,99,235,0.13)] hover:-translate-y-0.5 hover:border-blue-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <div className="size-11 rounded-xl bg-gradient-to-br from-blue-50 to-emerald-50 flex items-center justify-center mb-2.5 text-brand-blue">
                      <Receipt className="size-5" />
                    </div>
                    <p className="font-bold text-[13.5px] text-brand-navy leading-snug line-clamp-2 min-h-9">
                      {p.name}
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5" dir="ltr">
                      {p.sku}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[14px] font-extrabold text-brand-green" dir="ltr">
                        {formatMoney(p.salePrice, currency)}
                      </span>
                      <span
                        className={cn(
                          "text-[11px] font-bold px-2 py-0.5 rounded-full",
                          available <= p.alertQuantity
                            ? "bg-red-50 text-red-500"
                            : "bg-slate-100 text-slate-500"
                        )}
                      >
                        {available} {p.unit}
                      </span>
                    </div>
                  </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Cart */}
        <div className="w-full sm:w-[380px] shrink-0 flex flex-col bg-white border-s border-slate-100 rounded-s-2xl sm:rounded-s-none shadow-[-6px_0_20px_rgba(15,23,42,0.04)]">
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-extrabold text-brand-navy flex items-center gap-2">
              <ShoppingCart className="size-5 text-brand-blue" />
              سلة البيع
            </h2>
            <span className="text-[12px] font-bold bg-blue-50 text-brand-blue px-2.5 py-1 rounded-full">
              {cart.length} صنف
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 [scrollbar-width:thin] min-h-0">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-2 py-10">
                <ShoppingCart className="size-12" />
                <p className="text-sm text-slate-400">السلة فارغة — اختر أصنافاً للبيع</p>
              </div>
            ) : (
              <ul className="list-none p-0 m-0 space-y-2">
                {cart.map((l) => (
                  <li
                    key={l.productId}
                    className="bg-brand-light rounded-xl p-3 border border-slate-100"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-bold text-brand-navy leading-snug flex-1">
                        {l.name}
                      </p>
                      <button
                        onClick={() =>
                          setCart((c) => c.filter((x) => x.productId !== l.productId))
                        }
                        className="text-slate-300 hover:text-red-500 transition-colors"
                        aria-label={`إزالة ${l.name}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => changeQty(l.productId, -1)}
                          className="size-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:border-brand-blue hover:text-brand-blue transition-colors"
                          aria-label="تقليل الكمية"
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <span className="min-w-8 text-center text-[14px] font-extrabold text-brand-navy">
                          {l.qty}
                        </span>
                        <button
                          onClick={() => changeQty(l.productId, 1)}
                          className="size-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:border-brand-blue hover:text-brand-blue transition-colors"
                          aria-label="زيادة الكمية"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      <div className="text-end">
                        <p className="text-[13px] font-extrabold text-brand-green" dir="ltr">
                          {formatMoney(l.qty * l.unitPrice, currency)}
                        </p>
                        <p className="text-[11px] text-slate-400" dir="ltr">
                          {formatMoney(l.unitPrice, currency)} × {l.qty}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Summary */}
          <div className="border-t border-slate-100 p-4 space-y-2.5">
            <div className="flex justify-between text-[13px] text-slate-500">
              <span>الإجمالي الفرعي</span>
              <span dir="ltr">{formatMoney(subtotal, currency)}</span>
            </div>
            <div className="flex justify-between text-[13px] text-slate-500">
              <span>الضريبة ({taxRate}%)</span>
              <span dir="ltr">{formatMoney(taxVal, currency)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-dashed border-slate-200">
              <span className="font-extrabold text-brand-navy">الإجمالي النهائي</span>
              <span className="text-xl font-extrabold text-brand-green" dir="ltr">
                {formatMoney(total, currency)}
              </span>
            </div>
            <Button
              onClick={() => setCheckoutOpen(true)}
              disabled={cart.length === 0}
              className="w-full min-h-12 rounded-xl font-extrabold text-[15px] text-white bg-gradient-to-l from-brand-blue via-brand-cyan to-brand-green hover:opacity-95 shadow-[0_10px_24px_rgba(37,99,235,0.25)] disabled:opacity-50"
            >
              إتمام البيع ({formatMoney(total, currency)})
            </Button>
          </div>
        </div>
      </div>

      {/* ===== حوار فتح الوردية ===== */}
      <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-brand-navy flex items-center gap-2">
              <LockOpen className="size-5 text-emerald-600" />
              فتح وردية كاشير
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">الفرع</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">الفرع الرئيسي (بدون فرع)</SelectItem>
                  {activeBranches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} — {b.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">رصيد الصندوق الافتتاحي</Label>
              <Input
                type="number"
                min="0"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                className="h-11 rounded-xl border-slate-200"
                dir="ltr"
              />
              <p className="text-[12px] text-slate-400">
                المبلغ النقدي الموجود في الدرج قبل بدء البيع
              </p>
            </div>
            <Button
              onClick={openShift}
              disabled={shiftBusy}
              className="w-full min-h-12 rounded-xl font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {shiftBusy ? <Loader2 className="size-5 animate-spin" /> : "بدء الوردية"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== حوار إغلاق الوردية (تقرير Z) ===== */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-brand-navy flex items-center gap-2">
              <Wallet className="size-5 text-red-500" />
              إغلاق الوردية وتقرير الصندوق
            </DialogTitle>
          </DialogHeader>
          {shift?.summary && (
            <div className="rounded-xl border border-slate-200 overflow-hidden text-[13px]">
              <div className="bg-slate-50 px-3.5 py-2 font-bold text-brand-navy border-b border-slate-200">
                ملخص مبيعات الوردية
              </div>
              <div className="divide-y divide-slate-100">
                <div className="flex justify-between px-3.5 py-2">
                  <span className="text-slate-500">عدد الفواتير</span>
                  <span className="font-bold">{shift.summary.salesCount}</span>
                </div>
                <div className="flex justify-between px-3.5 py-2">
                  <span className="text-slate-500">إجمالي المبيعات</span>
                  <span className="font-bold" dir="ltr">
                    {formatMoney(shift.summary.salesTotal, currency)}
                  </span>
                </div>
                <div className="flex justify-between px-3.5 py-2">
                  <span className="text-slate-500">المرتجعات</span>
                  <span className="font-bold" dir="ltr">
                    {formatMoney(shift.summary.returnsTotal, currency)}
                  </span>
                </div>
                <div className="flex justify-between px-3.5 py-2">
                  <span className="text-slate-500">ض.ق.م المحصلة</span>
                  <span className="font-bold" dir="ltr">
                    {formatMoney(shift.summary.taxTotal, currency)}
                  </span>
                </div>
                <div className="flex justify-between px-3.5 py-2">
                  <span className="text-slate-500">الرصيد الافتتاحي</span>
                  <span className="font-bold" dir="ltr">
                    {formatMoney(shift.openingCash, currency)}
                  </span>
                </div>
                <div className="flex justify-between px-3.5 py-2 bg-emerald-50/60">
                  <span className="text-slate-600 font-bold">النقدي المتوقع في الدرج</span>
                  <span className="font-extrabold text-emerald-700" dir="ltr">
                    {formatMoney(shift.summary.expectedCash, currency)}
                  </span>
                </div>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="font-bold text-slate-700">النقدي المحصور فعلياً</Label>
            <Input
              type="number"
              min="0"
              value={countedCash}
              onChange={(e) => setCountedCash(e.target.value)}
              className="h-11 rounded-xl border-slate-200"
              dir="ltr"
            />
            {shift?.summary && (
              <p
                className={cn(
                  "text-[12px] font-bold",
                  (Number(countedCash) || 0) - shift.summary.expectedCash === 0
                    ? "text-emerald-600"
                    : "text-red-500"
                )}
                dir="auto"
              >
                الفرق:{" "}
                {r2((Number(countedCash) || 0) - shift.summary.expectedCash).toFixed(2)}{" "}
                {CURRENCY_LABELS[currency] ?? currency}
              </p>
            )}
          </div>
          <Button
            onClick={closeShift}
            disabled={shiftBusy}
            className="w-full min-h-12 rounded-xl font-extrabold bg-red-600 hover:bg-red-700 text-white"
          >
            {shiftBusy ? <Loader2 className="size-5 animate-spin" /> : "تأكيد الإغلاق"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* ===== حوار إتمام البيع ===== */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-brand-navy">إتمام عملية البيع</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">العميل</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="walkin">عميل نقدي</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">الخصم</Label>
                <Input
                  type="number"
                  min="0"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="h-11 rounded-xl border-slate-200"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">الضريبة %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  className="h-11 rounded-xl border-slate-200"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">طريقة الدفع</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "cash", label: "نقدي", icon: Banknote },
                  { value: "card", label: "بطاقة", icon: CreditCard },
                  { value: "transfer", label: "تحويل بنكي", icon: Landmark },
                  { value: "credit", label: "آجل", icon: Clock },
                ].map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setPaymentMethod(m.value)}
                    className={cn(
                      "flex items-center justify-center gap-2 min-h-11 rounded-xl border-[1.5px] text-[13px] font-bold transition-colors",
                      paymentMethod === m.value
                        ? "border-brand-blue bg-blue-50 text-brand-blue"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    <m.icon className="size-4" />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === "credit" && (
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">المبلغ المدفوع مقدماً</Label>
                <Input
                  type="number"
                  min="0"
                  max={total}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  className="h-11 rounded-xl border-slate-200"
                  dir="ltr"
                />
                <p className="text-[12px] text-slate-400">
                  المتبقي: {formatMoney(Math.max(0, total - (Number(paidAmount) || 0)), currency)}
                </p>
              </div>
            )}

            <div className="bg-brand-light rounded-xl p-3.5 space-y-1.5 border border-slate-100">
              <div className="flex justify-between text-[13px] text-slate-500">
                <span>الإجمالي الفرعي</span>
                <span dir="ltr">{formatMoney(subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-[13px] text-slate-500">
                <span>الخصم</span>
                <span dir="ltr">- {formatMoney(discountVal, currency)}</span>
              </div>
              <div className="flex justify-between text-[13px] text-slate-500">
                <span>الضريبة</span>
                <span dir="ltr">{formatMoney(taxVal, currency)}</span>
              </div>
              <div className="flex justify-between font-extrabold text-brand-navy pt-1.5 border-t border-dashed border-slate-200">
                <span>المطلوب</span>
                <span className="text-brand-green" dir="ltr">
                  {formatMoney(total, currency)}
                </span>
              </div>
            </div>

            <Button
              onClick={submitSale}
              disabled={submitting}
              className="w-full min-h-12 rounded-xl font-extrabold text-[15px] text-white bg-gradient-to-l from-brand-blue via-brand-cyan to-brand-green hover:opacity-95"
            >
              {submitting ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  <Banknote className="size-5 ml-1" />
                  تأكيد البيع وطباعة الفاتورة
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== حوار الإيصال القابل للطباعة ===== */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="sm:max-w-[380px] rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-brand-navy flex items-center gap-2">
              <Printer className="size-5 text-brand-blue" />
              إيصال الفاتورة المبسطة
            </DialogTitle>
          </DialogHeader>
          {receipt && receiptCompany && (
            <>
              <div
                id="pos-receipt-print"
                className="bg-white rounded-xl border border-dashed border-slate-300 p-4 text-[12px] font-mono text-slate-800 leading-relaxed"
              >
                <div className="text-center">
                  <p className="font-bold text-[14px] text-brand-navy">{receiptCompany.name}</p>
                  {receiptCompany.taxNumber && (
                    <p dir="ltr">VAT: {receiptCompany.taxNumber}</p>
                  )}
                  {receiptCompany.crNumber && <p dir="ltr">CR: {receiptCompany.crNumber}</p>}
                  {receiptCompany.phone && <p dir="ltr">Tel: {receiptCompany.phone}</p>}
                  {receipt.branchName && (
                    <p className="font-bold">فرع: {receipt.branchName}</p>
                  )}
                  <p className="mt-1 border-t border-dashed border-slate-300 pt-1">
                    {receipt.kind === "credit-note" ? "إشعار دائن (مرتجع)" : "فاتورة ضريبية مبسطة"}
                  </p>
                </div>

                <div className="border-t border-dashed border-slate-300 my-1.5 py-1.5">
                  <div className="flex justify-between">
                    <span>الرقم:</span>
                    <span className="font-bold" dir="ltr">{receipt.invoiceNo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>التاريخ:</span>
                    <span dir="ltr">{formatDateTime(receipt.date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>العميل:</span>
                    <span>{receipt.contactName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>الدفع:</span>
                    <span>{PAYMENT_METHOD_LABELS[receipt.paymentMethod] ?? receipt.paymentMethod}</span>
                  </div>
                </div>

                <div className="border-t border-dashed border-slate-300 my-1.5 py-1.5">
                  <div className="flex justify-between font-bold text-[11px] text-slate-500">
                    <span>الصنف</span>
                    <span>كمية × سعر = إجمالي</span>
                  </div>
                  {receipt.items.map((it, i) => (
                    <div key={i} className="flex justify-between mt-1">
                      <span className="truncate max-w-[55%]">{it.name}</span>
                      <span dir="ltr">
                        {it.qty} × {it.unitPrice.toFixed(2)} = {it.total.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-dashed border-slate-300 my-1.5 py-1.5">
                  <div className="flex justify-between">
                    <span>الإجمالي الفرعي</span>
                    <span dir="ltr">{receipt.subtotal.toFixed(2)}</span>
                  </div>
                  {receipt.discount > 0 && (
                    <div className="flex justify-between">
                      <span>الخصم</span>
                      <span dir="ltr">- {receipt.discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>ضريبة القيمة المضافة</span>
                    <span dir="ltr">{receipt.tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-[14px] text-brand-navy mt-1">
                    <span>الإجمالي</span>
                    <span dir="ltr">
                      {receipt.total.toFixed(2)} {CURRENCY_LABELS[receipt.currency] ?? receipt.currency}
                    </span>
                  </div>
                  {receipt.paid > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span>المدفوع</span>
                        <span dir="ltr">{receipt.paid.toFixed(2)}</span>
                      </div>
                      {receipt.change > 0 && (
                        <div className="flex justify-between">
                          <span>المتبقي للعميل</span>
                          <span dir="ltr">{receipt.change.toFixed(2)}</span>
                        </div>
                      )}
                      {receipt.remaining > 0 && (
                        <div className="flex justify-between">
                          <span>آجل</span>
                          <span dir="ltr">{receipt.remaining.toFixed(2)}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {receipt.qrImage && (
                  <div className="border-t border-dashed border-slate-300 my-1.5 pt-2 flex flex-col items-center gap-1">
                    <img
                      src={receipt.qrImage}
                      alt="رمز QR للفاتورة — زتكا"
                      className="size-36"
                    />
                    <p className="text-[10px] text-slate-400">
                      امسح الرمز للتحقق من الفاتورة
                    </p>
                  </div>
                )}

                <p className="text-center text-[10px] text-slate-400 mt-1.5 border-t border-dashed border-slate-300 pt-1.5">
                  شكراً لزيارتكم — {receiptCompany.zatcaEnv === "production" ? "زتكا (إنتاج)" : "زتكا (تجريبي)"}
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => window.print()}
                  className="flex-1 min-h-11 rounded-xl font-extrabold text-white bg-gradient-to-l from-brand-blue to-brand-green"
                >
                  <Printer className="size-4 ml-1" />
                  طباعة الإيصال
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setReceiptOpen(false)}
                  className="min-h-11 rounded-xl font-bold"
                >
                  <X className="size-4 ml-1" />
                  إغلاق
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
