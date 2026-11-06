"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Loader2,
  MessageCircle,
  MessagesSquare,
  Plus,
  Send,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDate } from "./types";

// ============ الأنواع ============

type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  messagesCount: number;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

const SUGGESTIONS = [
  "حلّل أرباحي الحالية",
  "ما المتأخرات على عملائي؟",
  "كيف أجهّز إقرار الضريبة؟",
  "اشرح لي متطلبات زتكا للمرحلة الثانية",
  "ما أصناف المخزون المنخفض؟",
];

function formatTime(d?: string) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============ المكوّن ============

export function AiAssistantView() {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // جلب قائمة المحادثات
  const loadConversations = useCallback(() => {
    fetch("/api/ai", { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (d: { conversations?: Conversation[]; error?: string }) => {
          if (d.error) return;
          setConversations(d.conversations ?? []);
        }
      )
      .catch(() => {})
      .finally(() => setLoadingConvs(false));
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // تمرير تلقائي لأسفل عند وصول رسائل جديدة
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, sending]);

  // ============ اختيار / بدء المحادثات ============

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setSheetOpen(false);
    textareaRef.current?.focus();
  }

  async function openConversation(id: string) {
    if (id === activeId) {
      setSheetOpen(false);
      return;
    }
    setActiveId(id);
    setMessages([]);
    setLoadingChat(true);
    setSheetOpen(false);
    try {
      const res = await fetch(`/api/ai?conversationId=${id}`, {
        cache: "no-store",
      });
      const d = await res.json();
      if (!res.ok || d.error) {
        toast({ variant: "destructive", title: d.error ?? "تعذر تحميل المحادثة" });
        return;
      }
      setMessages(
        (d.conversation?.messages ?? []).map(
          (m: { role: string; content: string; createdAt: string }) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
            createdAt: m.createdAt,
          })
        )
      );
    } catch {
      toast({ variant: "destructive", title: "تعذر تحميل المحادثة" });
    } finally {
      setLoadingChat(false);
    }
  }

  async function deleteConversation() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/ai?conversationId=${deleteTarget.id}`,
        { method: "DELETE" }
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setConversations((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      if (activeId === deleteTarget.id) {
        setActiveId(null);
        setMessages([]);
      }
      toast({ title: "تم حذف المحادثة" });
    } catch {
      toast({ variant: "destructive", title: "تعذر حذف المحادثة" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  // ============ إرسال رسالة ============

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || sending) return;
    setSending(true);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          conversationId: activeId ?? undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "تعذر توليد الرد");
      setActiveId(d.conversationId);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: d.reply, createdAt: new Date().toISOString() },
      ]);
      loadConversations();
    } catch (e) {
      // إزالة الرسالة المتفائلة وإرجاع النص للإدخال ليتمكن المستخدم من المحاولة مجدداً
      setMessages((prev) => prev.slice(0, -1));
      setInput(message);
      toast({
        variant: "destructive",
        title: "تعذر الاتصال بالمساعد الذكي",
        description: e instanceof Error ? e.message : "حاول مرة أخرى بعد قليل",
      });
    } finally {
      setSending(false);
    }
  }

  const isEmptyChat = !loadingChat && messages.length === 0 && !activeId;

  return (
    <div className="p-4 sm:p-5 space-y-4 max-w-6xl mx-auto">
      {/* الترويسة */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="size-12 rounded-2xl bg-gradient-to-l from-brand-blue to-brand-green flex items-center justify-center text-white shadow-md">
            <Sparkles className="size-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-extrabold text-brand-navy">
                المساعد الذكي المحاسبي
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[11px] font-extrabold border border-teal-200">
                <Sparkles className="size-3" />
                مدعوم بالذكاء الاصطناعي
              </span>
            </div>
            <p className="text-[13px] text-slate-500 mt-0.5">
              يجيب من بيانات منشأتك الفعلية — المبيعات، الذمم، الضريبة، المخزون ومتطلبات زتكا
            </p>
          </div>
          <div className="flex-1" />
          {/* على الجوال: زر المحادثات + محادثة جديدة */}
          <div className="flex items-center gap-2 lg:hidden">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-xl gap-1.5">
                  <MessagesSquare className="size-4" />
                  المحادثات
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 p-0">
                <SheetHeader className="px-4 py-3 border-b border-slate-100">
                  <SheetTitle className="text-brand-navy text-[15px] font-extrabold">
                    محادثاتك السابقة
                  </SheetTitle>
                </SheetHeader>
                <div className="p-3">
                  <Button
                    onClick={newChat}
                    className="w-full rounded-xl gap-1.5 mb-3"
                    size="sm"
                  >
                    <Plus className="size-4" />
                    محادثة جديدة
                  </Button>
                  <ConversationList
                    conversations={conversations}
                    loading={loadingConvs}
                    activeId={activeId}
                    onOpen={openConversation}
                    onDelete={setDeleteTarget}
                  />
                </div>
              </SheetContent>
            </Sheet>
            <Button size="sm" onClick={newChat} className="rounded-xl gap-1.5">
              <Plus className="size-4" />
              جديدة
            </Button>
          </div>
        </div>
      </div>

      {/* تخطيط مثل واتساب ويب */}
      <div className="grid lg:grid-cols-[300px_1fr] gap-4 items-start">
        {/* ===== شريط المحادثات (lg فقط) ===== */}
        <div className="hidden lg:flex flex-col bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-3 border-b border-slate-100">
            <Button onClick={newChat} className="w-full rounded-xl gap-1.5" size="sm">
              <Plus className="size-4" />
              محادثة جديدة
            </Button>
          </div>
          <ConversationList
            conversations={conversations}
            loading={loadingConvs}
            activeId={activeId}
            onOpen={openConversation}
            onDelete={setDeleteTarget}
          />
        </div>

        {/* ===== منطقة المحادثة ===== */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col h-[68vh] min-h-96">
          {loadingChat ? (
            <div className="flex-1 p-5 space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "flex",
                    i % 2 === 1 ? "justify-start" : "justify-end"
                  )}
                >
                  <Skeleton
                    className={cn("h-14 rounded-2xl", i % 2 === 1 ? "w-2/3" : "w-1/2")}
                  />
                </div>
              ))}
            </div>
          ) : isEmptyChat ? (
            /* بطاقة الترحيب مع الاقتراحات */
            <div className="flex-1 overflow-y-auto p-5 flex flex-col items-center justify-center text-center">
              <div className="size-16 rounded-2xl bg-gradient-to-l from-brand-blue to-brand-green flex items-center justify-center text-white shadow-lg">
                <Sparkles className="size-8" />
              </div>
              <h2 className="font-extrabold text-brand-navy text-lg mt-4">
                كيف أستطيع مساعدتك اليوم؟
              </h2>
              <p className="text-[13px] text-slate-500 mt-1.5 max-w-md leading-relaxed">
                اسألني عن أرقام منشأتك أو أي موضوع محاسبي أو ضريبي — أجيبك من بياناتك
                الفعلية، وكل محادثة تُحفظ لتعود إليها لاحقاً
              </p>
              <div className="grid sm:grid-cols-2 gap-2.5 mt-6 w-full max-w-xl">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={sending}
                    className="text-start rounded-xl border border-slate-100 bg-slate-50/60 hover:border-brand-blue/40 hover:bg-brand-light/60 px-4 py-3 text-[13px] font-bold text-brand-navy transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* الرسائل */
            <div className="flex-1 overflow-y-auto p-4 space-y-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200">
              {activeId && (
                <p className="text-center text-[11px] text-slate-400 font-bold">
                  <MessageCircle className="size-3.5 inline-block me-1 -mt-0.5" />
                  بداية المحادثة
                </p>
              )}
              {messages.map((m, i) => (
                <MessageBubble key={i} message={m} />
              ))}

              {sending && (
                <div className="flex justify-end">
                  <div className="rounded-2xl rounded-se-md bg-slate-100 px-4 py-3 flex items-center gap-2">
                    <span className="text-[12.5px] text-slate-500 font-bold">
                      يفكر
                    </span>
                    <span className="flex items-center gap-1" aria-label="جارٍ التفكير">
                      <span className="size-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                      <span className="size-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                      <span className="size-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* صندوق الإدخال */}
          <div className="border-t border-slate-100 p-3 sm:p-4">
            <div className="flex items-end gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="اسأل عن مبيعاتك، ذممك، ضريبتك... (Enter للإرسال، Shift+Enter لسطر جديد)"
                rows={2}
                disabled={sending}
                className="rounded-xl text-[13.5px] resize-none bg-slate-50/50"
                aria-label="رسالتك للمساعد الذكي"
              />
              <Button
                onClick={() => send()}
                disabled={sending || !input.trim()}
                className="rounded-xl shrink-0 size-10 p-0"
                aria-label="إرسال الرسالة"
              >
                {sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== تأكيد حذف محادثة ===== */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-extrabold text-brand-navy">
              حذف المحادثة؟
            </AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف «{deleteTarget?.title}» وجميع رسائلها نهائياً ولا يمكن التراجع عن
              ذلك.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteConversation}
              disabled={deleting}
              className="rounded-xl bg-red-500 hover:bg-red-600 gap-1.5"
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============ فقاعة رسالة ============

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex flex-col items-start gap-1">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-bold px-1">
          <User className="size-3" />
          أنت
          {message.createdAt && <span>{formatTime(message.createdAt)}</span>}
        </div>
        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-ss-md bg-gradient-to-l from-brand-blue to-brand-green text-white px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-bold px-1">
        {message.createdAt && <span>{formatTime(message.createdAt)}</span>}
        <Bot className="size-3.5 text-brand-blue" />
        المساعد الذكي
      </div>
      <div className="max-w-[92%] sm:max-w-[80%] rounded-2xl rounded-se-md bg-slate-100 px-4 py-2.5 text-[13.5px] text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
        {message.content}
      </div>
    </div>
  );
}

// ============ قائمة المحادثات (تُستخدم في الشريط الجانبي وSheet الجوال) ============

function ConversationList({
  conversations,
  loading,
  activeId,
  onOpen,
  onDelete,
}: {
  conversations: Conversation[];
  loading: boolean;
  activeId: string | null;
  onOpen: (id: string) => void;
  onDelete: (c: Conversation) => void;
}) {
  if (loading) {
    return (
      <div className="p-3 space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }
  if (conversations.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <MessageCircle className="size-8 text-slate-300 mx-auto" />
        <p className="text-[12.5px] text-slate-400 mt-2 leading-relaxed">
          لا توجد محادثات محفوظة بعد
          <br />
          ابدأ محادثة جديدة وستظهر هنا
        </p>
      </div>
    );
  }
  return (
    <div className="p-3 space-y-1.5 max-h-[54vh] lg:max-h-[58vh] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200">
      {conversations.map((c) => (
        <div
          key={c.id}
          className={cn(
            "group flex items-center gap-1 rounded-xl border p-2.5 transition-colors",
            c.id === activeId
              ? "border-brand-blue/40 bg-brand-light"
              : "border-transparent hover:bg-slate-50"
          )}
        >
          <button
            onClick={() => onOpen(c.id)}
            className="flex-1 min-w-0 text-start focus:outline-none"
            aria-label={`فتح محادثة: ${c.title}`}
          >
            <p className="text-[13px] font-extrabold text-brand-navy truncate">
              {c.title}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {formatDate(c.createdAt)} · {c.messagesCount} رسالة
            </p>
          </button>
          <button
            onClick={() => onDelete(c)}
            className="shrink-0 size-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
            aria-label={`حذف محادثة: ${c.title}`}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
