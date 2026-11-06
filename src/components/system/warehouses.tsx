"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Loader2,
  Warehouse as WarehouseIcon,
  Pencil,
  Trash2,
  Power,
  Star,
  StarOff,
  Boxes,
  PackageSearch,
  ArrowLeftRight,
  ClipboardCheck,
  History,
  MapPin,
  User,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
  WarehouseRecord,
  StockLevelRecord,
  StockMovementRecord,
  BranchRecord,
} from "./types";
import { STOCK_MOVEMENT_LABELS, formatMoney, formatDateTime } from "./types";
import { cn } from "@/lib/utils";

type Tab = "warehouses" | "levels" | "movements";

type FormState = {
  name: string;
  code: string;
  branchId: string;
  location: string;
  keeper: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  code: "",
  branchId: "none",
  location: "",
  keeper: "",
  isActive: true,
};

type TransferRow = { productId: string; qty: number };
type AdjustRow = { productId: string; countedQty: string };

export function WarehousesView({
  currency,
  onDataChange,
}: {
  currency: string;
  onDataChange?: () => void;
}) {
  const { toast } = useToast();
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("warehouses");

  // الأرصدة والحركات
  const [levelsWarehouseId, setLevelsWarehouseId] = useState<string>("");
  const [levels, setLevels] = useState<StockLevelRecord[]>([]);
  const [levelsLoading, setLevelsLoading] = useState(false);
  const [movements, setMovements] = useState<StockMovementRecord[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  // إنشاء/تعديل مستودع
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  // تحويل مخزون
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferRows, setTransferRows] = useState<TransferRow[]>([]);
  const [transferLevels, setTransferLevels] = useState<StockLevelRecord[]>([]);
  const [transferNote, setTransferNote] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);

  // تسوية جرد
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustWarehouseId, setAdjustWarehouseId] = useState("");
  const [adjustRows, setAdjustRows] = useState<AdjustRow[]>([]);
  const [adjustLevels, setAdjustLevels] = useState<StockLevelRecord[]>([]);
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustBusy, setAdjustBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, b] = await Promise.all([
        fetch("/api/warehouses").then((r) => r.json()),
        fetch("/api/branches").then((r) => r.json()),
      ]);
      setWarehouses(w.warehouses ?? []);
      setBranches(b.branches ?? []);
      if (!levelsWarehouseId && w.defaultWarehouseId) {
        setLevelsWarehouseId(w.defaultWarehouseId);
      }
    } catch {
      /* تجاهل */
    } finally {
      setLoading(false);
    }
  }, [levelsWarehouseId]);

  useEffect(() => {
    load();
  }, [load]);

  // جلب أرصدة مستودع محدد
  const loadLevels = useCallback(async (warehouseId: string) => {
    if (!warehouseId) return;
    setLevelsLoading(true);
    try {
      const res = await fetch(`/api/warehouses?levels=1&warehouseId=${warehouseId}`);
      const data = await res.json();
      setLevels(data.levels ?? []);
    } catch {
      /* تجاهل */
    } finally {
      setLevelsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "levels" && levelsWarehouseId) {
      loadLevels(levelsWarehouseId);
    }
  }, [tab, levelsWarehouseId, loadLevels]);

  // جلب الحركات
  useEffect(() => {
    if (tab !== "movements") return;
    setMovementsLoading(true);
    fetch("/api/warehouses?movements=1&limit=100")
      .then((r) => r.json())
      .then((d) => setMovements(d.movements ?? []))
      .catch(() => {})
      .finally(() => setMovementsLoading(false));
  }, [tab]);

  const activeWarehouses = warehouses.filter((w) => w.isActive);

  // ===== إنشاء / تعديل مستودع =====
  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(w: WarehouseRecord) {
    setEditingId(w.id);
    setForm({
      name: w.name,
      code: w.code,
      branchId: w.branch?.code ?? "none",
      location: w.location ?? "",
      keeper: w.keeper ?? "",
      isActive: w.isActive,
    });
    // الربط بالفرع عبر المعرف إن أمكن
    const branch = branches.find((b) => w.branch && b.code === w.branch.code);
    setForm((f) => ({ ...f, branchId: branch?.id ?? "none" }));
    setDialogOpen(true);
  }

  async function submitWarehouse() {
    setBusy(true);
    try {
      const payload = {
        name: form.name,
        location: form.location,
        keeper: form.keeper,
        isActive: form.isActive,
        branchId: form.branchId === "none" ? null : form.branchId,
        ...(editingId ? {} : { code: form.code }),
      };
      const url = editingId ? `/api/warehouses/${editingId}` : "/api/warehouses";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: editingId ? "تعذر تحديث المستودع" : "تعذر إنشاء المستودع",
          description: data.error ?? "حدث خطأ غير متوقع",
        });
        return;
      }
      toast({
        title: editingId ? "تم تحديث المستودع" : "تم إنشاء المستودع",
        description: `${form.name} (${form.code || "بدون رمز"})`,
      });
      setDialogOpen(false);
      await load();
      onDataChange?.();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(w: WarehouseRecord) {
    const res = await fetch(`/api/warehouses/${w.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !w.isActive }),
    });
    if (res.ok) {
      toast({ title: w.isActive ? "عُطّل المستودع" : "فُعّل المستودع", description: w.name });
      await load();
    }
  }

  async function makeDefault(w: WarehouseRecord) {
    const res = await fetch(`/api/warehouses/${w.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast({
        variant: "destructive",
        title: "تعذر التعيين كافتراضي",
        description: data.error ?? "حدث خطأ",
      });
      return;
    }
    toast({ title: "تم التعيين كمستودع افتراضي", description: w.name });
    await load();
  }

  async function removeWarehouse(w: WarehouseRecord) {
    if (!confirm(`حذف المستودع «${w.name}»؟ لا يمكن التراجع.`)) return;
    const res = await fetch(`/api/warehouses/${w.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast({
        variant: "destructive",
        title: "تعذر حذف المستودع",
        description: data.error ?? "حدث خطأ غير متوقع",
      });
      return;
    }
    toast({ title: "حُذف المستودع", description: w.name });
    await load();
  }

  // ===== تحويل مخزون =====
  async function openTransfer() {
    setTransferFrom(activeWarehouses[0]?.id ?? "");
    setTransferTo(activeWarehouses[1]?.id ?? "");
    setTransferRows([]);
    setTransferNote("");
    setTransferOpen(true);
  }

  useEffect(() => {
    if (!transferOpen || !transferFrom) {
      setTransferLevels([]);
      return;
    }
    fetch(`/api/warehouses/transfer?from=${transferFrom}`)
      .then((r) => r.json())
      .then((d) => {
        setTransferLevels(d.levels ?? []);
        setTransferRows([]);
      })
      .catch(() => setTransferLevels([]));
  }, [transferOpen, transferFrom]);

  function setTransferProduct(index: number, productId: string) {
    setTransferRows((rows) =>
      rows.map((r, i) => (i === index ? { ...r, productId } : r))
    );
  }

  async function submitTransfer() {
    const items = transferRows.filter((r) => r.productId && r.qty > 0);
    if (items.length === 0) {
      toast({
        variant: "destructive",
        title: "أضف صنفاً واحداً على الأقل",
        description: "حدد الصنف والكمية المحوّلة",
      });
      return;
    }
    if (!transferFrom || !transferTo || transferFrom === transferTo) {
      toast({
        variant: "destructive",
        title: "حدد مستودع المصدر والهدف",
        description: "يجب أن يكونا مختلفين",
      });
      return;
    }
    setTransferBusy(true);
    try {
      const res = await fetch("/api/warehouses/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromWarehouseId: transferFrom,
          toWarehouseId: transferTo,
          items,
          note: transferNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "تعذر تنفيذ التحويل",
          description: data.error ?? "حدث خطأ غير متوقع",
        });
        return;
      }
      toast({
        title: "تم التحويل بنجاح",
        description: `مستند ${data.refNo} — ${items.length} صنف`,
      });
      setTransferOpen(false);
      await load();
      if (tab === "levels") await loadLevels(levelsWarehouseId);
      onDataChange?.();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setTransferBusy(false);
    }
  }

  // ===== تسوية جرد =====
  async function openAdjust() {
    setAdjustWarehouseId(levelsWarehouseId || activeWarehouses[0]?.id || "");
    setAdjustNote("");
    setAdjustOpen(true);
  }

  useEffect(() => {
    if (!adjustOpen || !adjustWarehouseId) {
      setAdjustLevels([]);
      return;
    }
    fetch(`/api/warehouses?levels=1&warehouseId=${adjustWarehouseId}`)
      .then((r) => r.json())
      .then((d) => {
        setAdjustLevels(d.levels ?? []);
        setAdjustRows((d.levels ?? []).map((l: StockLevelRecord) => ({
          productId: l.productId,
          countedQty: "",
        })));
      })
      .catch(() => setAdjustLevels([]));
  }, [adjustOpen, adjustWarehouseId]);

  async function submitAdjust() {
    const filled = adjustRows.filter((r) => r.countedQty.trim() !== "");
    if (filled.length === 0) {
      toast({
        variant: "destructive",
        title: "أدخل العد الفعلي",
        description: "املأ الكمية الفعلية لصنف واحد على الأقل",
      });
      return;
    }
    setAdjustBusy(true);
    try {
      const res = await fetch("/api/warehouses/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseId: adjustWarehouseId,
          items: filled.map((r) => ({
            productId: r.productId,
            countedQty: Number(r.countedQty),
          })),
          note: adjustNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "تعذر تنفيذ التسوية",
          description: data.error ?? "حدث خطأ غير متوقع",
        });
        return;
      }
      toast({
        title: "تمت تسوية الجرد",
        description: `مستند ${data.refNo} — ${data.changes.length} صنف مُعدّل`,
      });
      setAdjustOpen(false);
      await load();
      if (tab === "levels") await loadLevels(levelsWarehouseId);
      onDataChange?.();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setAdjustBusy(false);
    }
  }

  const totalValue = warehouses.reduce((s, w) => s + w.totalValue, 0);
  const totalItems = warehouses.reduce((s, w) => s + w.itemsCount, 0);
  const selectedLevelsWarehouse = warehouses.find((w) => w.id === levelsWarehouseId);

  const tabs: { key: Tab; label: string; icon: typeof Boxes }[] = [
    { key: "warehouses", label: "المستودعات", icon: WarehouseIcon },
    { key: "levels", label: "الأرصدة", icon: PackageSearch },
    { key: "movements", label: "سجل الحركات", icon: History },
  ];

  const movementBadge = (m: StockMovementRecord) => {
    const isPositive = m.qty > 0;
    return (
      <span
        className={cn(
          "text-[11px] font-bold px-2 py-0.5 rounded-full",
          isPositive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
        )}
      >
        {STOCK_MOVEMENT_LABELS[m.type] ?? m.type}
      </span>
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-navy flex items-center gap-2.5">
            <WarehouseIcon className="size-6 text-brand-blue" />
            المستودعات
          </h1>
          <p className="text-[13px] text-slate-400 mt-1">
            إدارة مخازن متعددة بأرصدة مستقلة — تحويلات بين المستودعات، تسويات جرد، وسجل حركة كامل
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={openTransfer}
            variant="outline"
            disabled={activeWarehouses.length < 2}
            className="rounded-xl font-bold h-11"
          >
            <ArrowLeftRight className="size-4 ml-1" />
            تحويل مخزون
          </Button>
          <Button
            onClick={openAdjust}
            variant="outline"
            disabled={activeWarehouses.length < 1}
            className="rounded-xl font-bold h-11"
          >
            <ClipboardCheck className="size-4 ml-1" />
            تسوية جرد
          </Button>
          <Button
            onClick={openCreate}
            className="rounded-xl font-extrabold text-white bg-gradient-to-l from-brand-blue to-brand-green shadow-[0_8px_20px_rgba(37,99,235,0.25)] h-11"
          >
            <Plus className="size-4 ml-1" />
            مستودع جديد
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-[12px] text-slate-400 font-bold">عدد المستودعات</p>
          <p className="text-2xl font-extrabold text-brand-navy mt-1">
            {warehouses.length}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-[12px] text-slate-400 font-bold">الأصناف المخزّنة</p>
          <p className="text-2xl font-extrabold text-brand-blue mt-1">{totalItems}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-[12px] text-slate-400 font-bold">قيمة المخزون الكلية</p>
          <p className="text-lg font-extrabold text-brand-green mt-1" dir="ltr">
            {formatMoney(totalValue, currency)}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-[12px] text-slate-400 font-bold">المستودع الافتراضي</p>
          <p className="text-[15px] font-extrabold text-brand-navy mt-1.5 truncate">
            {warehouses.find((w) => w.isDefault)?.name ?? "—"}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 bg-white rounded-xl border border-slate-100 p-1.5 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold transition-colors",
              tab === t.key
                ? "bg-gradient-to-l from-brand-blue to-brand-green text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== تبويب المستودعات ===== */}
      {tab === "warehouses" &&
        (loading ? (
          <div className="flex items-center justify-center py-16 text-slate-300">
            <Loader2 className="size-8 animate-spin" />
          </div>
        ) : warehouses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
            <WarehouseIcon className="size-12 text-slate-200 mx-auto mb-3" />
            <p className="font-bold text-brand-navy">لا توجد مستودعات بعد</p>
            <p className="text-[13px] text-slate-400 mt-1">
              أنشئ مستودعاتك المتعددة ووزّع أرصدتك — الشراء يستلم لمستودع والبيع يخصم من مستودع
            </p>
            <Button onClick={openCreate} className="mt-4 rounded-xl font-bold">
              <Plus className="size-4 ml-1" />
              إنشاء المستودع الأول
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {warehouses.map((w) => (
              <div
                key={w.id}
                className={cn(
                  "bg-white rounded-2xl border p-4 transition-shadow hover:shadow-[0_8px_24px_rgba(15,23,42,0.07)]",
                  w.isActive ? "border-slate-100" : "border-slate-200 opacity-70"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={cn(
                        "size-10 rounded-xl flex items-center justify-center shrink-0",
                        w.isActive
                          ? "bg-gradient-to-br from-blue-50 to-emerald-50 text-brand-blue"
                          : "bg-slate-100 text-slate-400"
                      )}
                    >
                      <WarehouseIcon className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-extrabold text-brand-navy truncate flex items-center gap-1.5">
                        {w.name}
                        {w.isDefault && (
                          <Star className="size-3.5 text-amber-400 fill-amber-400 shrink-0" />
                        )}
                      </p>
                      <p className="text-[12px] text-slate-400">
                        <span className="font-mono" dir="ltr">
                          {w.code}
                        </span>
                        {w.branch && (
                          <span className="text-slate-300"> · </span>
                        )}
                        {w.branch && `فرع ${w.branch.name}`}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0",
                      w.isActive
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-slate-100 text-slate-400"
                    )}
                  >
                    {w.isActive ? "نشط" : "معطّل"}
                  </span>
                </div>

                {w.location && (
                  <p className="text-[12px] text-slate-400 mt-2 flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    {w.location}
                  </p>
                )}
                {w.keeper && (
                  <p className="text-[12px] text-slate-400 mt-1 flex items-center gap-1">
                    <User className="size-3.5" />
                    أمين المستودع: {w.keeper}
                  </p>
                )}

                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="rounded-xl bg-brand-light p-2.5 text-center">
                    <Boxes className="size-4 text-brand-blue mx-auto" />
                    <p className="text-[15px] font-extrabold text-brand-navy mt-0.5">
                      {w.itemsCount}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold">صنف</p>
                  </div>
                  <div className="rounded-xl bg-brand-light p-2.5 text-center">
                    <Layers className="size-4 text-brand-blue mx-auto" />
                    <p className="text-[15px] font-extrabold text-brand-navy mt-0.5">
                      {w.totalQty.toLocaleString("ar-EG", { maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold">كمية</p>
                  </div>
                  <div className="rounded-xl bg-brand-light p-2.5 text-center">
                    <PackageSearch className="size-4 text-emerald-500 mx-auto" />
                    <p className="text-[13px] font-extrabold text-brand-green mt-1" dir="ltr">
                      {w.totalValue.toLocaleString("ar-EG", { maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold">قيمة</p>
                  </div>
                </div>

                <div className="flex gap-1.5 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLevelsWarehouseId(w.id);
                      setTab("levels");
                    }}
                    className="flex-1 rounded-lg font-bold h-9"
                  >
                    <PackageSearch className="size-3.5 ml-1" />
                    الأرصدة
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(w)}
                    className="rounded-lg font-bold h-9"
                    aria-label={`تعديل ${w.name}`}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  {!w.isDefault ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => makeDefault(w)}
                      className="rounded-lg font-bold h-9 text-amber-600 border-amber-200 hover:bg-amber-50"
                      aria-label={`تعيين ${w.name} افتراضياً`}
                      title="تعيين كمستودع افتراضي"
                    >
                      <StarOff className="size-3.5" />
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleActive(w)}
                    className="rounded-lg font-bold h-9"
                    aria-label="تفعيل/تعطيل"
                  >
                    <Power className="size-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeWarehouse(w)}
                    className="rounded-lg font-bold h-9 text-red-600 border-red-200 hover:bg-red-50"
                    aria-label={`حذف ${w.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ))}

      {/* ===== تبويب الأرصدة ===== */}
      {tab === "levels" && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-extrabold text-brand-navy flex items-center gap-2">
                <PackageSearch className="size-5 text-brand-blue" />
                أرصدة الأصناف
                {selectedLevelsWarehouse && (
                  <span className="text-[13px] font-bold text-slate-400">
                    — {selectedLevelsWarehouse.name}
                  </span>
                )}
              </h2>
              <p className="text-[12px] text-slate-400 mt-0.5">
                توزيع الكميات والقيمة لكل صنف داخل المستودع المحدد
              </p>
            </div>
            <Select
              value={levelsWarehouseId}
              onValueChange={(v) => setLevelsWarehouseId(v)}
            >
              <SelectTrigger className="w-56 h-10 rounded-xl border-slate-200 font-bold">
                <SelectValue placeholder="اختر المستودع" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} {w.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {levelsLoading ? (
            <div className="flex items-center justify-center py-14 text-slate-300">
              <Loader2 className="size-7 animate-spin" />
            </div>
          ) : levels.length === 0 ? (
            <div className="p-10 text-center">
              <PackageSearch className="size-10 text-slate-200 mx-auto mb-2" />
              <p className="font-bold text-brand-navy">لا توجد أرصدة في هذا المستودع</p>
              <p className="text-[13px] text-slate-400 mt-1">
                الأرصدة تنشأ تلقائياً عند استلام مشتريات أو تحويل مخزون إليه
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0">
                  <tr className="bg-slate-50 text-slate-500 text-[12px]">
                    <th className="text-start font-bold px-4 py-2.5">الصنف</th>
                    <th className="text-start font-bold px-4 py-2.5">SKU</th>
                    <th className="text-center font-bold px-4 py-2.5">الكمية</th>
                    <th className="text-center font-bold px-4 py-2.5">الوحدة</th>
                    <th className="text-center font-bold px-4 py-2.5">القيمة (تكلفة)</th>
                    <th className="text-center font-bold px-4 py-2.5">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {levels.map((l) => (
                    <tr key={l.productId} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 font-bold text-brand-navy">{l.name}</td>
                      <td className="px-4 py-2.5 font-mono text-[12px] text-slate-500" dir="ltr">
                        {l.sku}
                      </td>
                      <td className="px-4 py-2.5 text-center font-extrabold" dir="ltr">
                        {l.quantity.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-500">{l.unit}</td>
                      <td className="px-4 py-2.5 text-center" dir="ltr">
                        {formatMoney(l.value, currency)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {l.low ? (
                          <Badge className="bg-amber-50 text-amber-600 hover:bg-amber-50 border-0">
                            منخفض
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-50 text-emerald-600 hover:bg-emerald-50 border-0">
                            متوفر
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===== تبويب سجل الحركات ===== */}
      {tab === "movements" && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-100">
            <h2 className="font-extrabold text-brand-navy flex items-center gap-2">
              <History className="size-5 text-brand-blue" />
              سجل حركات المخزون
            </h2>
            <p className="text-[12px] text-slate-400 mt-0.5">
              آخر 100 حركة — كل دخول وخروج وتحويل وتسوية مع الرصيد بعد الحركة
            </p>
          </div>
          {movementsLoading ? (
            <div className="flex items-center justify-center py-14 text-slate-300">
              <Loader2 className="size-7 animate-spin" />
            </div>
          ) : movements.length === 0 ? (
            <div className="p-10 text-center">
              <History className="size-10 text-slate-200 mx-auto mb-2" />
              <p className="font-bold text-brand-navy">لا توجد حركات بعد</p>
              <p className="text-[13px] text-slate-400 mt-1">
                تُسجّل الحركات تلقائياً مع كل عملية بيع أو شراء أو تحويل أو تسوية
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0">
                  <tr className="bg-slate-50 text-slate-500 text-[12px]">
                    <th className="text-start font-bold px-4 py-2.5">التاريخ</th>
                    <th className="text-start font-bold px-4 py-2.5">الصنف</th>
                    <th className="text-start font-bold px-4 py-2.5">المستودع</th>
                    <th className="text-center font-bold px-4 py-2.5">الحركة</th>
                    <th className="text-center font-bold px-4 py-2.5">الكمية</th>
                    <th className="text-center font-bold px-4 py-2.5">الرصيد بعدها</th>
                    <th className="text-center font-bold px-4 py-2.5">المستند</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {movements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 text-[12px] text-slate-500 whitespace-nowrap">
                        {formatDateTime(m.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 font-bold text-brand-navy">
                        {m.product.name}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{m.warehouse.name}</td>
                      <td className="px-4 py-2.5 text-center">{movementBadge(m)}</td>
                      <td
                        className={cn(
                          "px-4 py-2.5 text-center font-extrabold font-mono",
                          m.qty > 0 ? "text-emerald-600" : "text-rose-600"
                        )}
                        dir="ltr"
                      >
                        {m.qty > 0 ? "+" : ""}
                        {m.qty}
                      </td>
                      <td className="px-4 py-2.5 text-center font-bold" dir="ltr">
                        {m.balanceAfter}
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono text-[12px] text-slate-500">
                        {m.refNo ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===== Dialog إنشاء/تعديل مستودع ===== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-brand-navy">
              {editingId ? "تعديل المستودع" : "إنشاء مستودع جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">اسم المستودع *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="مستودع الخرج"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">رمز المستودع *</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="WH-01"
                  disabled={!!editingId}
                  className="h-11 rounded-xl border-slate-200 font-mono"
                  dir="ltr"
                />
                {editingId && (
                  <p className="text-[11px] text-slate-400">لا يمكن تغيير الرمز بعد الإنشاء</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">الفرع التابع له</Label>
                <Select
                  value={form.branchId}
                  onValueChange={(v) => setForm({ ...form, branchId: v })}
                >
                  <SelectTrigger className="h-11 rounded-xl border-slate-200">
                    <SelectValue placeholder="بدون فرع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون فرع (مستودع مستقل)</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} {b.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">أمين المستودع</Label>
                <Input
                  value={form.keeper}
                  onChange={(e) => setForm({ ...form, keeper: e.target.value })}
                  placeholder="أبو محمد"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">الموقع / العنوان</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="المنطقة الصناعية — الخرج"
                className="h-11 rounded-xl border-slate-200"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3.5 py-2.5">
              <div>
                <p className="font-bold text-slate-700 text-[13px]">المستودع نشط</p>
                <p className="text-[11px] text-slate-400">
                  المستودعات المعطّلة لا تظهر في نقطة البيع والمشتريات
                </p>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm({ ...form, isActive: v })}
              />
            </div>

            <Button
              onClick={submitWarehouse}
              disabled={
                busy || form.name.trim().length < 2 || (!editingId && form.code.trim().length < 2)
              }
              className="w-full min-h-12 rounded-xl font-extrabold text-white bg-gradient-to-l from-brand-blue to-brand-green"
            >
              {busy ? (
                <Loader2 className="size-5 animate-spin" />
              ) : editingId ? (
                "حفظ التعديلات"
              ) : (
                "إنشاء المستودع"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Dialog تحويل مخزون ===== */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-2xl rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-brand-navy flex items-center gap-2">
              <ArrowLeftRight className="size-5 text-brand-blue" />
              تحويل مخزون بين المستودعات
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">من مستودع (المصدر) *</Label>
                <Select value={transferFrom} onValueChange={(v) => setTransferFrom(v)}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 font-bold">
                    <SelectValue placeholder="اختر المصدر" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeWarehouses
                      .filter((w) => w.id !== transferTo)
                      .map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name} {w.code}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">إلى مستودع (الهدف) *</Label>
                <Select value={transferTo} onValueChange={(v) => setTransferTo(v)}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 font-bold">
                    <SelectValue placeholder="اختر الهدف" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeWarehouses
                      .filter((w) => w.id !== transferFrom)
                      .map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name} {w.code}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* بنود التحويل */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="font-bold text-slate-700">الأصناف المحوّلة</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setTransferRows((rows) => [...rows, { productId: "", qty: 1 }])
                  }
                  disabled={transferLevels.length === 0}
                  className="rounded-lg font-bold h-8"
                >
                  <Plus className="size-3.5 ml-1" />
                  إضافة صنف
                </Button>
              </div>

              {transferLevels.length === 0 ? (
                <p className="text-[13px] text-slate-400 rounded-xl border border-dashed border-slate-200 p-4 text-center">
                  لا توجد أرصدة متاحة في المستودع المصدر
                </p>
              ) : (
                transferRows.map((row, i) => {
                  const available = transferLevels.find(
                    (l) => l.productId === row.productId
                  );
                  const selected = transferRows
                    .filter((_, j) => j !== i)
                    .find((r) => r.productId === row.productId);
                  return (
                    <div key={i} className="flex gap-2 items-center">
                      <Select
                        value={row.productId}
                        onValueChange={(v) => setTransferProduct(i, v)}
                      >
                        <SelectTrigger className="flex-1 h-10 rounded-xl border-slate-200 text-[13px]">
                          <SelectValue placeholder="اختر الصنف" />
                        </SelectTrigger>
                        <SelectContent>
                          {transferLevels
                            .filter((l) => !selected)
                            .map((l) => (
                              <SelectItem key={l.productId} value={l.productId}>
                                {l.name} — متاح {l.quantity}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={1}
                        max={available?.quantity ?? undefined}
                        value={row.qty || ""}
                        onChange={(e) =>
                          setTransferRows((rows) =>
                            rows.map((r, j) =>
                              j === i ? { ...r, qty: Number(e.target.value) || 0 } : r
                            )
                          )
                        }
                        placeholder="الكمية"
                        className="w-28 h-10 rounded-xl border-slate-200"
                        dir="ltr"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setTransferRows((rows) => rows.filter((_, j) => j !== i))
                        }
                        className="rounded-lg h-10 text-red-600 border-red-200 hover:bg-red-50 px-2.5"
                        aria-label="حذف السطر"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">ملاحظة</Label>
              <Input
                value={transferNote}
                onChange={(e) => setTransferNote(e.target.value)}
                placeholder="سبب التحويل (اختياري)"
                className="h-11 rounded-xl border-slate-200"
              />
            </div>

            <Button
              onClick={submitTransfer}
              disabled={transferBusy || transferRows.filter((r) => r.productId && r.qty > 0).length === 0}
              className="w-full min-h-12 rounded-xl font-extrabold text-white bg-gradient-to-l from-brand-blue to-brand-green"
            >
              {transferBusy ? <Loader2 className="size-5 animate-spin" /> : "تنفيذ التحويل"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Dialog تسوية جرد ===== */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-2xl rounded-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-brand-navy flex items-center gap-2">
              <ClipboardCheck className="size-5 text-brand-blue" />
              تسوية جرد المستودع
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">المستودع المجرود *</Label>
              <Select value={adjustWarehouseId} onValueChange={(v) => setAdjustWarehouseId(v)}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 font-bold">
                  <SelectValue placeholder="اختر المستودع" />
                </SelectTrigger>
                <SelectContent>
                  {activeWarehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} {w.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {adjustLevels.length === 0 ? (
              <p className="text-[13px] text-slate-400 rounded-xl border border-dashed border-slate-200 p-4 text-center">
                لا توجد أرصدة دفترية في هذا المستودع
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-[12px] text-slate-400 font-bold">
                  أدخل العد الفعلي للأصناف التي تريد تسويتها فقط — اترك الباقي فارغاً
                </p>
                <div className="max-h-72 overflow-y-auto space-y-1.5 rounded-xl border border-slate-100 p-2.5">
                  {adjustLevels.map((l, i) => {
                    const row = adjustRows[i];
                    const bookQty = l.quantity;
                    const counted = row?.countedQty ? Number(row.countedQty) : null;
                    const diff = counted != null ? counted - bookQty : null;
                    return (
                      <div
                        key={l.productId}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-[13px] text-brand-navy truncate">
                            {l.name}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            الدفتري: <span dir="ltr">{bookQty}</span> {l.unit}
                          </p>
                        </div>
                        <Input
                          type="number"
                          min={0}
                          value={row?.countedQty ?? ""}
                          onChange={(e) =>
                            setAdjustRows((rows) =>
                              rows.map((r, j) =>
                                j === i ? { ...r, countedQty: e.target.value } : r
                              )
                            )
                          }
                          placeholder="العد الفعلي"
                          className="w-28 h-9 rounded-lg border-slate-200 text-[13px]"
                          dir="ltr"
                        />
                        {diff != null && (
                          <span
                            className={cn(
                              "text-[11px] font-extrabold font-mono w-12 text-center",
                              Math.abs(diff) < 0.005
                                ? "text-slate-300"
                                : diff > 0
                                  ? "text-emerald-600"
                                  : "text-rose-600"
                            )}
                            dir="ltr"
                          >
                            {diff > 0 ? "+" : ""}
                            {Math.round(diff * 100) / 100}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">ملاحظة الجرد</Label>
              <Input
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="جرد نهاية الشهر — أبريل"
                className="h-11 rounded-xl border-slate-200"
              />
            </div>

            <Button
              onClick={submitAdjust}
              disabled={adjustBusy || adjustRows.filter((r) => r.countedQty.trim() !== "").length === 0}
              className="w-full min-h-12 rounded-xl font-extrabold text-white bg-gradient-to-l from-brand-blue to-brand-green"
            >
              {adjustBusy ? <Loader2 className="size-5 animate-spin" /> : "اعتماد التسوية"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
