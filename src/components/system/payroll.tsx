"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BadgeDollarSign,
  CalendarClock,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Power,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type {
  EmployeeRecord,
  PayrollRunRecord,
  PayslipRecord,
  Session,
} from "./types";
import { formatDate, formatDateTime, formatMoney, hasPerm } from "./types";

// ============ ثوابت مساعدة ============

/** نسب التأمينات الاجتماعية (GOSI) السعودية */
export const GOSI_EMPLOYEE_RATE = 0.0975;
export const GOSI_EMPLOYER_RATE = 0.1175;

const MONTH_LABELS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

function monthLabel(month: number): string {
  return MONTH_LABELS[Math.min(Math.max(month, 1), 12) - 1];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const emptyEmployeeForm = {
  name: "",
  nationalId: "",
  position: "",
  phone: "",
  iban: "",
  bankName: "",
  baseSalary: "",
  housingAllowance: "",
  otherAllowance: "",
  otherDeduction: "",
  gosiApplicable: true,
};

type PayrollStats = {
  totalEmployees: number;
  activeEmployees: number;
  monthlyGross: number;
  lastRunLabel: string | null;
};

const emptyStats: PayrollStats = {
  totalEmployees: 0,
  activeEmployees: 0,
  monthlyGross: 0,
  lastRunLabel: null,
};

// ============ المكوّن الرئيسي ============

export function PayrollView({
  currency,
  session,
}: {
  currency: string;
  session: Session;
}) {
  const { toast } = useToast();
  const canWrite = hasPerm(session.role, "accounting:write");

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [runs, setRuns] = useState<PayrollRunRecord[]>([]);
  const [stats, setStats] = useState<PayrollStats>(emptyStats);
  const [q, setQ] = useState("");

  // حوار الموظف (إنشاء / تعديل)
  const [empDialogOpen, setEmpDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRecord | null>(null);
  const [empForm, setEmpForm] = useState({ ...emptyEmployeeForm });
  const [empSaving, setEmpSaving] = useState(false);
  const [deleteEmployeeTarget, setDeleteEmployeeTarget] = useState<EmployeeRecord | null>(null);

  // حوار تشغيل مسير جديد
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const now = new Date();
  const [runForm, setRunForm] = useState({
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
    note: "",
  });
  const [runSaving, setRunSaving] = useState(false);
  const [deleteRunTarget, setDeleteRunTarget] = useState<PayrollRunRecord | null>(null);

  // حوار قسائم مسير
  const [payslipsOpen, setPayslipsOpen] = useState(false);
  const [payslipsLoading, setPayslipsLoading] = useState(false);
  const [payslipsRun, setPayslipsRun] = useState<PayrollRunRecord | null>(null);
  const [payslips, setPayslips] = useState<PayslipRecord[]>([]);

  const load = useCallback(() => {
    fetch("/api/payroll")
      .then((r) => r.json())
      .then((d) => {
        setEmployees(d.employees ?? []);
        setRuns(d.runs ?? []);
        if (d.stats) setStats(d.stats as PayrollStats);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ============ الموظفون ============

  function openNewEmployee() {
    setEditingEmployee(null);
    setEmpForm({ ...emptyEmployeeForm });
    setEmpDialogOpen(true);
  }

  function openEditEmployee(e: EmployeeRecord) {
    setEditingEmployee(e);
    setEmpForm({
      name: e.name,
      nationalId: e.nationalId ?? "",
      position: e.position ?? "",
      phone: e.phone ?? "",
      iban: e.iban ?? "",
      bankName: e.bankName ?? "",
      baseSalary: String(e.baseSalary ?? ""),
      housingAllowance: String(e.housingAllowance ?? ""),
      otherAllowance: String(e.otherAllowance ?? ""),
      otherDeduction: String(e.otherDeduction ?? ""),
      gosiApplicable: e.gosiApplicable,
    });
    setEmpDialogOpen(true);
  }

  /** بناء حمولة الموظف من النموذج — isActive اختيارية للتعطيل/التفعيل */
  function employeePayload(active?: boolean) {
    return {
      name: empForm.name.trim(),
      nationalId: empForm.nationalId.trim() || undefined,
      position: empForm.position.trim() || undefined,
      phone: empForm.phone.trim() || undefined,
      iban: empForm.iban.trim() || undefined,
      bankName: empForm.bankName.trim() || undefined,
      baseSalary: Number(empForm.baseSalary) || 0,
      housingAllowance: Number(empForm.housingAllowance) || 0,
      otherAllowance: Number(empForm.otherAllowance) || 0,
      otherDeduction: Number(empForm.otherDeduction) || 0,
      gosiApplicable: empForm.gosiApplicable,
      ...(typeof active === "boolean" ? { isActive: active } : {}),
    };
  }

  async function saveEmployee() {
    if (!empForm.name.trim()) {
      toast({ variant: "destructive", title: "اسم الموظف مطلوب" });
      return;
    }
    if ((Number(empForm.baseSalary) || 0) <= 0) {
      toast({ variant: "destructive", title: "أدخل راتباً أساسياً صحيحاً" });
      return;
    }
    setEmpSaving(true);
    try {
      const body = editingEmployee
        ? { action: "employee.update", id: editingEmployee.id, employee: employeePayload(editingEmployee.isActive) }
        : { action: "employee.create", employee: employeePayload() };
      const res = await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل حفظ الموظف",
          description: data.error,
        });
        return;
      }
      toast({
        title: editingEmployee ? "تم تحديث بيانات الموظف" : "تمت إضافة الموظف",
        description: empForm.name.trim(),
      });
      setEmpDialogOpen(false);
      load();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setEmpSaving(false);
    }
  }

  /** تعطيل / تفعيل موظف — تحديث كامل مع عكس الحالة */
  async function toggleEmployee(e: EmployeeRecord) {
    try {
      const res = await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "employee.update",
          id: e.id,
          employee: {
            name: e.name,
            nationalId: e.nationalId ?? undefined,
            position: e.position,
            phone: e.phone ?? undefined,
            iban: e.iban ?? undefined,
            bankName: e.bankName ?? undefined,
            baseSalary: e.baseSalary,
            housingAllowance: e.housingAllowance,
            otherAllowance: e.otherAllowance,
            otherDeduction: e.otherDeduction,
            gosiApplicable: e.gosiApplicable,
            isActive: !e.isActive,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل تحديث حالة الموظف",
          description: data.error,
        });
        return;
      }
      toast({
        title: e.isActive ? "تم تعطيل الموظف" : "تم تفعيل الموظف",
        description: e.name,
      });
      load();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    }
  }

  async function removeEmployee(e: EmployeeRecord) {
    setDeleteEmployeeTarget(null);
    try {
      const res = await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "employee.delete", id: e.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل حذف الموظف",
          description: data.error,
        });
        return;
      }
      toast({ title: "تم حذف الموظف", description: e.name });
      load();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    }
  }

  // ============ المسيرات ============

  async function createRun() {
    const month = Number(runForm.month);
    const year = Number(runForm.year);
    if (!month || month < 1 || month > 12 || !year || year < 2000 || year > 2100) {
      toast({ variant: "destructive", title: "اختر شهراً وسنة صحيحة" });
      return;
    }
    setRunSaving(true);
    try {
      const res = await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run.create",
          month,
          year,
          note: runForm.note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل تشغيل المسير",
          description: data.error,
        });
        return;
      }
      toast({
        title: `تم تشغيل مسير ${monthLabel(month)} ${year}`,
        description: data.journalNumber
          ? `رُحِّل القيد ${data.journalNumber} — صافي المستحقات ${formatMoney(data.run?.netTotal ?? 0, currency)}`
          : `صافي المستحقات ${formatMoney(data.run?.netTotal ?? 0, currency)}`,
      });
      setRunDialogOpen(false);
      load();
      // فتح قسائم المسير الجديد مباشرة
      if (data.run) {
        setPayslipsRun(data.run as PayrollRunRecord);
        setPayslips(data.payslips ?? []);
        setPayslipsOpen(true);
      }
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setRunSaving(false);
    }
  }

  async function removeRun(run: PayrollRunRecord) {
    setDeleteRunTarget(null);
    try {
      const res = await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run.delete", id: run.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشل حذف المسير",
          description: data.error,
        });
        return;
      }
      toast({
        title: "تم حذف المسير",
        description: `${monthLabel(run.month)} ${run.year} — وعكس أثره المحاسبي`,
      });
      load();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    }
  }

  /** فتح حوار القسائم لمسير محدد */
  function openPayslips(run: PayrollRunRecord) {
    setPayslipsRun(run);
    setPayslips([]);
    setPayslipsLoading(true);
    setPayslipsOpen(true);
    fetch(`/api/payroll?runId=${run.id}`)
      .then((r) => r.json())
      .then((d) => {
        setPayslips(d.payslips ?? []);
        if (d.run) setPayslipsRun(d.run as PayrollRunRecord);
      })
      .catch(() => {
        toast({ variant: "destructive", title: "خطأ في تحميل القسائم" });
      })
      .finally(() => setPayslipsLoading(false));
  }

  // ============ حسابات GOSI الحية ============

  const baseSalaryVal = Number(empForm.baseSalary) || 0;
  const housingVal = Number(empForm.housingAllowance) || 0;
  const otherAllowVal = Number(empForm.otherAllowance) || 0;
  const otherDeductVal = Number(empForm.otherDeduction) || 0;
  const gosiBase = round2(baseSalaryVal + housingVal);
  const gosiEmployee = empForm.gosiApplicable ? round2(gosiBase * GOSI_EMPLOYEE_RATE) : 0;
  const gosiEmployer = empForm.gosiApplicable ? round2(gosiBase * GOSI_EMPLOYER_RATE) : 0;
  const netPay = round2(
    baseSalaryVal + housingVal + otherAllowVal - otherDeductVal - gosiEmployee
  );

  // فلترة الموظفين بالبحث
  const filteredEmployees = employees.filter((e) => {
    if (!q.trim()) return true;
    const needle = q.trim();
    return (
      e.name.includes(needle) ||
      (e.nationalId ?? "").includes(needle) ||
      e.position.includes(needle) ||
      (e.bankName ?? "").includes(needle)
    );
  });

  return (
    <div className="p-4 sm:p-5 space-y-4">
      {/* الترويسة */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-navy flex items-center gap-2">
            <BadgeDollarSign className="size-6 text-brand-blue" />
            الرواتب والموظفون
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            إدارة الموظفين ومسيرات الرواتب مع التأمينات الاجتماعية (GOSI) وترحيل محاسبي تلقائي
          </p>
        </div>
        <div className="flex-1" />
        {stats.lastRunLabel && (
          <Badge
            variant="secondary"
            className="rounded-full px-2.5 py-0.5 text-[11.5px] font-bold border-transparent bg-brand-light text-slate-500 gap-1"
          >
            <CalendarClock className="size-3" />
            آخر مسير: {stats.lastRunLabel}
          </Badge>
        )}
      </div>

      {/* بطاقات الإحصاء */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.05)] flex items-center gap-3">
          <div className="size-11 rounded-xl bg-blue-50 text-brand-blue flex items-center justify-center shrink-0">
            <Users className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] text-slate-500 font-bold">إجمالي الموظفين</p>
            <p className="text-[15px] font-extrabold text-brand-navy">
              {stats.totalEmployees.toLocaleString("ar-EG")}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.05)] flex items-center gap-3">
          <div className="size-11 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
            <UserRound className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] text-slate-500 font-bold">الموظفون النشطون</p>
            <p className="text-[15px] font-extrabold text-brand-navy">
              {stats.activeEmployees.toLocaleString("ar-EG")}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.05)] flex items-center gap-3">
          <div className="size-11 rounded-xl bg-teal-50 text-brand-teal flex items-center justify-center shrink-0">
            <Wallet className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] text-slate-500 font-bold">الرواتب الشهرية التقديرية (مع البدلات)</p>
            <p className="text-[15px] font-extrabold text-brand-navy truncate" dir="ltr">
              {formatMoney(stats.monthlyGross, currency)}
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="employees" dir="rtl" className="gap-4">
        <TabsList className="h-11 rounded-xl bg-white border border-slate-200 p-1 w-full sm:w-fit">
          <TabsTrigger
            value="employees"
            className="h-9 px-5 rounded-lg text-[13px] font-bold data-[state=active]:bg-brand-light data-[state=active]:text-brand-navy data-[state=active]:shadow-none text-slate-500"
          >
            <Users className="size-4" />
            الموظفون
          </TabsTrigger>
          <TabsTrigger
            value="runs"
            className="h-9 px-5 rounded-lg text-[13px] font-bold data-[state=active]:bg-brand-light data-[state=active]:text-brand-navy data-[state=active]:shadow-none text-slate-500"
          >
            <CalendarClock className="size-4" />
            مسيرات الرواتب
          </TabsTrigger>
        </TabsList>

        {/* ============ تبويب الموظفين ============ */}
        <TabsContent value="employees" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="بحث بالاسم أو الهوية أو الوظيفة..."
                className="w-full ps-10 h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-brand-blue"
              />
            </div>
            <div className="flex-1" />
            {canWrite && (
              <Button
                onClick={openNewEmployee}
                className="h-10 rounded-xl font-extrabold gap-1.5 bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
              >
                <Plus className="size-4" />
                إضافة موظف
              </Button>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-slate-400">
                <Loader2 className="size-8 animate-spin" />
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
                <Users className="size-14" />
                <p className="text-slate-400 text-sm">
                  {q.trim() ? "لا توجد نتائج مطابقة" : "لا يوجد موظفون بعد"}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-brand-light text-slate-500 text-[12px]">
                      <th className="text-start font-bold px-4 py-3">الموظف والوظيفة</th>
                      <th className="text-start font-bold px-4 py-3">الراتب الأساسي</th>
                      <th className="text-start font-bold px-4 py-3">البدلات (سكن + أخرى)</th>
                      <th className="text-start font-bold px-4 py-3">الاستقطاعات</th>
                      <th className="text-start font-bold px-4 py-3">التأمينات</th>
                      <th className="text-start font-bold px-4 py-3">الحالة</th>
                      <th className="text-start font-bold px-4 py-3">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((e) => (
                      <tr
                        key={e.id}
                        className={cn(
                          "border-t border-slate-100 hover:bg-blue-50/40 transition-colors",
                          !e.isActive && "bg-slate-50/60"
                        )}
                      >
                        <td className="px-4 py-3">
                          <p className="font-bold text-brand-navy whitespace-nowrap">{e.name}</p>
                          <p className="text-[11.5px] text-slate-400">
                            {e.position || "—"}
                            {e.nationalId ? ` — هوية ${e.nationalId}` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3 font-extrabold text-brand-navy whitespace-nowrap" dir="ltr">
                          {formatMoney(e.baseSalary, currency)}
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap" dir="ltr">
                          {formatMoney(e.housingAllowance + e.otherAllowance, currency)}
                        </td>
                        <td className="px-4 py-3 text-rose-500 font-bold whitespace-nowrap" dir="ltr">
                          {formatMoney(e.otherDeduction, currency)}
                        </td>
                        <td className="px-4 py-3">
                          {e.gosiApplicable ? (
                            <Badge
                              variant="secondary"
                              className="rounded-full px-2.5 py-0.5 text-[11.5px] font-bold border-transparent gap-1 bg-emerald-50 text-emerald-600"
                            >
                              <ShieldCheck className="size-3" />
                              خاضع
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="rounded-full px-2.5 py-0.5 text-[11.5px] font-bold border-transparent bg-slate-100 text-slate-400"
                            >
                              غير خاضع
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {e.isActive ? (
                            <Badge
                              variant="secondary"
                              className="rounded-full px-2.5 py-0.5 text-[11.5px] font-bold border-transparent bg-emerald-50 text-emerald-600"
                            >
                              نشط
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="rounded-full px-2.5 py-0.5 text-[11.5px] font-bold border-transparent bg-slate-100 text-slate-400"
                            >
                              معطّل
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {canWrite && (
                              <>
                                <button
                                  onClick={() => openEditEmployee(e)}
                                  className="size-8 rounded-lg hover:bg-blue-100 text-slate-400 hover:text-brand-blue flex items-center justify-center transition-colors"
                                  aria-label={`تعديل ${e.name}`}
                                >
                                  <Pencil className="size-4" />
                                </button>
                                <button
                                  onClick={() => toggleEmployee(e)}
                                  className={cn(
                                    "size-8 rounded-lg flex items-center justify-center transition-colors",
                                    e.isActive
                                      ? "hover:bg-amber-100 text-slate-400 hover:text-amber-500"
                                      : "hover:bg-emerald-100 text-slate-400 hover:text-emerald-600"
                                  )}
                                  aria-label={e.isActive ? `تعطيل ${e.name}` : `تفعيل ${e.name}`}
                                  title={e.isActive ? "تعطيل الموظف" : "تفعيل الموظف"}
                                >
                                  <Power className="size-4" />
                                </button>
                                <button
                                  onClick={() => setDeleteEmployeeTarget(e)}
                                  className="size-8 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors"
                                  aria-label={`حذف ${e.name}`}
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ============ تبويب المسيرات ============ */}
        <TabsContent value="runs" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[13px] text-slate-400">
              {runs.length} مسير — تشغيل المسير يُرحّل القيود آلياً ويصدر قسائم الرواتب
            </p>
            <div className="flex-1" />
            {canWrite && (
              <Button
                onClick={() => {
                  const d = new Date();
                  setRunForm({
                    month: String(d.getMonth() + 1),
                    year: String(d.getFullYear()),
                    note: "",
                  });
                  setRunDialogOpen(true);
                }}
                disabled={employees.filter((e) => e.isActive).length === 0}
                className="h-10 rounded-xl font-extrabold gap-1.5 bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
              >
                <Plus className="size-4" />
                تشغيل مسير جديد
              </Button>
            )}
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-100 flex items-center justify-center py-20 text-slate-400">
              <Loader2 className="size-8 animate-spin" />
            </div>
          ) : runs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
              <CalendarClock className="size-14" />
              <p className="text-slate-400 text-sm">لا توجد مسيرات رواتب بعد</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="size-10 rounded-xl bg-gradient-to-br from-brand-blue to-brand-teal text-white flex items-center justify-center shrink-0">
                      <CalendarClock className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-extrabold text-brand-navy text-[14.5px]">
                        مسير {monthLabel(run.month)} {run.year}
                      </p>
                      <p className="text-[11.5px] text-slate-400">
                        {run.processedAt
                          ? `شُغِّل في ${formatDateTime(run.processedAt)}`
                          : `أُنشئ في ${formatDate(run.createdAt)}`}
                      </p>
                    </div>
                    <div className="flex-1" />
                    <Badge
                      variant="secondary"
                      className="rounded-full px-2.5 py-0.5 text-[11.5px] font-bold border-transparent bg-emerald-50 text-emerald-600"
                    >
                      مُرحَّل
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
                    <div className="rounded-xl bg-brand-light px-3 py-2">
                      <p className="text-[11px] font-bold text-slate-400">الموظفون</p>
                      <p className="font-extrabold text-brand-navy">
                        {run.employeesCount.toLocaleString("ar-EG")}
                      </p>
                    </div>
                    <div className="rounded-xl bg-brand-light px-3 py-2">
                      <p className="text-[11px] font-bold text-slate-400">إجمالي الاستحقاق</p>
                      <p className="font-extrabold text-brand-navy truncate" dir="ltr">
                        {formatMoney(run.grossTotal, currency)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-brand-light px-3 py-2">
                      <p className="text-[11px] font-bold text-slate-400">تأمينات (موظف/منشأة)</p>
                      <p className="font-extrabold text-brand-navy truncate" dir="ltr">
                        {formatMoney(run.gosiEmployeeTotal, currency)} /{" "}
                        {formatMoney(run.gosiEmployerTotal, currency)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2">
                      <p className="text-[11px] font-bold text-emerald-500">الصافي المستحق</p>
                      <p className="font-extrabold text-emerald-600 truncate" dir="ltr">
                        {formatMoney(run.netTotal, currency)}
                      </p>
                    </div>
                  </div>

                  {run.note && (
                    <p className="text-[12px] text-slate-400 leading-relaxed">ملاحظة: {run.note}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openPayslips(run)}
                      className="rounded-lg font-bold gap-1.5 border-slate-200 text-brand-blue hover:text-brand-blue hover:bg-blue-50/60"
                    >
                      <Eye className="size-4" />
                      عرض القسائم
                    </Button>
                    {canWrite && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteRunTarget(run)}
                        className="rounded-lg font-bold gap-1.5 border-rose-200 text-rose-500 hover:text-rose-500 hover:bg-rose-50"
                      >
                        <Trash2 className="size-4" />
                        حذف
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* حوار إضافة / تعديل موظف */}
      <Dialog open={empDialogOpen} onOpenChange={setEmpDialogOpen}>
        <DialogContent
          className="sm:max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="text-brand-navy">
              {editingEmployee ? `تعديل الموظف — ${editingEmployee.name}` : "إضافة موظف جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">الاسم *</Label>
                <Input
                  value={empForm.name}
                  onChange={(e) => setEmpForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="مثال: عبدالله محمد"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">رقم الهوية / الإقامة</Label>
                <Input
                  value={empForm.nationalId}
                  onChange={(e) => setEmpForm((f) => ({ ...f, nationalId: e.target.value }))}
                  placeholder="1xxxxxxxxx"
                  dir="ltr"
                  inputMode="numeric"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">المسمى الوظيفي</Label>
                <Input
                  value={empForm.position}
                  onChange={(e) => setEmpForm((f) => ({ ...f, position: e.target.value }))}
                  placeholder="مثال: محاسب أول"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">الجوال</Label>
                <Input
                  value={empForm.phone}
                  onChange={(e) => setEmpForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="05xxxxxxxx"
                  dir="ltr"
                  inputMode="tel"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">الأيبان (IBAN)</Label>
                <Input
                  value={empForm.iban}
                  onChange={(e) => setEmpForm((f) => ({ ...f, iban: e.target.value }))}
                  placeholder="SAxxxxxxxxxxxxxxxxxxxx"
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">البنك</Label>
                <Input
                  value={empForm.bankName}
                  onChange={(e) => setEmpForm((f) => ({ ...f, bankName: e.target.value }))}
                  placeholder="مثال: الراجحي"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">الراتب الأساسي *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={empForm.baseSalary}
                  onChange={(e) => setEmpForm((f) => ({ ...f, baseSalary: e.target.value }))}
                  placeholder="0.00"
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">بدل السكن</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={empForm.housingAllowance}
                  onChange={(e) =>
                    setEmpForm((f) => ({ ...f, housingAllowance: e.target.value }))
                  }
                  placeholder="0.00"
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">بدلات أخرى</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={empForm.otherAllowance}
                  onChange={(e) =>
                    setEmpForm((f) => ({ ...f, otherAllowance: e.target.value }))
                  }
                  placeholder="0.00"
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">استقطاعات أخرى</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={empForm.otherDeduction}
                  onChange={(e) =>
                    setEmpForm((f) => ({ ...f, otherDeduction: e.target.value }))
                  }
                  placeholder="0.00"
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-brand-light/60 px-4 py-3">
              <div>
                <p className="text-[13px] font-bold text-brand-navy flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-emerald-500" />
                  خاضع للتأمينات الاجتماعية (GOSI)
                </p>
                <p className="text-[11.5px] text-slate-400 mt-0.5">
                  وعاء التأمينات = الراتب الأساسي + بدل السكن
                </p>
              </div>
              <Switch
                checked={empForm.gosiApplicable}
                onCheckedChange={(v) => setEmpForm((f) => ({ ...f, gosiApplicable: v }))}
                aria-label="خاضع للتأمينات الاجتماعية"
              />
            </div>

            {/* معاينة حية للمستحقات */}
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 space-y-1.5 text-[13px]">
              <p className="font-extrabold text-emerald-700 text-[12.5px] mb-1">
                معاينة المستحقات الشهرية (تتحدث تلقائياً)
              </p>
              <div className="flex justify-between">
                <span className="text-slate-500">وعاء التأمينات GOSI</span>
                <span className="font-bold text-brand-navy" dir="ltr">
                  {formatMoney(gosiBase, currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">حصة الموظف (9.75%)</span>
                <span className="font-bold text-rose-500" dir="ltr">
                  - {formatMoney(gosiEmployee, currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">حصة المنشأة (11.75%)</span>
                <span className="font-bold text-slate-500" dir="ltr">
                  {formatMoney(gosiEmployer, currency)}
                </span>
              </div>
              <div className="flex justify-between font-extrabold text-brand-navy pt-1.5 border-t border-dashed border-emerald-200">
                <span>الصافي المتوقع للموظف</span>
                <span className="text-emerald-600" dir="ltr">
                  {formatMoney(netPay, currency)}
                </span>
              </div>
            </div>

            <Button
              onClick={saveEmployee}
              disabled={empSaving}
              className="w-full min-h-11 rounded-xl font-extrabold bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
            >
              {empSaving ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  <Plus className="size-4" />
                  {editingEmployee ? "حفظ التعديلات" : "إضافة الموظف"}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* حوار تشغيل مسير جديد */}
      <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-brand-navy">تشغيل مسير رواتب جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">الشهر *</Label>
                <Select
                  value={runForm.month}
                  onValueChange={(v) => setRunForm((f) => ({ ...f, month: v }))}
                >
                  <SelectTrigger className="w-full data-[size=default]:h-11 rounded-xl border-slate-200 font-bold text-brand-navy bg-white">
                    <SelectValue placeholder="اختر الشهر" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_LABELS.map((m, i) => (
                      <SelectItem key={i} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">السنة *</Label>
                <Input
                  type="number"
                  min="2000"
                  max="2100"
                  value={runForm.year}
                  onChange={(e) => setRunForm((f) => ({ ...f, year: e.target.value }))}
                  dir="ltr"
                  className="h-11 rounded-xl border-slate-200"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">ملاحظة</Label>
              <Textarea
                value={runForm.note}
                onChange={(e) => setRunForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="ملاحظة على المسير (اختياري)..."
                className="rounded-xl min-h-20 text-[13px]"
              />
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-[12.5px] text-amber-800 leading-relaxed">
              <p className="font-extrabold">ترحيل محاسبي تلقائي</p>
              <p className="mt-0.5">
                يشمل المسير الموظفين النشطين فقط، ويُرحَّل قيد آلي: مدين مصروف الرواتب
                ومصروف تأمينات المنشأة، ودائن مستحقات GOSI ومستحقات الرواتب والسلف.
                لا يمكن تشغيل مسير لنفس الشهر مرتين.
              </p>
            </div>

            <Button
              onClick={createRun}
              disabled={runSaving}
              className="w-full min-h-11 rounded-xl font-extrabold bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
            >
              {runSaving ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <>
                  <CalendarClock className="size-4" />
                  تشغيل المسير وترحيل القيد
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* حوار قسائم المسير */}
      <Dialog open={payslipsOpen} onOpenChange={setPayslipsOpen}>
        <DialogContent
          className="sm:max-w-3xl rounded-2xl max-h-[90vh] overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="text-brand-navy flex flex-wrap items-center gap-2">
              <span>قسائم رواتب</span>
              {payslipsRun && (
                <span className="text-brand-blue">
                  {monthLabel(payslipsRun.month)} {payslipsRun.year}
                </span>
              )}
              <Badge
                variant="secondary"
                className="rounded-full px-2.5 py-0.5 text-[11.5px] font-bold border-transparent bg-emerald-50 text-emerald-600"
              >
                {payslips.length} قسيمة
              </Badge>
            </DialogTitle>
          </DialogHeader>
          {payslipsLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="size-8 animate-spin" />
            </div>
          ) : payslips.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-300 gap-2">
              <Users className="size-12" />
              <p className="text-slate-400 text-sm">لا توجد قسائم في هذا المسير</p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
                  <table className="w-full text-[13px]">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-brand-light text-slate-500 text-[12px]">
                        <th className="text-start font-bold px-3 py-2.5">الموظف</th>
                        <th className="text-start font-bold px-3 py-2.5">الأساسي</th>
                        <th className="text-start font-bold px-3 py-2.5">البدلات</th>
                        <th className="text-start font-bold px-3 py-2.5">GOSI (موظف)</th>
                        <th className="text-start font-bold px-3 py-2.5">GOSI (منشأة)</th>
                        <th className="text-start font-bold px-3 py-2.5">الصافي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payslips.map((p) => (
                        <tr
                          key={p.id}
                          className="border-t border-slate-100 hover:bg-blue-50/40 transition-colors"
                        >
                          <td className="px-3 py-2.5">
                            <p className="font-bold text-brand-navy whitespace-nowrap">
                              {p.employeeName}
                            </p>
                            <p className="text-[11px] text-slate-400">{p.position || "—"}</p>
                          </td>
                          <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap" dir="ltr">
                            {formatMoney(p.baseSalary, currency)}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap" dir="ltr">
                            {formatMoney(p.allowances, currency)}
                          </td>
                          <td className="px-3 py-2.5 text-rose-500 font-bold whitespace-nowrap" dir="ltr">
                            {formatMoney(p.gosiEmployee, currency)}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap" dir="ltr">
                            {formatMoney(p.gosiEmployer, currency)}
                          </td>
                          <td
                            className="px-3 py-2.5 font-extrabold text-emerald-600 whitespace-nowrap"
                            dir="ltr"
                          >
                            {formatMoney(p.netPay, currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {payslipsRun && (
                <div className="rounded-xl bg-brand-light border border-slate-100 p-4 space-y-1.5 text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">إجمالي الاستقطاعات</span>
                    <span className="font-bold text-rose-500" dir="ltr">
                      {formatMoney(payslipsRun.deductionsTotal, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">إجمالي حصة الموظف GOSI</span>
                    <span className="font-bold text-brand-navy" dir="ltr">
                      {formatMoney(payslipsRun.gosiEmployeeTotal, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between font-extrabold text-brand-navy pt-1.5 border-t border-dashed border-slate-200">
                    <span>صافي المسير</span>
                    <span className="text-emerald-600" dir="ltr">
                      {formatMoney(payslipsRun.netTotal, currency)}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* تأكيد حذف موظف */}
      <AlertDialog
        open={!!deleteEmployeeTarget}
        onOpenChange={(o) => !o && setDeleteEmployeeTarget(null)}
      >
        <AlertDialogContent dir="rtl" className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الموظف؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الموظف «{deleteEmployeeTarget?.name}» نهائياً. الموظفون
              الذين لهم مسيرات رواتب لا يمكن حذفهم — عطّلهم بدلاً من ذلك.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:justify-start">
            <AlertDialogAction
              onClick={() => deleteEmployeeTarget && removeEmployee(deleteEmployeeTarget)}
              className="bg-red-500 hover:bg-red-600 rounded-xl flex-1"
            >
              حذف
            </AlertDialogAction>
            <AlertDialogCancel className="rounded-xl flex-1">إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* تأكيد حذف مسير */}
      <AlertDialog
        open={!!deleteRunTarget}
        onOpenChange={(o) => !o && setDeleteRunTarget(null)}
      >
        <AlertDialogContent dir="rtl" className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف مسير الرواتب؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف مسير{" "}
              {deleteRunTarget ? `${monthLabel(deleteRunTarget.month)} ${deleteRunTarget.year}` : ""}{" "}
              وقسائمه وعكس أثره المحاسبي. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:justify-start">
            <AlertDialogAction
              onClick={() => deleteRunTarget && removeRun(deleteRunTarget)}
              className="bg-red-500 hover:bg-red-600 rounded-xl flex-1"
            >
              حذف
            </AlertDialogAction>
            <AlertDialogCancel className="rounded-xl flex-1">إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
