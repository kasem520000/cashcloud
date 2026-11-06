"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  Bell,
  BellRing,
  CheckCheck,
  Crown,
  FileCheck,
  FileText,
  Inbox,
  LifeBuoy,
  Loader2,
  Package,
  Receipt,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ViewKey } from "./types";
import { formatDateTime } from "./types";

// ============ الأنواع ============

type AppNotification = {
  id: string;
  title: string;
  message: string;
  type: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

type NotificationFilter = "all" | "unread" | string; // نوع الإشعار

// ============ خريطة أنواع الإشعارات (أيقونة + لون) ============

const TYPE_META: Record<
  string,
  { label: string; icon: typeof Bell; classes: string }
> = {
  system: { label: "النظام", icon: Bell, classes: "bg-slate-100 text-slate-600" },
  invoice: { label: "الفواتير", icon: FileText, classes: "bg-emerald-50 text-emerald-600" },
  payment: { label: "المدفوعات", icon: Banknote, classes: "bg-teal-50 text-teal-600" },
  purchase: { label: "المشتريات", icon: Truck, classes: "bg-amber-50 text-amber-600" },
  expense: { label: "المصاريف", icon: Receipt, classes: "bg-rose-50 text-rose-500" },
  stock: { label: "المخزون", icon: Package, classes: "bg-orange-50 text-orange-600" },
  vat: { label: "الضرائب", icon: FileCheck, classes: "bg-cyan-50 text-cyan-600" },
  support: { label: "الدعم الفني", icon: LifeBuoy, classes: "bg-red-50 text-red-500" },
  subscription: { label: "الاشتراك", icon: Crown, classes: "bg-yellow-50 text-yellow-600" },
};

// ============ المكوّن ============

export function NotificationsView({
  onNavigate,
}: {
  onNavigate: (v: ViewKey) => void;
}) {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>("all");

  const load = useCallback(() => {
    fetch("/api/notifications?limit=30", { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (d: {
          notifications?: AppNotification[];
          unreadCount?: number;
          error?: string;
        }) => {
          if (d.error) {
            toast({ variant: "destructive", title: "تعذر تحميل الإشعارات" });
            return;
          }
          setNotifications(d.notifications ?? []);
          setUnreadCount(d.unreadCount ?? 0);
        }
      )
      .catch(() =>
        toast({ variant: "destructive", title: "تعذر تحميل الإشعارات" })
      )
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // الفلاتر المتاحة: الكل + غير المقروء + الأنواع الموجودة فعلياً
  const availableTypes = useMemo(() => {
    const present = new Set(notifications.map((n) => n.type));
    return Object.entries(TYPE_META).filter(([key]) => present.has(key));
  }, [notifications]);

  const filtered = useMemo(() => {
    if (filter === "all") return notifications;
    if (filter === "unread") return notifications.filter((n) => !n.isRead);
    return notifications.filter((n) => n.type === filter);
  }, [notifications, filter]);

  // تعليم إشعار واحد كمقروء ثم التنقل إن وُجد رابط
  function openNotification(n: AppNotification) {
    if (!n.isRead) {
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id }),
      }).catch(() => {});
    }
    if (n.link) onNavigate(n.link as ViewKey);
  }

  async function markAllRead() {
    setMarkingAll(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      toast({
        title: "تم تعليم الكل كمقروء",
        description: "لا توجد إشعارات غير مقروءة الآن",
      });
    } catch {
      toast({ variant: "destructive", title: "تعذر تعليم الإشعارات" });
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div className="p-4 sm:p-5 space-y-4 max-w-3xl mx-auto">
      {/* الترويسة */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="size-12 rounded-2xl bg-gradient-to-l from-brand-blue to-brand-green flex items-center justify-center text-white shadow-md">
            <BellRing className="size-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-brand-navy">الإشعارات</h1>
            <p className="text-[13px] text-slate-500 mt-0.5">
              آخر مستجدات منشأتك — الفواتير، المدفوعات، المخزون، الضرائب والدعم الفني
            </p>
          </div>
          <div className="flex-1" />
          {unreadCount > 0 && (
            <>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-light text-brand-navy text-[12px] font-extrabold border border-slate-100">
                <span className="size-2 rounded-full bg-red-400" />
                {unreadCount} غير مقروء
              </span>
              <Button
                size="sm"
                onClick={markAllRead}
                disabled={markingAll}
                className="rounded-xl gap-1.5"
              >
                {markingAll ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCheck className="size-4" />
                )}
                تعليم الكل كمقروء
              </Button>
            </>
          )}
        </div>
      </div>

      {/* فلتر التبويبات — شرائح أفقية قابلة للتمرير */}
      <div
        className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200"
        role="tablist"
        aria-label="فلترة الإشعارات"
      >
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          الكل ({notifications.length})
        </FilterChip>
        <FilterChip
          active={filter === "unread"}
          onClick={() => setFilter("unread")}
        >
          غير المقروء ({unreadCount})
        </FilterChip>
        {availableTypes.map(([key, meta]) => (
          <FilterChip
            key={key}
            active={filter === key}
            onClick={() => setFilter(key)}
          >
            {meta.label}
          </FilterChip>
        ))}
      </div>

      {/* القائمة */}
      {loading ? (
        <div className="space-y-2.5">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-start gap-3"
            >
              <Skeleton className="size-10 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
          <div className="size-16 rounded-full bg-brand-light flex items-center justify-center mx-auto">
            <Inbox className="size-8 text-brand-blue" />
          </div>
          <h3 className="font-extrabold text-brand-navy mt-4">
            {filter === "unread" ? "لا توجد إشعارات غير مقروءة" : "لا توجد إشعارات"}
          </h3>
          <p className="text-[13px] text-slate-500 mt-1">
            {filter === "unread"
              ? "تم تعليم جميع الإشعارات كمقروءة — ستصلك المستجدات هنا فور حدوثها"
              : "ستصلك هنا تنبيهات الفواتير والمدفوعات والمخزون والضرائب فور حدوثها"}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[70vh] overflow-y-auto pe-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200">
          {filtered.map((n) => {
            const meta = TYPE_META[n.type] ?? TYPE_META.system;
            const Icon = meta.icon;
            return (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className={cn(
                  "w-full text-start bg-white rounded-2xl border p-4 shadow-sm transition-all hover:shadow-md hover:border-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40",
                  n.isRead ? "border-slate-100" : "border-brand-blue/30 bg-brand-light/40"
                )}
                aria-label={`إشعار: ${n.title}`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "size-10 rounded-xl flex items-center justify-center shrink-0",
                      meta.classes
                    )}
                  >
                    <Icon className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3
                        className={cn(
                          "text-[14px] truncate",
                          n.isRead
                            ? "font-bold text-brand-navy"
                            : "font-extrabold text-brand-navy"
                        )}
                      >
                        {n.title}
                      </h3>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold">
                        {meta.label}
                      </span>
                      {!n.isRead && (
                        <span
                          className="size-2.5 rounded-full bg-red-400 shrink-0"
                          aria-label="غير مقروء"
                        />
                      )}
                    </div>
                    <p className="text-[13px] text-slate-500 leading-relaxed mt-1 line-clamp-2">
                      {n.message}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1.5 font-medium">
                      {formatDateTime(n.createdAt)}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============ شريحة فلترة ============

function FilterChip({
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
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "shrink-0 px-3.5 py-1.5 rounded-full text-[12.5px] font-extrabold border transition-colors",
        active
          ? "bg-gradient-to-l from-brand-blue to-brand-green text-white border-transparent shadow-sm"
          : "bg-white text-slate-500 border-slate-100 hover:border-slate-200 hover:text-brand-navy"
      )}
    >
      {children}
    </button>
  );
}
