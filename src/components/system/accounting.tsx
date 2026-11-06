"use client";

import { useEffect, useState } from "react";
import {
  CreditCard,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Receipt,
  Save,
  Scale,
  ScrollText,
  Search,
  Send,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type {
  AccountRecord,
  JournalEntryDetail,
  JournalEntrySummary,
} from "./types";
import {
  ACCOUNT_TYPE_LABELS,
  JOURNAL_SOURCE_LABELS,
  formatDate,
  formatMoney,
} from "./types";

// ============ ثوابت مساعدة ============

const ACCOUNT_TYPE_KEYS = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE",
] as const;

const ACCOUNT_TYPE_STYLES: Record<string, string> = {
  ASSET: "bg-blue-50 text-blue-700",
  LIABILITY: "bg-rose-50 text-rose-600",
  EQUITY: "bg-amber-50 text-amber-700",
  REVENUE: "bg-emerald-50 text-emerald-600",
  EXPENSE: "bg-orange-50 text-orange-600",
};

const ACCOUNT_TYPE_CARDS: Record<string, { icon: LucideIcon; wrap: string }> = {
  ASSET: { icon: Wallet, wrap: "bg-blue-50 text-brand-blue" },
  LIABILITY: { icon: CreditCard, wrap: "bg-rose-50 text-rose-500" },
  EQUITY: { icon: Scale, wrap: "bg-amber-50 text-amber-600" },
  REVENUE: { icon: TrendingUp, wrap: "bg-emerald-50 text-emerald-500" },
  EXPENSE: { icon: Receipt, wrap: "bg-orange-50 text-orange-500" },
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "الكل" },
  { value: "draft", label: "مسودات" },
  { value: "posted", label: "مُرحّلة" },
];

type NewJournalLine = {
  accountId: string;
  debit: string;
  credit: string;
  description: string;
};

function emptyJournalLine(): NewJournalLine {
  return { accountId: "", debit: "", credit: "", description: "" };
}

function todayStr(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[11.5px] font-bold border-transparent",
        status === "posted"
          ? "bg-emerald-50 text-emerald-600"
          : "bg-amber-50 text-amber-600"
      )}
    >
      {status === "posted" ? "مُرحّل" : "مسودة"}
    </Badge>
  );
}

function SourceBadge({ source }: { source: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[11.5px] font-bold border-transparent",
        source === "manual"
          ? "bg-blue-50 text-blue-700"
          : "bg-slate-100 text-slate-500"
      )}
    >
      {JOURNAL_SOURCE_LABELS[source] ?? source}
    </Badge>
  );
}

// ============ المكوّن الرئيسي ============

export function AccountingView({
  tab,
  currency,
  onDataChange,
}: {
  tab: "accounts" | "journal";
  currency: string;
  onDataChange: () => void;
}) {
  if (tab === "accounts") {
    return <AccountsTab currency={currency} onDataChange={onDataChange} />;
  }
  return <JournalTab currency={currency} onDataChange={onDataChange} />;
}

// ============ تبويب دليل الحسابات ============

function AccountsTab({
  currency,
  onDataChange,
}: {
  currency: string;
  onDataChange: () => void;
}) {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", type: "ASSET" });
  const [saving, setSaving] = useState(false);
  const [editTarget, setEditTarget] = useState<AccountRecord | null>(null);
  const [editName, setEditName] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AccountRecord | null>(null);

  const sortedAccounts = [...accounts].sort((a, b) =>
    a.code.localeCompare(b.code, "en", { numeric: true })
  );

  function load() {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  function openEdit(a: AccountRecord) {
    setEditTarget(a);
    setEditName(a.name);
  }

  async function saveAccount() {
    const code = form.code.trim();
    const name = form.name.trim();
    if (!/^\d{3,6}$/.test(code)) {
      toast({
        variant: "destructive",
        title: "رمز غير صالح",
        description: "رمز الحساب يجب أن يكون من 3 إلى 6 أرقام",
      });
      return;
    }
    if (!name) {
      toast({ variant: "destructive", title: "اسم الحساب مطلوب" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, type: form.type }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل إضافة الحساب",
          description: data.error,
        });
        return;
      }
      toast({ title: "تمت إضافة الحساب", description: `${code} — ${name}` });
      setAddOpen(false);
      setForm({ code: "", name: "", type: "ASSET" });
      load();
      onDataChange();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!editTarget) return;
    const name = editName.trim();
    if (!name) {
      toast({ variant: "destructive", title: "اسم الحساب مطلوب" });
      return;
    }
    setEditSaving(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editTarget.id, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل تحديث الحساب",
          description: data.error,
        });
        return;
      }
      toast({ title: "تم تحديث الحساب", description: name });
      setEditTarget(null);
      load();
      onDataChange();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setEditSaving(false);
    }
  }

  async function removeAccount(a: AccountRecord) {
    setDeleteTarget(null);
    try {
      const res = await fetch(`/api/accounts?id=${a.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل حذف الحساب",
          description: data.error,
        });
        return;
      }
      if (data.deactivated) {
        toast({
          title: "تم تعطيل الحساب",
          description:
            "لا يمكن حذف حساب مرتبط بقيود يومية — تم تعطيله بدلاً من الحذف",
        });
      } else {
        toast({ title: "تم حذف الحساب", description: a.name });
      }
      load();
      onDataChange();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    }
  }

  return (
    <div className="p-4 sm:p-5 space-y-4">
      {/* الترويسة */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-navy flex items-center gap-2">
            <Landmark className="size-6 text-brand-blue" />
            دليل الحسابات
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            شجرة الحسابات المحاسبية للمنشأة
          </p>
        </div>
        <div className="flex-1" />
        <Button
          onClick={() => setAddOpen(true)}
          className="h-10 rounded-xl font-extrabold gap-1.5 bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
        >
          <Plus className="size-4" />
          إضافة حساب
        </Button>
      </div>

      {/* بطاقات الملخص */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {ACCOUNT_TYPE_KEYS.map((t, i) => {
          const list = accounts.filter(
            (a) => a.type === t && a.isActive
          );
          const sum = round2(list.reduce((s, a) => s + Math.abs(a.balance), 0));
          const meta = ACCOUNT_TYPE_CARDS[t];
          const Icon = meta.icon;
          return (
            <div
              key={t}
              className={cn(
                "bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.05)] flex items-center gap-3",
                i === ACCOUNT_TYPE_KEYS.length - 1 && "col-span-2 md:col-span-1"
              )}
            >
              <div
                className={cn(
                  "size-11 rounded-xl flex items-center justify-center shrink-0",
                  meta.wrap
                )}
              >
                <Icon className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[12px] text-slate-500 font-bold">
                  {ACCOUNT_TYPE_LABELS[t]}
                </p>
                <p
                  className="text-[15px] font-extrabold text-brand-navy truncate"
                  dir="ltr"
                >
                  {formatMoney(sum, currency)}
                </p>
                <p className="text-[11px] text-slate-400">
                  {list.length} حساب نشط
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* جدول الحسابات */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="size-8 animate-spin" />
          </div>
        ) : sortedAccounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
            <Landmark className="size-14" />
            <p className="text-slate-400 text-sm">
              لا توجد حسابات — أضف أول حساب للبدء
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-brand-light text-slate-500 text-[12px]">
                  <th className="text-start font-bold px-4 py-3">الرمز</th>
                  <th className="text-start font-bold px-4 py-3">اسم الحساب</th>
                  <th className="text-start font-bold px-4 py-3">النوع</th>
                  <th className="text-start font-bold px-4 py-3">مدين</th>
                  <th className="text-start font-bold px-4 py-3">دائن</th>
                  <th className="text-start font-bold px-4 py-3">الرصيد</th>
                  <th className="text-start font-bold px-4 py-3">الحالة</th>
                  <th className="text-start font-bold px-4 py-3">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {sortedAccounts.map((a) => (
                  <tr
                    key={a.id}
                    className="border-t border-slate-100 hover:bg-blue-50/40 transition-colors"
                  >
                    <td
                      className="px-4 py-3 font-mono font-bold text-brand-blue"
                      dir="ltr"
                    >
                      {a.code}
                    </td>
                    <td className="px-4 py-3 font-bold text-brand-navy whitespace-nowrap">
                      {a.name}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[11.5px] font-bold border-transparent",
                          ACCOUNT_TYPE_STYLES[a.type] ??
                            "bg-slate-100 text-slate-500"
                        )}
                      >
                        {ACCOUNT_TYPE_LABELS[a.type] ?? a.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500" dir="ltr">
                      {formatMoney(a.debit, currency)}
                    </td>
                    <td className="px-4 py-3 text-slate-500" dir="ltr">
                      {formatMoney(a.credit, currency)}
                    </td>
                    <td
                      className="px-4 py-3 font-extrabold text-brand-navy"
                      dir="ltr"
                    >
                      {formatMoney(a.balance, currency)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[11.5px] font-bold border-transparent",
                          a.isActive
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-slate-100 text-slate-400"
                        )}
                      >
                        {a.isActive ? "نشط" : "معطّل"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(a)}
                          className="size-8 rounded-lg hover:bg-blue-100 text-slate-400 hover:text-brand-blue flex items-center justify-center transition-colors"
                          aria-label={`تعديل ${a.name}`}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(a)}
                          className="size-8 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors"
                          aria-label={`حذف ${a.name}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* حوار إضافة حساب */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-brand-navy">
              إضافة حساب جديد
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">رمز الحساب *</Label>
                <Input
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, code: e.target.value }))
                  }
                  placeholder="مثال: 1101"
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200 font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">النوع *</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
                >
                  <SelectTrigger className="w-full data-[size=default]:h-11 rounded-xl border-slate-200 font-bold text-brand-navy bg-white">
                    <SelectValue placeholder="اختر النوع" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPE_KEYS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {ACCOUNT_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">اسم الحساب *</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="مثال: الصندوق الرئيسي"
                className="h-11 rounded-xl border-slate-200"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              الرمز من 3 إلى 6 أرقام — يُفضّل استخدام ترقيم متسلسل حسب النوع
            </p>
            <Button
              onClick={saveAccount}
              disabled={saving}
              className="w-full min-h-11 rounded-xl font-extrabold bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
            >
              {saving ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  <Plus className="size-4" />
                  إضافة الحساب
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* حوار تعديل اسم الحساب */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="sm:max-w-sm rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-brand-navy">
              تعديل اسم الحساب
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {editTarget && (
              <p className="text-[12px] text-slate-400">
                <span className="font-mono font-bold text-brand-blue" dir="ltr">
                  {editTarget.code}
                </span>{" "}
                — {editTarget.name}
              </p>
            )}
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">اسم الحساب *</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-11 rounded-xl border-slate-200"
              />
            </div>
            <Button
              onClick={saveEdit}
              disabled={editSaving}
              className="w-full min-h-11 rounded-xl font-extrabold bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
            >
              {editSaving ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  <Save className="size-4" />
                  حفظ التعديلات
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* تأكيد حذف الحساب */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent dir="rtl" className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف الحساب</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف «{deleteTarget?.name}»؟ إذا كان الحساب مرتبطاً
              بقيود يومية فسيتم تعطيله بدلاً من حذفه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:justify-start">
            <AlertDialogAction
              onClick={() => deleteTarget && removeAccount(deleteTarget)}
              className="bg-red-500 hover:bg-red-600 rounded-xl flex-1"
            >
              حذف
            </AlertDialogAction>
            <AlertDialogCancel className="rounded-xl flex-1">
              إلغاء
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============ تبويب القيود اليومية ============

function JournalTab({
  currency,
  onDataChange,
}: {
  currency: string;
  onDataChange: () => void;
}) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<JournalEntrySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<JournalEntryDetail | null>(null);
  const [posting, setPosting] = useState(false);
  const [deleteEntryTarget, setDeleteEntryTarget] =
    useState<JournalEntryDetail | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ date: todayStr(), description: "", reference: "" });
  const [lines, setLines] = useState<NewJournalLine[]>([
    emptyJournalLine(),
    emptyJournalLine(),
  ]);
  const [saving, setSaving] = useState(false);

  const activeAccounts = accounts
    .filter((a) => a.isActive)
    .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));

  const totalDebit = round2(
    lines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
  );
  const totalCredit = round2(
    lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
  );
  const balanced = totalDebit === totalCredit && totalDebit > 0;

  const detailTotalDebit = detail
    ? round2(detail.lines.reduce((s, l) => s + l.debit, 0))
    : 0;
  const detailTotalCredit = detail
    ? round2(detail.lines.reduce((s, l) => s + l.credit, 0))
    : 0;

  function load() {
    const params = new URLSearchParams({
      page: String(page),
      status,
      q,
    });
    fetch(`/api/journal?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setEntries(d.entries ?? []);
        setTotal(d.total ?? 0);
        setPageCount(d.pageCount ?? 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      load();
    }, 250);
    return () => clearTimeout(t);
  }, [q, status, page]);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts ?? []))
      .catch(() => {});
  }, []);

  function openNew() {
    setForm({ date: todayStr(), description: "", reference: "" });
    setLines([emptyJournalLine(), emptyJournalLine()]);
    setNewOpen(true);
  }

  function addLine() {
    setLines((ls) => [...ls, emptyJournalLine()]);
  }

  function updateLine(i: number, patch: Partial<NewJournalLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  }

  async function openDetail(id: string) {
    setDetail(null);
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const res = await fetch(`/api/journal/${id}`);
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل تحميل القيد",
          description: data.error,
        });
        setDetailOpen(false);
        return;
      }
      setDetail(data as JournalEntryDetail);
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  async function postEntry(entry: JournalEntryDetail) {
    setPosting(true);
    try {
      const res = await fetch(`/api/journal/${entry.id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل ترحيل القيد",
          description: data.error,
        });
        return;
      }
      toast({ title: "تم ترحيل القيد", description: entry.number });
      await openDetail(entry.id);
      load();
      onDataChange();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setPosting(false);
    }
  }

  async function removeEntry(entry: JournalEntryDetail) {
    setDeleteEntryTarget(null);
    try {
      const res = await fetch(`/api/journal/${entry.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل حذف القيد",
          description: data.error,
        });
        return;
      }
      toast({ title: "تم حذف القيد", description: entry.number });
      setDetailOpen(false);
      setDetail(null);
      load();
      onDataChange();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    }
  }

  async function saveEntry(statusToSave: "draft" | "posted") {
    const description = form.description.trim();
    if (!form.date) {
      toast({ variant: "destructive", title: "التاريخ مطلوب" });
      return;
    }
    if (!description) {
      toast({ variant: "destructive", title: "وصف القيد مطلوب" });
      return;
    }
    const validLines = lines
      .filter(
        (l) => l.accountId !== "" && (Number(l.debit) > 0 || Number(l.credit) > 0)
      )
      .map((l) => ({
        accountId: l.accountId,
        debit: round2(Number(l.debit) || 0),
        credit: round2(Number(l.credit) || 0),
        description: l.description.trim() || undefined,
      }));
    if (validLines.length < 2) {
      toast({
        variant: "destructive",
        title: "القيد يحتاج سطرين على الأقل",
        description: "اختر الحساب وأدخل مبلغاً مديناً أو دائناً في كل سطر",
      });
      return;
    }
    if (statusToSave === "posted" && !balanced) {
      toast({
        variant: "destructive",
        title: "القيد غير متوازن",
        description:
          "يجب تساوي إجمالي المدين مع إجمالي الدائن قبل ترحيل القيد",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          date: form.date,
          reference: form.reference.trim() || undefined,
          status: statusToSave,
          lines: validLines,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل حفظ القيد",
          description: data.error,
        });
        return;
      }
      toast({
        title:
          statusToSave === "posted" ? "تم حفظ القيد وترحيله" : "تم حفظ القيد كمسودة",
        description: data.number,
      });
      setNewOpen(false);
      load();
      onDataChange();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 sm:p-5 space-y-4">
      {/* الترويسة والفلاتر */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-navy flex items-center gap-2">
            <ScrollText className="size-6 text-brand-blue" />
            القيود اليومية
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            سجل القيود المحاسبية بنظام القيد المزدوج
          </p>
        </div>
        <div className="flex-1" />
        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="بحث في القيود..."
            className="ps-10 h-10 rounded-xl bg-white border-slate-200"
          />
        </div>
        <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.value}
              onClick={() => {
                setStatus(s.value);
                setPage(1);
              }}
              className={cn(
                "h-8 px-3 rounded-lg text-[12.5px] font-bold transition-colors",
                status === s.value
                  ? "bg-brand-light text-brand-navy"
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <Button
          onClick={openNew}
          className="h-10 rounded-xl font-extrabold gap-1.5 bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
        >
          <Plus className="size-4" />
          قيد جديد
        </Button>
      </div>

      {/* جدول القيود */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="size-8 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
            <ScrollText className="size-14" />
            <p className="text-slate-400 text-sm">لا توجد قيود يومية</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-brand-light text-slate-500 text-[12px]">
                    <th className="text-start font-bold px-4 py-3">رقم القيد</th>
                    <th className="text-start font-bold px-4 py-3">التاريخ</th>
                    <th className="text-start font-bold px-4 py-3">الوصف</th>
                    <th className="text-start font-bold px-4 py-3">المصدر</th>
                    <th className="text-start font-bold px-4 py-3">الحالة</th>
                    <th className="text-start font-bold px-4 py-3">عدد الأسطر</th>
                    <th className="text-start font-bold px-4 py-3">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr
                      key={e.id}
                      tabIndex={0}
                      onClick={() => openDetail(e.id)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") openDetail(e.id);
                      }}
                      aria-label={`عرض القيد ${e.number}`}
                      className="border-t border-slate-100 hover:bg-blue-50/40 transition-colors cursor-pointer outline-none focus-visible:bg-blue-50/60"
                    >
                      <td
                        className="px-4 py-3 font-bold text-brand-blue font-mono"
                        dir="ltr"
                      >
                        {e.number}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {formatDate(e.date)}
                      </td>
                      <td className="px-4 py-3 font-bold text-brand-navy max-w-56 truncate">
                        {e.description}
                      </td>
                      <td className="px-4 py-3">
                        <SourceBadge source={e.source} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={e.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-bold">
                        {e.linesCount}
                      </td>
                      <td
                        className="px-4 py-3 font-extrabold text-brand-navy"
                        dir="ltr"
                      >
                        {formatMoney(e.totalDebit, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ترقيم الصفحات */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <p className="text-[12px] text-slate-400">
                {total} قيد — صفحة {page} من {Math.max(pageCount, 1)}
              </p>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg"
                >
                  السابق
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pageCount || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg"
                >
                  التالي
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* حوار تفاصيل القيد */}
      <Dialog
        open={detailOpen}
        onOpenChange={(o) => {
          setDetailOpen(o);
          if (!o) setDetail(null);
        }}
      >
        <DialogContent
          className="sm:max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="text-brand-navy flex flex-wrap items-center gap-2">
              {detail ? (
                <>
                  <span>تفاصيل القيد</span>
                  <span className="font-mono text-brand-blue" dir="ltr">
                    {detail.number}
                  </span>
                  <StatusBadge status={detail.status} />
                </>
              ) : (
                "تفاصيل القيد"
              )}
            </DialogTitle>
          </DialogHeader>
          {detailLoading || !detail ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="size-8 animate-spin" />
            </div>
          ) : (
            <>
              {/* معلومات القيد */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-xl bg-brand-light px-3 py-2">
                  <p className="text-[11px] font-bold text-slate-400">التاريخ</p>
                  <p className="text-[13px] font-bold text-brand-navy">
                    {formatDate(detail.date)}
                  </p>
                </div>
                <div className="rounded-xl bg-brand-light px-3 py-2">
                  <p className="text-[11px] font-bold text-slate-400">المصدر</p>
                  <p className="text-[13px] font-bold text-brand-navy">
                    {JOURNAL_SOURCE_LABELS[detail.source] ?? detail.source}
                  </p>
                </div>
                <div className="rounded-xl bg-brand-light px-3 py-2">
                  <p className="text-[11px] font-bold text-slate-400">المرجع</p>
                  <p className="text-[13px] font-bold text-brand-navy truncate">
                    {detail.reference ?? "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-brand-light px-3 py-2">
                  <p className="text-[11px] font-bold text-slate-400">
                    عدد الأسطر
                  </p>
                  <p className="text-[13px] font-bold text-brand-navy">
                    {detail.lines.length}
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-4 rounded-xl bg-brand-light px-3 py-2">
                  <p className="text-[11px] font-bold text-slate-400">الوصف</p>
                  <p className="text-[13px] font-bold text-brand-navy">
                    {detail.description}
                  </p>
                </div>
              </div>

              {/* أسطر القيد */}
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-brand-light text-slate-500 text-[12px]">
                        <th className="text-start font-bold px-3 py-2.5">
                          رمز الحساب
                        </th>
                        <th className="text-start font-bold px-3 py-2.5">
                          اسم الحساب
                        </th>
                        <th className="text-start font-bold px-3 py-2.5">
                          البيان
                        </th>
                        <th className="text-start font-bold px-3 py-2.5">مدين</th>
                        <th className="text-start font-bold px-3 py-2.5">
                          دائن
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lines.map((l) => (
                        <tr
                          key={l.id}
                          className="border-t border-slate-100 hover:bg-blue-50/40 transition-colors"
                        >
                          <td
                            className="px-3 py-2.5 font-mono text-slate-500"
                            dir="ltr"
                          >
                            {l.account.code}
                          </td>
                          <td className="px-3 py-2.5 font-bold text-brand-navy whitespace-nowrap">
                            {l.account.name}
                          </td>
                          <td className="px-3 py-2.5 text-slate-400 max-w-40 truncate">
                            {l.description ?? "—"}
                          </td>
                          <td
                            className="px-3 py-2.5 font-bold text-brand-navy"
                            dir="ltr"
                          >
                            {l.debit > 0 ? formatMoney(l.debit, currency) : "—"}
                          </td>
                          <td
                            className="px-3 py-2.5 font-bold text-brand-navy"
                            dir="ltr"
                          >
                            {l.credit > 0
                              ? formatMoney(l.credit, currency)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-200 bg-slate-50/60">
                        <td
                          colSpan={3}
                          className="px-3 py-2.5 font-extrabold text-brand-navy"
                        >
                          الإجمالي
                        </td>
                        <td
                          className="px-3 py-2.5 font-extrabold text-brand-navy"
                          dir="ltr"
                        >
                          {formatMoney(detailTotalDebit, currency)}
                        </td>
                        <td
                          className="px-3 py-2.5 font-extrabold text-brand-navy"
                          dir="ltr"
                        >
                          {formatMoney(detailTotalCredit, currency)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {detail.status === "draft" &&
                detailTotalDebit !== detailTotalCredit && (
                  <p className="text-[12px] text-rose-500 font-bold">
                    تنبيه: القيد غير متوازن — يجب تساوي المدين والدائن قبل
                    الترحيل
                  </p>
                )}

              <DialogFooter className="flex-row gap-2 sm:justify-start">
                {detail.status === "draft" && (
                  <Button
                    onClick={() => postEntry(detail)}
                    disabled={posting}
                    className="rounded-xl font-extrabold gap-1.5 bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
                  >
                    {posting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    ترحيل القيد
                  </Button>
                )}
                {detail.source === "manual" && (
                  <Button
                    variant="outline"
                    onClick={() => setDeleteEntryTarget(detail)}
                    className="rounded-xl font-bold gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 border-slate-200"
                  >
                    <Trash2 className="size-4" />
                    حذف
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* حوار قيد جديد */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent
          className="sm:max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="text-brand-navy">قيد جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">التاريخ *</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, date: e.target.value }))
                  }
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">المرجع</Label>
                <Input
                  value={form.reference}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, reference: e.target.value }))
                  }
                  placeholder="رقم مستند / شيك (اختياري)"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="font-bold text-slate-700">الوصف *</Label>
                <Input
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder="وصف القيد المحاسبي..."
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
            </div>

            {/* محرر الأسطر */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-bold text-slate-700 text-[13px]">
                  أسطر القيد
                </Label>
                <span className="text-[11px] text-slate-400">
                  سطران على الأقل
                </span>
              </div>
              {activeAccounts.length === 0 && (
                <p className="text-[12px] text-amber-600 bg-amber-50 rounded-xl px-3 py-2 font-bold">
                  لا توجد حسابات نشطة — أضف حسابات من دليل الحسابات أولاً
                </p>
              )}
              <div className="hidden sm:grid grid-cols-[minmax(0,1.3fr)_6rem_6rem_minmax(0,1fr)_2.25rem] gap-2 text-[11px] font-bold text-slate-400">
                <span>الحساب</span>
                <span>مدين</span>
                <span>دائن</span>
                <span>البيان</span>
                <span />
              </div>
              {lines.map((line, i) => (
                <div
                  key={i}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.3fr)_6rem_6rem_minmax(0,1fr)_2.25rem] items-center"
                >
                  <div className="col-span-2 sm:col-span-1">
                    <Select
                      value={line.accountId}
                      onValueChange={(v) => updateLine(i, { accountId: v })}
                    >
                      <SelectTrigger
                        aria-label={`حساب السطر ${i + 1}`}
                        className="w-full data-[size=default]:h-10 rounded-xl border-slate-200 text-[13px] bg-white"
                      >
                        <SelectValue placeholder="اختر الحساب" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.code} — {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    dir="ltr"
                    placeholder="0.00"
                    aria-label={`مدين — السطر ${i + 1}`}
                    value={line.debit}
                    onChange={(e) => updateLine(i, { debit: e.target.value })}
                    className="h-10 rounded-xl border-slate-200"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    dir="ltr"
                    placeholder="0.00"
                    aria-label={`دائن — السطر ${i + 1}`}
                    value={line.credit}
                    onChange={(e) => updateLine(i, { credit: e.target.value })}
                    className="h-10 rounded-xl border-slate-200"
                  />
                  <Input
                    placeholder="بيان اختياري"
                    aria-label={`البيان — السطر ${i + 1}`}
                    value={line.description}
                    onChange={(e) =>
                      updateLine(i, { description: e.target.value })
                    }
                    className="h-10 rounded-xl border-slate-200"
                  />
                  <button
                    onClick={() => removeLine(i)}
                    disabled={lines.length <= 1}
                    className="size-9 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors disabled:opacity-30 disabled:pointer-events-none justify-self-end"
                    aria-label={`حذف السطر ${i + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={addLine}
                className="rounded-xl font-bold gap-1.5 border-dashed border-slate-300 text-brand-blue hover:bg-blue-50 hover:text-brand-blue"
              >
                <Plus className="size-4" />
                إضافة سطر
              </Button>
            </div>

            {/* الإجماليات */}
            <div className="rounded-xl bg-brand-light border border-slate-100 p-3 flex flex-wrap items-center gap-4">
              <div>
                <p className="text-[11px] font-bold text-slate-400">
                  إجمالي المدين
                </p>
                <p className="font-extrabold text-brand-navy" dir="ltr">
                  {formatMoney(totalDebit, currency)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400">
                  إجمالي الدائن
                </p>
                <p className="font-extrabold text-brand-navy" dir="ltr">
                  {formatMoney(totalCredit, currency)}
                </p>
              </div>
              <div className="flex-1" />
              <span
                className={cn(
                  "px-3 py-1.5 rounded-full text-[12px] font-bold",
                  balanced
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-rose-50 text-rose-500"
                )}
              >
                {balanced ? "متوازن ✓" : "غير متوازن"}
              </span>
            </div>
          </div>

          {/* أزرار الحفظ */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => saveEntry("draft")}
              disabled={saving}
              className="h-11 rounded-xl font-extrabold border-slate-200"
            >
              {saving ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                "حفظ كمسودة"
              )}
            </Button>
            <Button
              onClick={() => saveEntry("posted")}
              disabled={saving}
              className="h-11 rounded-xl font-extrabold bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
            >
              {saving ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                "حفظ وترحيل"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* تأكيد حذف القيد */}
      <AlertDialog
        open={!!deleteEntryTarget}
        onOpenChange={(o) => !o && setDeleteEntryTarget(null)}
      >
        <AlertDialogContent dir="rtl" className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف القيد</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف القيد «{deleteEntryTarget?.number}»؟ لا يمكن
              التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:justify-start">
            <AlertDialogAction
              onClick={() =>
                deleteEntryTarget && removeEntry(deleteEntryTarget)
              }
              className="bg-red-500 hover:bg-red-600 rounded-xl flex-1"
            >
              حذف
            </AlertDialogAction>
            <AlertDialogCancel className="rounded-xl flex-1">
              إلغاء
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
