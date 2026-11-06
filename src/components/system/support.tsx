"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Headset,
  LifeBuoy,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
  Send,
  Ticket,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "./types";

// ============ الأنواع ============

type TicketSummary = {
  id: string;
  subject: string;
  category: string;
  categoryLabel: string;
  priority: string;
  priorityLabel: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  userName: string;
  messagesCount: number;
  lastMessage: string;
  lastMessageAt: string;
};

type TicketMessage = {
  id: string;
  senderId: string | null;
  isStaff: boolean;
  message: string;
  createdAt: string;
};

type TicketDetail = {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  user?: { name: string | null; username: string } | null;
  messages: TicketMessage[];
};

// ============ ثوابت العرض ============

const STATUS_META: Record<string, { label: string; classes: string }> = {
  open: { label: "مفتوحة", classes: "bg-sky-50 text-sky-600 border-sky-100" },
  answered: { label: "تم الرد", classes: "bg-emerald-50 text-emerald-600 border-emerald-100" },
  resolved: { label: "تم الحل", classes: "bg-slate-100 text-slate-500 border-slate-200" },
  closed: { label: "مغلقة", classes: "bg-slate-100 text-slate-400 border-slate-200" },
};

const CATEGORY_LABELS: Record<string, string> = {
  general: "استفسار عام",
  billing: "الفواتير والاشتراك",
  technical: "مشكلة تقنية",
  zatca: "الامتثال وزتكا",
  accounting: "المحاسبة والقيود",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "منخفضة",
  normal: "عادية",
  high: "عالية",
};

const FALLBACK_CATEGORIES = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));
const FALLBACK_PRIORITIES = Object.entries(PRIORITY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

function isAutoReply(message: string) {
  return message.trimStart().startsWith("🤖");
}

function formatTime(d: string | Date) {
  return new Date(d).toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============ المكوّن ============

export function SupportView() {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);
  const [priorities, setPriorities] = useState(FALLBACK_PRIORITIES);
  const [loading, setLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loadingTicket, setLoadingTicket] = useState(false);
  const [mobileChat, setMobileChat] = useState(false);

  const [myId, setMyId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [awaitingAutoReply, setAwaitingAutoReply] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    subject: "",
    category: "general",
    priority: "normal",
    message: "",
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // جلب قائمة التذاكر + الفئات
  const loadTickets = useCallback(
    (silent = false) => {
      fetch("/api/support", { cache: "no-store" })
        .then((r) => r.json())
        .then(
          (d: {
            tickets?: TicketSummary[];
            categories?: { value: string; label: string }[];
            priorities?: { value: string; label: string }[];
            error?: string;
          }) => {
            if (d.error) {
              if (!silent)
                toast({ variant: "destructive", title: "تعذر تحميل التذاكر" });
              return;
            }
            setTickets(d.tickets ?? []);
            if (d.categories?.length) setCategories(d.categories);
            if (d.priorities?.length) setPriorities(d.priorities);
          }
        )
        .catch(() => {
          if (!silent)
            toast({ variant: "destructive", title: "تعذر تحميل التذاكر" });
        })
        .finally(() => setLoading(false));
    },
    [toast]
  );

  // جلب تفاصيل تذكرة
  const loadTicket = useCallback(
    async (id: string, silent = false): Promise<TicketDetail | null> => {
      if (!silent) setLoadingTicket(true);
      try {
        const res = await fetch(`/api/support?id=${id}`, { cache: "no-store" });
        const d = await res.json();
        if (!res.ok || d.error) {
          if (!silent)
            toast({ variant: "destructive", title: d.error ?? "تعذر تحميل التذكرة" });
          return null;
        }
        setTicket(d.ticket);
        return d.ticket as TicketDetail;
      } catch {
        if (!silent)
          toast({ variant: "destructive", title: "تعذر تحميل التذكرة" });
        return null;
      } finally {
        if (!silent) setLoadingTicket(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    loadTickets();
    // معرفة هوية المستخدم الحالي لتمييز رسائله في المحادثة
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated && d.user?.id) setMyId(d.user.id);
      })
      .catch(() => {});
  }, [loadTickets]);

  // تحديث تلقائي كل 20 ثانية للتذكرة المفتوحة (لإظهار ردود الدعم)
  useEffect(() => {
    if (!selectedId) return;
    if (ticket && ticket.status !== "open" && ticket.status !== "answered") return;
    const iv = setInterval(() => {
      loadTicket(selectedId, true);
      loadTickets(true);
    }, 20000);
    return () => clearInterval(iv);
  }, [selectedId, ticket?.status, loadTicket, loadTickets]);

  // تمرير المحادثة لأسفل عند وصول رسائل جديدة
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [ticket?.messages.length, loadingTicket, awaitingAutoReply]);

  function selectTicket(id: string) {
    setSelectedId(id);
    setTicket(null);
    setReply("");
    setAwaitingAutoReply(false);
    setMobileChat(true);
    loadTicket(id);
  }

  function backToList() {
    setMobileChat(false);
    // إبقاء التذكرة محددة — فقط العودة لعرض القائمة على الجوال
  }

  // إعادة جلب مرتين (بعد ~4ث ثم ~9ث) لإظهار الرد الآلي 🤖 فور وصوله
  function pollForAutoReply(id: string) {
    setAwaitingAutoReply(true);
    const done = (ok: boolean) => {
      if (ok) loadTickets(true);
    };
    setTimeout(async () => {
      const t = await loadTicket(id, true);
      if (t && t.messages.some((m) => m.isStaff && isAutoReply(m.message))) {
        setAwaitingAutoReply(false);
        done(true);
        return;
      }
      setTimeout(async () => {
        const t2 = await loadTicket(id, true);
        setAwaitingAutoReply(false);
        done(!!t2);
      }, 5000);
    }, 4000);
  }

  // ============ إنشاء تذكرة جديدة ============

  async function createTicket() {
    const subject = form.subject.trim();
    const message = form.message.trim();
    if (!subject) {
      toast({ variant: "destructive", title: "أدخل عنواناً للتذكرة" });
      return;
    }
    if (!message) {
      toast({ variant: "destructive", title: "صف المشكلة بإيجاز" });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          category: form.category,
          priority: form.priority,
          message,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "تعذر إنشاء التذكرة");

      const created = d as TicketDetail;
      setNewOpen(false);
      setForm({ subject: "", category: "general", priority: "normal", message: "" });
      toast({
        title: "تم إنشاء التذكرة",
        description: "سيتواصل معك فريق الدعم قريباً",
      });

      // فتح التذكرة المنشأة مباشرة
      setSelectedId(created.id);
      setTicket(created);
      setMobileChat(true);
      loadTickets(true);

      // إن لم يصل الرد الآلي بعد — إعادة جلب مرتين بعد لحظات
      const hasAutoReply = created.messages?.some(
        (m) => m.isStaff && isAutoReply(m.message)
      );
      if (!hasAutoReply) {
        pollForAutoReply(created.id);
      }
    } catch (e) {
      toast({
        variant: "destructive",
        title: "تعذر إنشاء التذكرة",
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setCreating(false);
    }
  }

  // ============ الرد على التذكرة ============

  async function sendReply() {
    const message = reply.trim();
    if (!message || !selectedId || sendingReply) return;
    setSendingReply(true);
    try {
      const res = await fetch("/api/support", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedId, action: "reply", message }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "تعذر إرسال الرد");
      setReply("");
      const t = await loadTicket(selectedId, true);
      if (!t || !t.messages.some((m) => m.isStaff && isAutoReply(m.message))) {
        // الرد الآلي قد يتأخر لحظات — إعادة جلب مرتين
        pollForAutoReply(selectedId);
      }
      loadTickets(true);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "تعذر إرسال الرد",
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setSendingReply(false);
    }
  }

  // ============ تغيير حالة التذكرة ============

  async function changeStatus(action: "resolve" | "close" | "reopen") {
    if (!selectedId) return;
    setBusyAction(action);
    try {
      const res = await fetch("/api/support", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedId, action }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "تعذر تحديث الحالة");
      toast({
        title:
          action === "resolve"
            ? "تم تعليم التذكرة كمحلولة"
            : action === "close"
              ? "تم إغلاق التذكرة"
              : "تمت إعادة فتح التذكرة",
      });
      await loadTicket(selectedId, true);
      loadTickets(true);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "تعذر تحديث الحالة",
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setBusyAction(null);
    }
  }

  const statusMeta = ticket ? STATUS_META[ticket.status] : null;
  const categoryLabel = ticket
    ? CATEGORY_LABELS[ticket.category] ?? ticket.category
    : "";

  return (
    <div className="p-4 sm:p-5 space-y-4 max-w-6xl mx-auto">
      {/* الترويسة */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="size-12 rounded-2xl bg-gradient-to-l from-brand-blue to-brand-green flex items-center justify-center text-white shadow-md">
            <Headset className="size-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-brand-navy">الدعم الفني</h1>
            <p className="text-[13px] text-slate-500 mt-0.5">
              افتح تذكرة وسيرد عليك فريقنا — مع مساعد ذكي يجيب فوراً على الأسئلة الشائعة
            </p>
          </div>
          <div className="flex-1" />
          <Button onClick={() => setNewOpen(true)} className="rounded-xl gap-1.5">
            <MessageSquarePlus className="size-4" />
            تذكرة جديدة
          </Button>
        </div>
      </div>

      {/* عمودان على الشاشات الكبيرة */}
      <div className="grid lg:grid-cols-[340px_1fr] gap-4 items-start">
        {/* ===== قائمة التذاكر ===== */}
        <div
          className={cn(
            "bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden",
            mobileChat && "hidden lg:block"
          )}
        >
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Ticket className="size-4.5 text-brand-blue" />
            <h2 className="font-extrabold text-brand-navy text-[14.5px]">
              تذاكري ({tickets.length})
            </h2>
          </div>
          <div className="p-3 space-y-2.5 max-h-[70vh] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200">
            {loading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl border border-slate-100 p-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))
            ) : tickets.length === 0 ? (
              <div className="text-center py-10 px-4">
                <div className="size-14 rounded-full bg-brand-light flex items-center justify-center mx-auto">
                  <LifeBuoy className="size-7 text-brand-blue" />
                </div>
                <h3 className="font-extrabold text-brand-navy mt-3 text-[15px]">
                  لا توجد تذاكر بعد
                </h3>
                <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">
                  عند مواجهة أي مشكلة أو استفسار، أنشئ تذكرة وسنرد عليك في أسرع وقت
                </p>
                <Button
                  size="sm"
                  onClick={() => setNewOpen(true)}
                  className="rounded-xl gap-1.5 mt-4"
                >
                  <MessageSquarePlus className="size-4" />
                  إنشاء أول تذكرة
                </Button>
              </div>
            ) : (
              tickets.map((t) => {
                const st = STATUS_META[t.status] ?? STATUS_META.open;
                const active = t.id === selectedId;
                return (
                  <button
                    key={t.id}
                    onClick={() => selectTicket(t.id)}
                    className={cn(
                      "w-full text-start rounded-xl border p-3 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40",
                      active
                        ? "border-brand-blue/40 bg-brand-light shadow-sm"
                        : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                    )}
                    aria-label={`تذكرة: ${t.subject}`}
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold">
                        {t.categoryLabel}
                      </span>
                      <span
                        className={cn(
                          "text-[11px] px-2 py-0.5 rounded-full border font-extrabold",
                          st.classes
                        )}
                      >
                        {st.label}
                      </span>
                      {t.priority === "high" && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-100 font-extrabold">
                          أولوية عالية
                        </span>
                      )}
                    </div>
                    <h3 className="font-extrabold text-brand-navy text-[13.5px] mt-1.5 truncate">
                      {t.subject}
                    </h3>
                    {t.lastMessage && (
                      <p className="text-[12px] text-slate-500 mt-1 truncate">
                        {isAutoReply(t.lastMessage)
                          ? t.lastMessage.replace("🤖", "").trim()
                          : t.lastMessage}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      {t.messagesCount} رسالة · آخر تحديث {formatDate(t.lastMessageAt)}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ===== محادثة التذكرة ===== */}
        <div
          className={cn(
            "bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden",
            !mobileChat && "hidden lg:block"
          )}
        >
          {!selectedId || !ticket ? (
            <div className="p-10 text-center">
              {selectedId && loadingTicket ? (
                <div className="flex items-center justify-center py-16 text-slate-300">
                  <Loader2 className="size-9 animate-spin" />
                </div>
              ) : (
                <>
                  <div className="size-16 rounded-full bg-brand-light flex items-center justify-center mx-auto">
                    <Headset className="size-8 text-brand-blue" />
                  </div>
                  <h3 className="font-extrabold text-brand-navy mt-4">
                    اختر تذكرة لعرض محادثتها
                  </h3>
                  <p className="text-[13px] text-slate-500 mt-1">
                    تظهر هنا رسائل التذكرة وردود فريق الدعم والمساعد الذكي
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              {/* رأس المحادثة */}
              <div className="px-4 py-3 border-b border-slate-100 flex items-start gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={backToList}
                  className="rounded-lg lg:hidden shrink-0"
                  aria-label="العودة إلى قائمة التذاكر"
                >
                  <ArrowRight className="size-4" />
                </Button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h2 className="font-extrabold text-brand-navy text-[15px] truncate">
                      {ticket.subject}
                    </h2>
                    {statusMeta && (
                      <span
                        className={cn(
                          "text-[11px] px-2 py-0.5 rounded-full border font-extrabold shrink-0",
                          statusMeta.classes
                        )}
                      >
                        {statusMeta.label}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-slate-400 mt-0.5">
                    {categoryLabel} · فتحها {ticket.user?.name ?? "أنت"} ·{" "}
                    {formatDateTime(ticket.createdAt)}
                  </p>
                </div>
              </div>

              {/* الرسائل */}
              <div className="p-4 space-y-3 max-h-[52vh] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200">
                {ticket.messages.map((m) => {
                  const auto = m.isStaff && isAutoReply(m.message);
                  const mine = !m.isStaff && m.senderId === myId;
                  if (!m.isStaff) {
                    // رسالة من مستخدم المنشأة
                    return (
                      <div key={m.id} className="flex flex-col items-start gap-1">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-bold px-1">
                          {mine ? "أنت" : "عضو بالمنشأة"}
                          <span>{formatTime(m.createdAt)}</span>
                        </div>
                        <div className="max-w-[85%] sm:max-w-[70%] rounded-2xl rounded-ss-md bg-gradient-to-l from-brand-blue to-brand-green text-white px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words shadow-sm">
                          {m.message}
                        </div>
                      </div>
                    );
                  }
                  // رد من فريق الدعم أو المساعد الذكي
                  return (
                    <div key={m.id} className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-bold px-1">
                        <span>{formatTime(m.createdAt)}</span>
                        {auto ? (
                          <span className="inline-flex items-center gap-1 text-teal-600">
                            <Bot className="size-3.5" />
                            مساعد ذكي
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-brand-blue">
                            <Headset className="size-3.5" />
                            فريق الدعم
                          </span>
                        )}
                      </div>
                      <div
                        className={cn(
                          "max-w-[85%] sm:max-w-[70%] rounded-2xl rounded-se-md px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words border",
                          auto
                            ? "bg-teal-50/60 border-teal-100 text-slate-700"
                            : "bg-slate-100 border-slate-200/60 text-slate-700"
                        )}
                      >
                        {m.message.replace("🤖", "").trim()}
                      </div>
                    </div>
                  );
                })}

                {awaitingAutoReply && (
                  <div className="flex justify-end">
                    <div className="rounded-2xl rounded-se-md bg-teal-50/60 border border-teal-100 px-4 py-2.5 text-[12.5px] text-teal-700 font-bold flex items-center gap-2">
                      <Loader2 className="size-3.5 animate-spin" />
                      جارٍ توليد رد آلي...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* أزرار الحالة + صندوق الرد */}
              <div className="border-t border-slate-100 p-3 sm:p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {(ticket.status === "open" || ticket.status === "answered") && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyAction !== null}
                      onClick={() => changeStatus("resolve")}
                      className="rounded-lg gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                    >
                      {busyAction === "resolve" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-3.5" />
                      )}
                      تم الحل
                    </Button>
                  )}
                  {ticket.status !== "closed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyAction !== null}
                      onClick={() => changeStatus("close")}
                      className="rounded-lg gap-1.5 text-slate-500 border-slate-200 hover:bg-slate-50"
                    >
                      {busyAction === "close" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <XCircle className="size-3.5" />
                      )}
                      إغلاق
                    </Button>
                  )}
                  {(ticket.status === "resolved" || ticket.status === "closed") && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyAction !== null}
                      onClick={() => changeStatus("reopen")}
                      className="rounded-lg gap-1.5 text-brand-blue border-blue-200 hover:bg-blue-50"
                    >
                      {busyAction === "reopen" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="size-3.5" />
                      )}
                      إعادة فتح
                    </Button>
                  )}
                </div>

                <div className="flex items-end gap-2">
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                    placeholder="اكتب ردك هنا... (Enter للإرسال)"
                    rows={2}
                    disabled={ticket.status === "closed"}
                    className="rounded-xl text-[13.5px] resize-none bg-slate-50/50"
                    aria-label="نص الرد على التذكرة"
                  />
                  <Button
                    onClick={sendReply}
                    disabled={
                      sendingReply ||
                      !reply.trim() ||
                      ticket.status === "closed"
                    }
                    className="rounded-xl shrink-0 gap-1.5"
                    aria-label="إرسال الرد"
                  >
                    {sendingReply ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    <span className="hidden sm:inline">إرسال</span>
                  </Button>
                </div>
                {ticket.status === "closed" && (
                  <p className="text-[12px] text-slate-400">
                    هذه التذكرة مغلقة — أعد فتحها إن احتجت متابعة الموضوع
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== نافذة تذكرة جديدة ===== */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-extrabold text-brand-navy flex items-center gap-2">
              <MessageSquarePlus className="size-5 text-brand-blue" />
              تذكرة دعم جديدة
            </DialogTitle>
            <DialogDescription>
              صف مشكلتك بدقة وسيرد عليك المساعد الذكي فوراً، ثم فريق الدعم خلال ساعات العمل
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ticket-subject" className="text-[13px] font-bold">
                عنوان التذكرة
              </Label>
              <Input
                id="ticket-subject"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="مثال: مشكلة في طباعة الفاتورة الضريبية"
                maxLength={120}
                className="rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-bold">الفئة</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger className="rounded-xl w-full" aria-label="فئة التذكرة">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {categories.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-bold">الأولوية</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm({ ...form, priority: v })}
                >
                  <SelectTrigger className="rounded-xl w-full" aria-label="أولوية التذكرة">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {priorities.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ticket-message" className="text-[13px] font-bold">
                وصف المشكلة
              </Label>
              <Textarea
                id="ticket-message"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="اشرح المشكلة بالتفصيل: ماذا حدث؟ وما المتوقع؟"
                rows={5}
                className="rounded-xl resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNewOpen(false)}
              className="rounded-xl"
            >
              إلغاء
            </Button>
            <Button onClick={createTicket} disabled={creating} className="rounded-xl gap-1.5">
              {creating && <Loader2 className="size-4 animate-spin" />}
              إنشاء التذكرة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
