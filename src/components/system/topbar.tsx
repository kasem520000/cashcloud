"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Plus,
  Bell,
  CalendarDays,
  TrendingUp,
  Store,
  BookOpen,
  Headset,
  LogOut,
  ChevronDown,
  Building2,
  Check,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Session, ViewKey } from "./types";
import { formatMoney, ROLE_LABELS, PLAN_LABELS, formatDateTime } from "./types";
import { cn } from "@/lib/utils";

type TopbarNotification = {
  id: string;
  title: string;
  message: string;
  type: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

export function Topbar({
  session,
  todaySales,
  onNavigate,
  onLogout,
  onSearch,
  onSwitchCompany,
}: {
  session: Session;
  todaySales: number;
  onNavigate: (v: ViewKey) => void;
  onLogout: () => void;
  onSearch: (q: string) => void;
  onSwitchCompany: (companyId: string) => void;
}) {
  const today = new Date().toLocaleDateString("ar-EG", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  // ===== الإشعارات الحقيقية =====
  const [notifs, setNotifs] = useState<TopbarNotification[]>([]);
  const [unread, setUnread] = useState(0);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=6", { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        if (!d.error) {
          setNotifs(d.notifications ?? []);
          setUnread(d.unreadCount ?? 0);
        }
      }
    } catch {
      /* تجاهل */
    }
  }, []);

  useEffect(() => {
    fetch("/api/notifications?limit=6", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !d.error) {
          setNotifs(d.notifications ?? []);
          setUnread(d.unreadCount ?? 0);
        }
      })
      .catch(() => {});
    const t = setInterval(() => {
      loadNotifications();
    }, 60000);
    return () => clearInterval(t);
  }, [loadNotifications]);

  async function handleMarkAllRead() {
    setUnread(0);
    setNotifs((list) => list.map((n) => ({ ...n, isRead: true })));
    try {
      await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      /* تجاهل */
    }
  }

  function handleOpenNotification(n: TopbarNotification) {
    if (!n.isRead) {
      setNotifs((list) => list.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id }),
      }).catch(() => {});
    }
    if (n.link) onNavigate(n.link as ViewKey);
  }

  return (
    <header className="h-[60px] shrink-0 bg-gradient-to-l from-[#2563eb] via-[#0ea5a8] to-[#22c55e] border-b border-white/20 flex items-center gap-2 px-3 sm:px-4 text-white relative z-40">
      {/* Search */}
      <div className="hidden md:flex items-center gap-2 min-w-0 flex-1 max-w-md">
        <div className="flex items-center gap-2 min-h-9 w-full max-w-sm px-3 rounded-[10px] bg-white/15 backdrop-blur-sm border border-white/20 focus-within:bg-white/25 transition-colors">
          <Search className="size-4 shrink-0 opacity-80" />
          <input
            placeholder="بحث في النظام..."
            onChange={(e) => onSearch(e.target.value)}
            className="flex-1 min-w-0 h-9 bg-transparent outline-none text-[13px] text-white placeholder:text-white/70"
            aria-label="بحث في النظام"
          />
        </div>
      </div>

      {/* Quick links */}
      <nav className="hidden xl:flex items-center gap-1 ms-auto" aria-label="روابط سريعة">
        <button
          onClick={() => onNavigate("pos")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold hover:bg-white/15 transition-colors"
        >
          <Store className="size-4" />
          الكاشير
        </button>
        <button
          onClick={() => onNavigate("dashboard")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold hover:bg-white/15 transition-colors"
        >
          <BookOpen className="size-4" />
          لوحة المتابعة
        </button>
        <button
          onClick={() => onNavigate("support")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold hover:bg-white/15 transition-colors"
        >
          <Headset className="size-4" />
          الدعم الفني
        </button>
      </nav>

      <div className="flex items-center gap-1.5 ms-auto xl:ms-0">
        {/* Company switcher — تعدد المنشآت */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 transition-colors max-w-44 sm:max-w-56"
              aria-label="تبديل المنشأة"
            >
              <Building2 className="size-4 shrink-0" />
              <span className="hidden sm:block text-[13px] font-extrabold truncate">
                {session.businessName}
              </span>
              <ChevronDown className="size-3.5 opacity-80 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <p className="px-3 py-2 text-xs font-bold text-slate-400">
              منشآتك ({session.companies.length})
            </p>
            {session.companies.map((c) => (
              <DropdownMenuItem
                key={c.id}
                onClick={() => c.id !== session.activeCompanyId && onSwitchCompany(c.id)}
                className={cn(
                  "gap-2 py-2.5",
                  c.id === session.activeCompanyId && "bg-blue-50/60"
                )}
              >
                <span
                  className={cn(
                    "size-7 rounded-lg flex items-center justify-center text-[12px] font-extrabold shrink-0",
                    c.id === session.activeCompanyId
                      ? "bg-gradient-to-br from-brand-blue to-brand-green text-white"
                      : "bg-slate-100 text-slate-500"
                  )}
                >
                  {c.name.slice(0, 1)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-bold text-brand-navy truncate">
                    {c.name}
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    {ROLE_LABELS[c.role] ?? c.role} · باقة {PLAN_LABELS[c.plan] ?? c.plan}
                  </span>
                </span>
                {c.id === session.activeCompanyId && (
                  <Check className="size-4 text-brand-green shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Today's profit */}
        <button
          onClick={() => onNavigate("dashboard")}
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-extrabold bg-white/15 hover:bg-white/25 transition-colors"
          title="مبيعات اليوم"
        >
          <TrendingUp className="size-4" />
          <span className="hidden lg:inline">مبيعات اليوم:</span>
          <span dir="ltr">{formatMoney(todaySales)}</span>
        </button>

        {/* Date */}
        <button
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold hover:bg-white/15 transition-colors"
          title="التاريخ"
        >
          <CalendarDays className="size-4" />
          <span dir="ltr">{today}</span>
        </button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="relative inline-flex items-center justify-center size-9 rounded-lg hover:bg-white/15 transition-colors"
              aria-label="الإشعارات"
              onClick={loadNotifications}
            >
              <Bell className="size-[18px]" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-extrabold flex items-center justify-center border border-white shadow">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
              <p className="text-sm font-extrabold text-brand-navy">الإشعارات</p>
              {unread > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[11px] font-bold text-brand-blue hover:underline"
                >
                  تعليم الكل كمقروء
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifs.length === 0 ? (
                <p className="px-3 py-6 text-center text-[13px] text-slate-400">
                  لا توجد إشعارات حالياً
                </p>
              ) : (
                notifs.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleOpenNotification(n)}
                    className="w-full text-start px-3 py-2.5 border-b border-slate-50 hover:bg-slate-50 transition-colors flex gap-2.5"
                  >
                    <span
                      className={cn(
                        "size-2 rounded-full mt-1.5 shrink-0",
                        n.isRead ? "bg-slate-200" : "bg-brand-green"
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-bold text-brand-navy truncate">
                        {n.title}
                      </span>
                      <span className="block text-[12px] text-slate-500 line-clamp-2 leading-relaxed">
                        {n.message}
                      </span>
                      <span className="block text-[10.5px] text-slate-400 mt-0.5">
                        {formatDateTime(n.createdAt)}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
            <button
              onClick={() => onNavigate("notifications")}
              className="w-full px-3 py-2.5 text-center text-[12.5px] font-extrabold text-brand-blue hover:bg-blue-50/60 border-t border-slate-100 transition-colors"
            >
              عرض كل الإشعارات
            </button>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Add new */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              className="size-9 rounded-lg bg-white text-brand-blue hover:bg-blue-50"
              aria-label="إضافة جديد"
            >
              <Plus className="size-[18px]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => onNavigate("sales")}>
              فاتورة مبيعات جديدة
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onNavigate("purchases")}>
              عملية شراء جديدة
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onNavigate("products")}>
              صنف جديد
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onNavigate("expenses")}>
              مصروف جديد
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/15 transition-colors"
              aria-label="حساب المستخدم"
            >
              <span className="size-8 rounded-full bg-white/25 border border-white/40 flex items-center justify-center text-[13px] font-extrabold">
                {session.name.slice(0, 1)}
              </span>
              <span className="hidden sm:block text-[13px] font-bold max-w-24 truncate">
                {session.name}
              </span>
              <ChevronDown className="size-3.5 opacity-80" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <div className="px-3 py-2">
              <p className="text-sm font-bold text-brand-navy">{session.name}</p>
              <p className="text-xs text-slate-400" dir="ltr">
                @{session.username}
              </p>
              <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-brand-green bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                <ShieldCheck className="size-3" />
                {ROLE_LABELS[session.role] ?? session.role}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onNavigate("settings")}>
              الإعدادات
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onNavigate("team")}>
              فريق العمل
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onNavigate("plans")}>
              الباقات والاشتراك
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onLogout}
              className="text-red-600 focus:text-red-600 focus:bg-red-50"
            >
              <LogOut className="size-4 ml-1" />
              تسجيل الخروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
