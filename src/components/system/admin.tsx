"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Loader2,
  Users,
  Receipt,
  TrendingUp,
  Ban,
  CheckCircle2,
  ShieldCheck,
  ShieldOff,
  RefreshCw,
  Wallet,
  Package,
  LifeBuoy,
  MessageSquareReply,
  Megaphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { AdminData } from "./types";
import { formatMoney, formatDate, formatDateTime, PLAN_LABELS, PLAN_PRICES } from "./types";
import { cn } from "@/lib/utils";
import { MarketingAdmin } from "./marketing-admin";

// ============ تذاكر الدعم الفني (توسعة بيانات المنصة) ============

type AdminTicket = {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  companyName: string;
  userName: string;
  messagesCount: number;
  lastMessage: string;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
};

type AdminDataWithTickets = AdminData & {
  tickets?: AdminTicket[];
  openTickets?: number;
};

const TICKET_CATEGORY_LABELS: Record<string, string> = {
  general: "استفسار عام",
  billing: "الفواتير والاشتراك",
  technical: "مشكلة تقنية",
  zatca: "الامتثال وزتكا",
  accounting: "المحاسبة والقيود",
};

const TICKET_PRIORITY_LABELS: Record<string, string> = {
  low: "منخفضة",
  normal: "عادية",
  high: "عالية",
};

const TICKET_STATUS_META: Record<string, { label: string; classes: string }> = {
  open: { label: "مفتوحة", classes: "bg-sky-50 text-sky-600" },
  answered: { label: "تم الرد", classes: "bg-emerald-50 text-emerald-600" },
  resolved: { label: "تم الحل", classes: "bg-slate-100 text-slate-500" },
  closed: { label: "مغلقة", classes: "bg-slate-100 text-slate-400" },
};

export function AdminView() {
  const { toast } = useToast();
  const [data, setData] = useState<AdminDataWithTickets | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"tenants" | "users" | "tickets" | "marketing">("tenants");
  const [replyTarget, setReplyTarget] = useState<AdminTicket | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setData(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(payload: Record<string, unknown>, key: string) {
    setBusy(key);
    try {
      const res = await fetch("/api/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "تعذر تنفيذ الإجراء");
      toast({ title: "تم التنفيذ", description: d.message });
      load();
    } catch (e) {
      toast({ variant: "destructive", title: "فشل الإجراء", description: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(null);
    }
  }

  // رد فريق المنصة على تذكرة دعم
  async function sendTicketReply() {
    if (!replyTarget) return;
    const message = replyText.trim();
    if (!message) {
      toast({ variant: "destructive", title: "أدخل نص الرد" });
      return;
    }
    setReplying(true);
    await patch(
      { action: "ticket-reply", ticketId: replyTarget.id, message },
      `tk:${replyTarget.id}`
    );
    setReplying(false);
    setReplyTarget(null);
    setReplyText("");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="size-9 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 sm:p-5 max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
          <div className="size-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
            <LifeBuoy className="size-7 text-red-400" />
          </div>
          <h2 className="font-extrabold text-brand-navy mt-4">تعذر تحميل بيانات المنصة</h2>
          <p className="text-[13px] text-slate-500 mt-1">
            حدث خطأ أثناء الاتصال بالخادم — حاول تحديث الصفحة
          </p>
          <Button variant="outline" className="rounded-xl gap-1.5 mt-4" onClick={load}>
            <RefreshCw className="size-4" />
            إعادة المحاولة
          </Button>
        </div>
      </div>
    );
  }

  const s = data?.stats;
  const planDist = s?.planDistribution ?? {};
  const maxPlan = Math.max(1, ...Object.values(planDist));

  return (
    <div className="p-4 sm:p-5 space-y-4 max-w-7xl mx-auto">
      {/* الترويسة */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-navy flex items-center gap-2">
            <Building2 className="size-6 text-brand-blue" />
            لوحة تحكم المنصة
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            إدارة المنشآت المشتركة والاشتراكات والمستخدمين — على مستوى المنصة بأكملها
          </p>
        </div>
        <div className="flex-1" />
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-brand-blue text-[12px] font-extrabold border border-blue-100">
          <ShieldCheck className="size-4" />
          صلاحية مدير المنصة
        </span>
        <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={load}>
          <RefreshCw className="size-4" />
          تحديث
        </Button>
      </div>

      {/* مؤشرات المنصة */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          icon={<Building2 className="size-5" />}
          label="المنشآت المشتركة"
          value={String(s?.tenants ?? 0)}
          sub={`${s?.active ?? 0} نشطة · ${s?.suspended ?? 0} معلّقة`}
          tone="blue"
        />
        <KpiCard
          icon={<Users className="size-5" />}
          label="المستخدمون"
          value={String(s?.users ?? 0)}
          sub={`${s?.platformAdmins ?? 0} مدير منصة`}
          tone="teal"
        />
        <KpiCard
          icon={<Receipt className="size-5" />}
          label="فواتير عبر المنصة"
          value={String(s?.invoices ?? 0)}
          sub={`حجم مبيعات ${formatMoney(s?.salesVolume ?? 0)}`}
          tone="green"
        />
        <KpiCard
          icon={<Wallet className="size-5" />}
          label="الإيراد الشهري MRR"
          value={formatMoney(s?.mrr ?? 0)}
          sub={`سنوياً ${formatMoney(s?.arr ?? 0)}`}
          tone="amber"
        />
        <KpiCard
          icon={<LifeBuoy className="size-5" />}
          label="تذاكر مفتوحة"
          value={String(data?.openTickets ?? 0)}
          sub={`من إجمالي ${data?.tickets?.length ?? 0} تذكرة دعم`}
          tone="rose"
        />
      </div>

      {/* توزيع الباقات */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-extrabold text-brand-navy text-[15px] flex items-center gap-2">
            <TrendingUp className="size-4.5 text-brand-green" />
            توزيع المنشآت على الباقات
          </h2>
          <span className="text-[12px] text-slate-400">
            الأسعار: أساسية 99 · احترافية 249 · مؤسسات 599 ر.س/شهر
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(["trial", "basic", "pro", "enterprise"] as const).map((plan) => {
            const count = planDist[plan] ?? 0;
            return (
              <div key={plan} className="rounded-xl border border-slate-100 bg-brand-light/60 p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12.5px] font-extrabold text-brand-navy">{PLAN_LABELS[plan]}</span>
                  <span className="text-[12px] font-bold text-slate-500" dir="ltr">
                    {PLAN_PRICES[plan] > 0 ? `${PLAN_PRICES[plan]} ر.س` : "مجانية"}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-200/70 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-l from-brand-blue to-brand-green transition-all"
                    style={{ width: `${Math.max(6, (count / maxPlan) * 100)}%` }}
                  />
                </div>
                <p className="text-[11.5px] text-slate-400 mt-1.5">{count} منشأة</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* التبويبات */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="flex items-center gap-1 px-3 pt-3 border-b border-slate-100">
          <TabButton active={tab === "tenants"} onClick={() => setTab("tenants")}>
            <Building2 className="size-4" />
            المنشآت ({data?.tenants.length ?? 0})
          </TabButton>
          <TabButton active={tab === "users"} onClick={() => setTab("users")}>
            <Users className="size-4" />
            المستخدمون ({data?.users.length ?? 0})
          </TabButton>
          <TabButton active={tab === "tickets"} onClick={() => setTab("tickets")}>
            <LifeBuoy className="size-4" />
            الدعم الفني ({data?.tickets?.length ?? 0})
          </TabButton>
          <TabButton active={tab === "marketing"} onClick={() => setTab("marketing")}>
            <Megaphone className="size-4" />
            الصفحات التسويقية
          </TabButton>
        </div>

        {tab === "tenants" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-brand-light text-slate-500 text-[12px]">
                  <th className="text-start font-bold px-4 py-3">المنشأة</th>
                  <th className="text-start font-bold px-4 py-3">المالك</th>
                  <th className="text-start font-bold px-4 py-3">الباقة</th>
                  <th className="text-start font-bold px-4 py-3">الأعضاء</th>
                  <th className="text-start font-bold px-4 py-3">الفواتير</th>
                  <th className="text-start font-bold px-4 py-3">الأصناف</th>
                  <th className="text-start font-bold px-4 py-3">الانضمام</th>
                  <th className="text-start font-bold px-4 py-3">الحالة</th>
                  <th className="text-start font-bold px-4 py-3">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {(data?.tenants ?? []).map((t) => (
                  <tr key={t.id} className="border-t border-slate-100 hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-extrabold text-brand-navy">{t.name}</p>
                      {t.taxNumber && (
                        <p className="text-[11px] text-slate-400" dir="ltr">VAT: {t.taxNumber}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-brand-navy text-[12.5px]">{t.owner}</p>
                      {t.ownerEmail && <p className="text-[11px] text-slate-400" dir="ltr">{t.ownerEmail}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-1 rounded-full bg-blue-50 text-brand-blue text-[11.5px] font-extrabold">
                        {PLAN_LABELS[t.plan] ?? t.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-bold" dir="ltr">{t.members}</td>
                    <td className="px-4 py-3 text-slate-600 font-bold" dir="ltr">{t.invoices}</td>
                    <td className="px-4 py-3 text-slate-600 font-bold" dir="ltr">{t.products}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDate(t.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-bold",
                          t.status === "active"
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-red-50 text-red-500"
                        )}
                      >
                        {t.status === "active" ? <CheckCircle2 className="size-3.5" /> : <Ban className="size-3.5" />}
                        {t.status === "active" ? "نشطة" : "معلّقة"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {t.status === "active" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy === `t:${t.id}`}
                            onClick={() => patch({ action: "suspend", companyId: t.id }, `t:${t.id}`)}
                            className="h-8 rounded-lg text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600 gap-1"
                          >
                            {busy === `t:${t.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
                            تعليق
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy === `t:${t.id}`}
                            onClick={() => patch({ action: "activate", companyId: t.id }, `t:${t.id}`)}
                            className="h-8 rounded-lg text-emerald-600 border-emerald-200 hover:bg-emerald-50 gap-1"
                          >
                            {busy === `t:${t.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                            تفعيل
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 rounded-lg gap-1">
                              <Package className="size-3.5" />
                              الباقة
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl">
                            {(["trial", "basic", "pro", "enterprise"] as const).map((p) => (
                              <DropdownMenuItem
                                key={p}
                                disabled={p === t.plan}
                                onClick={() => patch({ action: "set-plan", companyId: t.id, plan: p }, `p:${t.id}`)}
                                className="text-[13px] gap-2"
                              >
                                {PLAN_LABELS[p]}
                                {p === t.plan && <span className="text-[11px] text-slate-400">(الحالية)</span>}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : tab === "users" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-brand-light text-slate-500 text-[12px]">
                  <th className="text-start font-bold px-4 py-3">المستخدم</th>
                  <th className="text-start font-bold px-4 py-3">اسم الدخول</th>
                  <th className="text-start font-bold px-4 py-3">البريد</th>
                  <th className="text-start font-bold px-4 py-3">منشآته</th>
                  <th className="text-start font-bold px-4 py-3">التسجيل</th>
                  <th className="text-start font-bold px-4 py-3">مدير منصة؟</th>
                  <th className="text-start font-bold px-4 py-3">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {(data?.users ?? []).map((u) => (
                  <tr key={u.id} className="border-t border-slate-100 hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-3 font-extrabold text-brand-navy">{u.name}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-[12px]" dir="ltr">{u.username}</td>
                    <td className="px-4 py-3 text-slate-500 text-[12px]" dir="ltr">{u.email ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600 font-bold" dir="ltr">{u.memberships}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      {u.isPlatformAdmin ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-brand-blue text-[11.5px] font-bold">
                          <ShieldCheck className="size-3.5" />
                          مدير منصة
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[12px]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === `u:${u.id}`}
                        onClick={() =>
                          patch(
                            { action: u.isPlatformAdmin ? "revoke-admin" : "grant-admin", userId: u.id },
                            `u:${u.id}`
                          )
                        }
                        className={cn(
                          "h-8 rounded-lg gap-1",
                          u.isPlatformAdmin
                            ? "text-amber-600 border-amber-200 hover:bg-amber-50"
                            : "text-brand-blue border-blue-200 hover:bg-blue-50"
                        )}
                      >
                        {busy === `u:${u.id}` ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : u.isPlatformAdmin ? (
                          <ShieldOff className="size-3.5" />
                        ) : (
                          <ShieldCheck className="size-3.5" />
                        )}
                        {u.isPlatformAdmin ? "سحب الصلاحية" : "ترقية لمدير منصة"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : tab === "tickets" ? (
          /* ===== تبويب الدعم الفني — تذاكر جميع المنشآت ===== */
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-brand-light text-slate-500 text-[12px]">
                  <th className="text-start font-bold px-4 py-3">المنشأة</th>
                  <th className="text-start font-bold px-4 py-3">الموضوع</th>
                  <th className="text-start font-bold px-4 py-3">الفئة</th>
                  <th className="text-start font-bold px-4 py-3">الأولوية</th>
                  <th className="text-start font-bold px-4 py-3">الحالة</th>
                  <th className="text-start font-bold px-4 py-3">الرسائل</th>
                  <th className="text-start font-bold px-4 py-3">آخر رسالة</th>
                  <th className="text-start font-bold px-4 py-3">آخر تحديث</th>
                  <th className="text-start font-bold px-4 py-3">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {(data?.tickets ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center">
                      <LifeBuoy className="size-9 text-slate-300 mx-auto" />
                      <p className="font-extrabold text-brand-navy mt-2">لا توجد تذاكر دعم</p>
                      <p className="text-[12px] text-slate-400 mt-0.5">
                        ستظهر هنا تذاكر الدعم المفتوحة من جميع المنشآت المشتركة
                      </p>
                    </td>
                  </tr>
                ) : (
                  (data?.tickets ?? []).map((t) => {
                    const st = TICKET_STATUS_META[t.status] ?? TICKET_STATUS_META.open;
                    return (
                      <tr key={t.id} className="border-t border-slate-100 hover:bg-blue-50/30 transition-colors align-top">
                        <td className="px-4 py-3">
                          <p className="font-extrabold text-brand-navy">{t.companyName}</p>
                          <p className="text-[11px] text-slate-400">{t.userName}</p>
                        </td>
                        <td className="px-4 py-3 max-w-56">
                          <p className="font-extrabold text-brand-navy truncate" title={t.subject}>
                            {t.subject}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[11.5px] font-bold whitespace-nowrap">
                            {TICKET_CATEGORY_LABELS[t.category] ?? t.category}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {t.priority === "high" ? (
                            <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-500 text-[11.5px] font-extrabold border border-red-100 whitespace-nowrap">
                              {TICKET_PRIORITY_LABELS[t.priority]}
                            </span>
                          ) : (
                            <span className="text-slate-500 font-bold text-[12px] whitespace-nowrap">
                              {TICKET_PRIORITY_LABELS[t.priority] ?? t.priority}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center px-2.5 py-1 rounded-full text-[11.5px] font-extrabold whitespace-nowrap",
                              st.classes
                            )}
                          >
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-bold" dir="ltr">
                          {t.messagesCount}
                        </td>
                        <td className="px-4 py-3 max-w-52">
                          {t.lastMessage ? (
                            <p className="text-slate-500 text-[12px] truncate" title={t.lastMessage}>
                              {t.lastMessage.replace(/^🤖/, "").trim()}
                            </p>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-[12px]">
                          {formatDateTime(t.updatedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setReplyTarget(t);
                                setReplyText("");
                              }}
                              disabled={busy === `tk:${t.id}`}
                              className="h-8 rounded-lg text-brand-blue border-blue-200 hover:bg-blue-50 gap-1"
                            >
                              {busy === `tk:${t.id}` ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <MessageSquareReply className="size-3.5" />
                              )}
                              رد
                            </Button>
                            <Select
                              value={t.status}
                              onValueChange={(status) =>
                                patch(
                                  { action: "ticket-status", ticketId: t.id, status },
                                  `tks:${t.id}`
                                )
                              }
                              disabled={busy === `tks:${t.id}`}
                            >
                              <SelectTrigger
                                className="h-8 w-32 rounded-lg text-[12px] font-bold gap-1"
                                aria-label={`تغيير حالة التذكرة: ${t.subject}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl">
                                <SelectItem value="open">مفتوحة</SelectItem>
                                <SelectItem value="answered">تم الرد</SelectItem>
                                <SelectItem value="resolved">تم الحل</SelectItem>
                                <SelectItem value="closed">مغلقة</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : tab === "marketing" ? (
          /* ===== تبويب الصفحات التسويقية — إدارة الموقع العام ===== */
          <div className="p-4 sm:p-5">
            <MarketingAdmin />
          </div>
        ) : null}
      </div>

      {/* ===== نافذة الرد على تذكرة ===== */}
      <Dialog
        open={replyTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReplyTarget(null);
            setReplyText("");
          }
        }}
      >
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-extrabold text-brand-navy flex items-center gap-2">
              <MessageSquareReply className="size-5 text-brand-blue" />
              الرد على التذكرة
            </DialogTitle>
            <DialogDescription>
              «{replyTarget?.subject}» — {replyTarget?.companyName} · يصل الرد للعميل
              فوراً مع إشعار داخل النظام
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ticket-reply-text" className="text-[13px] font-bold">
              نص الرد
            </Label>
            <Textarea
              id="ticket-reply-text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="اكتب رد فريق الدعم هنا..."
              rows={5}
              className="rounded-xl resize-none"
              disabled={replying}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReplyTarget(null);
                setReplyText("");
              }}
              disabled={replying}
              className="rounded-xl"
            >
              إلغاء
            </Button>
            <Button onClick={sendTicketReply} disabled={replying} className="rounded-xl gap-1.5">
              {replying && <Loader2 className="size-4 animate-spin" />}
              إرسال الرد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "blue" | "teal" | "green" | "amber" | "rose";
}) {
  const tones = {
    blue: "from-blue-50 to-cyan-50 text-brand-blue border-blue-100",
    teal: "from-teal-50 to-emerald-50 text-brand-teal border-teal-100",
    green: "from-emerald-50 to-green-50 text-emerald-600 border-emerald-100",
    amber: "from-amber-50 to-yellow-50 text-amber-600 border-amber-100",
    rose: "from-rose-50 to-red-50 text-red-500 border-rose-100",
  };
  return (
    <div className={cn("rounded-2xl border p-4 bg-gradient-to-br", tones[tone])}>
      <div className="flex items-center justify-between">
        {icon}
      </div>
      <p className="text-xl font-extrabold text-brand-navy mt-2" dir="ltr">{value}</p>
      <p className="text-[12px] font-bold text-slate-500 mt-0.5">{label}</p>
      <p className="text-[11px] text-slate-400 mt-1">{sub}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-extrabold rounded-t-xl border-b-2 -mb-px transition-colors",
        active
          ? "text-brand-blue border-brand-blue bg-blue-50/50"
          : "text-slate-400 border-transparent hover:text-brand-navy"
      )}
    >
      {children}
    </button>
  );
}
