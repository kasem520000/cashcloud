"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Package,
  Loader2,
  PackageSearch,
  Save,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import type { Product } from "./types";
import { formatMoney } from "./types";
import { cn } from "@/lib/utils";

const emptyForm = {
  name: "",
  sku: "",
  category: "عام",
  brand: "",
  unit: "قطعة",
  salePrice: "",
  purchasePrice: "",
  stock: "",
  alertQuantity: "5",
};

export function ProductsView({
  currency,
  onDataChange,
}: {
  currency: string;
  onDataChange: () => void;
}) {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  function load() {
    const params = new URLSearchParams({
      q,
      category,
      page: String(page),
      pageSize: "12",
    });
    fetch(`/api/products?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setProducts(d.products ?? []);
        setCategories(d.categories ?? []);
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
  }, [q, category, page]);

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      name: p.name,
      sku: p.sku,
      category: p.category,
      brand: p.brand ?? "",
      unit: p.unit,
      salePrice: String(p.salePrice),
      purchasePrice: String(p.purchasePrice),
      stock: String(p.stock),
      alertQuantity: String(p.alertQuantity),
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      toast({ variant: "destructive", title: "اسم الصنف مطلوب" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category.trim() || "عام",
        brand: form.brand.trim(),
        unit: form.unit.trim() || "قطعة",
        salePrice: Number(form.salePrice) || 0,
        purchasePrice: Number(form.purchasePrice) || 0,
        stock: Number(form.stock) || 0,
        alertQuantity: Number(form.alertQuantity) || 0,
        ...(editing ? {} : { sku: form.sku.trim() }),
      };
      const res = await fetch(
        editing ? `/api/products/${editing.id}` : "/api/products",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل الحفظ",
          description: data.error,
        });
        return;
      }
      toast({
        title: editing ? "تم تحديث الصنف" : "تمت إضافة الصنف",
        description: form.name,
      });
      setDialogOpen(false);
      load();
      onDataChange();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: Product) {
    setDeleteTarget(null);
    const res = await fetch(`/api/products/${p.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast({ variant: "destructive", title: "فشل الحذف", description: data.error });
      return;
    }
    toast({
      title: data.deactivated ? "تم تعطيل الصنف" : "تم حذف الصنف",
      description: data.deactivated
        ? "لا يمكن حذف صنف مرتبط بعمليات — تم تعطيله بدلاً من ذلك"
        : p.name,
    });
    load();
    onDataChange();
  }

  return (
    <div className="p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-navy flex items-center gap-2">
            <Package className="size-6 text-brand-blue" />
            الأصناف
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">{total} صنف مسجل</p>
        </div>
        <div className="flex-1" />
        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="بحث في الأصناف..."
            className="ps-10 h-10 rounded-xl bg-white border-slate-200"
          />
        </div>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-bold text-slate-700 outline-none focus:border-brand-blue"
          aria-label="تصفية بالمجموعة"
        >
          <option value="">كل المجموعات</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Button
          onClick={openAdd}
          className="h-10 rounded-xl bg-brand-green hover:bg-emerald-600 font-extrabold gap-1.5"
        >
          <Plus className="size-4" />
          إضافة
        </Button>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="size-8 animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
            <PackageSearch className="size-14" />
            <p className="text-slate-400 text-sm">لا توجد أصناف — أضف أول صنف</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-brand-light text-slate-500 text-[12px]">
                    <th className="text-start font-bold px-4 py-3">الصنف</th>
                    <th className="text-start font-bold px-4 py-3">الرمز</th>
                    <th className="text-start font-bold px-4 py-3">المجموعة</th>
                    <th className="text-start font-bold px-4 py-3">سعر البيع</th>
                    <th className="text-start font-bold px-4 py-3">سعر الشراء</th>
                    <th className="text-start font-bold px-4 py-3">المخزون</th>
                    <th className="text-start font-bold px-4 py-3">الحالة</th>
                    <th className="text-start font-bold px-4 py-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr
                      key={p.id}
                      className="border-t border-slate-100 hover:bg-blue-50/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="size-9 rounded-lg bg-gradient-to-br from-blue-50 to-emerald-50 flex items-center justify-center text-brand-blue shrink-0">
                            <Package className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-brand-navy truncate max-w-44">
                              {p.name}
                            </p>
                            <p className="text-[11px] text-slate-400">{p.unit}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500" dir="ltr">
                        {p.sku}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[12px] font-bold">
                          {p.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-extrabold text-brand-green" dir="ltr">
                        {formatMoney(p.salePrice, currency)}
                      </td>
                      <td className="px-4 py-3 text-slate-500" dir="ltr">
                        {formatMoney(p.purchasePrice, currency)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={cn(
                              "font-extrabold",
                              p.stock <= p.alertQuantity ? "text-red-500" : "text-brand-navy"
                            )}
                          >
                            {p.stock}
                          </span>
                          {p.stockLevels && p.stockLevels.length > 0 && (
                            <span
                              className="text-[10.5px] text-slate-400 leading-tight max-w-32 truncate"
                              title={p.stockLevels
                                .map((sl) => `${sl.warehouse.name}: ${sl.quantity}`)
                                .join("\n")}
                            >
                              {p.stockLevels.length > 1
                                ? `${p.stockLevels.length} مستودعات`
                                : p.stockLevels[0].warehouse.name}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-full text-[11.5px] font-bold",
                            !p.isActive
                              ? "bg-slate-100 text-slate-400"
                              : p.stock <= p.alertQuantity
                                ? "bg-red-50 text-red-500"
                                : "bg-emerald-50 text-emerald-600"
                          )}
                        >
                          {!p.isActive ? "معطل" : p.stock <= p.alertQuantity ? "منخفض" : "نشط"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(p)}
                            className="size-8 rounded-lg hover:bg-blue-100 text-slate-400 hover:text-brand-blue flex items-center justify-center transition-colors"
                            aria-label={`تعديل ${p.name}`}
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(p)}
                            className="size-8 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors"
                            aria-label={`حذف ${p.name}`}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
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

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-brand-navy">
              {editing ? "تعديل صنف" : "إضافة صنف جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label className="font-bold text-slate-700">اسم الصنف *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="مثال: أرز بسمتي 5 كجم"
                className="h-11 rounded-xl border-slate-200"
              />
            </div>
            {!editing && (
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">
                  الباركود / الرمز
                </Label>
                <Input
                  value={form.sku}
                  onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                  placeholder="تلقائي إن تُرك فارغاً"
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">المجموعة</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                list="product-categories"
                className="h-11 rounded-xl border-slate-200"
              />
              <datalist id="product-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">الماركة</Label>
              <Input
                value={form.brand}
                onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                className="h-11 rounded-xl border-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">الوحدة</Label>
              <Input
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                className="h-11 rounded-xl border-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">سعر البيع *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.salePrice}
                onChange={(e) => setForm((f) => ({ ...f, salePrice: e.target.value }))}
                className="h-11 rounded-xl border-slate-200"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">سعر الشراء</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.purchasePrice}
                onChange={(e) =>
                  setForm((f) => ({ ...f, purchasePrice: e.target.value }))
                }
                className="h-11 rounded-xl border-slate-200"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">الكمية بالمخزون</Label>
              <Input
                type="number"
                value={form.stock}
                onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                className="h-11 rounded-xl border-slate-200"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">حد التنبيه</Label>
              <Input
                type="number"
                value={form.alertQuantity}
                onChange={(e) =>
                  setForm((f) => ({ ...f, alertQuantity: e.target.value }))
                }
                className="h-11 rounded-xl border-slate-200"
                dir="ltr"
              />
            </div>
          </div>
          <Button
            onClick={save}
            disabled={saving}
            className="w-full min-h-11 rounded-xl font-extrabold bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95 mt-2"
          >
            {saving ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                <Save className="size-4 ml-1" />
                {editing ? "حفظ التعديلات" : "إضافة الصنف"}
              </>
            )}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl" className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف الصنف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف «{deleteTarget?.name}»؟ لا يمكن التراجع عن هذا
              الإجراء.
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
