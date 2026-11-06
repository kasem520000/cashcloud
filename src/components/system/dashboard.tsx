"use client";

import { useEffect, useState } from "react";
import {
  ShoppingCart,
  TrendingUp,
  Wallet,
  Undo2,
  Truck,
  Receipt,
  Package,
  PackageSearch,
  Users,
  Boxes,
  Loader2,
  MapPin,
  Clock,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import type { DashboardData, ViewKey } from "./types";
import { formatMoney } from "./types";

const CHART_COLORS = ["#2563eb", "#0ea5a8", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];

export function DashboardView({
  session,
  currency,
  onNavigate,
  refreshKey,
}: {
  session: { name: string };
  currency: string;
  onNavigate: (v: ViewKey) => void;
  refreshKey: number;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadedKey, setLoadedKey] = useState(-1);
  const loading = data === null || loadedKey < refreshKey;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && !d.error) setData(d);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadedKey(refreshKey);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const kpis = data?.kpis;
  const cards = [
    { label: "اجمالي المبيعات", value: kpis?.totalSales ?? 0, icon: ShoppingCart, tint: "bg-blue-50 text-brand-blue" },
    { label: "صافي الدخل", value: kpis?.netIncome ?? 0, icon: TrendingUp, tint: "bg-emerald-50 text-emerald-600" },
    { label: "المبيعات المستحقة", value: kpis?.salesDue ?? 0, icon: Wallet, tint: "bg-amber-50 text-amber-600" },
    { label: "اجمالى مرجع المبيعات", value: kpis?.saleReturnsTotal ?? 0, icon: Undo2, tint: "bg-violet-50 text-violet-600" },
    { label: "إجمالي المشتريات", value: kpis?.totalPurchases ?? 0, icon: Truck, tint: "bg-cyan-50 text-cyan-600" },
    { label: "المشتريات المستحقة", value: kpis?.purchasesDue ?? 0, icon: Receipt, tint: "bg-orange-50 text-orange-600" },
    { label: "مصروف", value: kpis?.totalExpenses ?? 0, icon: Receipt, tint: "bg-rose-50 text-rose-600" },
    { label: "قيمة المخزون", value: data?.counts.stockValue ?? 0, icon: Boxes, tint: "bg-teal-50 text-teal-600" },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Welcome */}
      <div className="rounded-2xl bg-gradient-to-l from-brand-blue via-teal-600 to-emerald-500 text-white px-6 py-5 shadow-lg">
        <h1 className="text-xl sm:text-2xl font-extrabold">
          أهلاً وسهلاً، {session.name} 👋
        </h1>
        <p className="text-white/85 text-sm mt-1">
          هذه نظرة عامة على أداء متجرك اليوم — تابع مبيعاتك ومخزونك من مكان واحد
        </p>
        <div className="flex flex-wrap gap-2.5 mt-4">
          <button
            onClick={() => onNavigate("pos")}
            className="px-4 py-2 rounded-xl bg-white text-brand-blue text-[13px] font-extrabold hover:bg-blue-50 transition-colors"
          >
            فتح الكاشير
          </button>
          <button
            onClick={() => onNavigate("sales")}
            className="px-4 py-2 rounded-xl bg-white/15 border border-white/30 text-white text-[13px] font-extrabold hover:bg-white/25 transition-colors"
          >
            فاتورة مبيعات
          </button>
          <button
            onClick={() => onNavigate("products")}
            className="px-4 py-2 rounded-xl bg-white/15 border border-white/30 text-white text-[13px] font-extrabold hover:bg-white/25 transition-colors"
          >
            إضافة صنف
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="size-8 animate-spin" />
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {cards.map((c) => (
              <button
                key={c.label}
                onClick={() => onNavigate("reports")}
                className="bg-white rounded-2xl border border-slate-100 p-4 text-start shadow-[0_4px_16px_rgba(15,23,42,0.05)] hover:shadow-[0_8px_24px_rgba(15,23,42,0.09)] hover:-translate-y-0.5 transition-all"
              >
                <div className={`size-10 rounded-xl flex items-center justify-center mb-3 ${c.tint}`}>
                  <c.icon className="size-5" />
                </div>
                <p className="text-[17px] sm:text-xl font-extrabold text-brand-navy" dir="ltr">
                  {formatMoney(c.value, currency)}
                </p>
                <p className="text-[12.5px] text-slate-500 mt-0.5">{c.label}</p>
              </button>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 p-5 shadow-[0_4px_16px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-extrabold text-brand-navy">المبيعات خلال 30 يوم</h2>
                <span className="text-[12px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 font-bold">
                  مبيعات اليوم: {formatMoney(kpis?.todaySales ?? 0, currency)}
                </span>
              </div>
              <div className="h-64" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.salesSeries ?? []}>
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      tickLine={false}
                      axisLine={false}
                      interval={4}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      tickLine={false}
                      axisLine={false}
                      width={50}
                    />
                    <Tooltip
                      formatter={(v: number) => [formatMoney(v, currency), "المبيعات"]}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #e2e8f0",
                        fontSize: 13,
                        direction: "rtl",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="sales"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      fill="url(#salesGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5 shadow-[0_4px_16px_rgba(15,23,42,0.05)]">
              <h2 className="font-extrabold text-brand-navy mb-4">المنتجات الأكثر مبيعاً</h2>
              {(data?.topProducts.length ?? 0) === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-300">
                  <PackageSearch className="size-12 mb-2" />
                  <p className="text-sm text-slate-400">لا توجد مبيعات بعد</p>
                </div>
              ) : (
                <div className="h-64" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data?.topProducts ?? []} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "#334155" }}
                        tickLine={false}
                        axisLine={false}
                        width={110}
                      />
                      <Tooltip
                        formatter={(v: number) => [v, "الكمية"]}
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid #e2e8f0",
                          fontSize: 13,
                          direction: "rtl",
                        }}
                      />
                      <Bar dataKey="qty" radius={[0, 8, 8, 0]} barSize={18}>
                        {(data?.topProducts ?? []).map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <QuickStat
              icon={Package}
              tint="bg-blue-50 text-brand-blue"
              label="عدد الأصناف"
              value={String(data?.counts.products ?? 0)}
              onClick={() => onNavigate("products")}
            />
            <QuickStat
              icon={PackageSearch}
              tint="bg-red-50 text-red-500"
              label="أصناف منخفضة المخزون"
              value={String(data?.counts.lowStock ?? 0)}
              onClick={() => onNavigate("products")}
            />
            <QuickStat
              icon={Users}
              tint="bg-emerald-50 text-emerald-600"
              label="عدد العملاء"
              value={String(data?.counts.customers ?? 0)}
              onClick={() => onNavigate("contacts-customers")}
            />
            <QuickStat
              icon={Truck}
              tint="bg-amber-50 text-amber-600"
              label="عدد الموردين"
              value={String(data?.counts.suppliers ?? 0)}
              onClick={() => onNavigate("contacts-suppliers")}
            />
          </div>

          {/* Branches performance */}
          {(data?.branchStats?.length ?? 0) > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-[0_4px_16px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-extrabold text-brand-navy flex items-center gap-2">
                  <MapPin className="size-5 text-brand-blue" />
                  أداء الفروع
                </h2>
                <span className="text-[12px] px-2.5 py-1 rounded-full bg-blue-50 text-brand-blue font-bold flex items-center gap-1">
                  <Clock className="size-3" />
                  {data?.counts.openShifts ?? 0} وردية مفتوحة
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {(data?.branchStats ?? []).map((b) => {
                  const maxSales = Math.max(
                    ...(data?.branchStats ?? []).map((x) => x.salesTotal),
                    1
                  );
                  const pct = Math.round((b.salesTotal / maxSales) * 100);
                  return (
                    <button
                      key={b.id}
                      onClick={() => onNavigate("branches")}
                      className="text-start rounded-xl border border-slate-100 p-3.5 hover:border-brand-blue/40 hover:shadow-[0_6px_16px_rgba(37,99,235,0.1)] transition-all"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-brand-navy text-[13px] truncate">{b.name}</p>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0" dir="ltr">
                          {b.code}
                        </span>
                      </div>
                      <p className="text-[15px] font-extrabold text-brand-green mt-1.5" dir="ltr">
                        {formatMoney(b.salesTotal, currency)}
                      </p>
                      <p className="text-[11px] text-slate-400">{b.salesCount} فاتورة</p>
                      <div className="h-1.5 rounded-full bg-slate-100 mt-2 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-l from-brand-blue to-brand-green"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function QuickStat({
  icon: Icon,
  tint,
  label,
  value,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3 text-start shadow-[0_4px_16px_rgba(15,23,42,0.05)] hover:shadow-[0_8px_24px_rgba(15,23,42,0.09)] hover:-translate-y-0.5 transition-all"
    >
      <div className={`size-11 rounded-xl flex items-center justify-center shrink-0 ${tint}`}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-extrabold text-brand-navy">{value}</p>
        <p className="text-[12px] text-slate-500 truncate">{label}</p>
      </div>
    </button>
  );
}
