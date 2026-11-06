"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  Users,
  Truck,
  Loader2,
  Phone,
  Save,
  MapPin,
  ChevronDown,
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
import type { Contact } from "./types";
import { formatMoney } from "./types";
import { formatNationalAddress } from "@/lib/address";
import { cn } from "@/lib/utils";

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  taxNumber: "",
  address: "",
  buildingNo: "",
  streetName: "",
  district: "",
  city: "",
  postalCode: "",
  additionalNo: "",
};

export function ContactsView({
  type,
  currency,
  onDataChange,
}: {
  type: "customer" | "supplier";
  currency: string;
  onDataChange: () => void;
}) {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [showAddress, setShowAddress] = useState(false);

  const isCustomer = type === "customer";
  const title = isCustomer ? "العملاء" : "الموردين";
  const Icon = isCustomer ? Users : Truck;

  // معاينة مختصرة للعنوان الوطني المُدخل (لعرضها عند طي القسم)
  const addressPreview = [
    form.buildingNo,
    form.streetName,
    form.district,
    form.city,
    form.postalCode,
  ]
    .filter(Boolean)
    .join("، ");

  function load() {
    fetch(`/api/contacts?type=${type}&q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d) => setContacts(d.contacts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      load();
    }, 250);
    return () => clearTimeout(t);
  }, [q, type]);

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  }

  function openEdit(c: Contact) {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      taxNumber: c.taxNumber ?? "",
      address: c.address ?? "",
      buildingNo: c.buildingNo ?? "",
      streetName: c.streetName ?? "",
      district: c.district ?? "",
      city: c.city ?? "",
      postalCode: c.postalCode ?? "",
      additionalNo: c.additionalNo ?? "",
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      toast({ variant: "destructive", title: "الاسم مطلوب" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        editing ? `/api/contacts/${editing.id}` : "/api/contacts",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, type }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "فشل الحفظ", description: data.error });
        return;
      }
      toast({ title: editing ? "تم التحديث" : "تمت الإضافة", description: form.name });
      setDialogOpen(false);
      load();
      onDataChange();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: Contact) {
    const res = await fetch(`/api/contacts/${c.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast({ variant: "destructive", title: "فشل الحذف", description: data.error });
      return;
    }
    toast({ title: "تم الحذف", description: c.name });
    load();
    onDataChange();
  }

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-navy flex items-center gap-2">
            <Icon className="size-6 text-brand-blue" />
            {title}
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            {contacts.length} {isCustomer ? "عميل" : "مورد"} مسجل
          </p>
        </div>
        <div className="flex-1" />
        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`بحث في ${title}...`}
            className="w-full ps-10 h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-brand-blue"
          />
        </div>
        <Button
          onClick={openAdd}
          className="h-10 rounded-xl bg-brand-green hover:bg-emerald-600 font-extrabold gap-1.5"
        >
          <Plus className="size-4" />
          إضافة
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="size-8 animate-spin" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
            <Icon className="size-14" />
            <p className="text-slate-400 text-sm">
              لا يوجد {isCustomer ? "عملاء" : "موردين"} — أضف أول سجل
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-brand-light text-slate-500 text-[12px]">
                  <th className="text-start font-bold px-4 py-3">الاسم</th>
                  <th className="text-start font-bold px-4 py-3">الجوال</th>
                  <th className="text-start font-bold px-4 py-3">المدينة</th>
                  <th className="text-start font-bold px-4 py-3">البريد</th>
                  <th className="text-start font-bold px-4 py-3">الرقم الضريبي</th>
                  {isCustomer ? (
                    <>
                      <th className="text-start font-bold px-4 py-3">إجمالي المشتريات</th>
                      <th className="text-start font-bold px-4 py-3">المستحق</th>
                    </>
                  ) : (
                    <>
                      <th className="text-start font-bold px-4 py-3">إجمالي التوريد</th>
                      <th className="text-start font-bold px-4 py-3">المستحق</th>
                    </>
                  )}
                  <th className="text-start font-bold px-4 py-3">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-slate-100 hover:bg-blue-50/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="size-9 rounded-full bg-gradient-to-br from-blue-100 to-emerald-100 text-brand-blue flex items-center justify-center font-extrabold text-[14px] shrink-0">
                          {c.name.slice(0, 1)}
                        </span>
                        <span className="font-bold text-brand-navy">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500" dir="ltr">
                      {c.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {c.city ? (
                        <div>
                          <span className="font-bold text-brand-navy">{c.city}</span>
                          {c.district ? (
                            <span className="block text-[11.5px] text-slate-400">
                              {c.district}
                            </span>
                          ) : null}
                        </div>
                      ) : c.buildingNo || c.streetName || c.postalCode ? (
                        <span
                          className="block text-[11.5px] text-slate-400 max-w-40 truncate"
                          title={formatNationalAddress(c)}
                        >
                          {formatNationalAddress(c)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500" dir="ltr">
                      {c.email ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500" dir="ltr">
                      {c.taxNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-bold text-brand-navy" dir="ltr">
                      {formatMoney(isCustomer ? c.totalSales : c.totalPurchases, currency)}
                    </td>
                    <td className="px-4 py-3" dir="ltr">
                      <span
                        className={cn(
                          "font-bold",
                          c.balance > 0 ? "text-amber-600" : "text-slate-400"
                        )}
                      >
                        {formatMoney(c.balance, currency)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(c)}
                          className="size-8 rounded-lg hover:bg-blue-100 text-slate-400 hover:text-brand-blue flex items-center justify-center transition-colors"
                          aria-label={`تعديل ${c.name}`}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          onClick={() => remove(c)}
                          className="size-8 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors"
                          aria-label={`حذف ${c.name}`}
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
        )}
      </div>

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-brand-navy">
              {editing ? `تعديل — ${title}` : `إضافة ${isCustomer ? "عميل" : "مورد"} جديد`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">الاسم *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-11 rounded-xl border-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">الجوال</Label>
              <div className="relative">
                <Phone className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  dir="ltr"
                  className="ps-10 h-11 rounded-xl border-slate-200"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">البريد الإلكتروني</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                dir="ltr"
                className="h-11 rounded-xl border-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">الرقم الضريبي</Label>
              <Input
                value={form.taxNumber}
                onChange={(e) => setForm((f) => ({ ...f, taxNumber: e.target.value }))}
                dir="ltr"
                className="h-11 rounded-xl border-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">العنوان (وصف الموقع)</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="وصف مختصر للموقع إن وجد"
                className="h-11 rounded-xl border-slate-200"
              />
            </div>

            {/* العنوان الوطني — قسم قابل للطي */}
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAddress((s) => !s)}
                aria-expanded={showAddress}
                className="w-full flex items-center gap-2 px-3.5 py-3 bg-slate-50/70 hover:bg-slate-100 transition-colors"
              >
                <MapPin className="size-4 text-brand-blue shrink-0" />
                <span className="font-bold text-slate-700 text-[13px]">العنوان الوطني</span>
                {!showAddress && addressPreview && (
                  <span className="text-[11.5px] text-slate-400 truncate flex-1 text-start">
                    {addressPreview}
                  </span>
                )}
                <ChevronDown
                  className={cn(
                    "size-4 text-slate-400 shrink-0 transition-transform",
                    showAddress && "rotate-180"
                  )}
                />
              </button>
              {showAddress && (
                <div className="p-3.5 space-y-3 bg-white">
                  <p className="text-[11.5px] text-slate-400">
                    عنوان {isCustomer ? "العميل" : "المورد"} المسجل في العنوان الوطني السعودي
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="font-bold text-slate-700 text-[12.5px]">رقم المبنى</Label>
                      <Input
                        value={form.buildingNo}
                        onChange={(e) => setForm((f) => ({ ...f, buildingNo: e.target.value }))}
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="1234"
                        dir="ltr"
                        className="h-10 rounded-xl border-slate-200"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="font-bold text-slate-700 text-[12.5px]">اسم الشارع</Label>
                      <Input
                        value={form.streetName}
                        onChange={(e) => setForm((f) => ({ ...f, streetName: e.target.value }))}
                        placeholder="شارع الملك فهد"
                        className="h-10 rounded-xl border-slate-200"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="font-bold text-slate-700 text-[12.5px]">الحي</Label>
                      <Input
                        value={form.district}
                        onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                        placeholder="العليا"
                        className="h-10 rounded-xl border-slate-200"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="font-bold text-slate-700 text-[12.5px]">المدينة</Label>
                      <Input
                        value={form.city}
                        onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                        placeholder="الرياض"
                        className="h-10 rounded-xl border-slate-200"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="font-bold text-slate-700 text-[12.5px]">الرمز البريدي</Label>
                      <Input
                        value={form.postalCode}
                        onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
                        inputMode="numeric"
                        maxLength={5}
                        placeholder="12211"
                        dir="ltr"
                        className="h-10 rounded-xl border-slate-200"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="font-bold text-slate-700 text-[12.5px]">الرقم الإضافي</Label>
                      <Input
                        value={form.additionalNo}
                        onChange={(e) => setForm((f) => ({ ...f, additionalNo: e.target.value }))}
                        inputMode="numeric"
                        maxLength={3}
                        placeholder="567"
                        dir="ltr"
                        className="h-10 rounded-xl border-slate-200"
                      />
                    </div>
                  </div>
                </div>
              )}
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
                  <Save className="size-4 ml-1" />
                  {editing ? "حفظ التعديلات" : "إضافة"}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
