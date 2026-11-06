"use client";

/**
 * إدارة الصفحات التسويقية — تبويب داخل لوحة تحكم المنصة
 * إضافة / تعديل / حذف / نشر ومسودة + محرر أقسام مرئي
 */
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Briefcase,
  Building,
  Calculator,
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  Headset,
  Loader2,
  Mail,
  Megaphone,
  MessageCircle,
  Package,
  Pencil,
  Percent,
  Phone,
  PieChart,
  Plus,
  Receipt,
  RefreshCw,
  ShoppingCart,
  Smile,
  Trash2,
  TrendingUp,
  Truck,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import type { MarketingPageData, MarketingSection, MarketingSectionItem } from "./marketing";
import { parsePageSections } from "./marketing";

// ============ ثوابت ============

const KIND_LABELS: Record<string, string> = {
  home: "الصفحة الرئيسية",
  features: "المميزات",
  pricing: "الباقات والأسعار",
  about: "عن المنصة",
  faq: "الأسئلة الشائعة",
  contact: "تواصل معنا",
  page: "صفحة عامة",
};

const SECTION_TYPE_LABELS: Record<string, string> = {
  features: "شبكة مميزات (أيقونة + عنوان + وصف)",
  stats: "شريط أرقام (قيمة + وصف)",
  steps: "خطوات مرقمة",
  testimonials: "آراء العملاء",
  faq: "أسئلة شائعة قابلة للطي",
  pricing: "بطاقات باقات (المزايا تفصلها ؛)",
  richtext: "نص حر (الفقرات تفصلها سطر جديد)",
  cta: "دعوة للإجراء (بانر)",
};

const ITEM_ICONS: Record<string, { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  receipt: { label: "فاتورة", Icon: Receipt },
  shoppingCart: { label: "سلة شراء", Icon: ShoppingCart },
  warehouse: { label: "مستودع", Icon: Warehouse },
  calculator: { label: "حاسبة", Icon: Calculator },
  users: { label: "مستخدمون", Icon: Users },
  pieChart: { label: "رسم بياني", Icon: PieChart },
  truck: { label: "شاحنة", Icon: Truck },
  creditCard: { label: "بطاقة", Icon: CreditCard },
  building: { label: "مبنى", Icon: Building },
  shield: { label: "درع", Icon: CheckCircle2 },
  percent: { label: "نسبة", Icon: Percent },
  briefcase: { label: "حقيبة", Icon: Briefcase },
  bot: { label: "روبوت", Icon: Bot },
  smile: { label: "ابتسامة", Icon: Smile },
  trendingUp: { label: "نمو", Icon: TrendingUp },
  headset: { label: "سماعة", Icon: Headset },
  mail: { label: "بريد", Icon: Mail },
  phone: { label: "هاتف", Icon: Phone },
  messageCircle: { label: "محادثة", Icon: MessageCircle },
  package: { label: "طرد", Icon: Package },
};

const sid = () => Math.random().toString(36).slice(2, 10);

type EditorForm = {
  id?: string;
  title: string;
  subtitle: string;
  slug: string;
  kind: string;
  navLabel: string;
  order: number;
  heroBadge: string;
  heroTitle: string;
  heroSubtitle: string;
  ctaLabel: string;
  sections: MarketingSection[];
};

const emptyForm: EditorForm = {
  title: "",
  subtitle: "",
  slug: "",
  kind: "page",
  navLabel: "",
  order: 0,
  heroBadge: "",
  heroTitle: "",
  heroSubtitle: "",
  ctaLabel: "",
  sections: [],
};

// ============ المكون الرئيسي ============

export function MarketingAdmin() {
  const { toast } = useToast();
  const [pages, setPages] = useState<MarketingPageData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<EditorForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<MarketingPageData | null>(null);

  const load = useCallback(() => {
    fetch("/api/marketing?admin=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.pages)) setPages(d.pages);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setForm({ ...emptyForm, order: (pages?.length ?? 0) + 1 });
    setEditorOpen(true);
  }

  function openEdit(page: MarketingPageData) {
    setForm({
      id: page.id,
      title: page.title,
      subtitle: page.subtitle ?? "",
      slug: page.slug,
      kind: page.kind ?? "page",
      navLabel: page.navLabel ?? "",
      order: page.order ?? 0,
      heroBadge: page.heroBadge ?? "",
      heroTitle: page.heroTitle ?? "",
      heroSubtitle: page.heroSubtitle ?? "",
      ctaLabel: page.ctaLabel ?? "",
      sections: parsePageSections(page.sections),
    });
    setEditorOpen(true);
  }

  async function save() {
    if (!form.title.trim()) {
      toast({ variant: "destructive", title: "أدخل عنوان الصفحة" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        subtitle: form.subtitle,
        slug: form.slug,
        kind: form.kind,
        navLabel: form.navLabel,
        order: form.order,
        heroBadge: form.heroBadge,
        heroTitle: form.heroTitle,
        heroSubtitle: form.heroSubtitle,
        ctaLabel: form.ctaLabel,
        sections: JSON.stringify(form.sections),
      };
      const res = await fetch(form.id ? `/api/marketing/${form.id}` : "/api/marketing", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "تعذر الحفظ");
      toast({ title: form.id ? "تم حفظ التعديلات" : "تم إنشاء الصفحة", description: d.message });
      setEditorOpen(false);
      load();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "فشل الحفظ",
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(page: MarketingPageData) {
    setBusy(`st:${page.id}`);
    try {
      const res = await fetch("/api/marketing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle-status", pageId: page.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast({ title: d.message });
      load();
    } catch (e) {
      toast({ variant: "destructive", title: "تعذر تغيير الحالة" });
    } finally {
      setBusy(null);
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    setBusy(`del:${confirmDelete.id}`);
    try {
      const res = await fetch(`/api/marketing/${confirmDelete.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast({ title: "تم الحذف", description: d.message });
      setConfirmDelete(null);
      load();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "تعذر الحذف",
        description: e instanceof Error ? e.message : "",
      });
    } finally {
      setBusy(null);
    }
  }

  const totalViews = (pages ?? []).reduce((s, p) => s + (p.views ?? 0), 0);
  const published = (pages ?? []).filter((p) => p.status !== "draft").length;

  return (
    <div className="space-y-4">
      {/* إحصاءات سريعة */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 p-3.5">
          <p className="text-xl font-black text-brand-navy" dir="ltr">
            {pages?.length ?? "—"}
          </p>
          <p className="text-[12px] font-bold text-slate-500 mt-0.5">إجمالي الصفحات</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-green-50 p-3.5">
          <p className="text-xl font-black text-brand-navy" dir="ltr">
            {published}
          </p>
          <p className="text-[12px] font-bold text-slate-500 mt-0.5">منشورة للزوار</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-yellow-50 p-3.5">
          <p className="text-xl font-black text-brand-navy" dir="ltr">
            {totalViews}
          </p>
          <p className="text-[12px] font-bold text-slate-500 mt-0.5">إجمالي الزيارات</p>
        </div>
      </div>

      {/* شريط الأدوات */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-40">
          <p className="text-[13px] text-slate-500 font-bold">
            الصفحات تظهر للزوار في الموقع التسويقي العام قبل تسجيل الدخول
          </p>
        </div>
        <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={load}>
          <RefreshCw className="size-4" />
          تحديث
        </Button>
        <Button
          size="sm"
          className="rounded-xl font-extrabold bg-gradient-to-l from-brand-blue to-brand-green text-white gap-1.5"
          onClick={openCreate}
        >
          <Plus className="size-4" />
          صفحة تسويقية جديدة
        </Button>
      </div>

      {/* القائمة */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-300">
          <Loader2 className="size-8 animate-spin" />
        </div>
      ) : (pages ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-10 text-center">
          <Megaphone className="size-10 text-slate-300 mx-auto" />
          <p className="font-extrabold text-brand-navy mt-3">لا توجد صفحات تسويقية بعد</p>
          <p className="text-[13px] text-slate-500 mt-1">
            أنشئ صفحتك الأولى — ستظهر فوراً للزوار في الموقع العام
          </p>
          <Button className="rounded-xl mt-4 gap-1.5" onClick={openCreate}>
            <Plus className="size-4" />
            إنشاء صفحة
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {(pages ?? []).map((page) => {
            const sections = parsePageSections(page.sections);
            const isDraft = page.status === "draft";
            return (
              <div
                key={page.id}
                className={cn(
                  "rounded-2xl border bg-white p-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors",
                  isDraft ? "border-amber-200 bg-amber-50/30" : "border-slate-100 hover:border-blue-200"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="size-4 text-brand-blue shrink-0" />
                    <span className="font-extrabold text-brand-navy text-[14.5px] truncate">
                      {page.navLabel || page.title}
                    </span>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[11px] font-extrabold border",
                        isDraft
                          ? "bg-amber-50 text-amber-600 border-amber-200"
                          : "bg-emerald-50 text-emerald-600 border-emerald-200"
                      )}
                    >
                      {isDraft ? "مسودة" : "منشورة"}
                    </span>
                    {page.showInNav === false && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                        مخفية من القائمة
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[12px] text-slate-400">
                    <span dir="ltr" className="font-mono">
                      /{page.slug}
                    </span>
                    <span>· {KIND_LABELS[page.kind ?? "page"] ?? page.kind}</span>
                    <span>· {sections.length} قسم</span>
                    <span className="inline-flex items-center gap-1">
                      · <Eye className="size-3" /> {page.views ?? 0} زيارة
                    </span>
                    <span>· ترتيب {page.order ?? 0}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-9 p-0 rounded-lg text-amber-600 hover:bg-amber-50"
                    onClick={() => toggleStatus(page)}
                    disabled={busy === `st:${page.id}`}
                    title={isDraft ? "نشر الصفحة" : "تحويل لمسودة"}
                  >
                    {busy === `st:${page.id}` ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : isDraft ? (
                      <Eye className="size-4" />
                    ) : (
                      <EyeOff className="size-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-9 p-0 rounded-lg text-brand-blue hover:bg-blue-50"
                    onClick={() => openEdit(page)}
                    title="تعديل الصفحة"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-9 p-0 rounded-lg text-red-500 hover:bg-red-50"
                    onClick={() => setConfirmDelete(page)}
                    disabled={busy === `del:${page.id}`}
                    title="حذف الصفحة"
                  >
                    {busy === `del:${page.id}` ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== نافذة المحرر ===== */}
      <Dialog open={editorOpen} onOpenChange={(open) => !open && setEditorOpen(false)}>
        <DialogContent className="rounded-2xl max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-extrabold text-brand-navy flex items-center gap-2">
              <Megaphone className="size-5 text-brand-blue" />
              {form.id ? `تعديل: ${form.title}` : "صفحة تسويقية جديدة"}
            </DialogTitle>
            <DialogDescription>
              الصفحة تظهر للزوار في الموقع العام — عدّل المحتوى والأقسام ثم احفظ
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* البيانات الأساسية */}
            <div className="grid sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-bold">عنوان الصفحة *</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="مثال: الباقات والأسعار"
                  className="rounded-xl h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-bold">
                  المعرف بالرابط (slug) <span className="text-slate-400 font-normal">إنجليزي</span>
                </Label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  placeholder="pricing"
                  dir="ltr"
                  className="rounded-xl h-11 text-start"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-bold">نوع الصفحة</Label>
                <Select
                  value={form.kind}
                  onValueChange={(v) => setForm((f) => ({ ...f, kind: v }))}
                >
                  <SelectTrigger className="rounded-xl h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {Object.entries(KIND_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-bold">
                  الترتيب في القائمة <span className="text-slate-400 font-normal">(رقم)</span>
                </Label>
                <Input
                  type="number"
                  value={form.order}
                  onChange={(e) => setForm((f) => ({ ...f, order: Number(e.target.value) }))}
                  className="rounded-xl h-11"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-[13px] font-bold">
                  وصف مختصر <span className="text-slate-400 font-normal">(تحت العنوان بالـ SEO)</span>
                </Label>
                <Input
                  value={form.subtitle}
                  onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                  placeholder="جملة تعريفية قصيرة بالصفحة"
                  className="rounded-xl h-11"
                />
              </div>
            </div>

            {/* قسم الهيرو */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-3.5">
              <p className="text-[13px] font-extrabold text-brand-navy">
                ترويسة الصفحة (Hero) — أول ما يراه الزائر
              </p>
              <div className="grid sm:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <Label className="text-[12.5px] font-bold">شارة فوق العنوان</Label>
                  <Input
                    value={form.heroBadge}
                    onChange={(e) => setForm((f) => ({ ...f, heroBadge: e.target.value }))}
                    placeholder="متوافق مع زتكا"
                    className="rounded-xl h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[12.5px] font-bold">نص زر الإجراء</Label>
                  <Input
                    value={form.ctaLabel}
                    onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))}
                    placeholder="ابدأ مجاناً الآن"
                    className="rounded-xl h-10"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-[12.5px] font-bold">العنوان الرئيسي الكبير</Label>
                  <Input
                    value={form.heroTitle}
                    onChange={(e) => setForm((f) => ({ ...f, heroTitle: e.target.value }))}
                    placeholder="أدر منشأتك كاملة من مكان واحد"
                    className="rounded-xl h-10"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-[12.5px] font-bold">النص التعريفي تحت العنوان</Label>
                  <Textarea
                    value={form.heroSubtitle}
                    onChange={(e) => setForm((f) => ({ ...f, heroSubtitle: e.target.value }))}
                    placeholder="جملة أو جملتان تشرحان القيمة الأساسية..."
                    rows={2}
                    className="rounded-xl resize-none"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-[12.5px] font-bold">
                    نص الرابط في قائمة الموقع <span className="text-slate-400 font-normal">(اختياري — الافتراضي العنوان)</span>
                  </Label>
                  <Input
                    value={form.navLabel}
                    onChange={(e) => setForm((f) => ({ ...f, navLabel: e.target.value }))}
                    placeholder="الباقات"
                    className="rounded-xl h-10"
                  />
                </div>
              </div>
            </div>

            {/* محرر الأقسام */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-extrabold text-brand-navy">
                  أقسام الصفحة ({form.sections.length})
                </p>
                <SectionTypePicker
                  onPick={(type) =>
                    setForm((f) => ({
                      ...f,
                      sections: [...f.sections, { id: sid(), type, items: [] }],
                    }))
                  }
                />
              </div>

              {form.sections.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-[13px] text-slate-400">
                  لا أقسام — أضف قسماً من الزر أعلاه لتبدأ بناء محتوى الصفحة
                </div>
              ) : (
                <div className="space-y-3">
                  {form.sections.map((section, idx) => (
                    <SectionEditor
                      key={section.id ?? idx}
                      section={section}
                      onChange={(next) =>
                        setForm((f) => ({
                          ...f,
                          sections: f.sections.map((s, i) => (i === idx ? next : s)),
                        }))
                      }
                      onRemove={() =>
                        setForm((f) => ({
                          ...f,
                          sections: f.sections.filter((_, i) => i !== idx),
                        }))
                      }
                      onMove={(dir) =>
                        setForm((f) => {
                          const arr = [...f.sections];
                          const target = idx + dir;
                          if (target < 0 || target >= arr.length) return f;
                          [arr[idx], arr[target]] = [arr[target], arr[idx]];
                          return { ...f, sections: arr };
                        })
                      }
                      isFirst={idx === 0}
                      isLast={idx === form.sections.length - 1}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setEditorOpen(false)} disabled={saving}>
              إلغاء
            </Button>
            <Button
              className="rounded-xl font-extrabold bg-gradient-to-l from-brand-blue to-brand-green text-white gap-1.5"
              onClick={save}
              disabled={saving}
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {form.id ? "حفظ التعديلات" : "إنشاء الصفحة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== تأكيد الحذف ===== */}
      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="font-extrabold text-brand-navy flex items-center gap-2">
              <Trash2 className="size-5 text-red-500" />
              حذف الصفحة التسويقية
            </DialogTitle>
            <DialogDescription>
              سيتم حذف «{confirmDelete?.navLabel || confirmDelete?.title}» نهائياً من الموقع العام —
              لا يمكن التراجع عن هذا الإجراء.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setConfirmDelete(null)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl gap-1.5"
              onClick={doDelete}
              disabled={busy === `del:${confirmDelete?.id}`}
            >
              {busy === `del:${confirmDelete?.id}` ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              حذف نهائي
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ منتقي نوع القسم ============

function SectionTypePicker({ onPick }: { onPick: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Select onValueChange={(v) => { onPick(v); setOpen(false); }}>
            <SelectTrigger className="h-9 w-64 rounded-lg text-[12px] font-bold">
              <SelectValue placeholder="اختر نوع القسم..." />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {Object.entries(SECTION_TYPE_LABELS).map(([type, label]) => (
                <SelectItem key={type} value={type}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            className="size-9 p-0 rounded-lg"
            onClick={() => setOpen(false)}
            aria-label="إلغاء"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg gap-1 text-[12px]"
          onClick={() => setOpen(true)}
        >
          <Plus className="size-3.5" />
          إضافة قسم
        </Button>
      )}
    </>
  );
}

// ============ محرر قسم واحد ============

function SectionEditor({
  section,
  onChange,
  onRemove,
  onMove,
  isFirst,
  isLast,
}: {
  section: MarketingSection;
  onChange: (s: MarketingSection) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const set = (patch: Partial<MarketingSection>) => onChange({ ...section, ...patch });
  const items = section.items ?? [];

  const setItem = (idx: number, patch: Partial<MarketingSectionItem>) =>
    set({ items: items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });
  const addItem = () => set({ items: [...items, { icon: "receipt", title: "", text: "" }] });
  const removeItem = (idx: number) => set({ items: items.filter((_, i) => i !== idx) });
  const moveItem = (idx: number, dir: -1 | 1) => {
    const arr = [...items];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    set({ items: arr });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {/* رأس القسم */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-50 border-b border-slate-100">
        <span className="text-[12px] font-extrabold text-brand-blue truncate flex-1">
          {SECTION_TYPE_LABELS[section.type] ?? section.type}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="size-7 p-0 rounded-md"
          onClick={() => onMove(-1)}
          disabled={isFirst}
          aria-label="تحريك القسم لأعلى"
        >
          <ArrowUp className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="size-7 p-0 rounded-md"
          onClick={() => onMove(1)}
          disabled={isLast}
          aria-label="تحريك القسم لأسفل"
        >
          <ArrowDown className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="size-7 p-0 rounded-md text-red-500 hover:bg-red-50"
          onClick={onRemove}
          aria-label="حذف القسم"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <div className="p-3.5 space-y-3">
        <div className="grid sm:grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <Label className="text-[12px] font-bold">عنوان القسم</Label>
            <Input
              value={section.title ?? ""}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="مثال: كل ما تحتاجه منشأتك"
              className="h-9 rounded-lg text-[13px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[12px] font-bold">عنوان فرعي</Label>
            <Input
              value={section.subtitle ?? ""}
              onChange={(e) => set({ subtitle: e.target.value })}
              placeholder="شرح مختصر اختياري"
              className="h-9 rounded-lg text-[13px]"
            />
          </div>
        </div>

        {/* نص حر لقسمي richtext و cta */}
        {(section.type === "richtext" || section.type === "cta") && (
          <div className="space-y-1">
            <Label className="text-[12px] font-bold">
              {section.type === "cta" ? "نص الدعوة" : "النص (فاصل بين الفقرات: سطر جديد)"}
            </Label>
            <Textarea
              value={section.text ?? ""}
              onChange={(e) => set({ text: e.target.value })}
              rows={section.type === "richtext" ? 4 : 2}
              placeholder={section.type === "cta" ? "ابدأ بباقة تجريبية مجانية..." : "فقرة أولى..."}
              className="rounded-lg text-[13px] resize-none"
            />
          </div>
        )}

        {/* عناصر القسم */}
        {["features", "stats", "steps", "testimonials", "faq", "pricing"].includes(section.type) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[12px] font-bold">
                عناصر القسم ({items.length})
                {section.type === "testimonials" && (
                  <span className="text-slate-400 font-normal"> — الحقل «نص إضافي» لرأي العميل</span>
                )}
                {section.type === "stats" && (
                  <span className="text-slate-400 font-normal"> — العنوان = الرقم</span>
                )}
              </Label>
              <Button
                variant="outline"
                size="sm"
                className="h-7 rounded-lg gap-1 text-[11px] px-2"
                onClick={addItem}
              >
                <Plus className="size-3" />
                عنصر
              </Button>
            </div>

            {items.length === 0 ? (
              <p className="text-[12px] text-slate-400 text-center py-3 border border-dashed border-slate-200 rounded-xl">
                لا عناصر — أضف عنصراً للبدء
              </p>
            ) : (
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 space-y-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-extrabold text-slate-400 w-5 text-center">
                        {idx + 1}
                      </span>
                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {section.type === "stats" ? (
                          <>
                            <Input
                              value={item.value ?? ""}
                              onChange={(e) => setItem(idx, { value: e.target.value })}
                              placeholder="الرقم — مثال: +٧٥٠"
                              className="h-8 rounded-lg text-[12px]"
                            />
                            <Input
                              value={item.sub ?? ""}
                              onChange={(e) => setItem(idx, { sub: e.target.value })}
                              placeholder="وصف الرقم"
                              className="h-8 rounded-lg text-[12px] col-span-1 sm:col-span-2"
                            />
                          </>
                        ) : section.type === "pricing" ? (
                          <>
                            <Input
                              value={item.title ?? ""}
                              onChange={(e) => setItem(idx, { title: e.target.value })}
                              placeholder="اسم الباقة"
                              className="h-8 rounded-lg text-[12px]"
                            />
                            <Input
                              value={item.value ?? ""}
                              onChange={(e) => setItem(idx, { value: e.target.value })}
                              placeholder="السعر — ٢٤٩ ر.س"
                              className="h-8 rounded-lg text-[12px]"
                            />
                            <Input
                              value={item.sub ?? ""}
                              onChange={(e) => setItem(idx, { sub: e.target.value })}
                              placeholder="الدورية — شهرياً"
                              className="h-8 rounded-lg text-[12px]"
                            />
                          </>
                        ) : (
                          <Input
                            value={item.title ?? ""}
                            onChange={(e) => setItem(idx, { title: e.target.value })}
                            placeholder={
                              section.type === "testimonials"
                                ? "اسم العميل"
                                : section.type === "faq"
                                  ? "السؤال"
                                  : "العنوان"
                            }
                            className="h-8 rounded-lg text-[12px]"
                          />
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-7 p-0 rounded-md"
                        onClick={() => moveItem(idx, -1)}
                        disabled={idx === 0}
                        aria-label="تحريك لأعلى"
                      >
                        <ArrowUp className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-7 p-0 rounded-md"
                        onClick={() => moveItem(idx, 1)}
                        disabled={idx === items.length - 1}
                        aria-label="تحريك لأسفل"
                      >
                        <ArrowDown className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-7 p-0 rounded-md text-red-500 hover:bg-red-50"
                        onClick={() => removeItem(idx)}
                        aria-label="حذف العنصر"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-1.5 ps-6">
                      {/* اختيار الأيقونة للمميزات */}
                      {section.type === "features" && (
                        <Select
                          value={item.icon ?? "receipt"}
                          onValueChange={(v) => setItem(idx, { icon: v })}
                        >
                          <SelectTrigger className="h-8 rounded-lg text-[12px]">
                            <div className="flex items-center gap-1.5">
                              {(() => {
                                const Ic = ITEM_ICONS[item.icon ?? "receipt"]?.Icon ?? Receipt;
                                return <Ic className="size-3.5 text-brand-blue" />;
                              })()}
                              <SelectValue />
                            </div>
                          </SelectTrigger>
                          <SelectContent className="rounded-xl max-h-64">
                            {Object.entries(ITEM_ICONS).map(([key, { label, Icon }]) => (
                              <SelectItem key={key} value={key}>
                                <span className="flex items-center gap-2">
                                  <Icon className="size-4" />
                                  {label}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Input
                        value={item.text ?? ""}
                        onChange={(e) => setItem(idx, { text: e.target.value })}
                        placeholder={
                          section.type === "testimonials"
                            ? "الصفة — متجر إلكتروني بجدة"
                            : section.type === "faq"
                              ? "الإجابة"
                              : "الوصف"
                        }
                        className={`h-8 rounded-lg text-[12px] ${section.type === "features" ? "" : "sm:col-span-2"}`}
                      />
                      {section.type === "testimonials" && (
                        <Textarea
                          value={item.sub ?? ""}
                          onChange={(e) => setItem(idx, { sub: e.target.value })}
                          placeholder="نص رأي العميل الفعلي"
                          rows={2}
                          className="rounded-lg text-[12px] resize-none sm:col-span-2"
                        />
                      )}
                      {section.type === "pricing" && (
                        <Input
                          value={item.text ?? ""}
                          onChange={(e) => setItem(idx, { text: e.target.value })}
                          placeholder="المزايا مفصولة بالفاصلة المنقوطة ؛"
                          className="h-8 rounded-lg text-[12px] sm:col-span-2"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
