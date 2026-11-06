"use client";

import { useEffect, useState } from "react";
import {
  UserCog,
  UserPlus,
  Trash2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Session, TeamMember } from "./types";
import { ROLE_LABELS, formatDate, hasPerm } from "./types";

const ROLE_DESCRIPTIONS: { key: string; label: string; desc: string }[] = [
  {
    key: "OWNER",
    label: "المالك",
    desc: "كل الصلاحيات بما فيها إدارة الباقة والفريق",
  },
  { key: "ADMIN", label: "مدير", desc: "كل الصلاحيات" },
  {
    key: "ACCOUNTANT",
    label: "محاسب",
    desc: "المبيعات والمشتريات والمصاريف والمحاسبة",
  },
  { key: "SALES", label: "مبيعات", desc: "الفواتير والعملاء ونقطة البيع" },
  { key: "VIEWER", label: "مُشاهد", desc: "عرض فقط بدون تعديل" },
];

const ASSIGNABLE_ROLES = ["ADMIN", "ACCOUNTANT", "SALES", "VIEWER"];

const ROLE_BADGE_STYLES: Record<string, string> = {
  OWNER: "bg-amber-50 text-amber-700 border-amber-200",
  ADMIN: "bg-brand-light text-brand-navy border-slate-200",
  ACCOUNTANT: "bg-emerald-50 text-emerald-700 border-emerald-200",
  SALES: "bg-teal-50 text-teal-700 border-teal-200",
  VIEWER: "bg-slate-100 text-slate-500 border-slate-200",
};

export function TeamView({
  session,
  onChanged,
}: {
  session: Session;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const canManage = hasPerm(session.role, "team:manage");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ username: "", role: "SALES" });
  const [adding, setAdding] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState(false);

  function load() {
    fetch("/api/team")
      .then((r) => r.json())
      .then((d: { members?: TeamMember[]; myRole?: string }) => {
        setMembers(d.members ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function addMember() {
    const username = form.username.trim();
    if (!username) {
      toast({ variant: "destructive", title: "أدخل اسم المستخدم" });
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", username, role: form.role }),
      });
      const data: { error?: string } = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشلت الإضافة",
          description: data.error,
        });
        return;
      }
      toast({ title: "تمت إضافة العضو", description: username });
      setForm({ username: "", role: "SALES" });
      load();
      onChanged();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setAdding(false);
    }
  }

  async function changeRole(m: TeamMember, role: string) {
    if (role === m.role) return;
    setChangingId(m.id);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "role", userId: m.userId, role }),
      });
      const data: { error?: string } = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل تغيير الدور",
          description: data.error,
        });
        return;
      }
      toast({
        title: "تم تحديث الدور",
        description: `${m.name} — ${ROLE_LABELS[role] ?? role}`,
      });
      load();
      onChanged();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setChangingId(null);
    }
  }

  async function remove(m: TeamMember) {
    setRemoving(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", userId: m.userId }),
      });
      const data: { error?: string } = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل إزالة العضو",
          description: data.error,
        });
        return;
      }
      toast({ title: "تمت إزالة العضو", description: m.name });
      setRemoveTarget(null);
      load();
      onChanged();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="p-4 sm:p-5 space-y-4">
      {/* الترويسة */}
      <div>
        <h1 className="text-xl font-extrabold text-brand-navy flex items-center gap-2">
          <UserCog className="size-6 text-brand-blue" />
          فريق العمل والأدوار
        </h1>
        <p className="text-[13px] text-slate-400 mt-0.5">
          أعضاء منشأة {session.businessName} وصلاحياتهم
        </p>
      </div>

      {/* شرح الأدوار */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {ROLE_DESCRIPTIONS.map((r) => (
          <div
            key={r.key}
            className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] p-3.5"
          >
            <p className="font-extrabold text-brand-navy text-[13px] flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-brand-blue shrink-0" />
              {r.label}
            </p>
            <p className="text-[11.5px] text-slate-400 mt-1 leading-relaxed">
              {r.desc}
            </p>
          </div>
        ))}
      </div>

      {/* إضافة عضو */}
      {canManage && (
        <section className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] p-5">
          <h2 className="font-extrabold text-brand-navy flex items-center gap-2 text-[15px]">
            <UserPlus className="size-5 text-brand-blue" />
            إضافة عضو
          </h2>
          <p className="text-[12px] text-slate-400 mt-0.5 mb-4">
            أضف مستخدماً مسجلاً مسبقاً في النظام وحدد دوره في المنشأة
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px_auto] gap-3 sm:items-end">
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">اسم المستخدم</Label>
              <Input
                value={form.username}
                onChange={(e) =>
                  setForm((f) => ({ ...f, username: e.target.value }))
                }
                placeholder="اسم مستخدم مسجل مسبقاً"
                dir="ltr"
                className="h-11 rounded-xl border-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">الدور</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}
              >
                <SelectTrigger className="h-11 w-full rounded-xl border-slate-200 font-bold text-brand-navy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={addMember}
              disabled={adding}
              className="h-11 w-full sm:w-auto rounded-xl font-extrabold gap-1.5 bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
            >
              {adding ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  <UserPlus className="size-4" />
                  إضافة
                </>
              )}
            </Button>
          </div>
          <p className="text-[11px] text-slate-400 mt-3">
            ملاحظة: يجب أن يكون للعضو حساب مسجل في النظام أولاً — لا يمكن إضافة
            مستخدم غير موجود.
          </p>
        </section>
      )}

      {/* جدول الأعضاء */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="size-8 animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
            <UserCog className="size-14" />
            <p className="text-slate-400 text-sm">لا يوجد أعضاء في الفريق بعد</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-brand-light text-slate-500 text-[12px]">
                  <th className="text-start font-bold px-4 py-3">العضو</th>
                  <th className="text-start font-bold px-4 py-3">الدور</th>
                  <th className="text-start font-bold px-4 py-3">
                    تاريخ الانضمام
                  </th>
                  <th className="text-start font-bold px-4 py-3">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr
                    key={m.id}
                    className={cn(
                      "border-t border-slate-100 transition-colors",
                      m.isSelf ? "bg-blue-50/40" : "hover:bg-blue-50/40"
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="size-9 rounded-full bg-gradient-to-br from-blue-100 to-emerald-100 text-brand-blue flex items-center justify-center font-extrabold text-[14px] shrink-0">
                          {m.name.slice(0, 1)}
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-brand-navy flex items-center gap-1.5">
                            <span className="truncate">{m.name}</span>
                            {m.isSelf && (
                              <span className="text-[11px] font-extrabold text-brand-blue shrink-0">
                                (أنت)
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-400" dir="ltr">
                            @{m.username}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {canManage && m.role !== "OWNER" ? (
                        <Select
                          value={m.role}
                          onValueChange={(v) => changeRole(m, v)}
                          disabled={changingId === m.id}
                        >
                          <SelectTrigger className="h-9 w-36 rounded-xl border-slate-200 text-[12px] font-bold text-brand-navy">
                            {changingId === m.id ? (
                              <Loader2 className="size-4 animate-spin text-slate-400" />
                            ) : (
                              <SelectValue />
                            )}
                          </SelectTrigger>
                          <SelectContent>
                            {ASSIGNABLE_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge
                          className={cn(
                            "rounded-full px-3 py-1 text-[12px] font-bold",
                            ROLE_BADGE_STYLES[m.role] ?? ROLE_BADGE_STYLES.VIEWER
                          )}
                        >
                          {m.roleLabel || ROLE_LABELS[m.role] || m.role}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {formatDate(m.joinedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {canManage && !m.isSelf && m.role !== "OWNER" ? (
                        <button
                          onClick={() => setRemoveTarget(m)}
                          className="size-8 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors"
                          aria-label={`إزالة ${m.name}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* تأكيد الإزالة */}
      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
      >
        <AlertDialogContent dir="rtl" className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>إزالة العضو؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إزالة «{removeTarget?.name}» من فريق منشأة {session.businessName}
              ولن يتمكن من الوصول إلى بياناتها. يمكن إعادته لاحقاً بإضافته من
              جديد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:justify-start">
            <AlertDialogAction
              onClick={() => removeTarget && remove(removeTarget)}
              disabled={removing}
              className="bg-red-500 hover:bg-red-600 rounded-xl flex-1"
            >
              {removing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "إزالة"
              )}
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
