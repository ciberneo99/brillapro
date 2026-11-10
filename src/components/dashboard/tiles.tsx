import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/components/ui";

export type Tone = "green" | "blue" | "amber" | "teal" | "red" | "cyan";

const TONE: Record<Tone, string> = {
  green: "bg-[#15803d]", blue: "bg-[#1d4ed8]", amber: "bg-[#b45309]",
  teal: "bg-[#0f766e]", red: "bg-[#b91c1c]", cyan: "bg-[#0e7490]",
};

/** Headline number in solid color: the one loud element of the dashboard. */
export function KpiTile({ tone, icon: Icon, label, value, badge }: { tone: Tone; icon: LucideIcon; label: string; value: string; badge?: string }) {
  return (
    <div className={cn("rounded-2xl p-4 text-white shadow-card sm:p-5", TONE[tone])}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20"><Icon className="h-5 w-5" aria-hidden /></span>
        {badge && <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium">{badge}</span>}
      </div>
      <p className="mt-3 text-xs opacity-90 sm:mt-4 sm:text-sm">{label}</p>
      <p className="mt-0.5 break-words text-xl font-extrabold tracking-tight sm:text-3xl">{value}</p>
    </div>
  );
}

/** Change against last month. `format` renders the absolute difference. */
export function Trend({ now, before, format, suffix }: { now: number; before: number; format: (n: number) => string; suffix: string }) {
  const diff = now - before;
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
      diff > 0 ? "bg-success-soft text-success" : diff < 0 ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted")}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {diff > 0 ? "+" : diff < 0 ? "-" : ""}{format(Math.abs(diff))} {suffix}
    </span>
  );
}

export function StatTile({ icon: Icon, label, value, hint, trend }: { icon: LucideIcon; label: string; value: string; hint: string; trend: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary"><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
      <p className="mt-3 text-sm text-muted">{label}</p>
      <p className="mt-0.5 break-words text-xl font-bold tracking-tight sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
      <div className="mt-3">{trend}</div>
    </div>
  );
}

export function Panel({ title, action, icon: Icon, children, className }: { title: string; action?: React.ReactNode; icon?: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-line bg-surface p-5 shadow-card", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-base font-bold">
          {Icon && <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary"><Icon className="h-[18px] w-[18px]" aria-hidden /></span>}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
