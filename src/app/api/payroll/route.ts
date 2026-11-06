import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/auth";
import { postAutoJournal, deleteAutoJournals, ensureDefaultAccounts } from "@/lib/accounting";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** أسماء الشهور العربية (مفهرسة من 1) */
const MONTH_NAMES = [
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

/** مرجع قيد مسير الرواتب: PAYRUN-{السنة}-{الشهر بصفريين} */
function payrollRef(year: number, month: number): string {
  return `PAYRUN-${year}-${String(month).padStart(2, "0")}`;
}

/** احتساب مجاميع مسير الرواتب من قسائمه */
function runTotals(
  payslips: {
    baseSalary: number;
    allowances: number;
    deductions: number;
    gosiEmployee: number;
    gosiEmployer: number;
    netPay: number;
  }[]
) {
  return {
    employeesCount: payslips.length,
    grossTotal: r2(payslips.reduce((s, p) => s + p.baseSalary + p.allowances, 0)),
    deductionsTotal: r2(payslips.reduce((s, p) => s + p.deductions, 0)),
    gosiEmployeeTotal: r2(payslips.reduce((s, p) => s + p.gosiEmployee, 0)),
    gosiEmployerTotal: r2(payslips.reduce((s, p) => s + p.gosiEmployer, 0)),
    netTotal: r2(payslips.reduce((s, p) => s + p.netPay, 0)),
  };
}

/** GET — الموظفون + المسيرات + الإحصاءات، أو مسير واحد بقسائمه عبر ?runId= */
export async function GET(req: NextRequest) {
  try {
    const g = await guard("accounting:read");
    if (!g.ok) return g.response;
    const companyId = g.ctx.company.id;

    const { searchParams } = new URL(req.url);
    const runId = searchParams.get("runId")?.trim() ?? "";

    // ===== مسير محدد بقسائمه =====
    if (runId) {
      const run = await db.payrollRun.findFirst({
        where: { id: runId, companyId },
        include: { payslips: { include: { employee: true } } },
      });
      if (!run) {
        return NextResponse.json({ error: "مسير الرواتب غير موجود" }, { status: 404 });
      }
      const payslips = run.payslips.map((p) => ({
        id: p.id,
        employeeId: p.employeeId,
        employeeName: p.employee.name,
        position: p.employee.position,
        baseSalary: p.baseSalary,
        allowances: p.allowances,
        deductions: p.deductions,
        gosiEmployee: p.gosiEmployee,
        gosiEmployer: p.gosiEmployer,
        netPay: p.netPay,
      }));
      const { payslips: _omit, ...runFields } = run;
      return NextResponse.json({ run: { ...runFields, ...runTotals(run.payslips) }, payslips });
    }

    // ===== القائمة الرئيسية =====
    const [employees, runs] = await Promise.all([
      db.employee.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
      }),
      db.payrollRun.findMany({
        where: { companyId },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        include: { payslips: true },
      }),
    ]);

    const activeEmployees = employees.filter((e) => e.isActive);
    const monthlyGross = r2(
      activeEmployees.reduce(
        (s, e) => s + e.baseSalary + e.housingAllowance + e.otherAllowance,
        0
      )
    );
    const lastRun = runs[0];

    return NextResponse.json({
      employees: employees.map((e) => ({
        id: e.id,
        name: e.name,
        nationalId: e.nationalId,
        position: e.position,
        phone: e.phone,
        iban: e.iban,
        bankName: e.bankName,
        baseSalary: e.baseSalary,
        housingAllowance: e.housingAllowance,
        otherAllowance: e.otherAllowance,
        otherDeduction: e.otherDeduction,
        gosiApplicable: e.gosiApplicable,
        isActive: e.isActive,
        createdAt: e.createdAt,
      })),
      runs: runs.map((run) => ({
        id: run.id,
        month: run.month,
        year: run.year,
        status: run.status,
        note: run.note,
        processedAt: run.processedAt,
        createdAt: run.createdAt,
        ...runTotals(run.payslips),
      })),
      stats: {
        totalEmployees: employees.length,
        activeEmployees: activeEmployees.length,
        monthlyGross,
        lastRunLabel: lastRun
          ? `${MONTH_NAMES[lastRun.month - 1]} ${lastRun.year}`
          : null,
      },
    });
  } catch (error) {
    console.error("[payroll:GET]", error);
    return NextResponse.json({ error: "تعذر تحميل بيانات الرواتب" }, { status: 500 });
  }
}

/** POST — إدارة الموظفين وتشغيل مسيرات الرواتب (action-based) */
export async function POST(req: NextRequest) {
  try {
    const g = await guard("accounting:write");
    if (!g.ok) return g.response;
    const companyId = g.ctx.company.id;

    const body = await req.json().catch(() => null);
    const action: string = body?.action ?? "";

    // ===== 1) إنشاء موظف =====
    if (action === "employee.create") {
      const emp = body?.employee ?? {};
      const name = typeof emp.name === "string" ? emp.name.trim() : "";
      if (!name) {
        return NextResponse.json({ error: "اسم الموظف مطلوب" }, { status: 400 });
      }
      const baseSalary = Number(emp.baseSalary);
      if (isNaN(baseSalary) || baseSalary < 0) {
        return NextResponse.json({ error: "الراتب الأساسي يجب أن يكون رقماً موجباً" }, { status: 400 });
      }
      const employee = await db.employee.create({
        data: {
          companyId,
          name,
          nationalId: typeof emp.nationalId === "string" && emp.nationalId.trim() ? emp.nationalId.trim() : null,
          position: typeof emp.position === "string" && emp.position.trim() ? emp.position.trim() : "موظف",
          phone: typeof emp.phone === "string" && emp.phone.trim() ? emp.phone.trim() : null,
          iban: typeof emp.iban === "string" && emp.iban.trim() ? emp.iban.trim() : null,
          bankName: typeof emp.bankName === "string" && emp.bankName.trim() ? emp.bankName.trim() : null,
          baseSalary,
          housingAllowance: Math.max(0, Number(emp.housingAllowance) || 0),
          otherAllowance: Math.max(0, Number(emp.otherAllowance) || 0),
          otherDeduction: Math.max(0, Number(emp.otherDeduction) || 0),
          gosiApplicable: emp.gosiApplicable === undefined ? true : !!emp.gosiApplicable,
          isActive: emp.isActive === undefined ? true : !!emp.isActive,
        },
      });
      await logAudit({
        companyId,
        userId: g.ctx.user.id,
        username: g.ctx.user.username,
        action: "payroll.employee.create",
        entity: "employee",
        entityId: employee.id,
        details: { name, baseSalary },
      });
      return NextResponse.json({ employee }, { status: 201 });
    }

    // ===== 2) تعديل موظف =====
    if (action === "employee.update") {
      const id: string = body?.id ?? "";
      const emp = body?.employee ?? {};
      const existing = await db.employee.findFirst({ where: { id, companyId } });
      if (!existing) {
        return NextResponse.json({ error: "الموظف غير موجود" }, { status: 404 });
      }
      const name = typeof emp.name === "string" ? emp.name.trim() : "";
      if (!name) {
        return NextResponse.json({ error: "اسم الموظف مطلوب" }, { status: 400 });
      }
      const baseSalary = Number(emp.baseSalary ?? existing.baseSalary);
      if (isNaN(baseSalary) || baseSalary < 0) {
        return NextResponse.json({ error: "الراتب الأساسي يجب أن يكون رقماً موجباً" }, { status: 400 });
      }
      const employee = await db.employee.update({
        where: { id },
        data: {
          name,
          nationalId: typeof emp.nationalId === "string" ? (emp.nationalId.trim() || null) : undefined,
          position: typeof emp.position === "string" && emp.position.trim() ? emp.position.trim() : undefined,
          phone: typeof emp.phone === "string" ? (emp.phone.trim() || null) : undefined,
          iban: typeof emp.iban === "string" ? (emp.iban.trim() || null) : undefined,
          bankName: typeof emp.bankName === "string" ? (emp.bankName.trim() || null) : undefined,
          baseSalary,
          housingAllowance: emp.housingAllowance === undefined ? undefined : Math.max(0, Number(emp.housingAllowance) || 0),
          otherAllowance: emp.otherAllowance === undefined ? undefined : Math.max(0, Number(emp.otherAllowance) || 0),
          otherDeduction: emp.otherDeduction === undefined ? undefined : Math.max(0, Number(emp.otherDeduction) || 0),
          gosiApplicable: emp.gosiApplicable === undefined ? undefined : !!emp.gosiApplicable,
          isActive: emp.isActive === undefined ? undefined : !!emp.isActive,
        },
      });
      await logAudit({
        companyId,
        userId: g.ctx.user.id,
        username: g.ctx.user.username,
        action: "payroll.employee.update",
        entity: "employee",
        entityId: employee.id,
        details: { name },
      });
      return NextResponse.json({ employee });
    }

    // ===== 3) حذف موظف =====
    if (action === "employee.delete") {
      const id: string = body?.id ?? "";
      const existing = await db.employee.findFirst({
        where: { id, companyId },
        include: { payslips: { select: { id: true }, take: 1 } },
      });
      if (!existing) {
        return NextResponse.json({ error: "الموظف غير موجود" }, { status: 404 });
      }
      if (existing.payslips.length > 0) {
        return NextResponse.json(
          { error: "لا يمكن حذف موظف له مسيرات رواتب — عطّله بدلاً من ذلك" },
          { status: 400 }
        );
      }
      await db.employee.delete({ where: { id } });
      await logAudit({
        companyId,
        userId: g.ctx.user.id,
        username: g.ctx.user.username,
        action: "payroll.employee.delete",
        entity: "employee",
        entityId: id,
        details: { name: existing.name },
      });
      return NextResponse.json({ ok: true });
    }

    // ===== 4) تشغيل مسير رواتب =====
    if (action === "run.create") {
      const month = Number(body?.month);
      const year = Number(body?.year);
      if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 1900) {
        return NextResponse.json({ error: "شهر وسنة المسير غير صالحين" }, { status: 400 });
      }
      const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;

      // ضمان اكتمال دليل الحسابات (ترقية سلسة للمنشآت القائمة)
      await ensureDefaultAccounts(companyId);

      const duplicate = await db.payrollRun.findFirst({
        where: { companyId, month, year },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json({ error: "تم تشغيل مسير هذا الشهر مسبقاً" }, { status: 400 });
      }

      const employees = await db.employee.findMany({
        where: { companyId, isActive: true },
        orderBy: { createdAt: "asc" },
      });
      if (employees.length === 0) {
        return NextResponse.json({ error: "لا يوجد موظفون نشطون" }, { status: 400 });
      }

      // احتساب قسيمة كل موظف (تأمينات: موظف 9.75% ومنشأة 11.75% على الأساسي + بدل السكن)
      const slips = employees.map((e) => {
        const allowances = r2(e.housingAllowance + e.otherAllowance);
        const gosiBase = e.baseSalary + e.housingAllowance;
        const gosiEmployee = e.gosiApplicable ? r2(gosiBase * 0.0975) : 0;
        const gosiEmployer = e.gosiApplicable ? r2(gosiBase * 0.1175) : 0;
        const netPay = r2(e.baseSalary + allowances - e.otherDeduction - gosiEmployee);
        return {
          employeeId: e.id,
          employeeName: e.name,
          position: e.position,
          baseSalary: e.baseSalary,
          allowances,
          deductions: e.otherDeduction,
          gosiEmployee,
          gosiEmployer,
          netPay,
        };
      });

      const totals = runTotals(slips);
      const now = new Date();
      const reference = payrollRef(year, month);

      const run = await db.$transaction(async (tx) => {
        return tx.payrollRun.create({
          data: {
            companyId,
            month,
            year,
            status: "processed",
            note,
            processedAt: now,
            payslips: {
              create: slips.map((s) => ({
                employeeId: s.employeeId,
                baseSalary: s.baseSalary,
                allowances: s.allowances,
                deductions: s.deductions,
                gosiEmployee: s.gosiEmployee,
                gosiEmployer: s.gosiEmployer,
                netPay: s.netPay,
              })),
            },
          },
          include: { payslips: { include: { employee: true } } },
        });
      });

      // قيد آلي واحد للمسير:
      // مدين: مصروف الرواتب (الإجمالي) + مصروف تأمينات المنشأة
      // دائن: مستحقات التأمينات (حصة الطرفين) + رواتب مستحقة (الصافي) + سلف واستقطاعات
      const journal = await postAutoJournal({
        companyId,
        date: now,
        description: `مسير رواتب ${MONTH_NAMES[month - 1]} ${year}`,
        reference,
        source: "auto-payroll",
        lines: [
          { code: "5100", debit: totals.grossTotal, description: "رواتب وأجور" },
          { code: "5110", debit: totals.gosiEmployerTotal, description: "تأمينات اجتماعية — حصة المنشأة" },
          { code: "2110", credit: r2(totals.gosiEmployeeTotal + totals.gosiEmployerTotal), description: "مستحقات التأمينات (GOSI)" },
          { code: "2120", credit: totals.netTotal, description: "رواتب مستحقة الدفع" },
          { code: "2130", credit: totals.deductionsTotal, description: "سلف واستقطاعات الموظفين" },
        ],
      });

      await notify({
        companyId,
        title: "تم تشغيل مسير الرواتب",
        message: `اكتمل مسير رواتب ${MONTH_NAMES[month - 1]} ${year} لعدد ${totals.employeesCount} موظفاً بصافي ${totals.netTotal.toFixed(2)} ${g.ctx.company.currency}`,
        type: "system",
        link: "payroll",
      });

      await logAudit({
        companyId,
        userId: g.ctx.user.id,
        username: g.ctx.user.username,
        action: "payroll.run",
        entity: "payrollRun",
        entityId: run.id,
        details: { month, year, employeesCount: totals.employeesCount, netTotal: totals.netTotal },
      });

      const payslips = run.payslips.map((p) => {
        const slip = slips.find((s) => s.employeeId === p.employeeId);
        return {
          id: p.id,
          employeeId: p.employeeId,
          employeeName: slip?.employeeName ?? p.employee.name,
          position: slip?.position ?? p.employee.position,
          baseSalary: p.baseSalary,
          allowances: p.allowances,
          deductions: p.deductions,
          gosiEmployee: p.gosiEmployee,
          gosiEmployer: p.gosiEmployer,
          netPay: p.netPay,
        };
      });

      const { payslips: _omit, ...runFields } = run;
      return NextResponse.json(
        { run: { ...runFields, ...totals }, payslips, journalNumber: journal?.number ?? null },
        { status: 201 }
      );
    }

    // ===== 5) حذف مسير رواتب =====
    if (action === "run.delete") {
      const id: string = body?.id ?? "";
      const run = await db.payrollRun.findFirst({ where: { id, companyId } });
      if (!run) {
        return NextResponse.json({ error: "مسير الرواتب غير موجود" }, { status: 404 });
      }
      await db.payrollRun.delete({ where: { id } }); // يحذف القسائم cascade
      await deleteAutoJournals(companyId, payrollRef(run.year, run.month));
      await logAudit({
        companyId,
        userId: g.ctx.user.id,
        username: g.ctx.user.username,
        action: "payroll.run.delete",
        entity: "payrollRun",
        entityId: id,
        details: { month: run.month, year: run.year },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  } catch (error) {
    console.error("[payroll:POST]", error);
    return NextResponse.json({ error: "تعذر تنفيذ إجراء الرواتب" }, { status: 500 });
  }
}
