"use client";

/**
 * الموقع التسويقي العام — يُعرض للزوار غير المسجلين
 * يقرأ الصفحات ديناميكياً من /api/marketing (التي يديرها مدير المنصة)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  Bot,
  Briefcase,
  Building,
  Calculator,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Headset,
  Loader2,
  LogIn,
  Mail,
  Menu,
  MessageCircle,
  Package,
  Percent,
  Phone,
  PieChart,
  Receipt,
  Rocket,
  Shield,
  ShoppingCart,
  Smile,
  TrendingUp,
  Truck,
  UserPlus,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ============ الأنواع المشتركة ============

export type MarketingSectionItem = {
  icon?: string;
  title?: string;
  text?: string;
  value?: string;
  sub?: string;
};

export type MarketingSection = {
  id?: string;
  type: string; // features | stats | steps | testimonials | faq | pricing | richtext | cta
  title?: string;
  subtitle?: string;
  text?: string;
  items?: MarketingSectionItem[];
};

export type MarketingPageData = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  kind?: string;
  navLabel?: string | null;
  order?: number;
  heroBadge?: string | null;
  heroTitle?: string | null;
  heroSubtitle?: string | null;
  ctaLabel?: string | null;
  sections: string;
  status?: string;
  showInNav?: boolean;
  views?: number;
};

export type MarketingNavItem = { slug: string; label: string };

/** أيقونات الأقسام — خريطة أسماء آمنة */
const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  receipt: Receipt,
  shoppingCart: ShoppingCart,
  warehouse: Warehouse,
  calculator: Calculator,
  users: Users,
  pieChart: PieChart,
  truck: Truck,
  creditCard: CreditCard,
  building: Building,
  shield: Shield,
  percent: Percent,
  briefcase: Briefcase,
  bot: Bot,
  smile: Smile,
  trendingUp: TrendingUp,
  headset: Headset,
  mail: Mail,
  phone: Phone,
  messageCircle: MessageCircle,
  package: Package,
};

function SectionIcon({ name, className }: { name?: string; className?: string }) {
  const Icon = (name && SECTION_ICONS[name]) || CheckCircle2;
  return <Icon className={className} />;
}

/** ألوان دوائر الأيقونات الدوارة */
const ICON_TONES = [
  "bg-blue-50 text-brand-blue border-blue-100",
  "bg-emerald-50 text-emerald-600 border-emerald-100",
  "bg-amber-50 text-amber-600 border-amber-100",
  "bg-teal-50 text-brand-teal border-teal-100",
  "bg-rose-50 text-rose-500 border-rose-100",
  "bg-cyan-50 text-cyan-600 border-cyan-100",
];

/** وضع الانتقال من الموقع التسويقي إلى شاشة الدخول */
export type AuthIntent = "login" | "register";

// ============ الواجهة الرئيسية للموقع التسويقي ============

export function MarketingSite({
  initialSlug,
  onExit,
}: {
  initialSlug: string;
  /** الانتقال لشاشة الدخول/التسجيل — الافتراضي تسجيل الدخول */
  onExit: (mode?: AuthIntent) => void;
}) {
  const [pages, setPages] = useState<MarketingPageData[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [slug, setSlug] = useState(initialSlug);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/marketing", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (Array.isArray(d.pages) && d.pages.length > 0) {
          setPages(d.pages);
        } else {
          setLoadError(true);
        }
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const navItems = useMemo<MarketingNavItem[]>(() => {
    if (!pages) return [];
    return pages
      .filter((p) => p.showInNav !== false)
      .map((p) => ({ slug: p.slug, label: p.navLabel || p.title }));
  }, [pages]);

  const current = useMemo(() => {
    if (!pages) return null;
    return pages.find((p) => p.slug === slug) ?? pages[0];
  }, [pages, slug]);

  // تتبع الزيارات
  useEffect(() => {
    if (!current?.id) return;
    fetch("/api/marketing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "track-view", pageId: current.id }),
    }).catch(() => {});
  }, [current?.id]);

  const navigate = useCallback((target: string) => {
    setSlug(target);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-brand-light p-6">
        <div className="size-16 rounded-2xl bg-red-50 flex items-center justify-center">
          <X className="size-8 text-red-400" />
        </div>
        <h1 className="text-lg font-extrabold text-brand-navy">تعذر تحميل الموقع التسويقي</h1>
        <p className="text-[13px] text-slate-500">حدث خطأ بالاتصال — حاول مرة أخرى</p>
        <Button variant="outline" className="rounded-xl gap-1.5" onClick={() => onExit("login")}>
          <ArrowLeft className="size-4" />
          الانتقال لتسجيل الدخول
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* ================= Header ================= */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-100 shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
        <div className="max-w-6xl mx-auto flex items-center gap-3 px-4 sm:px-6 h-16">
          <button
            onClick={() => navigate(navItems[0]?.slug ?? "home")}
            className="flex items-center gap-2.5 shrink-0"
            aria-label="كاش كلاود — الصفحة الرئيسية"
          >
            <div className="size-10 rounded-xl bg-gradient-to-l from-brand-blue to-brand-green flex items-center justify-center shadow-md overflow-hidden">
              <Image
                src="/images/logo.png"
                alt="شعار كاش كلاود"
                width={28}
                height={28}
                className="rounded-lg object-cover"
              />
            </div>
            <span className="hidden sm:block font-extrabold text-[17px] text-brand-navy">
              كاش كلاود
            </span>
          </button>

          <div className="flex-1" />

          <nav className="hidden md:flex items-center gap-1" aria-label="روابط الموقع">
            {navItems.map((item) => (
              <button
                key={item.slug}
                onClick={() => navigate(item.slug)}
                className={`px-3 py-2 rounded-lg text-[14px] font-bold transition-colors ${
                  current?.slug === item.slug
                    ? "text-brand-blue bg-blue-50"
                    : "text-slate-600 hover:text-brand-navy hover:bg-slate-100"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="hidden sm:inline-flex rounded-xl font-extrabold bg-brand-green hover:bg-emerald-600 text-white shadow-[0_6px_16px_rgba(16,185,129,0.35)] gap-1.5"
              onClick={() => onExit("register")}
            >
              <UserPlus className="size-4" />
              جرب مجاناً
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl font-extrabold border-[1.5px] border-brand-blue text-brand-blue hover:bg-blue-50 gap-1.5"
              onClick={() => onExit("login")}
            >
              <LogIn className="size-4" />
              تسجيل الدخول
            </Button>
            <button
              className="md:hidden inline-flex items-center justify-center size-10 rounded-xl border border-slate-200 bg-white"
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
          </div>
        </div>

        {mobileNavOpen && (
          <nav
            className="md:hidden grid grid-cols-2 gap-2 px-4 pb-4 bg-white border-b border-slate-100"
            aria-label="روابط الموقع للجوال"
          >
            {navItems.map((item) => (
              <button
                key={item.slug}
                onClick={() => navigate(item.slug)}
                className={`min-h-11 px-3 rounded-xl border text-[13px] font-bold transition-colors ${
                  current?.slug === item.slug
                    ? "border-blue-200 bg-blue-50 text-brand-blue"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* ================= المحتوى ================= */}
      <main className="flex-1">
        {!pages || !current ? (
          <div className="flex items-center justify-center py-32 text-slate-400">
            <Loader2 className="size-10 animate-spin" />
          </div>
        ) : (
          <>
            {/* Hero */}
            <section className="relative overflow-hidden bg-gradient-to-br from-brand-navy via-brand-blue to-brand-teal text-white">
              <div
                aria-hidden
                className="absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 20% 30%, white 2px, transparent 2px), radial-gradient(circle at 80% 70%, white 2px, transparent 2px)",
                  backgroundSize: "64px 64px",
                }}
              />
              <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
                {current.heroBadge && (
                  <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/15 border border-white/25 text-[13px] font-extrabold backdrop-blur-sm">
                    <Shield className="size-4" />
                    {current.heroBadge}
                  </span>
                )}
                <h1 className="text-3xl sm:text-5xl font-black leading-tight mt-5">
                  {current.heroTitle || current.title}
                </h1>
                <p className="text-[15px] sm:text-lg text-white/85 leading-relaxed mt-4 max-w-2xl mx-auto">
                  {current.heroSubtitle || current.subtitle || ""}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
                  <Button
                    size="lg"
                    className="rounded-xl font-extrabold bg-brand-green hover:bg-emerald-500 text-white shadow-[0_10px_28px_rgba(16,185,129,0.45)] gap-2"
                    onClick={() => onExit("register")}
                  >
                    <Rocket className="size-5" />
                    {current.ctaLabel || "ابدأ مجاناً الآن"}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-xl font-extrabold bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white gap-2"
                    onClick={() =>
                      document
                        .getElementById("marketing-sections")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    اعرف المزيد
                    <ChevronDown className="size-4" />
                  </Button>
                </div>
              </div>
            </section>

            {/* الأقسام */}
            <div id="marketing-sections" className="max-w-6xl mx-auto px-4 sm:px-6">
              {parsePageSections(current.sections).map((section, i) => (
                <MarketingSectionRenderer
                  key={section.id ?? i}
                  section={section}
                  onRegister={() => onExit("register")}
                />
              ))}
              {parsePageSections(current.sections).length === 0 && (
                <div className="py-24 text-center text-slate-400 font-bold">
                  هذه الصفحة لا تحتوي أقساماً بعد — يمكن لمدير المنصة إضافتها من لوحة التحكم
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* ================= Footer ================= */}
      <footer className="bg-brand-navy text-white mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="size-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden">
                <Image
                  src="/images/logo.png"
                  alt="شعار كاش كلاود"
                  width={26}
                  height={26}
                  className="rounded-lg object-cover"
                />
              </div>
              <span className="font-extrabold text-lg">كاش كلاود</span>
            </div>
            <p className="text-[13px] leading-relaxed text-white/70 mt-3 max-w-sm">
              نظام سحابي سعودي متكامل للمحاسبة ونقاط البيع والمخزون — متوافق مع فاتوريا (زتكا)
              ومصمم خصيصاً للسوق العربي.
            </p>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-[12px] font-bold mt-4">
              <Shield className="size-3.5 text-emerald-300" />
              متوافق مع زتكا — المرحلة الثانية
            </span>
          </div>

          <div>
            <h3 className="font-extrabold text-[15px] mb-3">روابط سريعة</h3>
            <ul className="space-y-2">
              {navItems.map((item) => (
                <li key={item.slug}>
                  <button
                    onClick={() => navigate(item.slug)}
                    className="text-[13px] text-white/70 hover:text-white transition-colors"
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-extrabold text-[15px] mb-3">ابدأ اليوم</h3>
            <p className="text-[13px] text-white/70 leading-relaxed">
              أنشئ حسابك المجاني خلال دقيقة وابدأ إصدار فواتيرك المتوافقة مع زتكا.
            </p>
            <Button
              size="sm"
              className="rounded-xl font-extrabold bg-brand-green hover:bg-emerald-500 text-white mt-3 gap-1.5"
              onClick={() => onExit("register")}
            >
              <UserPlus className="size-4" />
              سجل مجاناً
            </Button>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 px-4 text-center text-[12px] text-white/50">
          © {new Date().getFullYear()} كاش كلاود — جميع الحقوق محفوظة · صُنع بفخر في السعودية
        </div>
      </footer>
    </div>
  );
}

// ============ مساعدات ============

export function parsePageSections(raw: string): MarketingSection[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MarketingSection[]) : [];
  } catch {
    return [];
  }
}

// ============ عارض الأقسام ============

function MarketingSectionRenderer({
  section,
  onRegister,
}: {
  section: MarketingSection;
  onRegister: () => void;
}) {
  switch (section.type) {
    case "features":
      return <FeaturesSection section={section} />;
    case "stats":
      return <StatsSection section={section} />;
    case "steps":
      return <StepsSection section={section} />;
    case "testimonials":
      return <TestimonialsSection section={section} />;
    case "faq":
      return <FaqSection section={section} />;
    case "pricing":
      return <PricingSection section={section} onRegister={onRegister} />;
    case "richtext":
      return <RichTextSection section={section} />;
    case "cta":
      return <CtaSection section={section} onRegister={onRegister} />;
    default:
      return null;
  }
}

function SectionHeading({ title, subtitle }: { title?: string; subtitle?: string }) {
  if (!title && !subtitle) return null;
  return (
    <div className="text-center max-w-2xl mx-auto mb-10">
      {title && (
        <h2 className="text-2xl sm:text-3xl font-black text-brand-navy leading-tight">{title}</h2>
      )}
      {subtitle && (
        <p className="text-[14px] sm:text-[15px] text-slate-500 leading-relaxed mt-3">{subtitle}</p>
      )}
    </div>
  );
}

/** شبكة المميزات مع أيقونات */
function FeaturesSection({ section }: { section: MarketingSection }) {
  const items = section.items ?? [];
  if (items.length === 0) return null;
  return (
    <section className="py-14 sm:py-20">
      <SectionHeading title={section.title} subtitle={section.subtitle} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => (
          <div
            key={i}
            className="group rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_6px_20px_rgba(15,23,42,0.05)] hover:shadow-[0_14px_36px_rgba(15,23,42,0.1)] hover:-translate-y-0.5 transition-all"
          >
            <div
              className={`size-12 rounded-xl border flex items-center justify-center ${ICON_TONES[i % ICON_TONES.length]}`}
            >
              <SectionIcon name={item.icon} className="size-6" />
            </div>
            <h3 className="font-extrabold text-brand-navy mt-4">{item.title}</h3>
            <p className="text-[13px] text-slate-500 leading-relaxed mt-1.5">{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** شريط الأرقام */
function StatsSection({ section }: { section: MarketingSection }) {
  const items = section.items ?? [];
  if (items.length === 0) return null;
  return (
    <section className="py-12 sm:py-16">
      <SectionHeading title={section.title} />
      <div className="rounded-3xl bg-gradient-to-l from-brand-blue to-brand-teal p-6 sm:p-10 grid grid-cols-2 lg:grid-cols-4 gap-6 text-white">
        {items.map((item, i) => (
          <div key={i} className="text-center">
            <p className="text-2xl sm:text-4xl font-black" dir="ltr">
              {item.value}
            </p>
            <p className="text-[12px] sm:text-[13px] text-white/80 mt-1.5 leading-relaxed">
              {item.sub}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** خطوات مرقمة */
function StepsSection({ section }: { section: MarketingSection }) {
  const items = section.items ?? [];
  if (items.length === 0) return null;
  return (
    <section className="py-14 sm:py-20 bg-brand-light/60 -mx-4 sm:-mx-6 px-4 sm:px-6">
      <SectionHeading title={section.title} subtitle={section.subtitle} />
      <div className="grid gap-5 md:grid-cols-3 max-w-4xl mx-auto">
        {items.map((item, i) => (
          <div key={i} className="relative rounded-2xl bg-white border border-slate-100 p-6 shadow-sm">
            <span className="absolute -top-4 start-6 size-9 rounded-xl bg-gradient-to-l from-brand-blue to-brand-green text-white font-black flex items-center justify-center shadow-md">
              {i + 1}
            </span>
            <h3 className="font-extrabold text-brand-navy mt-3">{item.title}</h3>
            <p className="text-[13px] text-slate-500 leading-relaxed mt-1.5">{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** آراء العملاء */
function TestimonialsSection({ section }: { section: MarketingSection }) {
  const items = section.items ?? [];
  if (items.length === 0) return null;
  return (
    <section className="py-14 sm:py-20">
      <SectionHeading title={section.title} subtitle={section.subtitle} />
      <div className="grid gap-4 md:grid-cols-3">
        {items.map((item, i) => (
          <figure
            key={i}
            className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_6px_20px_rgba(15,23,42,0.05)] flex flex-col"
          >
            <div className="flex gap-0.5 text-amber-400" aria-label="تقييم ٥ من ٥">
              {Array.from({ length: 5 }).map((_, s) => (
                <span key={s} aria-hidden>
                  ★
                </span>
              ))}
            </div>
            <blockquote className="text-[13.5px] text-slate-600 leading-relaxed mt-3 flex-1">
              «{item.sub}»
            </blockquote>
            <figcaption className="mt-4 pt-4 border-t border-slate-100">
              <p className="font-extrabold text-brand-navy text-[14px]">{item.title}</p>
              <p className="text-[12px] text-slate-400 mt-0.5">{item.text}</p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/** أسئلة شائعة قابلة للطي */
function FaqSection({ section }: { section: MarketingSection }) {
  const items = section.items ?? [];
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  if (items.length === 0) return null;
  return (
    <section className="py-14 sm:py-20">
      <SectionHeading title={section.title} subtitle={section.subtitle} />
      <div className="max-w-3xl mx-auto space-y-3">
        {items.map((item, i) => {
          const open = openIdx === i;
          return (
            <div
              key={i}
              className={`rounded-2xl border transition-colors ${
                open ? "border-blue-200 bg-blue-50/40" : "border-slate-100 bg-white"
              }`}
            >
              <button
                onClick={() => setOpenIdx(open ? null : i)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-start"
                aria-expanded={open}
              >
                <span className="font-extrabold text-brand-navy text-[14.5px]">{item.title}</span>
                <ChevronDown
                  className={`size-5 shrink-0 text-brand-blue transition-transform ${
                    open ? "rotate-180" : ""
                  }`}
                />
              </button>
              {open && (
                <p className="px-5 pb-5 -mt-1 text-[13.5px] text-slate-600 leading-relaxed">
                  {item.text}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** بطاقات الباقات */
function PricingSection({
  section,
  onRegister,
}: {
  section: MarketingSection;
  onRegister: () => void;
}) {
  const items = section.items ?? [];
  const [hovered, setHovered] = useState<number | null>(null);
  if (items.length === 0) return null;
  return (
    <section className="py-14 sm:py-20 bg-brand-light/60 -mx-4 sm:-mx-6 px-4 sm:px-6">
      <SectionHeading title={section.title} subtitle={section.subtitle} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 max-w-5xl mx-auto">
        {items.map((item, i) => {
          const featured = i === 2; // الباقة الاحترافية مميزة
          const features = (item.text ?? "")
            .split("؛")
            .map((f) => f.trim())
            .filter(Boolean);
          return (
            <div
              key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              className={`relative rounded-2xl border p-6 flex flex-col transition-all ${
                featured
                  ? "border-brand-green bg-white shadow-[0_18px_44px_rgba(16,185,129,0.18)] lg:-translate-y-2"
                  : "border-slate-200 bg-white shadow-[0_6px_20px_rgba(15,23,42,0.05)]"
              }`}
            >
              {featured && (
                <span className="absolute -top-3.5 start-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-brand-green text-white text-[11px] font-extrabold shadow-md whitespace-nowrap">
                  الأكثر شعبية
                </span>
              )}
              <h3 className="font-extrabold text-brand-navy text-[16px]">{item.title}</h3>
              <div className="mt-3 flex items-baseline gap-1.5" dir="ltr">
                <span className="text-3xl font-black text-brand-navy">{item.value}</span>
                <span className="text-[12px] text-slate-400 font-bold">{item.sub}</span>
              </div>
              <ul className="mt-5 space-y-2.5 flex-1">
                {features.map((f, fi) => (
                  <li key={fi} className="flex items-start gap-2 text-[13px] text-slate-600">
                    <CheckCircle2
                      className={`size-4 shrink-0 mt-0.5 ${
                        featured ? "text-brand-green" : "text-brand-blue"
                      }`}
                    />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                className={`mt-6 rounded-xl font-extrabold w-full ${
                  featured || hovered === i
                    ? "bg-gradient-to-l from-brand-blue to-brand-green text-white shadow-lg"
                    : "bg-slate-100 text-brand-navy hover:bg-slate-200"
                }`}
                onClick={onRegister}
              >
                اختر الباقة
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** نص حر بفقرات */
function RichTextSection({ section }: { section: MarketingSection }) {
  const paragraphs = (section.text ?? "").split("\n").filter((p) => p.trim());
  return (
    <section className="py-14 sm:py-20">
      <SectionHeading title={section.title} subtitle={section.subtitle} />
      <div className="max-w-3xl mx-auto space-y-4">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-[14.5px] text-slate-600 leading-[1.9] text-justify">
            {p}
          </p>
        ))}
      </div>
    </section>
  );
}

/** دعوة أخيرة للإجراء */
function CtaSection({
  section,
  onRegister,
}: {
  section: MarketingSection;
  onRegister: () => void;
}) {
  return (
    <section className="py-14 sm:py-20">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-brand-navy via-brand-blue to-brand-teal text-white px-6 py-12 sm:py-16 text-center">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 20%, white 2px, transparent 2px), radial-gradient(circle at 70% 80%, white 2px, transparent 2px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative max-w-xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black leading-tight">{section.title}</h2>
          <p className="text-[14px] sm:text-[15px] text-white/85 leading-relaxed mt-3">
            {section.text}
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-7">
            <Button
              size="lg"
              className="rounded-xl font-extrabold bg-brand-green hover:bg-emerald-500 text-white shadow-[0_10px_28px_rgba(16,185,129,0.45)] gap-2"
              onClick={onRegister}
            >
              <Rocket className="size-5" />
              ابدأ مجاناً الآن
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="rounded-xl font-extrabold bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white gap-2"
              onClick={onRegister}
            >
              <LogIn className="size-5" />
              لديك حساب؟ سجل دخولك
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
