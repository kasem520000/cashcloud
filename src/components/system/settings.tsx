"use client";

import { useEffect, useState } from "react";
import {
  Settings as SettingsIcon,
  Save,
  Loader2,
  Store,
  UserRound,
  Percent,
  Building2,
  MapPin,
  Mail,
  MessageCircle,
  DatabaseBackup,
  Download,
  ShieldCheck,
  Eraser,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import type { Settings } from "./types";
import { CURRENCY_LABELS } from "./types";

export function SettingsView({
  onSaved,
}: {
  onSaved: (s: Settings) => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  // اعتماد زتكا CSID — حقول مستقلة (السرية لا تُرسل إلا عند إدخال قيمة جديدة)
  const [zatcaEnv, setZatcaEnv] = useState("simulation");
  const [egsSerial, setEgsSerial] = useState("");
  const [zatcaCsid, setZatcaCsid] = useState("");
  const [zatcaSecret, setZatcaSecret] = useState("");
  const [zatcaPrivateKey, setZatcaPrivateKey] = useState("");
  const [zatcaCert, setZatcaCert] = useState("");
  const [zatcaSaving, setZatcaSaving] = useState(false);
  const [clearCsidOpen, setClearCsidOpen] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return;
        setData(d);
        setZatcaEnv(d.zatcaEnv ?? "simulation");
        setEgsSerial(d.egsSerial ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!data) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const updated = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "فشل الحفظ", description: updated.error });
        return;
      }
      // PUT يرجع {ok:true} فقط — نعيد جلب الإعدادات المحدثة من الخادم
      const fresh = await fetch("/api/settings").then((r) => r.json());
      if (fresh && !fresh.error) {
        setData(fresh);
        onSaved(fresh);
      } else {
        onSaved(data);
      }
      toast({ title: "تم حفظ الإعدادات بنجاح" });
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setSaving(false);
    }
  }

  /** تنزيل نسخة احتياطية كاملة بصيغة JSON من /api/backup */
  async function downloadBackup() {
    setBackingUp(true);
    try {
      const res = await fetch("/api/backup");
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast({
          variant: "destructive",
          title: "فشل إنشاء النسخة الاحتياطية",
          description: d.error ?? "تعذر الاتصال بالخادم",
        });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `cashcloud-backup-${today}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast({ title: "تم تنزيل النسخة الاحتياطية بنجاح" });
    } catch {
      toast({
        variant: "destructive",
        title: "فشل تنزيل النسخة الاحتياطية",
        description: "تعذر الاتصال بالخادم",
      });
    } finally {
      setBackingUp(false);
    }
  }

  /** حفظ إعدادات اعتماد زتكا — الحقول السرية تُرسل فقط عند إدخال قيمة جديدة */
  async function saveCsid() {
    setZatcaSaving(true);
    try {
      const body: Record<string, string> = {
        zatcaEnv,
        egsSerial: egsSerial.trim(),
      };
      if (zatcaCsid.trim()) body.zatcaCsid = zatcaCsid.trim();
      if (zatcaSecret.trim()) body.zatcaSecret = zatcaSecret.trim();
      if (zatcaPrivateKey.trim()) body.zatcaPrivateKey = zatcaPrivateKey.trim();
      if (zatcaCert.trim()) body.zatcaCert = zatcaCert.trim();
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const updated = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "فشل حفظ الاعتماد", description: updated.error });
        return;
      }
      // إعادة جلب الإعدادات لتحديث الشارات
      const fresh = await fetch("/api/settings").then((r) => r.json());
      if (fresh && !fresh.error) {
        setData(fresh);
        onSaved(fresh);
      }
      setZatcaCsid("");
      setZatcaSecret("");
      setZatcaPrivateKey("");
      setZatcaCert("");
      toast({
        title: "حُفظت إعدادات الاعتماد",
        description: "سيُستخدم الإرسال الفعلي عند اكتمال البيانات",
      });
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setZatcaSaving(false);
    }
  }

  /** مسح اعتماد زتكا — إرسال سلاسل فارغة للمفاتيح الأربعة */
  async function clearCsid() {
    setClearCsidOpen(false);
    setZatcaSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zatcaEnv,
          egsSerial: egsSerial.trim(),
          zatcaCsid: "",
          zatcaSecret: "",
          zatcaPrivateKey: "",
          zatcaCert: "",
        }),
      });
      const updated = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "فشل مسح الاعتماد", description: updated.error });
        return;
      }
      const fresh = await fetch("/api/settings").then((r) => r.json());
      if (fresh && !fresh.error) {
        setData(fresh);
        onSaved(fresh);
      }
      setZatcaCsid("");
      setZatcaSecret("");
      setZatcaPrivateKey("");
      setZatcaCert("");
      toast({
        title: "تم مسح اعتماد زتكا",
        description: "عاد الإرسال إلى وضع المحاكاة",
      });
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setZatcaSaving(false);
    }
  }

  const set = (key: keyof Settings) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setData((d) => (d ? { ...d, [key]: e.target.value } : d));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="size-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-5 max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-brand-navy flex items-center gap-2">
          <SettingsIcon className="size-6 text-brand-blue" />
          الإعدادات الرئيسية
        </h1>
        <p className="text-[13px] text-slate-400 mt-0.5">
          إعدادات المتجر والحساب والعملة
        </p>
      </div>

      {/* Business card */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] p-5 space-y-4">
        <h2 className="font-extrabold text-brand-navy flex items-center gap-2 text-[15px]">
          <Store className="size-5 text-brand-blue" />
          بيانات المتجر
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="font-bold text-slate-700">اسم المتجر</Label>
            <Input
              value={data?.businessName ?? ""}
              onChange={set("businessName")}
              className="h-11 rounded-xl border-slate-200"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-bold text-slate-700">العملة الرئيسية</Label>
            <select
              value={data?.currency ?? "SAR"}
              onChange={set("currency")}
              className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-bold text-brand-navy outline-none focus:border-brand-blue"
            >
              {Object.entries(CURRENCY_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {code} — {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="font-bold text-slate-700">الرقم الضريبي</Label>
            <Input
              value={data?.taxNumber ?? ""}
              onChange={set("taxNumber")}
              placeholder="300000000000003"
              dir="ltr"
              className="h-11 rounded-xl border-slate-200"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-bold text-slate-700">رقم الجوال</Label>
            <Input
              value={data?.phone ?? ""}
              onChange={set("phone")}
              dir="ltr"
              className="h-11 rounded-xl border-slate-200"
            />
          </div>
          <div className="col-span-full space-y-1.5">
            <Label className="font-bold text-slate-700">العنوان</Label>
            <Input
              value={data?.address ?? ""}
              onChange={set("address")}
              placeholder="المدينة، الحي، الشارع"
              className="h-11 rounded-xl border-slate-200"
            />
          </div>
        </div>
      </section>

      {/* Account card */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] p-5 space-y-4">
        <h2 className="font-extrabold text-brand-navy flex items-center gap-2 text-[15px]">
          <UserRound className="size-5 text-brand-blue" />
          بيانات الحساب
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="font-bold text-slate-700">الاسم الكامل</Label>
            <Input
              value={data?.name ?? ""}
              onChange={set("name")}
              className="h-11 rounded-xl border-slate-200"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-bold text-slate-700">اسم المستخدم</Label>
            <Input
              value={data?.username ?? ""}
              disabled
              dir="ltr"
              className="h-11 rounded-xl border-slate-200 bg-slate-50 text-slate-400"
            />
          </div>
          <div className="col-span-full space-y-1.5">
            <Label className="font-bold text-slate-700">البريد الإلكتروني</Label>
            <Input
              type="email"
              value={data?.email ?? ""}
              onChange={set("email")}
              dir="ltr"
              className="h-11 rounded-xl border-slate-200"
            />
          </div>
        </div>
      </section>

      {/* National address card */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] p-5 space-y-4">
        <div>
          <h2 className="font-extrabold text-brand-navy flex items-center gap-2 text-[15px]">
            <MapPin className="size-5 text-brand-blue" />
            العنوان الوطني
          </h2>
          <p className="text-[12.5px] text-slate-400 mt-0.5">
            عنوان منشأتك المسجل في العنوان الوطني السعودي
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="font-bold text-slate-700">رقم المبنى</Label>
            <Input
              value={data?.buildingNo ?? ""}
              onChange={set("buildingNo")}
              inputMode="numeric"
              maxLength={4}
              placeholder="1234"
              dir="ltr"
              className="h-11 rounded-xl border-slate-200"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-bold text-slate-700">اسم الشارع</Label>
            <Input
              value={data?.streetName ?? ""}
              onChange={set("streetName")}
              placeholder="شارع الملك فهد"
              className="h-11 rounded-xl border-slate-200"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-bold text-slate-700">الحي</Label>
            <Input
              value={data?.district ?? ""}
              onChange={set("district")}
              placeholder="العليا"
              className="h-11 rounded-xl border-slate-200"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-bold text-slate-700">المدينة</Label>
            <Input
              value={data?.city ?? ""}
              onChange={set("city")}
              placeholder="الرياض"
              className="h-11 rounded-xl border-slate-200"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-bold text-slate-700">الرمز البريدي</Label>
            <Input
              value={data?.postalCode ?? ""}
              onChange={set("postalCode")}
              inputMode="numeric"
              maxLength={5}
              placeholder="12211"
              dir="ltr"
              className="h-11 rounded-xl border-slate-200"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-bold text-slate-700">الرقم الإضافي</Label>
            <Input
              value={data?.additionalNo ?? ""}
              onChange={set("additionalNo")}
              inputMode="numeric"
              maxLength={3}
              placeholder="567"
              dir="ltr"
              className="h-11 rounded-xl border-slate-200"
            />
          </div>
        </div>
      </section>

      {/* Sending integrations */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] p-5 space-y-4">
        <h2 className="font-extrabold text-brand-navy flex items-center gap-2 text-[15px]">
          <Building2 className="size-5 text-brand-blue" />
          تكاملات الإرسال
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-brand-navy text-[14px]">
                <Mail className="size-4.5 text-brand-blue" />
                البريد الإلكتروني
              </div>
              {data?.emailConfigured ? (
                <Badge className="bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-50">
                  مُفعّل
                </Badge>
              ) : (
                <Badge className="bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-50">
                  وضع المحاكاة
                </Badge>
              )}
            </div>
            <p className="text-[12px] text-slate-400 leading-relaxed">
              للإرسال الفعلي أضف RESEND_API_KEY في متغيرات البيئة
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-brand-navy text-[14px]">
                <MessageCircle className="size-4.5 text-brand-blue" />
                الواتساب
              </div>
              {data?.whatsappConfigured ? (
                <Badge className="bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-50">
                  مُفعّل
                </Badge>
              ) : (
                <Badge className="bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-50">
                  وضع المحاكاة
                </Badge>
              )}
            </div>
            <p className="text-[12px] text-slate-400 leading-relaxed">
              للإرسال الفعلي أضف مفاتيح WHATSAPP في متغيرات البيئة
            </p>
          </div>
        </div>
      </section>

      {/* ZATCA CSID card */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] p-5 space-y-4">
        <div>
          <h2 className="font-extrabold text-brand-navy flex items-center gap-2 text-[15px]">
            <ShieldCheck className="size-5 text-brand-teal" />
            اعتماد زتكا للإرسال الفعلي (CSID)
          </h2>
          <p className="text-[12.5px] text-slate-400 mt-1 leading-relaxed">
            لتفعيل الإرسال الفعلي لبوابة هيئة الزكاة والضريبة والجمارك، احصل على اعتماد
            CSID (PCSID عند التسجيل، ثم CCSID بعد اجتياز فحص الامتثال) وبيانات وحدة
            الفاتورة EGS من بوابة فاتورة (Fatoora) — fatoora.zatca.gov.sa — ثم أدخلها
            هنا. بدونها يعمل الإرسال بوضع المحاكاة.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="font-bold text-slate-700">البيئة</Label>
            <select
              value={zatcaEnv}
              onChange={(e) => setZatcaEnv(e.target.value)}
              className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-bold text-brand-navy outline-none focus:border-brand-teal"
            >
              <option value="simulation">محاكاة — بوابة التطوير</option>
              <option value="production">إنتاج — البوابة الفعلية</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="font-bold text-slate-700">الرقم التسلسلي EGS</Label>
            <Input
              value={egsSerial}
              onChange={(e) => setEgsSerial(e.target.value)}
              placeholder="1|اسم المنشأة|كاشير1"
              dir="ltr"
              className="h-11 rounded-xl border-slate-200"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="font-bold text-slate-700">
              رمز الاعتماد CSID (Binary Security Token)
            </Label>
            {data?.csidConfigured ? (
              <Badge className="bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-50">
                مُعدّ
              </Badge>
            ) : (
              <Badge className="bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-100">
                غير مُعدّ
              </Badge>
            )}
          </div>
          <Textarea
            value={zatcaCsid}
            onChange={(e) => setZatcaCsid(e.target.value)}
            dir="ltr"
            placeholder={
              data?.csidConfigured
                ? "•••• محفوظ — أدخل قيمة جديدة للاستبدال"
                : "الصق رمز الاعتماد هنا"
            }
            className="rounded-xl min-h-16 text-[11px] font-mono"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="font-bold text-slate-700">سر الاعتماد</Label>
            {data?.zatcaSecretConfigured ? (
              <Badge className="bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-50">
                مُعدّ
              </Badge>
            ) : (
              <Badge className="bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-100">
                غير مُعدّ
              </Badge>
            )}
          </div>
          <Input
            type="password"
            value={zatcaSecret}
            onChange={(e) => setZatcaSecret(e.target.value)}
            dir="ltr"
            placeholder={
              data?.zatcaSecretConfigured
                ? "•••• محفوظ — أدخل قيمة جديدة للاستبدال"
                : "سر الاعتماد من بوابة فاتورة"
            }
            className="h-11 rounded-xl border-slate-200"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="font-bold text-slate-700">المفتاح الخاص (PEM — EC P-384)</Label>
              {data?.zatcaKeyConfigured ? (
                <Badge className="bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-50">
                  مُعدّ
                </Badge>
              ) : (
                <Badge className="bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-100">
                  غير مُعدّ
                </Badge>
              )}
            </div>
            <Textarea
              value={zatcaPrivateKey}
              onChange={(e) => setZatcaPrivateKey(e.target.value)}
              dir="ltr"
              placeholder={
                data?.zatcaKeyConfigured
                  ? "•••• محفوظ — أدخل قيمة جديدة للاستبدال"
                  : "-----BEGIN PRIVATE KEY-----"
              }
              className="rounded-xl min-h-24 text-[10.5px] font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="font-bold text-slate-700">شهادة التوقيع (PEM)</Label>
              {data?.zatcaCertConfigured ? (
                <Badge className="bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-50">
                  مُعدّ
                </Badge>
              ) : (
                <Badge className="bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-100">
                  غير مُعدّ
                </Badge>
              )}
            </div>
            <Textarea
              value={zatcaCert}
              onChange={(e) => setZatcaCert(e.target.value)}
              dir="ltr"
              placeholder={
                data?.zatcaCertConfigured
                  ? "•••• محفوظ — أدخل قيمة جديدة للاستبدال"
                  : "-----BEGIN CERTIFICATE-----"
              }
              className="rounded-xl min-h-24 text-[10.5px] font-mono"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            onClick={saveCsid}
            disabled={zatcaSaving}
            className="rounded-xl font-extrabold gap-1.5 bg-brand-teal hover:bg-teal-700 text-white"
          >
            {zatcaSaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            حفظ إعدادات الاعتماد
          </Button>
          <Button
            variant="outline"
            onClick={() => setClearCsidOpen(true)}
            disabled={zatcaSaving || !data?.csidConfigured}
            className="rounded-xl font-bold gap-1.5 border-rose-200 text-rose-500 hover:text-rose-500 hover:bg-rose-50"
          >
            <Eraser className="size-4" />
            مسح الاعتماد
          </Button>
          <p className="text-[11.5px] text-slate-400">
            الحقول المحفوظة تُرسل فقط عند إدخال قيمة جديدة
          </p>
        </div>
      </section>

      {/* Backup & export card */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] p-5 space-y-4">
        <div>
          <h2 className="font-extrabold text-brand-navy flex items-center gap-2 text-[15px]">
            <DatabaseBackup className="size-5 text-brand-blue" />
            النسخ الاحتياطي والتصدير
          </h2>
          <p className="text-[12.5px] text-slate-400 mt-0.5 leading-relaxed">
            نزّل نسخة كاملة من بيانات منشأتك بصيغة JSON — الفواتير، القيود، جهات
            الاتصال، المخزون، المدفوعات وعروض الأسعار
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={downloadBackup}
            disabled={backingUp}
            className="rounded-xl font-extrabold gap-1.5 bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
          >
            {backingUp ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {backingUp ? "جارٍ التحضير..." : "تنزيل النسخة الاحتياطية"}
          </Button>
          <p className="text-[11.5px] text-slate-400">
            الاستيراد يتطلب تدخل الدعم الفني في هذه النسخة
          </p>
        </div>
      </section>

      {/* Info card */}
      <section className="bg-gradient-to-l from-brand-blue via-teal-600 to-emerald-500 rounded-2xl p-5 text-white">
        <h2 className="font-extrabold flex items-center gap-2 text-[15px] mb-2">
          <Percent className="size-5" />
          ملاحظات النظام
        </h2>
        <ul className="list-disc ps-5 space-y-1 text-[13px] text-white/90">
          <li>الضريبة الافتراضية في الكاشير 15% (ضريبة القيمة المضافة السعودية) ويمكن تعديلها لكل فاتورة.</li>
          <li>حذف فاتورة مبيعات يعيد الكميات تلقائياً إلى المخزون.</li>
          <li>الأصناف المرتبطة بعمليات لا تُحذف نهائياً — تُعطّل فقط حفاظاً على التقارير.</li>
        </ul>
      </section>

      <Button
        onClick={save}
        disabled={saving}
        className="w-full min-h-12 rounded-xl font-extrabold text-[15px] text-white bg-gradient-to-l from-brand-blue to-brand-green hover:opacity-95"
      >
        {saving ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <>
            <Save className="size-5 ml-1.5" />
            حفظ الإعدادات
          </>
        )}
      </Button>
    </div>
  );
}
