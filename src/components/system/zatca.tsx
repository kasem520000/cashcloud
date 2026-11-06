"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  QrCode,
  FileCode2,
  Send,
  Save,
  RefreshCw,
  X,
  Download,
  Copy,
  Info,
  BadgeCheck,
  Clock,
  AlertTriangle,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { ZatcaData, ViewKey } from "./types";
import { formatMoney, formatDate, formatDateTime, ZATCA_STATUS_LABELS } from "./types";
import { cn } from "@/lib/utils";

export function ZatcaView({
  currency,
  onNavigate,
  onDataChange,
}: {
  currency: string;
  onNavigate: (v: ViewKey) => void;
  onDataChange: () => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<ZatcaData | null>(null);
  const [loading, setLoading] = useState(true);

  // نموذج بيانات الامتثال
  const [vat, setVat] = useState("");
  const [cr, setCr] = useState("");
  const [saving, setSaving] = useState(false);

  // نوافذ QR / XML
  const [qrModal, setQrModal] = useState<{ qr: string; payload: string; invoiceNo: string } | null>(null);
  const [xmlModal, setXmlModal] = useState<{ xml: string; invoiceNo: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/zatca", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) {
          setData(d);
          setVat(d.company?.taxNumber ?? "");
          setCr(d.company?.crNumber ?? "");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveCompliance() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: data?.company.name,
          taxNumber: vat.trim(),
          crNumber: cr.trim(),
          address: data?.company.address ?? "",
          phone: data?.company.phone ?? "",
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "تعذر الحفظ");
      toast({ title: "تم حفظ بيانات الامتثال", description: "أُحدثت بيانات البائع الضريبية" });
      load();
    } catch (e) {
      toast({ variant: "destructive", title: "فشل الحفظ", description: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  }

  async function doAction(action: "qr" | "xml" | "submit", saleId: string, invoiceNo: string) {
    setBusy(`${action}:${saleId}`);
    try {
      const res = await fetch("/api/zatca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, saleId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "تعذر تنفيذ الإجراء");

      if (action === "qr") {
        setQrModal({ qr: d.qr, payload: d.payload, invoiceNo });
      } else if (action === "xml") {
        setXmlModal({ xml: d.xml, invoiceNo });
      } else {
        const isLive = d.mode === "live";
        const validation = Array.isArray(d.validationResults) && d.validationResults.length > 0
          ? ` — ملاحظات الفحص: ${d.validationResults.join(" • ")}`
          : "";
        toast({
          title:
            d.status === "REPORTED"
              ? isLive
                ? "تم الإبلاغ عن الفاتورة للبوابة الفعلية"
                : "تم الإبلاغ عن الفاتورة (محاكاة)"
              : "رُفضت الفاتورة",
          description: (
            <span>
              {d.message}
              {" — "}
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-extrabold",
                  isLive
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-sky-100 text-sky-700"
                )}
              >
                {isLive ? "إرسال فعلي" : "محاكاة"}
              </span>
              {validation}
            </span>
          ),
          variant: d.status === "REPORTED" ? "default" : "destructive",
        });
        load();
        onDataChange();
      }
    } catch (e) {
      toast({ variant: "destructive", title: "تعذر تنفيذ الإجراء", description: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(null);
    }
  }

  function downloadXml() {
    if (!xmlModal) return;
    const blob = new Blob([xmlModal.xml], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${xmlModal.invoiceNo}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="size-9 animate-spin" />
      </div>
    );
  }

  const stats = data?.stats ?? { total: 0, withQr: 0, submitted: 0, rejected: 0, pending: 0 };
  const compliance = data?.compliance ?? [];
  const passedCount = compliance.filter((c) => c.passed).length;

  return (
    <div className="p-4 sm:p-5 space-y-4 max-w-7xl mx-auto">
      {/* الترويسة */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-navy flex items-center gap-2">
            <ShieldCheck className="size-6 text-brand-teal" />
            الفاتورة الإلكترونية — تكامل زتكا
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            الامتثال لمتطلبات هيئة الزكاة والضريبة والجمارك — الفوترة الإلكترونية
          </p>
        </div>
        <div className="flex-1" />
        {data?.company.zatcaEnv === "production" ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-[12px] font-extrabold border border-amber-300">
            <ShieldCheck className="size-4" />
            وضع الإنتاج — بوابة فاتورة الفعلية
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-slate-500 text-[12px] font-extrabold border border-slate-200">
            <Info className="size-4" />
            وضع المحاكاة
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-teal-50 text-teal-700 text-[12px] font-extrabold border border-teal-200">
          <BadgeCheck className="size-4" />
          المرحلة الأولى — QR
        </span>
        <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={load}>
          <RefreshCw className="size-4" />
          تحديث
        </Button>
      </div>

      {/* تنبيه غياب اعتماد CSID */}
      {data && !data.company.csidConfigured && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
          <Info className="size-4.5 text-slate-400 shrink-0" />
          <p className="text-[12.5px] text-slate-500 leading-relaxed flex-1 min-w-56">
            لم يُدخل اعتماد CSID بعد — الإرسال يعمل بالمحاكاة. فعّله من
            الإعدادات ← اعتماد زتكا.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate("settings")}
            className="rounded-lg font-bold gap-1.5 border-slate-200 text-brand-navy hover:bg-slate-100 hover:text-brand-navy"
          >
            <Settings className="size-4" />
            فتح الإعدادات
          </Button>
        </div>
      )}

      {/* تنبيه وضع المحاكاة */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3.5">
        <Info className="size-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-[13px] leading-relaxed">
          <p className="font-extrabold text-amber-800">وضع المحاكاة (بيئة التطوير والاختبار)</p>
          <p className="text-amber-700 mt-0.5">
            جميع وظائف التكامل مفعّلة فعلياً: توليد رمز QR بصيغة TLV-Base64، وتصدير XML بصيغة UBL 2.1،
            وفحوصات الامتثال، وتسلسل الإرسال. الإرسال الحقيقي لبوابة زتكا يتطلب اعتماد الحل لدى الهيئة
            وإصدار شهادات CSID ورموز EGS — طبقة التكامل هنا جاهزة للربط فور توفر الاعتماد.
          </p>
        </div>
      </div>

      {/* بطاقات الإحصاء */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<FileCode2 className="size-5" />} label="فواتير صادرة" value={String(stats.total)} tone="blue" />
        <StatCard icon={<QrCode className="size-5" />} label="بها رمز QR" value={String(stats.withQr)} tone="teal" />
        <StatCard icon={<BadgeCheck className="size-5" />} label="مُبلَّغ عنها لزتكا" value={String(stats.submitted)} tone="green" />
        <StatCard icon={<Clock className="size-5" />} label="بانتظار الإرسال" value={String(stats.pending)} tone="amber" />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-4">
        {/* بيانات الامتثال */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] p-5 space-y-3.5">
          <h2 className="font-extrabold text-brand-navy text-[15px]">بيانات البائع للامتثال</h2>
          <p className="text-[12px] text-slate-400 leading-relaxed">
            تُستخدم هذه البيانات في توليد رمز QR وملفات XML لكل فاتورة — تأكد من مطابقتها لسجلاتك الرسمية.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-[12px] font-bold text-slate-500 mb-1 block">الرقم الضريبي (VAT)</label>
              <input
                value={vat}
                onChange={(e) => setVat(e.target.value)}
                dir="ltr"
                inputMode="numeric"
                placeholder="3xxxxxxxxxxxxx3"
                className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-brand-teal"
              />
              <p className="text-[11px] text-slate-400 mt-1">15 رقماً — يبدأ وينتهي بالرقم 3</p>
            </div>
            <div>
              <label className="text-[12px] font-bold text-slate-500 mb-1 block">رقم السجل التجاري</label>
              <input
                value={cr}
                onChange={(e) => setCr(e.target.value)}
                dir="ltr"
                inputMode="numeric"
                placeholder="10xxxxxxxx"
                className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-brand-teal"
              />
              <p className="text-[11px] text-slate-400 mt-1">10 أرقام — يُضمَّن ضمن بيانات المورّد في XML</p>
            </div>
            <Button
              onClick={saveCompliance}
              disabled={saving}
              className="w-full rounded-xl bg-brand-teal hover:bg-teal-700 font-extrabold gap-1.5"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              حفظ بيانات الامتثال
            </Button>
            {(!data?.company.address || !data?.company.phone) && (
              <button
                onClick={() => onNavigate("settings")}
                className="w-full text-[12px] text-brand-blue font-bold hover:underline"
              >
                ⚠ أكمل العنوان والهاتف من إعدادات المنشأة (متطلب امتثال)
              </button>
            )}
          </div>
        </div>

        {/* قائمة فحوصات الامتثال */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-brand-navy text-[15px]">فحوصات الجاهزية للامتثال</h2>
            <span
              className={cn(
                "px-2.5 py-1 rounded-full text-[11.5px] font-extrabold",
                passedCount === compliance.length
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-amber-50 text-amber-600"
              )}
            >
              {passedCount} / {compliance.length} مكتملة
            </span>
          </div>
          <div className="space-y-2.5">
            {compliance.map((c) => (
              <div
                key={c.key}
                className={cn(
                  "flex items-start gap-3 rounded-xl border px-3.5 py-3",
                  c.passed ? "border-emerald-100 bg-emerald-50/50" : "border-amber-100 bg-amber-50/50"
                )}
              >
                {c.passed ? (
                  <CheckCircle2 className="size-5 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="size-5 text-amber-500 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-brand-navy">{c.label}</p>
                  <p className="text-[12px] text-slate-500 mt-0.5">{c.hint}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* جدول الفواتير */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-extrabold text-brand-navy text-[15px]">فواتير الامتثال الضريبي</h2>
          <p className="text-[12px] text-slate-400 mt-0.5">
            ولّد رمز QR، صدّر ملف XML، وأبلغ عن الفاتورة — لكل فاتورة نهائية صادرة
          </p>
        </div>
        {!data || data.invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-300 gap-2">
            <ShieldCheck className="size-12" />
            <p className="text-slate-400 text-sm">لا توجد فواتير نهائية بعد</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-brand-light text-slate-500 text-[12px]">
                  <th className="text-start font-bold px-4 py-3">الفاتورة</th>
                  <th className="text-start font-bold px-4 py-3">التاريخ</th>
                  <th className="text-start font-bold px-4 py-3">العميل</th>
                  <th className="text-start font-bold px-4 py-3">الإجمالي</th>
                  <th className="text-start font-bold px-4 py-3">الضريبة</th>
                  <th className="text-start font-bold px-4 py-3">QR</th>
                  <th className="text-start font-bold px-4 py-3">حالة زتكا</th>
                  <th className="text-start font-bold px-4 py-3">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-slate-100 hover:bg-teal-50/30 transition-colors">
                    <td className="px-4 py-3 font-extrabold text-brand-blue" dir="ltr">{inv.invoiceNo}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDate(inv.date)}</td>
                    <td className="px-4 py-3 font-bold text-brand-navy">{inv.contactName}</td>
                    <td className="px-4 py-3 font-extrabold text-brand-navy" dir="ltr">
                      {formatMoney(inv.total, currency)}
                    </td>
                    <td className="px-4 py-3 text-slate-500" dir="ltr">{formatMoney(inv.tax, currency)}</td>
                    <td className="px-4 py-3">
                      {inv.hasQr ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-[12px]">
                          <QrCode className="size-4" /> مُولَّد
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[12px]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ZatcaBadge status={inv.zatcaStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <IconAction
                          title="عرض رمز QR"
                          busy={busy === `qr:${inv.id}`}
                          onClick={() => doAction("qr", inv.id, inv.invoiceNo)}
                        >
                          <QrCode className="size-4" />
                        </IconAction>
                        <IconAction
                          title="تصدير XML"
                          busy={busy === `xml:${inv.id}`}
                          onClick={() => doAction("xml", inv.id, inv.invoiceNo)}
                        >
                          <FileCode2 className="size-4" />
                        </IconAction>
                        <IconAction
                          title="الإبلاغ لزتكا (محاكاة)"
                          busy={busy === `submit:${inv.id}`}
                          disabled={inv.zatcaStatus === "REPORTED"}
                          tone="teal"
                          onClick={() => doAction("submit", inv.id, inv.invoiceNo)}
                        >
                          <Send className="size-4" />
                        </IconAction>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* نافذة QR */}
      {qrModal && (
        <div
          className="fixed inset-0 z-50 bg-brand-navy/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setQrModal(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
            role="dialog"
            aria-label={`رمز QR للفاتورة ${qrModal.invoiceNo}`}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-extrabold text-brand-navy">
                رمز QR — <span dir="ltr">{qrModal.invoiceNo}</span>
              </h3>
              <button
                onClick={() => setQrModal(null)}
                className="size-8 rounded-lg hover:bg-slate-100 text-slate-400 flex items-center justify-center"
                aria-label="إغلاق"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-6 flex flex-col items-center gap-4">
              <img
                src={qrModal.qr}
                alt={`رمز الاستجابة السريعة للفاتورة ${qrModal.invoiceNo}`}
                className="size-56 rounded-2xl border border-slate-100 shadow-sm"
              />
              <div className="text-center">
                <p className="text-[13px] font-extrabold text-brand-navy">
                  فاتورة إلكترونية — متوافقة مع المرحلة الأولى
                </p>
                <p className="text-[11.5px] text-slate-400 mt-1 leading-relaxed">
                  يحتوي الرمز على: اسم البائع، الرقم الضريبي، الطابع الزمني،
                  الإجمالي مع الضريبة، وإجمالي الضريبة (TLV-Base64)
                </p>
              </div>
              <div className="w-full">
                <p className="text-[11px] font-bold text-slate-400 mb-1">حِمل البيانات (TLV-Base64):</p>
                <p dir="ltr" className="text-[10.5px] font-mono bg-brand-light rounded-xl p-3 break-all text-slate-500 max-h-24 overflow-y-auto border border-slate-100">
                  {qrModal.payload}
                </p>
              </div>
              <Button variant="outline" className="w-full rounded-xl gap-1.5" onClick={() => window.print()}>
                <Download className="size-4" />
                طباعة الرمز
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة XML */}
      {xmlModal && (
        <div
          className="fixed inset-0 z-50 bg-brand-navy/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setXmlModal(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
            role="dialog"
            aria-label={`ملف XML للفاتورة ${xmlModal.invoiceNo}`}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-extrabold text-brand-navy">
                ملف XML (UBL 2.1) — <span dir="ltr">{xmlModal.invoiceNo}</span>
              </h3>
              <button
                onClick={() => setXmlModal(null)}
                className="size-8 rounded-lg hover:bg-slate-100 text-slate-400 flex items-center justify-center"
                aria-label="إغلاق"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto flex-1">
              <p className="text-[12.5px] text-slate-500 leading-relaxed">
                بنية الفاتورة الإلكترونية المعيارية المطلوبة من زتكا، مع تضمين رمز QR كمرفق
                وبيانات البائع الضريبية (الرقم الضريبي + السجل التجاري).
              </p>
              <pre
                dir="ltr"
                className="text-[10.5px] font-mono bg-brand-navy text-emerald-200 rounded-xl p-4 overflow-auto max-h-[52vh] border border-slate-800 leading-relaxed"
              >
                {xmlModal.xml}
              </pre>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
              <Button onClick={downloadXml} className="flex-1 rounded-xl bg-brand-teal hover:bg-teal-700 font-extrabold gap-1.5">
                <Download className="size-4" />
                تحميل الملف
              </Button>
              <Button
                variant="outline"
                className="rounded-xl gap-1.5"
                onClick={() => {
                  navigator.clipboard?.writeText(xmlModal.xml);
                  toast({ title: "تم نسخ XML" });
                }}
              >
                <Copy className="size-4" />
                نسخ
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ZatcaBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    REPORTED: { label: ZATCA_STATUS_LABELS.REPORTED, cls: "bg-emerald-50 text-emerald-600", icon: <BadgeCheck className="size-3.5" /> },
    PENDING: { label: ZATCA_STATUS_LABELS.PENDING, cls: "bg-amber-50 text-amber-600", icon: <Clock className="size-3.5" /> },
    REJECTED: { label: ZATCA_STATUS_LABELS.REJECTED, cls: "bg-red-50 text-red-500", icon: <AlertTriangle className="size-3.5" /> },
  };
  const v = map[status] ?? map.PENDING;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-bold", v.cls)}>
      {v.icon}
      {v.label}
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "blue" | "teal" | "green" | "amber";
}) {
  const tones = {
    blue: "from-blue-50 to-cyan-50 text-brand-blue border-blue-100",
    teal: "from-teal-50 to-emerald-50 text-brand-teal border-teal-100",
    green: "from-emerald-50 to-green-50 text-emerald-600 border-emerald-100",
    amber: "from-amber-50 to-yellow-50 text-amber-600 border-amber-100",
  };
  return (
    <div className={cn("rounded-2xl border p-4 bg-gradient-to-br", tones[tone])}>
      <div className="flex items-center justify-between">
        {icon}
        <span className="text-2xl font-extrabold text-brand-navy" dir="ltr">{value}</span>
      </div>
      <p className="text-[12px] font-bold text-slate-500 mt-2">{label}</p>
    </div>
  );
}

function IconAction({
  children,
  title,
  onClick,
  busy,
  disabled,
  tone = "slate",
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: "slate" | "teal";
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      title={title}
      aria-label={title}
      className={cn(
        "size-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40",
        tone === "teal"
          ? "hover:bg-teal-100 text-slate-400 hover:text-brand-teal"
          : "hover:bg-slate-100 text-slate-400 hover:text-brand-navy"
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : children}
    </button>
  );
}
