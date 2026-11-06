"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Receipt,
  Users,
  Package,
  UserCog,
  Landmark,
  FileBarChart,
  Settings,
  ChevronDown,
  Search,
  Plus,
  Store,
  CreditCard,
  QrCode,
  UserCheck,
  ScrollText,
  Sparkles,
  ShieldCheck,
  Building2,
  FileCheck,
  LifeBuoy,
  Bell,
  FileText,
  Wallet,
  History,
  Repeat,
  Boxes,
  BadgeDollarSign,
  MapPin,
  Warehouse,
} from "lucide-react";
import type { ViewKey } from "./types";
import { hasPerm, PLAN_LABELS } from "./types";
import { cn } from "@/lib/utils";

type MenuItem = {
  key: ViewKey | null;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  perm?: string;
  children?: { label: string; view: ViewKey; perm?: string }[];
};

const MENU: { section: string; items: MenuItem[] }[] = [
  {
    section: "الرئيسية",
    items: [
      { key: "dashboard", label: "لوحة المتابعة", icon: LayoutDashboard },
    ],
  },
  {
    section: "المبيعات",
    items: [
      { key: "sales", label: "الفواتير والمبيعات", icon: ShoppingCart, perm: "sales:read" },
      { key: "quotations", label: "عروض الأسعار", icon: FileText, perm: "sales:read" },
      { key: "recurring", label: "الفواتير المتكررة", icon: Repeat, perm: "sales:read" },
      { key: "pos", label: "نقطة البيع (كاشير)", icon: QrCode, perm: "pos:read" },
    ],
  },
  {
    section: "المشتريات والمصاريف",
    items: [
      { key: "purchases", label: "فواتير المشتريات", icon: Truck, perm: "purchases:read" },
      { key: "expenses", label: "المصاريف", icon: Receipt, perm: "expenses:read" },
    ],
  },
  {
    section: "العلاقات",
    items: [
      { key: "contacts-customers", label: "العملاء", icon: UserCheck, perm: "contacts:read" },
      { key: "contacts-suppliers", label: "الموردون", icon: Users, perm: "contacts:read" },
    ],
  },
  {
    section: "المخزون",
    items: [
      { key: "products", label: "الأصناف والمخزون", icon: Package, perm: "products:read" },
      { key: "warehouses", label: "المستودعات", icon: Warehouse, perm: "products:read" },
      { key: "branches", label: "الفروع والمنافذ", icon: MapPin, perm: "products:read" },
    ],
  },
  {
    section: "المحاسبة",
    items: [
      { key: "accounting-accounts", label: "دليل الحسابات", icon: Landmark, perm: "accounting:read" },
      { key: "accounting-journal", label: "القيود اليومية", icon: ScrollText, perm: "accounting:read" },
      { key: "payments", label: "المدفوعات والسندات", icon: Wallet, perm: "accounting:read" },
      { key: "assets", label: "الأصول الثابتة والإهلاك", icon: Boxes, perm: "accounting:read" },
    ],
  },
  {
    section: "التقارير",
    items: [
      { key: "reports", label: "مركز التقارير", icon: FileBarChart, perm: "accounting:read" },
    ],
  },
  {
    section: "الامتثال الضريبي",
    items: [
      { key: "zatca", label: "الفاتورة الإلكترونية — زتكا", icon: ShieldCheck, perm: "sales:read" },
      { key: "vat", label: "الإقرار الضريبي (ض.ق.م)", icon: FileCheck, perm: "accounting:read" },
    ],
  },
  {
    section: "الأدوات والذكاء",
    items: [
      { key: "ai", label: "المساعد الذكي المحاسبي", icon: Sparkles },
      { key: "support", label: "الدعم الفني", icon: LifeBuoy },
      { key: "notifications", label: "الإشعارات", icon: Bell },
    ],
  },
  {
    section: "إدارة المنشأة",
    items: [
      { key: "payroll", label: "الرواتب والموظفون", icon: BadgeDollarSign, perm: "accounting:read" },
      { key: "team", label: "فريق العمل والأدوار", icon: UserCog, perm: "team:read" },
      { key: "plans", label: "الباقات والاشتراك", icon: CreditCard },
      { key: "audit", label: "سجل التدقيق", icon: History, perm: "team:manage" },
    ],
  },
  {
    section: "الإعدادات",
    items: [
      { key: "settings", label: "إعدادات المنشأة", icon: Settings },
    ],
  },
];

export function Sidebar({
  view,
  onNavigate,
  businessName,
  role,
  plan,
  isPlatformAdmin = false,
  collapsed,
  onToggle,
  onSearch,
}: {
  view: ViewKey;
  onNavigate: (v: ViewKey) => void;
  businessName: string;
  role: string;
  plan: string;
  isPlatformAdmin?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onSearch: (q: string) => void;
}) {
  const [query, setQuery] = useState("");

  const allSections = isPlatformAdmin
    ? [
        ...MENU,
        {
          section: "منصة SaaS",
          items: [
            {
              key: "admin",
              label: "لوحة تحكم المنصة",
              icon: Building2,
            } as MenuItem,
          ],
        },
      ]
    : MENU;

  const visibleMenu = allSections.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.perm || hasPerm(role, item.perm)),
  })).filter((group) => group.items.length > 0);

  return (
    <aside
      className={cn(
        "hidden lg:flex lg:flex-col shrink-0 h-full bg-white border-e border-slate-100 transition-all duration-300 relative",
        collapsed ? "w-[76px]" : "w-64"
      )}
      aria-label="القائمة الجانبية"
    >
      {/* Brand */}
      <div className="min-h-[60px] flex items-center gap-3 px-4 border-b border-slate-100">
        <div className="size-10 rounded-xl bg-gradient-to-br from-brand-blue to-brand-green flex items-center justify-center text-white shrink-0 shadow-md">
          <Store className="size-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold text-brand-navy truncate leading-tight">
              {businessName}
            </p>
            <p className="text-[11px] text-slate-400">ERP سحابي متعدد المنشآت</p>
          </div>
        )}
      </div>

      {/* Search + Add */}
      {!collapsed && (
        <div className="px-3 pt-3 pb-2 flex flex-col gap-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2 min-h-10 px-3 rounded-[10px] border border-slate-200 bg-brand-light focus-within:border-brand-blue/45 focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] transition-all">
            <Search className="size-4 text-slate-400 shrink-0" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                onSearch(e.target.value);
              }}
              placeholder="بحث سريع..."
              className="flex-1 min-w-0 h-[38px] bg-transparent outline-none text-[13px] text-brand-navy placeholder:text-slate-400"
              aria-label="بحث سريع"
            />
          </div>
          <button
            onClick={() => onNavigate("pos")}
            className="flex items-center justify-center gap-2 min-h-10 rounded-[10px] bg-gradient-to-l from-brand-blue to-brand-green text-white text-[13px] font-extrabold shadow-[0_6px_16px_rgba(37,99,235,0.25)] hover:brightness-105 active:scale-[0.98] transition-all"
          >
            <Plus className="size-4" />
            إضافة — انشاء
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2.5 [scrollbar-width:thin]">
        {visibleMenu.map((group) => (
          <div key={group.section} className="mb-1.5">
            {!collapsed && (
              <p className="px-3 pt-2 pb-1.5 text-[11px] font-bold bg-gradient-to-l from-brand-blue via-teal-600 to-emerald-500 bg-clip-text text-transparent">
                {group.section}
              </p>
            )}
            <ul className="list-none p-0 m-0">
              {group.items.map((item) => (
                <li key={item.label} className="mb-1">
                  <button
                    onClick={() => item.key && onNavigate(item.key)}
                    disabled={!item.key}
                    className={cn(
                      "w-full flex items-center gap-2.5 min-h-10 px-3 rounded-[10px] text-[13.5px] font-bold transition-colors",
                      item.key && item.key === view
                        ? "bg-gradient-to-l from-emerald-500 to-blue-600 text-white shadow-[0_6px_16px_rgba(30,136,229,0.22)]"
                        : item.key
                          ? "text-slate-600 hover:bg-slate-100 hover:text-brand-navy"
                          : "text-slate-400 cursor-default"
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    {item.icon && <item.icon className="size-[18px] shrink-0" />}
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Plan badge */}
      {!collapsed && (
        <div className="px-3 pb-3">
          <button
            onClick={() => onNavigate("plans")}
            className="w-full flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-gradient-to-l from-emerald-50 to-blue-50 px-3 py-2.5 hover:border-emerald-300 transition-colors"
          >
            <Sparkles className="size-4 text-emerald-600 shrink-0" />
            <div className="min-w-0 flex-1 text-start">
              <p className="text-[11px] text-slate-400 font-bold">باقتك الحالية</p>
              <p className="text-[13px] font-extrabold text-brand-navy truncate">
                {PLAN_LABELS[plan] ?? plan}
              </p>
            </div>
            <ChevronDown className="size-3.5 text-slate-400 -rotate-90" />
          </button>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -start-3 top-24 z-20 size-6 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-500 hover:text-brand-blue transition-colors"
        aria-label={collapsed ? "توسيع القائمة" : "طي القائمة"}
      >
        <ChevronDown className={cn("size-3.5 transition-transform", collapsed ? "-rotate-90" : "rotate-90")} />
      </button>
    </aside>
  );
}
