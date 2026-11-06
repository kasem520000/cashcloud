"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  Globe,
  ChevronDown,
  BookOpen,
  ClipboardCheck,
  CirclePlay,
  Headset,
  Menu,
  X,
  Rocket,
  Crown,
  User,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  TrendingUp,
  Smile,
  LogIn,
  UserPlus,
  Loader2,
  CheckCircle2,
  Ban,
  Store,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Sidebar } from "@/components/system/sidebar";
import { Topbar } from "@/components/system/topbar";
import { DashboardView } from "@/components/system/dashboard";
import { PosView } from "@/components/system/pos";
import { ProductsView } from "@/components/system/products";
import { BranchesView } from "@/components/system/branches";
import { WarehousesView } from "@/components/system/warehouses";
import { SalesView } from "@/components/system/sales";
import { PurchasesView } from "@/components/system/purchases";
import { ContactsView } from "@/components/system/contacts";
import { ExpensesView } from "@/components/system/expenses";
import { ReportsView } from "@/components/system/reports";
import { SettingsView } from "@/components/system/settings";
import { AccountingView } from "@/components/system/accounting";
import { PaymentsView } from "@/components/system/payments";
import { QuotationsView } from "@/components/system/quotations";
import { PayrollView } from "@/components/system/payroll";
import { AssetsView } from "@/components/system/assets";
import { RecurringView } from "@/components/system/recurring";
import { AuditView } from "@/components/system/audit";
import { TeamView } from "@/components/system/team";
import { PlansView } from "@/components/system/plans";
import { ZatcaView } from "@/components/system/zatca";
import { VatView } from "@/components/system/vat";
import { NotificationsView } from "@/components/system/notifications";
import { SupportView } from "@/components/system/support";
import { AiAssistantView } from "@/components/system/ai-assistant";
import { AdminView } from "@/components/system/admin";
import { MarketingSite, type AuthIntent } from "@/components/system/marketing";
import type { ViewKey, Session, Settings } from "@/components/system/types";
import { PLAN_LABELS } from "@/components/system/types";

const LANGUAGES = [
  { code: "ar", label: "العربية" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "tr", label: "Türkçe" },
];

// روابط التنقل الافتراضية — تُستبدل بالصفحات التسويقية المنشورة عند توفرها
const DEFAULT_NAV_LINKS = [
  { slug: "home", label: "الرئيسية", icon: BookOpen },
  { slug: "features", label: "المميزات", icon: ClipboardCheck },
  { slug: "pricing", label: "الباقات والأسعار", icon: Crown },
  { slug: "faq", label: "الأسئلة الشائعة", icon: CirclePlay },
];

const HERO_FEATURES = [
  { icon: RefreshCw, title: "محدّث باستمرار", subtitle: "تحديثات وميزات جديدة" },
  { icon: TrendingUp, title: "يدعم نمو أعمالك", subtitle: "حلول تتناسب مع احتياجاتك" },
  { icon: Smile, title: "سهل الاستخدام", subtitle: "واجهة بسيطة ومرنة" },
];

type Mode = "login" | "register";

export default function Home() {
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [todaySales, setTodaySales] = useState(0);
  const [suspendedActive, setSuspendedActive] = useState(false);
  const [marketingSlug, setMarketingSlug] = useState<string | null>("home");
  const [authIntent, setAuthIntent] = useState<AuthIntent>("login");

  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // جلب الجلسة الحقيقية من الخادم
  const refreshMe = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        if (d.authenticated) {
          setSuspendedActive(d.company?.status === "suspended");
          setSession({
            name: d.user.name ?? d.user.username,
            username: d.user.username,
            businessName: d.company.name,
            role: d.role,
            plan: d.company.plan,
            isPlatformAdmin: d.user.isPlatformAdmin === true,
            companies: d.memberships.map(
              (m: { company: { id: string; name: string; plan: string }; role: string }) => ({
                id: m.company.id,
                name: m.company.name,
                role: m.role,
                plan: m.company.plan,
              })
            ),
            activeCompanyId: d.company.id,
          });
          return;
        }
      }
      setSession(null);
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  // تحميل إعدادات المنشأة النشطة
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && !d.error) setSettings(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session, refreshKey]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && !d.error) setTodaySales(d.kpis?.todaySales ?? 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session, refreshKey]);

  const currency = settings?.currency ?? "SAR";
  const businessName = settings?.businessName ?? session?.businessName ?? "منشأتي";

  function handleLogin() {
    setView("dashboard");
    refreshMe();
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* تجاهل */
    }
    setSession(null);
    setSettings(null);
    setView("dashboard");
    setSuspendedActive(false);
    // بعد الخروج نعود للموقع التسويقي (الصفحة الرئيسية للزوار)
    setAuthIntent("login");
    setMarketingSlug("home");
  }

  async function handleSwitchCompany(companyId: string) {
    try {
      const res = await fetch("/api/company/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      if (res.ok) {
        setSettings(null);
        setView("dashboard");
        await refreshMe();
        bumpRefresh();
        toast({ title: "تم تبديل المنشأة", description: "تم تحميل بيانات المنشأة الجديدة" });
      }
    } catch {
      toast({ variant: "destructive", title: "تعذر تبديل المنشأة" });
    }
  }

  function handleSettingsSaved(s: Settings) {
    setSettings(s);
    setSession((prev) => (prev ? { ...prev, businessName: s.businessName } : prev));
  }

  function navigate(v: ViewKey) {
    setView(v);
    setMobileSidebarOpen(false);
  }

  // ============ SYSTEM SHELL ============
  if (session && suspendedActive) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-light p-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-lg max-w-md w-full p-8 text-center">
          <div className="size-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
            <Ban className="size-8 text-red-400" />
          </div>
          <h1 className="text-lg font-extrabold text-brand-navy mt-4">المنشأة معلّقة حالياً</h1>
          <p className="text-[13px] text-slate-500 mt-2 leading-relaxed">
            تم تعليق «{businessName}» من إدارة المنصة — لا يمكنك استخدام بياناتها حتى إعادة التفعيل.
            تواصل مع الدعم لإعادة تنشيط اشتراكك.
          </p>
          <div className="mt-6 space-y-2">
            {session.companies.filter((c) => c.id !== session.activeCompanyId).map((c) => (
              <Button
                key={c.id}
                variant="outline"
                className="w-full rounded-xl font-bold"
                onClick={() => handleSwitchCompany(c.id)}
              >
                التبديل إلى {c.name}
              </Button>
            ))}
            <Button
              className="w-full rounded-xl bg-brand-blue hover:bg-blue-700 font-bold"
              onClick={handleLogout}
            >
              تسجيل الخروج
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (session) {
    return (
      <div className="h-screen flex flex-col bg-[#fcfcfc] overflow-hidden">
        <Topbar
          session={session}
          todaySales={todaySales}
          onNavigate={navigate}
          onLogout={handleLogout}
          onSearch={() => navigate("products")}
          onSwitchCompany={handleSwitchCompany}
        />
        <div className="flex flex-1 min-h-0">
          <Sidebar
            view={view}
            onNavigate={navigate}
            businessName={businessName}
            role={session.role}
            plan={session.plan}
            isPlatformAdmin={session.isPlatformAdmin}
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed((c) => !c)}
            onSearch={() => navigate("products")}
          />

          {/* Mobile sidebar toggle */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="lg:hidden fixed bottom-5 start-5 z-40 size-12 rounded-full bg-gradient-to-l from-brand-blue to-brand-green text-white shadow-xl flex items-center justify-center"
            aria-label="فتح القائمة"
          >
            <Menu className="size-5" />
          </button>

          {/* Mobile sidebar drawer */}
          {mobileSidebarOpen && (
            <div
              className="lg:hidden fixed inset-0 z-50 bg-brand-navy/50 backdrop-blur-sm"
              onClick={() => setMobileSidebarOpen(false)}
            >
              <div
                className="absolute inset-y-0 end-0 w-72 max-w-[85%] bg-white shadow-2xl overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-4 h-14 border-b border-slate-100 sticky top-0 bg-white">
                  <span className="font-extrabold text-brand-navy flex items-center gap-2">
                    <Store className="size-5 text-brand-blue" />
                    {businessName}
                  </span>
                  <button
                    onClick={() => setMobileSidebarOpen(false)}
                    className="size-8 rounded-lg hover:bg-slate-100 text-slate-400 flex items-center justify-center"
                    aria-label="إغلاق القائمة"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                  <div className="lg:flex flex-col [&_aside]:flex [&_aside]:w-full [&_aside]:border-0">
                  <Sidebar
                    view={view}
                    onNavigate={navigate}
                    businessName={businessName}
                    role={session.role}
                    plan={session.plan}
                    isPlatformAdmin={session.isPlatformAdmin}
                    collapsed={false}
                    onToggle={() => {}}
                    onSearch={() => {
                      setMobileSidebarOpen(false);
                      navigate("products");
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          <main className="flex-1 min-w-0 overflow-y-auto [scrollbar-width:thin]">
            {view === "dashboard" && (
              <DashboardView
                session={session}
                currency={currency}
                onNavigate={navigate}
                refreshKey={refreshKey}
              />
            )}
            {view === "pos" && (
              <div className="h-full">
                <PosView currency={currency} onDataChange={bumpRefresh} />
              </div>
            )}
            {view === "products" && (
              <ProductsView currency={currency} onDataChange={bumpRefresh} />
            )}
            {view === "branches" && <BranchesView currency={currency} />}
            {view === "warehouses" && (
              <WarehousesView currency={currency} onDataChange={bumpRefresh} />
            )}
            {view === "sales" && (
              <SalesView
                currency={currency}
                onNavigate={navigate}
                onDataChange={bumpRefresh}
              />
            )}
            {view === "quotations" && (
              <QuotationsView
                session={session}
                currency={currency}
                onDataChange={bumpRefresh}
              />
            )}
            {view === "recurring" && (
              <RecurringView currency={currency} session={session} />
            )}
            {view === "purchases" && (
              <PurchasesView currency={currency} onDataChange={bumpRefresh} />
            )}
            {view === "contacts-customers" && (
              <ContactsView type="customer" currency={currency} onDataChange={bumpRefresh} />
            )}
            {view === "contacts-suppliers" && (
              <ContactsView type="supplier" currency={currency} onDataChange={bumpRefresh} />
            )}
            {view === "expenses" && (
              <ExpensesView currency={currency} onDataChange={bumpRefresh} />
            )}
            {view === "accounting-accounts" && (
              <AccountingView tab="accounts" currency={currency} onDataChange={bumpRefresh} />
            )}
            {view === "accounting-journal" && (
              <AccountingView tab="journal" currency={currency} onDataChange={bumpRefresh} />
            )}
            {view === "payments" && (
              <PaymentsView
                session={session}
                currency={currency}
                onDataChange={bumpRefresh}
              />
            )}
            {view === "payroll" && (
              <PayrollView currency={currency} session={session} />
            )}
            {view === "assets" && (
              <AssetsView currency={currency} session={session} />
            )}
            {view === "reports" && <ReportsView currency={currency} />}
            {view === "zatca" && (
              <ZatcaView currency={currency} onNavigate={navigate} onDataChange={bumpRefresh} />
            )}
            {view === "vat" && (
              <VatView currency={currency} onDataChange={bumpRefresh} />
            )}
            {view === "notifications" && (
              <NotificationsView onNavigate={navigate} />
            )}
            {view === "support" && <SupportView />}
            {view === "ai" && <AiAssistantView />}
            {view === "team" && (
              <TeamView session={session} onChanged={refreshMe} />
            )}
            {view === "plans" && (
              <PlansView session={session} onChanged={refreshMe} />
            )}
            {view === "audit" && <AuditView session={session} />}
            {view === "settings" && <SettingsView onSaved={handleSettingsSaved} />}
            {view === "admin" && session.isPlatformAdmin && <AdminView />}
          </main>
        </div>
      </div>
    );
  }

  // شاشة انتظار أثناء فحص الجلسة
  if (session === undefined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-brand-light">
        <div className="size-16 rounded-2xl bg-gradient-to-l from-brand-blue to-brand-green flex items-center justify-center shadow-lg">
          <Store className="size-8 text-white" />
        </div>
        <div className="flex items-center gap-2 text-slate-500 font-bold">
          <Loader2 className="size-4 animate-spin" />
          جاري التحقق من جلستك...
        </div>
      </div>
    );
  }

  // ============ LOGIN / REGISTER ============

  // الصفحة الرئيسية للزوار = الموقع التسويقي، وشاشة الدخول تُفتتح من أزراره
  if (marketingSlug !== null && !session) {
    return (
      <MarketingSite
        initialSlug={marketingSlug}
        onExit={(mode) => {
          setAuthIntent(mode ?? "login");
          setMarketingSlug(null);
        }}
      />
    );
  }

  return (
    <AuthScreen
      onAuthed={handleLogin}
      onOpenMarketing={setMarketingSlug}
      initialMode={authIntent}
    />
  );

  function AuthScreen({
    onAuthed,
    onOpenMarketing,
    initialMode,
  }: {
    onAuthed: () => void;
    onOpenMarketing: (slug: string) => void;
    initialMode: AuthIntent;
  }) {
    const [mode, setMode] = useState<Mode>(initialMode);
    const [lang, setLang] = useState("ar");
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(true);
    const [loading, setLoading] = useState(false);
    const [plan, setPlan] = useState("trial");
    // روابط التنقل التسويقية — تُجلب ديناميكياً من الصفحات المنشورة
    const [navLinks, setNavLinks] = useState<
      { slug: string; label: string; icon: React.ComponentType<{ className?: string }> }[]
    >(DEFAULT_NAV_LINKS);

    useEffect(() => {
      let cancelled = false;
      fetch("/api/marketing", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (cancelled || !Array.isArray(d.pages) || d.pages.length === 0) return;
          const iconPool = [BookOpen, ClipboardCheck, Crown, CirclePlay, Headset, Store];
          setNavLinks(
            d.pages
              .filter((p: { showInNav?: boolean }) => p.showInNav !== false)
              .slice(0, 5)
              .map(
                (
                  p: { slug: string; navLabel?: string | null; title: string },
                  i: number
                ) => ({
                  slug: p.slug,
                  label: p.navLabel || p.title,
                  icon: iconPool[i % iconPool.length],
                })
              )
          );
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, []);

    const [form, setForm] = useState({
      username: "",
      password: "",
      name: "",
      email: "",
      businessName: "",
    });

    const currentLang = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

    const setField =
      (key: keyof typeof form) =>
      (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value }));

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      setLoading(true);
      try {
        const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
        const payload =
          mode === "login"
            ? { username: form.username.trim(), password: form.password }
            : {
                name: form.name.trim(),
                businessName: form.businessName.trim() || "منشأتي",
                username: form.username.trim(),
                email: form.email.trim() || undefined,
                password: form.password,
                plan,
              };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (!res.ok) {
          toast({
            variant: "destructive",
            title: mode === "login" ? "فشل تسجيل الدخول" : "فشل إنشاء الحساب",
            description: data.error ?? "حدث خطأ غير متوقع، حاول مرة أخرى",
          });
          return;
        }

        if (mode === "login") {
          onAuthed();
          toast({
            title: "تم تسجيل الدخول بنجاح",
            description: `أهلاً بك ${data.name ?? form.username} 👋`,
          });
        } else {
          toast({
            title: "تم إنشاء الحساب والمنشأة بنجاح",
            description: "جاري تسجيل دخولك إلى نظامك الجديد...",
          });
          onAuthed();
        }
      } catch {
        toast({
          variant: "destructive",
          title: "خطأ في الاتصال",
          description: "تعذر الاتصال بالخادم، تحقق من الشبكة وحاول مجدداً",
        });
      } finally {
        setLoading(false);
      }
    }

    function switchMode(next: Mode) {
      setMode(next);
      setShowPassword(false);
    }

    return (
      <div className="min-h-screen flex flex-col bg-brand-light">
        {/* ================= Header ================= */}
        <header className="relative z-50 flex-none">
          <div className="flex items-center justify-end gap-3 w-full min-h-[68px] px-5 sm:px-8 py-2.5 bg-white shadow-[0_6px_24px_rgba(15,23,42,0.07)] rounded-br-[48px]">
            <button
              onClick={() => onOpenMarketing("home")}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-bold text-[14px] text-slate-600 hover:text-brand-blue hover:bg-slate-100 transition-colors"
              aria-label="العودة إلى الموقع الرئيسي"
            >
              <ArrowRight className="size-4" />
              <span className="hidden sm:inline">العودة للموقع</span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex items-center gap-2 px-1.5 py-1.5 rounded-lg font-bold text-[15px] text-slate-800 hover:bg-slate-100 transition-colors"
                  aria-label="تغيير اللغة"
                >
                  <Globe className="size-[18px] text-slate-500" />
                  <span>{currentLang.label}</span>
                  <ChevronDown className="size-3 text-slate-500" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {LANGUAGES.map((l) => (
                  <DropdownMenuItem
                    key={l.code}
                    onClick={() => setLang(l.code)}
                    className={
                      l.code === lang ? "font-bold text-brand-blue" : "text-slate-700"
                    }
                  >
                    {l.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <span
              aria-hidden
              className="hidden md:block w-px h-[22px] bg-slate-300 mx-2"
            />

            <nav className="hidden md:flex items-center gap-1 ms-auto">
              {navLinks.map((link) => (
                <button
                  key={link.slug}
                  onClick={() => onOpenMarketing(link.slug)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[9px] font-bold text-[15px] text-slate-800 hover:bg-slate-100 hover:text-brand-blue transition-colors"
                >
                  <link.icon className="size-[15px] text-slate-500" />
                  {link.label}
                </button>
              ))}
            </nav>

            <button
              className="md:hidden inline-flex items-center justify-center size-11 rounded-xl border border-slate-200 bg-white cursor-pointer"
              onClick={() => setMobileNavOpen((o) => !o)}
              aria-label={mobileNavOpen ? "إغلاق القائمة" : "فتح القائمة"}
              aria-expanded={mobileNavOpen}
            >
              {mobileNavOpen ? (
                <X className="size-5 text-slate-700" />
              ) : (
                <Menu className="size-5 text-slate-700" />
              )}
            </button>

            <div className="flex items-center gap-2.5">
              <Button
                variant="outline"
                className="hidden sm:inline-flex min-h-10 px-4 rounded-xl font-extrabold text-[15px] border-[1.5px] border-brand-blue text-brand-blue bg-white hover:bg-blue-50 hover:text-blue-700 gap-2"
                onClick={() => switchMode("register")}
              >
                <Rocket className="size-4" />
                جرب مجاناً
              </Button>
              <Button
                className="inline-flex min-h-10 px-4 rounded-xl font-extrabold text-[15px] bg-brand-green hover:bg-emerald-600 text-white shadow-[0_6px_16px_rgba(16,185,129,0.35)] hover:-translate-y-px transition-all gap-2"
                onClick={() => onOpenMarketing("pricing")}
              >
                <Crown className="size-4" />
                باقات الاشتراك
              </Button>
            </div>
          </div>

          {mobileNavOpen && (
            <nav className="md:hidden grid grid-cols-2 gap-2 px-3.5 pt-3 pb-3.5 bg-gradient-to-b from-white to-brand-light border-b border-slate-100">
              {navLinks.map((link) => (
                <button
                  key={link.slug}
                  onClick={() => onOpenMarketing(link.slug)}
                  className="flex items-center justify-center gap-1.5 min-h-12 px-1.5 py-2.5 rounded-[14px] border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 transition-colors text-center"
                >
                  <link.icon className="size-4 shrink-0" />
                  <span className="leading-tight">{link.label}</span>
                </button>
              ))}
            </nav>
          )}
        </header>

        {/* ================= Shell ================= */}
        <div
          dir="ltr"
          className="flex-1 grid lg:grid-cols-[minmax(420px,42%)_minmax(0,58%)] min-h-0 w-full overflow-hidden"
        >
          <main
            dir="rtl"
            className="flex items-center justify-center px-6 sm:px-10 py-8 sm:py-10 min-w-0 h-full overflow-x-hidden overflow-y-auto"
          >
            <div className="w-full max-w-[440px] pt-6 sm:pt-12">
              <div className="relative bg-white border border-slate-100 rounded-[28px] px-6 py-7 sm:px-7 sm:py-8 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
                {/* Card logo */}
                <div className="flex justify-center -mt-16 mb-4">
                  <div className="size-[76px] rounded-full bg-white border border-slate-100 shadow-[0_10px_28px_rgba(15,23,42,0.12)] flex items-center justify-center overflow-hidden">
                    <Image
                      src="/images/logo.png"
                      alt="شعار كاش كلاود"
                      width={52}
                      height={52}
                      className="rounded-full object-cover"
                      priority
                    />
                  </div>
                </div>

                <h1 className="text-center text-[26px] leading-snug font-extrabold text-brand-navy">
                  {mode === "login" ? "أهلاً بك دوماً" : "ابدأ رحلتك مع كاش كلاود"}
                </h1>
                <p className="text-center text-slate-500 text-[15px] mt-1.5 mb-7">
                  {mode === "login"
                    ? "سجل الدخول إلى حسابك بأمان"
                    : "أنشئ حسابك ومنشأتك وابدأ الإدارة خلال دقائق"}
                </p>

                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  {mode === "register" && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="font-bold text-slate-700">
                          اسم المنشأة / الشركة
                        </Label>
                        <div className="relative">
                          <span
                            aria-hidden
                            className="absolute inset-y-1 start-1 w-10 flex items-center justify-center bg-slate-100 text-slate-500 rounded-[11px] z-10"
                          >
                            <Store className="size-4" />
                          </span>
                          <Input
                            value={form.businessName}
                            onChange={setField("businessName")}
                            placeholder="مثال: شركة النور للتجارة"
                            required
                            className="h-12 rounded-xl border-[1.5px] border-slate-200 ps-14 pe-4 text-[14px] text-brand-navy bg-white focus-visible:ring-brand-blue/30 focus-visible:border-brand-blue"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="font-bold text-slate-700">الاسم الكامل</Label>
                        <div className="relative">
                          <span
                            aria-hidden
                            className="absolute inset-y-1 start-1 w-10 flex items-center justify-center bg-slate-100 text-slate-500 rounded-[11px] z-10"
                          >
                            <User className="size-4" />
                          </span>
                          <Input
                            value={form.name}
                            onChange={setField("name")}
                            placeholder="مثال: محمد أحمد"
                            required
                            className="h-12 rounded-xl border-[1.5px] border-slate-200 ps-14 pe-4 text-[14px] text-brand-navy bg-white focus-visible:ring-brand-blue/30 focus-visible:border-brand-blue"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="username" className="font-bold text-slate-700">
                      إسم المستخدم
                    </Label>
                    <div className="relative">
                      <span
                        aria-hidden
                        className="absolute inset-y-1 start-1 w-10 flex items-center justify-center bg-slate-100 text-slate-500 rounded-[11px] z-10"
                      >
                        <User className="size-4" />
                      </span>
                      <Input
                        id="username"
                        name="username"
                        autoComplete="username"
                        value={form.username}
                        onChange={setField("username")}
                        placeholder="أدخل اسم المستخدم"
                        required
                        dir="ltr"
                        className="h-12 rounded-xl border-[1.5px] border-slate-200 ps-14 pe-4 text-[14px] text-brand-navy bg-white text-start focus-visible:ring-brand-blue/30 focus-visible:border-brand-blue"
                      />
                    </div>
                  </div>

                  {mode === "register" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="font-bold text-slate-700">
                        البريد الإلكتروني{" "}
                        <span className="font-normal text-slate-400">(اختياري)</span>
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        value={form.email}
                        onChange={setField("email")}
                        placeholder="name@example.com"
                        dir="ltr"
                        className="h-12 rounded-xl border-[1.5px] border-slate-200 px-4 text-[14px] text-brand-navy bg-white text-start focus-visible:ring-brand-blue/30 focus-visible:border-brand-blue"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="font-bold text-slate-700">
                        كلمة السر
                      </Label>
                      {mode === "login" && (
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            toast({
                              title: "استعادة كلمة السر",
                              description:
                                "تواصل مع الدعم الفني لاستعادة كلمة السر الخاصة بك",
                            });
                          }}
                          className="text-sm font-medium text-slate-400 hover:text-brand-blue transition-colors"
                        >
                          نسيت كلمة السر؟
                        </a>
                      )}
                    </div>
                    <div className="relative">
                      <span
                        aria-hidden
                        className="absolute inset-y-1 start-1 w-10 flex items-center justify-center bg-slate-100 text-slate-500 rounded-[11px] z-10"
                      >
                        <Lock className="size-4" />
                      </span>
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={
                          mode === "login" ? "current-password" : "new-password"
                        }
                        value={form.password}
                        onChange={setField("password")}
                        placeholder="••••••••"
                        required
                        minLength={6}
                        dir="ltr"
                        className="h-12 rounded-xl border-[1.5px] border-slate-200 ps-14 pe-12 text-[14px] text-brand-navy bg-white text-start focus-visible:ring-brand-blue/30 focus-visible:border-brand-blue"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute inset-y-0 end-0 px-3.5 flex items-center text-slate-400 hover:text-slate-600"
                        aria-label={
                          showPassword ? "إخفاء كلمة السر" : "إظهار كلمة السر"
                        }
                      >
                        {showPassword ? (
                          <EyeOff className="size-[18px]" />
                        ) : (
                          <Eye className="size-[18px]" />
                        )}
                      </button>
                    </div>
                  </div>

                  {mode === "register" && (
                    <div className="space-y-2">
                      <Label className="font-bold text-slate-700">
                        اختر باقة البداية
                      </Label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { key: "trial", label: "التجريبية", desc: "مجاناً" },
                          { key: "basic", label: "الأساسية", desc: "99 ر.س/شهر" },
                          { key: "pro", label: "الاحترافية", desc: "249 ر.س/شهر" },
                        ].map((p) => (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => setPlan(p.key)}
                            className={`rounded-xl border-[1.5px] px-2 py-2.5 text-center transition-all ${
                              plan === p.key
                                ? "border-brand-green bg-emerald-50 shadow-[0_4px_12px_rgba(16,185,129,0.15)]"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <span
                              className={`block text-[13px] font-extrabold ${
                                plan === p.key ? "text-emerald-700" : "text-brand-navy"
                              }`}
                            >
                              {p.label}
                            </span>
                            <span className="block text-[11px] text-slate-400 mt-0.5">
                              {p.desc}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {mode === "login" && (
                    <label className="flex items-center gap-2.5 cursor-pointer select-none py-1">
                      <Checkbox
                        checked={rememberMe}
                        onCheckedChange={(v) => setRememberMe(v === true)}
                        className="size-[18px] border-[1.5px] border-slate-300 data-[state=checked]:border-brand-green data-[state=checked]:bg-brand-green"
                      />
                      <span className="text-[15px] font-medium text-slate-600">
                        تذكرني
                      </span>
                    </label>
                  )}

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-12 rounded-xl font-extrabold text-[16px] text-white bg-gradient-to-l from-brand-blue via-brand-cyan to-brand-green hover:opacity-95 transition-all shadow-[0_10px_24px_rgba(37,99,235,0.25)] disabled:opacity-60 disabled:shadow-none gap-2"
                  >
                    {loading ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : mode === "login" ? (
                      <LogIn className="size-5" />
                    ) : (
                      <UserPlus className="size-5" />
                    )}
                    {mode === "login" ? "تسجيل الدخول" : "إنشاء الحساب وابدأ الآن"}
                  </Button>
                </form>

                <p className="text-center text-slate-500 text-[15px] mt-6">
                  {mode === "login" ? (
                    <>
                      لم تسجل بعد؟{" "}
                      <button
                        type="button"
                        onClick={() => switchMode("register")}
                        className="font-bold text-brand-green hover:text-emerald-600 transition-colors"
                      >
                        سجل مجاناً
                      </button>
                    </>
                  ) : (
                    <>
                      لديك حساب بالفعل؟{" "}
                      <button
                        type="button"
                        onClick={() => switchMode("login")}
                        className="font-bold text-brand-blue hover:text-blue-700 transition-colors"
                      >
                        تسجيل الدخول
                      </button>
                    </>
                  )}
                </p>
              </div>

              {/* Mobile features */}
              <div className="lg:hidden grid grid-cols-3 gap-2 mt-6">
                {HERO_FEATURES.map((f) => (
                  <div
                    key={f.title}
                    className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-2 py-3.5 text-center"
                  >
                    <f.icon className="size-5 text-brand-green" />
                    <span className="text-[13px] font-bold text-brand-navy leading-tight">
                      {f.title}
                    </span>
                    <span className="text-[11px] text-slate-400 leading-tight">
                      {f.subtitle}
                    </span>
                  </div>
                ))}
              </div>

              {/* Demo hint */}
              <div className="mt-6 rounded-2xl bg-blue-50 border border-blue-100 px-4 py-3.5 text-center">
                <p className="text-[13px] text-blue-900 font-bold">
                  حساب تجريبي جاهز:
                </p>
                <p className="text-[13px] text-blue-700 mt-1" dir="ltr">
                  admin / admin123
                </p>
              </div>
            </div>
          </main>

          {/* Hero */}
          <aside
            dir="rtl"
            aria-hidden
            className="hidden lg:block relative overflow-hidden self-stretch min-h-0 h-full bg-gradient-to-r from-brand-blue to-brand-teal"
          >
            <Image
              src="/images/hero.jpg"
              alt=""
              fill
              sizes="(min-width: 1024px) 58vw, 100vw"
              className="object-cover object-center"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-brand-navy/45 via-transparent to-transparent" />

            <div className="absolute inset-x-5 bottom-5 z-10 flex items-stretch justify-between py-3.5 px-2 rounded-2xl bg-white/90 backdrop-blur-sm shadow-[0_14px_40px_rgba(15,23,42,0.16)]">
              {HERO_FEATURES.map((f, i) => (
                <div
                  key={f.title}
                  className={`flex items-center justify-center gap-2.5 flex-1 min-w-0 px-3 py-1.5 ${
                    i > 0 ? "border-s border-slate-200" : ""
                  }`}
                >
                  <f.icon className="size-5 text-brand-green shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[15px] font-extrabold text-brand-navy leading-tight whitespace-nowrap">
                      {f.title}
                    </p>
                    <p className="text-[12px] text-slate-500 leading-tight whitespace-nowrap">
                      {f.subtitle}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    );
  }
}
