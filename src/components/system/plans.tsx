"use client";

import { useEffect, useState } from "react";
import { Crown, Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { PlanInfo, Session } from "./types";
import { PLAN_LABELS, hasPerm } from "./types";

export function PlansView({
  session,
  onChanged,
}: {
  session: Session;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const canBill = hasPerm(session.role, "billing:manage");
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [current, setCurrent] = useState(session.plan);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  function load() {
    fetch("/api/company/plan")
      .then((r) => r.json())
      .then((d: { plans?: PlanInfo[]; current?: string; role?: string }) => {
        setPlans(d.plans ?? []);
        if (d.current) setCurrent(d.current);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function choose(p: PlanInfo) {
    setBusyKey(p.key);
    try {
      const res = await fetch("/api/company/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: p.key }),
      });
      const data: { error?: string; plan?: string } = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "فشلت الترقية",
          description: data.error,
        });
        return;
      }
      toast({ title: `تمت الترقية إلى باقة ${p.name}` });
      onChanged();
      load();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setBusyKey(null);
    }
  }

  const currentName =
    plans.find((p) => p.key === current)?.name ??
    PLAN_LABELS[current] ??
    current;

  return (
    <div className="p-4 sm:p-5 space-y-4">
      {/* الترويسة */}
      <div>
        <h1 className="text-xl font-extrabold text-brand-navy flex items-center gap-2">
          <Crown className="size-6 text-brand-blue" />
          الباقات والاشتراك
        </h1>
        <p className="text-[13px] text-slate-400 mt-0.5">
          ترقية باقة منشأتك — نظام SaaS متعدد المنشآت
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="size-8 animate-spin" />
        </div>
      ) : (
        <>
          {/* الباقة الحالية */}
          <section className="rounded-2xl bg-gradient-to-l from-brand-blue to-brand-green p-5 text-white flex flex-wrap items-center gap-3 shadow-[0_4px_16px_rgba(15,23,42,0.05)]">
            <div className="size-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              <Crown className="size-6" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-extrabold">
                باقتك الحالية: {currentName}
              </p>
              <p className="text-[12.5px] text-white/80 mt-0.5">
                الترقية فورية في هذه النسخة التجريبية
              </p>
            </div>
            <div className="flex-1" />
            <span className="inline-flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1.5 text-[12px] font-bold">
              <Sparkles className="size-3.5" />
              نظام متعدد المنشآت
            </span>
          </section>

          {/* بطاقات الباقات */}
          {plans.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
              <Crown className="size-14" />
              <p className="text-slate-400 text-sm">
                لا توجد باقات متاحة حالياً
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {plans.map((p) => {
                const isCurrent = p.key === current;
                return (
                  <section
                    key={p.key}
                    className={cn(
                      "relative bg-white rounded-2xl border border-slate-100 shadow-[0_4px_16px_rgba(15,23,42,0.05)] p-5 flex flex-col",
                      p.key === "pro" && "ring-2 ring-brand-blue"
                    )}
                  >
                    {p.key === "pro" && (
                      <span className="absolute -top-3 start-4 bg-brand-blue text-white text-[11px] font-extrabold px-3 py-1 rounded-full shadow-sm">
                        الأكثر شيوعاً
                      </span>
                    )}

                    <h3 className="font-extrabold text-brand-navy text-[15px]">
                      {p.name}
                    </h3>

                    <div className="mt-3">
                      {p.price === 0 ? (
                        <span className="text-3xl font-extrabold text-brand-navy leading-none">
                          مجاناً
                        </span>
                      ) : (
                        <div className="flex items-baseline gap-1.5">
                          <span
                            className="text-3xl font-extrabold text-brand-navy leading-none"
                            dir="ltr"
                          >
                            {p.price.toLocaleString("ar-EG")}
                          </span>
                          <span className="text-[13px] font-bold text-slate-500">
                            ر.س
                          </span>
                          <span className="text-[11px] text-slate-400">
                            / {p.period}
                          </span>
                        </div>
                      )}
                    </div>

                    <ul className="mt-4 space-y-2 flex-1">
                      {p.features.map((f) => (
                        <li
                          key={f}
                          className="flex items-start gap-2 text-[13px] text-slate-600"
                        >
                          <Check className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-5 pt-4 border-t border-slate-100">
                      {isCurrent ? (
                        <Button
                          variant="outline"
                          disabled
                          className="w-full h-11 rounded-xl font-extrabold border-emerald-300 text-emerald-600 bg-emerald-50/50"
                        >
                          باقتك الحالية
                        </Button>
                      ) : canBill ? (
                        <Button
                          onClick={() => choose(p)}
                          disabled={busyKey !== null}
                          className="w-full h-11 rounded-xl font-extrabold bg-gradient-to-l from-brand-blue to-brand-green text-white hover:opacity-95"
                        >
                          {busyKey === p.key ? (
                            <Loader2 className="size-5 animate-spin" />
                          ) : (
                            `الترقية إلى ${p.name}`
                          )}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          disabled
                          className="w-full h-11 rounded-xl font-bold border-slate-200 text-slate-400"
                        >
                          يتطلب صلاحية المالك
                        </Button>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
